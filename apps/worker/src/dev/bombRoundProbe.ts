/**
 * **라운드 단위로 C4 를 센다** (2026-09-03 · ★읽기 전용★).
 *
 * ══ 왜 라운드로 가나 ══
 *
 * 경기 단위로는 못 잰다는 것이 오늘 확인됐다 —
 * ```
 * ★C4 상태와 무관하게 「이긴 팀이 나간 경기」가 3,954건 중 0건★
 * ★「설치만(해체없음)」 경기가 오히려 더 길다★ (16~17분 vs 설치없음 11분)
 *    → 조건 ③(짧게 끝남)과 ★정면으로 반대★ 다
 * ```
 * 당연하다 — ★한 경기에 라운드가 십수 개다.★ 「한 번이라도 설치했고 한 번도 해체 안 됐다」는
 * ★경기 전체를 뭉갠 조건★ 이라 설박튀 한 라운드를 짚어내지 못한다.
 *
 * ★그런데 배틀로그 이벤트에 `round` 칸이 있다.★ (실측 확인)
 * ```
 * round · event_time("00:44") · event_type(kill|death) · event_text("C4 설치")
 * team_no · user_nexon_sn(= 우리 Player.sourcePlayerId)
 * ```
 * ★그래서 라운드 단위로 셀 수 있다.★ 여기서 그 바탕 숫자를 낸다.
 *
 * ⚠ ★「설박튀」가 라운드 안에서 무슨 모양인지는 아직 사장님께 못 받았다.★
 *   그래서 ★판정하지 않는다.★ 셀 수 있는 것만 세어 놓는다.
 */
import { prisma } from '@sacloud/db'

const pc = (a: number, b: number): string => (b === 0 ? '  —  ' : `${((100 * a) / b).toFixed(1)}%`)

async function main(): Promise<void> {
  /* ── 1 · event_text 에 무엇이 오나 ───────────────────────────── */
  console.info('══ 1 · ★event_text 종류★ — 특수 사건은 여기 적힌다 ══\n')
  const kinds = await prisma.$queryRaw<{ t: string | null; n: bigint }[]>`
    SELECT e->>'event_text' AS t, count(*) AS n
      FROM "BarracksBattleLogRaw" r,
           LATERAL jsonb_array_elements(r."payload"->'battleLog') e
     WHERE r."status" = 'ok'
     GROUP BY 1 ORDER BY 2 DESC LIMIT 20
  `
  for (const k of kinds) {
    console.info(`  ${(k.t ?? '(없음 — 보통 킬/데스)').padEnd(24)} ${Number(k.n).toLocaleString()}회`)
  }

  /* ── 2 · 라운드가 몇 개인가 ─────────────────────────────────── */
  console.info('\n══ 2 · ★라운드 단위로 셀 수 있는가★ ══\n')
  const rounds = await prisma.$queryRaw<
    { matches: bigint; rounds: bigint; planted: bigint; defused: bigint; both: bigint }[]
  >`
    WITH r AS (
      SELECT r."matchKey", e->>'round' AS rnd,
             bool_or(e->>'event_text' = 'C4 설치') AS planted,
             bool_or(e->>'event_text' = 'C4 해체') AS defused
        FROM "BarracksBattleLogRaw" r,
             LATERAL jsonb_array_elements(r."payload"->'battleLog') e
       WHERE r."status" = 'ok' AND e->>'round' IS NOT NULL
       GROUP BY 1, 2
    )
    SELECT count(DISTINCT "matchKey")                               AS matches,
           count(*)                                                 AS rounds,
           count(*) FILTER (WHERE planted)                          AS planted,
           count(*) FILTER (WHERE defused)                          AS defused,
           count(*) FILTER (WHERE planted AND defused)              AS both
      FROM r
  `
  const r0 = rounds[0]!
  const rn = Number(r0.rounds)
  console.info(`  경기 ${Number(r0.matches).toLocaleString()}건 · ★라운드 ${rn.toLocaleString()}개★`)
  console.info(
    `  경기당 라운드 ★${(rn / Number(r0.matches)).toFixed(1)}개★` +
      `  ← ★경기 단위로 뭉개면 이만큼이 한 칸이 된다★`,
  )
  console.info(`  ★설치된 라운드 ${Number(r0.planted).toLocaleString()}개★ ${pc(Number(r0.planted), rn)}`)
  console.info(`  해체된 라운드 ${Number(r0.defused).toLocaleString()}개 ${pc(Number(r0.defused), rn)}`)
  console.info(
    `  ★설치됐는데 해체 안 된 라운드 ${(Number(r0.planted) - Number(r0.both)).toLocaleString()}개★` +
      ` ${pc(Number(r0.planted) - Number(r0.both), rn)}`,
  )

  /* ── 3 · 설치 라운드가 어떻게 끝나나 ─────────────────────────── */
  console.info('\n══ 3 · ★설치된 라운드에서 설치 뒤에 무슨 일이 있었나★ ══\n')
  console.info('  설박튀라면 ★설치 뒤에 아무 일도 없어야★ 한다 (설치하고 나갔으니)\n')
  const after = await prisma.$queryRaw<{ label: string; n: bigint }[]>`
    WITH ev AS (
      SELECT r."matchKey", e->>'round' AS rnd,
             (e->>'event_time') AS t,
             e->>'event_text' AS txt,
             e->>'event_type' AS typ
        FROM "BarracksBattleLogRaw" r,
             LATERAL jsonb_array_elements(r."payload"->'battleLog') e
       WHERE r."status" = 'ok' AND e->>'round' IS NOT NULL
    ),
    plant AS (
      SELECT "matchKey", rnd, min(t) AS "plantAt"
        FROM ev WHERE txt = 'C4 설치' GROUP BY 1, 2
    ),
    tally AS (
      SELECT p."matchKey", p.rnd,
             count(*) FILTER (WHERE ev.t > p."plantAt" AND ev.typ = 'kill') AS "killsAfter",
             bool_or(ev.txt = 'C4 해체')                                     AS defused
        FROM plant p JOIN ev ON ev."matchKey" = p."matchKey" AND ev.rnd = p.rnd
       GROUP BY 1, 2
    )
    SELECT CASE WHEN defused                       THEN 'B 해체됐다'
                WHEN "killsAfter" = 0              THEN 'A ★설치 뒤 킬이 0★'
                WHEN "killsAfter" <= 2             THEN 'C 설치 뒤 킬 1~2'
                ELSE                                    'D 설치 뒤 킬 3+' END AS label,
           count(*) AS n
      FROM tally GROUP BY 1 ORDER BY 1
  `
  let tot = 0
  for (const a of after) tot += Number(a.n)
  for (const a of after) {
    console.info(`  ${a.label.padEnd(22)} ${Number(a.n).toLocaleString().padStart(7)}라운드 ${pc(Number(a.n), tot)}`)
  }
  console.info(
    `\n  ⚠ ★사장님 기준은 「10판에 1판」(10%) 이다.★ 어느 줄이 그 언저리인지 A 가 여쭐 것.\n` +
      `  ⚠ ★그리고 「설박튀」가 라운드 안에서 무슨 모양인지를 아직 못 받았다.★ 여기서 판정하지 않는다`,
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
