import { prisma } from '@sacloud/db'

import { log } from '../lib/log.js'

/**
 * ★★경기의 양 진영이 잘못 박힌 것을 바로잡는다★★ (2026-09-22 · 사장님 지시)
 *
 * > 「경기 40분 후에도 ★킬데스 수집조차 안 된★ 이런 경기들 싹다 명단채우고 분석 끝내놔」
 *
 * ── 실측으로 여기까지 왔다 (2026-09-22)
 *
 *   ```
 *   ① 모르는 클랜 22곳을 찾아 만들었다        → 막힘 110 → 69
 *   ② 클랜 번호를 받아 적었다                 → 69 → 6
 *   ③ 그랬더니 이번엔 ★side_mismatch 98건★
 *   ```
 *   한 건을 열어 봤더니 —
 *   ```
 *   배틀로그   lineclan vs deIete     ← 실제로 뛴 두 클랜
 *   경기 원문  lineclan vs deIete     ← 같다
 *   ★Match 진영  lineclan vs #zerobase★  ← ★여기만 다르다★
 *   ```
 *   `deIete` 가 우리 DB 에 ★없던 시절★ 에 만들어진 경기라, 정규화가 엉뚱한 클랜을
 *   진영에 박아 넣었다. ★정규화는 경기를 만들기만 하고 고치지는 않는다★ —
 *   그래서 그 뒤에 클랜이 생겨도 진영은 영영 틀린 채로 남는다.
 *
 * ── 무엇을 근거로 고치나 — ★두 곳이 같은 말을 할 때만★
 *
 *   ```
 *   배틀로그 teamList 의 clan_no 둘  →  우리 클랜 둘   (번호는 넥슨이 매긴 것이다)
 *   경기 원문 red_clan_name / blue_clan_name          (어느 쪽이 붉은 팀인가)
 *   ```
 *   ★번호가 「누구누구」 를 정하고, 이름이 「어느 편」 을 정한다.★
 *   둘이 어긋나면 ★손대지 않는다.★
 *
 * ── 지키는 것
 *
 *   ⚠ ★기록을 건드리지 않는다★ — 진영 두 칸만 고친다. 참가행·래더는 그대로다
 *   ⚠ ★둘 다 그 리그 명단에 있어야★ 고친다 — 없으면 건너뛴다 (D-106)
 *   ⚠ ★이름이 정확히 한 짝으로 맞아야★ 고친다 — 헷갈리면 안 고친다
 *   ⚠ 고친 경기는 ★막힘 표시를 지운다★ — 명단 잡이 다시 본다
 *
 * ```
 * pnpm --filter @sacloud/worker nexon match-side-fix             # 미리보기
 * pnpm --filter @sacloud/worker nexon match-side-fix --confirm
 * ```
 */

export interface MatchSideFixResult {
  /** 진영이 어긋난다고 표시된 경기 */
  candidates: number
  /** 두 곳이 같은 말을 해서 고칠 수 있는 경기 */
  fixable: number
  /** 실제로 고친 경기 */
  fixed: number
  /** 이미 맞게 박혀 있던 경기 */
  alreadyRight: number
  /** 근거가 어긋나 손대지 않은 경기 */
  unsure: number
  confirmed: boolean
  samples: string[]
}

interface Row {
  matchid: string
  leagueid: string
  redname: string | null
  bluename: string | null
  redlc: string | null
  bluelc: string | null
  /** 배틀로그가 말하는 두 클랜 (이름) */
  a_name: string | null
  a_lc: string | null
  b_name: string | null
  b_lc: string | null
}

