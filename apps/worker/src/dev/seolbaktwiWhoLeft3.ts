/**
 * ★★설박튀 — 「설치한 팀이 통째로 나갔나」★★ (2026-09-04 · ★읽기 전용 · 외부 콜 0★).
 *
 * ⚠ `BarracksClanNumber` 는 ★행이 0개★ 라 클랜번호 다리는 쓸 수 없다.
 * ⚠ 선수 전체로 다리를 놓으면 질의가 ★시간 초과★ 난다.
 * → ★설치한 사람 한 명만★ 잇는다. 그 사람의 side 만 알면 조건 ③ 을 판정할 수 있다.
 *
 * ```
 * 배틀로그 마지막 라운드 → 설치한 사람 user_nexon_sn
 *   → Player.sourcePlayerId → MatchPlayerStat.side
 *   → 그 side 전원이 dropout 인가
 * ```
 */
import { prisma } from '@sacloud/db'

const pc = (a: number, b: number): string => (b === 0 ? '—' : `${((100 * a) / b).toFixed(1)}%`)

interface LastRound {
  k: string
  planted: boolean
  defused: boolean
  planterSn: string | null
}

async function main(): Promise<void> {
  console.info('══ 0 · 배틀로그 마지막 라운드를 뽑는다 …')
  const last = await prisma.$queryRawUnsafe<LastRound[]>(`
    WITH ev AS (
      SELECT r."matchKey" AS k, (e->>'round')::int AS rnd,
             e->>'weapon' AS w, e->>'target_weapon' AS tw,
             NULLIF(e->>'user_nexon_sn','0')        AS usn,
             NULLIF(e->>'target_user_nexon_sn','0') AS tusn
        FROM "BarracksBattleLogRaw" r, LATERAL jsonb_array_elements(r."payload"->'battleLog') e
       WHERE r."status" = 'ok' AND jsonb_typeof(r."payload"->'battleLog') = 'array'
         AND COALESCE(e->>'round','') <> ''
    ),
    pr AS (
      SELECT k, rnd,
             bool_or(w = 'c4-install'   OR tw = 'c4-install')   AS planted,
             bool_or(w = 'c4-dismantle' OR tw = 'c4-dismantle') AS defused,
             max(COALESCE(CASE WHEN w  = 'c4-install' THEN usn  END,
                          CASE WHEN tw = 'c4-install' THEN tusn END)) AS "planterSn"
        FROM ev GROUP BY 1,2
    )
    SELECT k, planted, defused, "planterSn" FROM (
      SELECT pr.*, row_number() OVER (PARTITION BY k ORDER BY rnd DESC) AS rk FROM pr) z
     WHERE rk = 1
  `)
  console.info(`   경기 ${last.length.toLocaleString()}건`)

  const keys = last.map((r) => r.k)
  console.info('══ 0 · 우리 DB 의 side / dropout 을 뽑는다 …')
  const sides = await prisma.$queryRawUnsafe<
    { k: string; league: string; side: string; sn: string; dropout: boolean | null }[]
  >(
    `SELECT m."sourceMatchId" AS k, l."slug" AS league, s."side",
            p."sourcePlayerId" AS sn, s."dropout"
       FROM "Match" m
       JOIN "League" l ON l."id" = m."leagueId"
       JOIN "MatchPlayerStat" s ON s."matchId" = m."id"
       JOIN "Player" p ON p."id" = s."playerId"
      WHERE m."sourceMatchId" = ANY($1::text[])`,
    keys,
  )
  console.info(`   선수-경기 ${sides.length.toLocaleString()}행`)

  /* 경기별로 side 를 모은다 */
  interface Team { n: number; out: number; unknown: number }
  const byMatch = new Map<string, { league: string; teams: Map<string, Team>; snSide: Map<string, string> }>()
  for (const r of sides) {
    let m = byMatch.get(r.k)
    if (!m) { m = { league: r.league, teams: new Map(), snSide: new Map() }; byMatch.set(r.k, m) }
    let t = m.teams.get(r.side)
    if (!t) { t = { n: 0, out: 0, unknown: 0 }; m.teams.set(r.side, t) }
    t.n += 1
    if (r.dropout === null) t.unknown += 1
    else if (r.dropout) t.out += 1
    if (r.sn) m.snSide.set(r.sn, r.side)
  }

  const tally = new Map<string, { n: number; planted: number; cand: number; other: number; none: number; noSide: number }>()
  const add = (lg: string, f: (t: NonNullable<ReturnType<typeof tally.get>>) => void): void => {
    let t = tally.get(lg)
    if (!t) { t = { n: 0, planted: 0, cand: 0, other: 0, none: 0, noSide: 0 }; tally.set(lg, t) }
    f(t)
  }

  for (const r of last) {
    const m = byMatch.get(r.k)
    if (!m) continue
    /* 두 팀 다 dropout 값을 알아야 판정한다 */
    const teams = [...m.teams.entries()].filter(([, t]) => t.n >= 4)
    if (teams.length !== 2 || teams.some(([, t]) => t.unknown > 0)) continue
    add(m.league, (t) => { t.n += 1 })
    if (!(r.planted && !r.defused)) continue
    add(m.league, (t) => { t.planted += 1 })
    const pSide = r.planterSn ? m.snSide.get(r.planterSn) : undefined
    if (!pSide) { add(m.league, (t) => { t.noSide += 1 }); continue }
    const allOut = (side: string): boolean => {
      const t = m.teams.get(side)
      return !!t && t.n >= 4 && t.out === t.n
    }
    const other = teams.find(([s]) => s !== pSide)![0]
    if (allOut(pSide)) add(m.league, (t) => { t.cand += 1 })
    else if (allOut(other)) add(m.league, (t) => { t.other += 1 })
    else add(m.league, (t) => { t.none += 1 })
  }

  console.info('\n══ 1 · ★★설치한 팀이 통째로 나갔나★★ (리그별) ══\n')
  let g = { n: 0, planted: 0, cand: 0, other: 0, none: 0, noSide: 0 }
  for (const [lg, t] of [...tally.entries()].sort((a, b) => b[1].n - a[1].n)) {
    console.info(
      `  ${lg.padEnd(10)} 판정가능 ${t.n.toLocaleString().padStart(6)}건` +
        `  마지막설치·해체X ${t.planted.toLocaleString().padStart(5)}` +
        `  ★설치팀 전원퇴장 ${t.cand.toLocaleString().padStart(4)} (${pc(t.cand, t.n)})★` +
        `  수비팀 전원퇴장 ${t.other.toLocaleString().padStart(4)}` +
        `  아무도 안나감 ${t.none.toLocaleString().padStart(4)}` +
        `  설치자 못찾음 ${t.noSide.toLocaleString().padStart(4)}`,
    )
    g = {
      n: g.n + t.n, planted: g.planted + t.planted, cand: g.cand + t.cand,
      other: g.other + t.other, none: g.none + t.none, noSide: g.noSide + t.noSide,
    }
  }
  console.info(
    `\n  ★합계★ 판정가능 ${g.n.toLocaleString()}건 · 마지막설치·해체X ${g.planted.toLocaleString()}` +
      ` · ★설박튀 후보 ${g.cand.toLocaleString()} (${pc(g.cand, g.n)})★` +
      ` · 수비팀퇴장 ${g.other.toLocaleString()} · 아무도안나감 ${g.none.toLocaleString()}` +
      ` · 설치자못찾음 ${g.noSide.toLocaleString()}`,
  )
  console.info('\n  ⚠ 사장님 기준 ★10판에 1판(10%)★')
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
