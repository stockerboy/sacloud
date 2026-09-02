import { prisma } from '@sacloud/db'
import { registerClanTier } from '@sacloud/db/ops'
import { LeagueClanRegisterInput, PAGE_SIZE, winRate } from '@sacloud/contract'
import { badRequest, forbidden, guard, guardPublic, notFound, ok, okPagePublic, unauthorized } from '@/lib/server/respond'
import { intQuery, jsonBody, pageParams, routeParam } from '@/lib/server/request'
import { getLeagueClans } from '@/lib/server/queries/leagues'
import { audit, requireLeagueAdmin } from '@/lib/server/queries/leagueAdmin'
import { CLAN_SUMMARY_SELECT, toClanSummary } from '@/lib/server/mappers'
import { toKstIso } from '@/lib/server/format'

/**
 * 한 번에 받아 갈 수 있는 최대 건수 (2026-09-02 · D-260).
 *
 * 「고용가능 클랜」 화면은 **검색을 브라우저에서 한다.** 그러려면 목록이 전부 손에 있어야
 * 하는데 20건씩 끊어 받으면 아직 안 받은 클랜은 검색에 걸리지 않는다.
 * 그래서 `?size=` 를 받는다 — **상한을 두고** 받는다. 무제한이면 이 라우트 하나로
 * 리그 전체를 몇 번이고 긁을 수 있다.
 *
 * 실측(2026-09-02): SPL 63곳 · IPL 43곳 · 10mountain 356곳. 400이면 지금은 한 번에 들어온다.
 * 넘치면 커서가 그대로 살아 있으므로 화면이 이어서 받는다 — **없는 데이터가 되지 않는다.**
 */
const MAX_SIZE = 400

/**
 * GET /api/leagues/{leagueSlug}/clans — 리그 참여 클랜 (커서)
 *
 * `?size=N` 을 주면 한 쪽에 N건까지 담는다 (1 ~ `MAX_SIZE`).
 * **없으면 예전 그대로 20건**이다 — 기존 호출자를 깨지 않는다.
 */
export async function GET(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guardPublic(request, 600, async () => {
    const leagueSlug = await routeParam(context, 'league')
    const { cursor } = pageParams(request)
    const size = Math.min(Math.max(intQuery(request, 'size', PAGE_SIZE.DEFAULT), 1), MAX_SIZE)
    const page = await getLeagueClans(leagueSlug, cursor, size)
    /* 목록은 로그인과 무관하다 — 엣지가 대신 답한다 (D-223) */
    return page ? okPagePublic(page) : notFound('리그를 찾을 수 없습니다')
  })
}

/**
 * POST /api/leagues/{leagueSlug}/clans — 리그 관리자가 클랜을 티어/부리그에 직접 등록 (D-165).
 *
 * 초대(`POST .../invitations`)와 다르다. 초대는 클랜 마스터가 링크로 수락하는 흐름이고,
 * 이것은 **운영자가 티어를 정해 직접 넣는** 흐름이다 — 무소속리그 편성이 그렇다.
 *
 * 권한은 기존 리그 관리자 검사(`requireLeagueAdmin`) 그대로다.
 * 비인증은 401, 관리자가 아니면 403이다 (`apps/web/tests/adminApi.test.ts` 가 검사한다).
 *
 * 무소속리그면 `LeagueClan.division` 과 `Clan.category`/`Clan.tier` 를 **같이** 쓴다.
 * 한쪽만 고치면 부리그 탭(division)과 무소속 래더(D-104 · `Clan.tier`)가 서로 다른 답을 낸다.
 *
 * 승강은 자동이 아니다 — 여기서 rating 을 보지 않는다 (D-104 ①).
 */