export async function runMatchSideFix(
  options: { confirm?: boolean; limit?: number } = {},
): Promise<MatchSideFixResult> {
  const confirm = options.confirm ?? false
  const limit = options.limit ?? 500

  const result: MatchSideFixResult = {
    candidates: 0,
    fixable: 0,
    fixed: 0,
    alreadyRight: 0,
    unsure: 0,
    confirmed: confirm,
    samples: [],
  }

  /*
   * 진영이 어긋난 경기마다 —
   *   · 원문이 말하는 두 이름 (어느 쪽이 붉은 팀인가)
   *   · 배틀로그 번호가 가리키는 두 클랜 (누구누구인가)
   * 를 한 줄에 모은다.
   *
   * ⚠ ★SQL 템플릿 안에 백틱을 쓰지 않는다★ — 템플릿이 거기서 끊긴다.
   */
  const rows = await prisma.$queryRaw<Row[]>`
    WITH bad AS (
      SELECT m."id" AS matchid, m."leagueId" AS leagueid, m."sourceMatchId" AS key,
             m."redLeagueClanId" AS redlc_now, m."blueLeagueClanId" AS bluelc_now
        FROM "Match" m
       WHERE m."supersededAt" IS NULL
         AND m."lineupSkipReason" = 'side_mismatch'
         AND m."startAt" > NOW() - INTERVAL '60 days'
       LIMIT ${limit}
    ),
    named AS (
      SELECT b.*, r."payload"->>'red_clan_name' AS redname,
                  r."payload"->>'blue_clan_name' AS bluename
        FROM bad b
        JOIN "BarracksClanMatchRaw" r ON r."matchKey" = b.key
    ),
    nums AS (
      SELECT n2.matchid,
             MIN(n2.nm) FILTER (WHERE n2.rn = 1) AS a_name,
             MIN(n2.lc) FILTER (WHERE n2.rn = 1) AS a_lc,
             MIN(n2.nm) FILTER (WHERE n2.rn = 2) AS b_name,
             MIN(n2.lc) FILTER (WHERE n2.rn = 2) AS b_lc,
             COUNT(*)::int AS howmany
        FROM (
          SELECT DISTINCT ON (bd.matchid, c."id")
                 bd.matchid,
                 c."name" AS nm,
                 lc."id"  AS lc,
                 ROW_NUMBER() OVER (PARTITION BY bd.matchid ORDER BY c."id") AS rn
            FROM bad bd
            JOIN "BarracksBattleLogRaw" bl
              ON bl."matchKey" = bd.key AND bl."subjectKind" = 'clan'
            CROSS JOIN LATERAL jsonb_array_elements(
                   COALESCE(bl."payload"->'teamList', '[]'::jsonb)) AS e(v)
            JOIN "BarracksClanNumber" n ON n."clanNo" = e.v->>'clan_no'
            JOIN "Clan" c ON c."id" = n."clanId"
            JOIN "LeagueClan" lc
              ON lc."clanId" = c."id" AND lc."leagueId" = bd.leagueid
        ) n2
       GROUP BY n2.matchid
    )
    SELECT nd.matchid, nd.leagueid, nd.redname, nd.bluename,
           nd.redlc_now AS redlc, nd.bluelc_now AS bluelc,
           nums.a_name, nums.a_lc, nums.b_name, nums.b_lc
      FROM named nd
      JOIN nums ON nums.matchid = nd.matchid
     WHERE nums.howmany = 2
  `

  const fixedIds: string[] = []

  for (const row of rows) {
    result.candidates += 1
    const { redname, bluename, a_name, a_lc, b_name, b_lc } = row
    if (
      redname === null ||
      bluename === null ||
      a_name === null ||
      b_name === null ||
      a_lc === null ||
      b_lc === null
    ) {
      result.unsure += 1
      continue
    }

    /* ★이름이 정확히 한 짝으로 맞아야 한다★ — 헷갈리면 안 고친다 */
    let red: string
    let blue: string
    if (a_name === redname && b_name === bluename) {
      red = a_lc
      blue = b_lc
    } else if (b_name === redname && a_name === bluename) {
      red = b_lc
      blue = a_lc
    } else {
      result.unsure += 1
      if (result.samples.length < 20) {
        result.samples.push(`★못 가림★ 원문 ${redname} vs ${bluename} · 배틀로그 ${a_name} vs ${b_name}`)
      }
      continue
    }

    if (red === row.redlc && blue === row.bluelc) {
      result.alreadyRight += 1
      continue
    }

    result.fixable += 1
    if (result.samples.length < 20) {
      result.samples.push(`고침 ${redname} vs ${bluename}`)
    }
    if (confirm) {
      await prisma.match.update({
        where: { id: row.matchid },
        /* ★진영 두 칸만★ — 기록은 건드리지 않는다 */
        data: { redLeagueClanId: red, blueLeagueClanId: blue, lineupSkipReason: null },
      })
      result.fixed += 1
      fixedIds.push(row.matchid)
    }
  }

  log(
    `경기 진영 바로잡기 — 대상 ${result.candidates} · 고칠 수 있음 ${result.fixable} · ` +
      `고침 ${result.fixed} · 이미맞음 ${result.alreadyRight} · 못 가림 ${result.unsure}` +
      (confirm ? '' : ' (미리보기)'),
  )
  for (const s of result.samples) log(`  ${s}`)
  return result
}
