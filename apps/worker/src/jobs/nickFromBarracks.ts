import { prisma } from '@sacloud/db'

import { log } from '../lib/log.js'

/**
 * ★★닉네임을 병영수첩 명부로 맞춘다★★ (2026-09-21 · 사장님 지시)
 *
 * > 「정보갱신 최신화 좀 제대로 안되냐 진짜 왜 못하는거야 이거?」
 * > 「언제적 닉네임이야 이건 이 사람 이 닉네임 거의 ★6개월전에★ 쓰던건데」
 *
 * ── 무엇이 빠져 있었나 (실측 2026-09-21)
 *
 *   ```
 *   병영 명부와 이을 수 있는 선수   3,969명
 *   그중 ★닉이 다른 사람★          ★1,740명★
 *   ```
 *   명부(`BarracksClanMember`)는 ★매시 받아 오고 있었다.★ 그런데 —
 *   ```
 *   clan-affiliation   명부로 ★소속★ 을 맞춘다      ← 이름은 안 건드린다
 *   renew-requests     ★한 명씩★ 눌렀을 때만        ← 전체를 훑지 않는다
 *   ```
 *   ★받아 둔 명부의 닉을 선수 이름에 옮기는 잡이 아예 없었다.★
 *   그래서 사장님이 정보갱신을 눌러도 ★그 한 명만★ 바뀌고 나머지 천칠백 명은
 *   반년 전 닉 그대로였다.
 *
 * ── ★계정으로만 잇는다★ (D-221)
 *
 *   닉으로 사람을 잇지 않는다 — 위장닉이 있다. 여기서 하는 일은 그 반대다:
 *   ★이미 계정(`BRK-<str_usn>`)으로 이어진 사람★ 의 이름을 병영이 말하는 지금 닉으로
 *   맞추는 것뿐이다. 사람을 새로 잇지 않는다.
 *
 * ── 안 건드리는 것
 *
 *   ⚠ ★합쳐진 껍데기★ (`(합쳐짐→…)`) 는 그대로 둔다 — 그 이름이 ★어디로 갔는지★ 를
 *     말해 주는 표식이다. 덮으면 합치기 이력이 사라진다.
 *   ⚠ ★빈 닉으로 덮지 않는다.★
 *   ⚠ ★경기 당시 닉(`matchTime*`)은 한 칸도 안 건드린다.★
 *
 * ```
 * pnpm --filter @sacloud/worker nexon nick-from-barracks             # 미리보기
 * pnpm --filter @sacloud/worker nexon nick-from-barracks --confirm
 * pnpm --filter @sacloud/worker nexon nick-from-barracks --limit 500
 * ```
 */

/** 합친 뒤 남기는 껍데기 표식 — ★이 이름은 안 덮는다★ */
const MERGED_MARK = '(합쳐짐→'

export interface NickFromBarracksResult {
  /** 계정으로 이어진 선수 수 */
  linked: number
  /** 닉이 달라서 고칠 대상 */
  stale: number
  /** 실제로 고친 수 */
  renamed: number
  /** 껍데기라 건너뛴 수 */
  skippedMerged: number
  confirmed: boolean
  samples: string[]
}

interface Row {
  id: string
  ours: string
  theirs: string
}

export async function runNickFromBarracks(
  options: { confirm?: boolean; limit?: number } = {},
): Promise<NickFromBarracksResult> {
  const confirm = options.confirm ?? false
  const limit = options.limit ?? 5000

  const result: NickFromBarracksResult = {
    linked: 0,
    stale: 0,
    renamed: 0,
    skippedMerged: 0,
    confirmed: confirm,
    samples: [],
  }

  /*
   * ★계정마다 가장 최근에 본 닉★ 을 뽑아 우리 이름과 견준다.
   *
   * `DISTINCT ON` 은 `ORDER BY` 의 첫 줄만 남긴다 — 그 계정의 최신 한 줄이다.
   * ⚠ ★SQL 템플릿 안에 백틱을 쓰지 않는다★ — 템플릿이 거기서 끊긴다.
   */
  const rows = await prisma.$queryRaw<Row[]>`
    WITH latest AS (
      SELECT DISTINCT ON (b."strUsn")
             b."strUsn"    AS usn,
             b."userNick"  AS nick
        FROM "BarracksClanMember" b
       WHERE b."userNick" IS NOT NULL
         AND b."userNick" <> ''
       ORDER BY b."strUsn", b."observedAt" DESC
    )
    SELECT p."id", p."name" AS ours, l.nick AS theirs
      FROM "Player" p
      JOIN latest l ON 'BRK-' || l.usn = p."sourcePlayerId"
     WHERE p."name" <> l.nick
     LIMIT ${limit}
  `

  const counted = await prisma.$queryRaw<{ n: number }[]>`
    SELECT COUNT(*)::int AS n
      FROM "Player" p
     WHERE p."sourcePlayerId" LIKE 'BRK-%'
  `
  result.linked = counted[0]?.n ?? 0

  for (const row of rows) {
    /* ★합쳐진 껍데기는 그대로 둔다★ — 어디로 갔는지 말해 주는 표식이다 */
    if (row.ours.includes(MERGED_MARK)) {
      result.skippedMerged += 1
      continue
    }
    result.stale += 1
    if (result.samples.length < 20) result.samples.push(`${row.ours} → ${row.theirs}`)
    if (confirm) {
      await prisma.player.update({ where: { id: row.id }, data: { name: row.theirs } })
      result.renamed += 1
    }
  }

  log(
    `병영 닉 맞춤 — 계정 아는 선수 ${result.linked} · 어긋남 ${result.stale} · ` +
      `고침 ${result.renamed} · 껍데기 건너뜀 ${result.skippedMerged}` +
      (confirm ? '' : ' (미리보기)'),
  )
  for (const s of result.samples) log(`  ${s}`)
  return result
}