export async function POST(request: Request, context: { params: Promise<Record<string, string>> }) {
  return guard(async () => {
    const leagueSlug = await routeParam(context, 'league')

    const check = await requireLeagueAdmin(request, leagueSlug)
    if (!check.ok) {
      if (check.reason === 'unauthorized') return unauthorized()
      if (check.reason === 'notFound') return notFound('리그를 찾을 수 없습니다')
      return forbidden('이 리그의 관리자만 등록할 수 있습니다')
    }

    const parsed = LeagueClanRegisterInput.safeParse(await jsonBody(request))
    if (!parsed.success) return badRequest('입력값을 확인해주세요')

    const league = await prisma.league.findUnique({
      where: { id: check.leagueId },
      select: { category: true, divisionCount: true },
    })
    if (!league) return notFound('리그를 찾을 수 없습니다')
    if (parsed.data.division > league.divisionCount) {
      return badRequest(
        league.category === 'independent'
          ? `이 리그는 ${league.divisionCount}티어까지 있습니다`
          : `이 리그는 ${league.divisionCount}부리그까지 있습니다`,
      )
    }

    const result =
      league.category === 'independent'
        ? await registerClanTier({
            leagueSlug,
            clanSlug: parsed.data.clan_slug,
            tier: parsed.data.division,
          })
        : await registerOfficialClan(check.leagueId, parsed.data.clan_slug, parsed.data.division)

    if (!result.ok) {
      if (result.reason === 'clanNotFound') return notFound('클랜을 찾을 수 없습니다')
      if (result.reason === 'expelled') return badRequest('추방된 클랜은 다시 등록할 수 없습니다')
      return badRequest('등록할 수 없습니다')
    }

    await audit(check.userId, 'league_clan.register', 'league_clan', result.leagueClanId ?? '-', {
      clanSlug: parsed.data.clan_slug,
      division: parsed.data.division,
      created: result.created ?? false,
      warnings: result.warnings.join(' / ') || null,
    })

    const row = await prisma.leagueClan.findUniqueOrThrow({
      where: { id: result.leagueClanId ?? '' },
      select: {
        id: true,
        leagueId: true,
        rating: true,
        division: true,
        win: true,
        lose: true,
        placement: true,
        status: true,
        joinedAt: true,
        clan: { select: CLAN_SUMMARY_SELECT },
      },
    })

    return ok({
      id: row.id,
      league_id: row.leagueId,
      clan: toClanSummary(row.clan),
      rating: row.rating,
      division: row.division,
      win: row.win,
      lose: row.lose,
      win_rate: winRate(row.win, row.lose),
      placement: row.placement,
      status: row.status,
      joined_at: toKstIso(row.joinedAt),
    })
  })
}

/**
 * 공식리그(그 밖의 리그) 직접 등록.
 *
 * `Clan.category`/`Clan.tier` 는 **건드리지 않는다.** 그것은 무소속 편성용 값이다 (D-104).
 * 여기서 하는 일은 참여 행을 만들거나 부리그를 옮기는 것뿐이다.
 */
async function registerOfficialClan(
  leagueId: string,
  clanSlug: string,
  division: number,
): Promise<{
  ok: boolean
  reason?: 'clanNotFound' | 'expelled'
  warnings: string[]
  leagueClanId?: string
  created?: boolean
}> {
  const clan = await prisma.clan.findUnique({ where: { slug: clanSlug }, select: { id: true } })
  if (!clan) return { ok: false, reason: 'clanNotFound', warnings: [] }

  const existing = await prisma.leagueClan.findUnique({
    where: { leagueId_clanId: { leagueId, clanId: clan.id } },
    select: { id: true, expelledAt: true },
  })
  if (existing?.expelledAt) return { ok: false, reason: 'expelled', warnings: [] }

  const row = await prisma.leagueClan.upsert({
    where: { leagueId_clanId: { leagueId, clanId: clan.id } },
    create: { leagueId, clanId: clan.id, division },
    update: { division },
    select: { id: true },
  })
  return { ok: true, warnings: [], leagueClanId: row.id, created: !existing }
}
