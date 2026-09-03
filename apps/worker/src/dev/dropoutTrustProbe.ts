/**
 * **`dropout` 을 믿을 수 있나** — 운영 실측 (2026-09-03 · 읽기 전용).
 *
 * ══ 왜 ══
 *
 * 두 숫자가 같은 칸을 보고 있다.
 * ```
 * 도현  dropout IS TRUE 인 참가자 ★1,264,270명 (35%)★ — 어디서 왔는지 몰랐다
 * 민재  한 팀 전원 탈주 경기 ★171,323건 (44.4%)★ — ★로컬 DB★ 에서 셌다
 * ```
 * ★그 칸이 못 믿을 값이면 44% 도 35% 도 무의미하다.★
 *
 * ══ 이 칸이 어디서 오나 (코드로 확인함) ══
 *
 * `supplyMirrorParse.ts:510` — `dropout: boolOrNull(row.dropout)`
 * ★**3rd.supply 가 준 값을 그대로 넣는다.**★ 넥슨도 아니고 우리가 만든 것도 아니다.
 * 그래서 **뜻은 3rd.supply 의 것**이고 우리 쪽에 정의가 없다.
 * ⚠ `lineupGapProbe.ts` 주석에 「넥슨이 안 주는 값」이라고 적었는데 ★그건 넥슨 이야기였다.★
 *   이 칸은 미러에서 온다 — 그 주석은 오해를 준다.
 *
 * ══ 그래서 무엇으로 재나 ══
 *
 * 뜻을 못 물어보니 **행동으로 잰다.**
 * ```
 * ① 진짜 중도 이탈이면 → ★경기가 짧아야 한다★
 * ② 설박튀면          → ★나간 쪽이 져 있어야 한다★ (사장님: 인게임은 블루 승리가 맞다)
 * ③ 「끝난 뒤 나감」이면 → 경기 길이가 정상과 ★같아야★ 한다
 * ```
 * ⚠ **읽기만 한다.** ⚠ ★로컬이 아니라 운영이다★ (로컬은 낡았다 — 오늘 한 번 겪었다)
 */
import { prisma } from '@sacloud/db'

async function main(): Promise<void> {
  console.info('══ 1 · 운영에서 dropout 이 몇 건인가 ══\n')
  const base = await prisma.$queryRaw<{ total: bigint; t: bigint; f: bigint; n: bigint }[]>`
    SELECT count(*) AS total,
           count(*) FILTER (WHERE "dropout" IS TRUE)  AS t,
           count(*) FILTER (WHERE "dropout" IS FALSE) AS f,
           count(*) FILTER (WHERE "dropout" IS NULL)  AS n
      FROM "MatchPlayerStat"
  `
  const b = base[0]!
  const tot = Number(b.total)
  console.info(`  참가자 ${tot.toLocaleString()}명`)
  console.info(`    true  ${Number(b.t).toLocaleString()} (${((Number(b.t) / tot) * 100).toFixed(1)}%)`)
  console.info(`    false ${Number(b.f).toLocaleString()} (${((Number(b.f) / tot) * 100).toFixed(1)}%)`)
  console.info(`    null  ${Number(b.n).toLocaleString()} (${((Number(b.n) / tot) * 100).toFixed(1)}%)`)

  console.info('\n══ 2 · ★한 팀이 통째로 나간 경기★ ══\n')
  /* 같은 편 5명이 전부 dropout=true 인 경기. 그것이 사장님이 말씀하신 모양이다 */
  const whole = await prisma.$queryRaw<
    { league: string; games: bigint; quit_lost: bigint; quit_won: bigint }[]
  >`
    WITH side_drop AS (
      SELECT s."matchId", s."side",
             count(*) AS n,
             count(*) FILTER (WHERE s."dropout" IS TRUE) AS d
        FROM "MatchPlayerStat" s
       GROUP BY 1, 2
    ),
    whole_side AS (
      SELECT "matchId", "side" FROM side_drop WHERE n > 0 AND n = d
    )
    SELECT l."slug" AS league,
           count(DISTINCT w."matchId") AS games,
           count(*) FILTER (WHERE w."side" <> m."winnerSide") AS quit_lost,
           count(*) FILTER (WHERE w."side" =  m."winnerSide") AS quit_won
      FROM whole_side w
      JOIN "Match" m ON m."id" = w."matchId"
      JOIN "League" l ON l."id" = m."leagueId"
     GROUP BY 1 ORDER BY 2 DESC
  `
  if (whole.length === 0) console.info('  ★한 팀이 통째로 나간 경기가 없다★')
  for (const r of whole) {
    console.info(
      `  ${r.league.padEnd(9)} ${Number(r.games).toLocaleString().padStart(8)}건 · ` +
        `★나간 쪽이 패 ${Number(r.quit_lost).toLocaleString()}★ · 나간 쪽이 승 ${Number(r.quit_won).toLocaleString()}`,
    )
  }

  console.info('\n══ 3 · ★경기 길이로 갈라 본다★ (진짜 중도 이탈인가) ══\n')
  /*
   * 중도 이탈이면 ★짧아야★ 하고, 「끝난 뒤 나감」이면 ★정상과 같아야★ 한다.
   * `endAt` 이 없으면 잴 수 없다 — 그것도 답이다.
   */
  const dur = await prisma.$queryRaw<
    { kind: string; games: bigint; med: number | null }[]
  >`
    WITH side_drop AS (
      SELECT s."matchId", count(*) AS n, count(*) FILTER (WHERE s."dropout" IS TRUE) AS d
        FROM "MatchPlayerStat" s GROUP BY 1
    ),
    tagged AS (
      SELECT m."id",
             CASE WHEN sd.d > 0 THEN '탈주 있음' ELSE '탈주 없음' END AS kind,
             EXTRACT(EPOCH FROM (m."endAt" - m."startAt")) AS secs
        FROM "Match" m
        JOIN side_drop sd ON sd."matchId" = m."id"
       WHERE m."endAt" IS NOT NULL
    )
    SELECT kind, count(*) AS games,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY secs) AS med
      FROM tagged GROUP BY 1 ORDER BY 1
  `
  if (dur.length === 0) {
    console.info('  ★`endAt` 이 있는 경기가 없다 — 길이로는 못 가른다★')
  }
  for (const r of dur) {
    const m = r.med === null ? null : Math.round(Number(r.med))
    console.info(
      `  ${r.kind.padEnd(10)} ${Number(r.games).toLocaleString().padStart(8)}건 · ` +
        `중앙 ${m === null ? '—' : `${Math.floor(m / 60)}분 ${m % 60}초`}`,
    )
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
