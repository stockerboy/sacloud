import { badRequest, forbidden, guard, ok } from '@/lib/server/respond'
import { jsonBody } from '@/lib/server/request'
import { requireAdmin } from '@/lib/server/session'
import { writeAudit } from '@/lib/server/admin/audit'
import {
  fromCsv,
  fromJsonRows,
  fromSupplyHtml,
  fromSupplyState,
  importLegacySeasons,
  mergeRows,
  type LegacySeasonRow,
} from '@sacloud/db/ops'

/**
 * POST /api/admin/legacy — 과거 시즌 기록 이관 (Phase 11-F).
 *
 * 파일 내용을 **본문에 담아** 보낸다. 서버가 파일 시스템을 뒤지지 않는다.
 * `confirm: true`가 없으면 **미리보기만** 한다 — 무엇이 새로 들어가고
 * 무엇이 중복·충돌·확정거부인지 먼저 보여 준다.
 *
 * 파싱 코어는 CLI와 **같은 것**을 쓴다 (`@sacloud/db/ops`). 두 벌로 갈라지면
 * 화면에서 본 미리보기와 실제 저장 결과가 달라진다.
 */
export async function POST(request: Request) {
  return guard(async () => {
    const admin = await requireAdmin(request)
    if (!admin) return forbidden('관리자만 접근할 수 있습니다')

    const body = (await jsonBody(request).catch(() => ({}))) as {
      leagueSlug?: string
      /** 여러 파일을 한 번에 올릴 수 있다 (마감 직전 + 마감 직후 병합) */
      files?: { name: string; text: string }[]
      /** 진행 중 시즌의 현재 성적을 이 번호의 카드로 만든다 */
      currentSeason?: number
      confirm?: boolean
    }

    if (!body.leagueSlug) return badRequest('leagueSlug가 필요합니다')
    const files = body.files ?? []
    if (files.length === 0) return badRequest('파일이 없습니다')

    const rows: LegacySeasonRow[] = []
    const warnings: string[] = []
    for (const file of files) {
      const parsed = /\.csv$/i.test(file.name)
        ? fromCsv(file.text)
        : /\.json$/i.test(file.name)
          ? parseJson(file.text, body.currentSeason)
          : fromSupplyHtml(file.text, { currentSeason: body.currentSeason })
      rows.push(...parsed.rows)
      warnings.push(...parsed.warnings.map((message) => `${file.name}: ${message}`))
    }

    const merged = mergeRows(rows)
    const result = await importLegacySeasons({
      leagueSlug: body.leagueSlug,
      rows: merged,
      warnings,
      confirm: body.confirm === true,
    })

    if (result.executed) {
      await writeAudit({
        user: admin,
        action: 'legacy.import',
        targetType: 'league',
        targetId: body.leagueSlug,
        before: { files: files.map((file) => file.name), parsed: merged.length },
        after: { created: result.created, counts: result.counts },
      })
    }

    return ok({
      seasons: result.seasons,
      counts: result.counts,
      executed: result.executed,
      created: result.created,
      warnings: result.warnings.slice(0, 50),
      // 화면에서 바로 확인할 수 있게 문제 있는 줄만 추린다
      issues: result.plans
        .filter((plan) => plan.verdict !== 'create')
        .slice(0, 100)
        .map((plan) => ({
          legacy_player_id: plan.row.legacyPlayerId,
          nickname: plan.row.nickname,
          season: plan.row.season,
          verdict: plan.verdict,
          note: plan.note,
        })),
      sample: merged.slice(0, 10),
    })
  })
}

function parseJson(text: string, currentSeason: number | undefined) {
  const json: unknown = JSON.parse(text)
  // 정규화된 배열일 수도, 브라우저에서 저장한 state 페이로드일 수도 있다
  return Array.isArray(json) ? fromJsonRows(json) : fromSupplyState(json, { currentSeason })
}
