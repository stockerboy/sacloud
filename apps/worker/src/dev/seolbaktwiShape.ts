/**
 * **설박튀 — 재료 확인** (2026-09-04 · ★읽기 전용★).
 *
 * 세기 전에 「무엇으로 레드 전원 퇴장을 판정할 수 있는가」를 먼저 본다.
 * 지어내지 않기 위해서다. 여기서는 ★칸이 무엇이 있고 값이 어떻게 오는지★ 만 본다.
 */
import { prisma } from '@sacloud/db'

async function main(): Promise<void> {
  /* ── 1 · battleLog 이벤트의 칸 이름 ─────────────────────────── */
  console.info('══ 1 · ★battleLog 이벤트의 칸★ ══\n')
  const keys = await prisma.$queryRaw<{ k: string; n: bigint }[]>`
    WITH ev AS (
      SELECT e
        FROM "BarracksBattleLogRaw" r,
             LATERAL jsonb_array_elements(r."payload"->'battleLog') e
       WHERE r."status" = 'ok' AND jsonb_typeof(r."payload"->'battleLog') = 'array'
       LIMIT 200000
    )
    SELECT k, count(*) AS n FROM ev, LATERAL jsonb_object_keys(ev.e) k
     GROUP BY 1 ORDER BY 2 DESC
  `
  for (const k of keys) console.info(`  ${k.k.padEnd(22)} ${Number(k.n).toLocaleString()}`)

  /* ── 2 · payload 최상위 칸 ──────────────────────────────────── */
  console.info('\n══ 2 · ★payload 최상위 칸★ ══\n')
  const top = await prisma.$queryRaw<{ k: string; n: bigint }[]>`
    SELECT k, count(*) AS n
      FROM "BarracksBattleLogRaw" r, LATERAL jsonb_object_keys(r."payload") k
     WHERE r."status" = 'ok' AND jsonb_typeof(r."payload"->'battleLog') = 'array' GROUP BY 1 ORDER BY 2 DESC
  `
  for (const k of top) console.info(`  ${k.k.padEnd(22)} ${Number(k.n).toLocaleString()}`)

  /* ── 3 · event_type × event_text 전량 ───────────────────────── */
  console.info('\n══ 3 · ★event_type × event_text★ (전량) ══\n')
  const t = await prisma.$queryRaw<{ typ: string | null; txt: string | null; n: bigint }[]>`
    SELECT e->>'event_type' AS typ, e->>'event_text' AS txt, count(*) AS n
      FROM "BarracksBattleLogRaw" r,
           LATERAL jsonb_array_elements(r."payload"->'battleLog') e
     WHERE r."status" = 'ok' AND jsonb_typeof(r."payload"->'battleLog') = 'array'
     GROUP BY 1,2 ORDER BY 3 DESC LIMIT 40
  `
  for (const x of t) {
    console.info(
      `  type=${(x.typ ?? 'null').padEnd(12)} text=${(x.txt ?? '(없음)').padEnd(14)} ${Number(x.n).toLocaleString()}`,
    )
  }

  /* ── 4 · win_team_no 가 얼마나 차 있나 ──────────────────────── */
  console.info('\n══ 4 · ★win_team_no 채움률★ ══\n')
  const w = await prisma.$queryRaw<{ label: string; n: bigint }[]>`
    WITH pr AS (
      SELECT r."matchKey", (e->>'round') AS rnd,
             max(NULLIF(e->>'win_team_no','')) AS winner
        FROM "BarracksBattleLogRaw" r,
             LATERAL jsonb_array_elements(r."payload"->'battleLog') e
       WHERE r."status" = 'ok' AND jsonb_typeof(r."payload"->'battleLog') = 'array' AND e->>'round' IS NOT NULL AND e->>'round' <> ''
       GROUP BY 1,2
    )
    SELECT CASE WHEN winner IS NULL THEN '승자 모름' ELSE '승자 = ' || winner END AS label,
           count(*) AS n FROM pr GROUP BY 1 ORDER BY 2 DESC LIMIT 10
  `
  for (const x of w) console.info(`  ${x.label.padEnd(20)} ${Number(x.n).toLocaleString()}라운드`)

  /* ── 5 · team_no 값 ────────────────────────────────────────── */
  console.info('\n══ 5 · ★team_no 값★ ══\n')
  const tn = await prisma.$queryRaw<{ v: string | null; n: bigint }[]>`
    SELECT e->>'team_no' AS v, count(*) AS n
      FROM "BarracksBattleLogRaw" r,
           LATERAL jsonb_array_elements(r."payload"->'battleLog') e
     WHERE r."status" = 'ok' AND jsonb_typeof(r."payload"->'battleLog') = 'array' GROUP BY 1 ORDER BY 2 DESC LIMIT 10
  `
  for (const x of tn) console.info(`  ${(x.v ?? 'null').padEnd(10)} ${Number(x.n).toLocaleString()}`)

  /* ── 6 · 한 경기 통째로 펼쳐 본다 (설치·해체X·설치팀 패) ────── */
  console.info('\n══ 6 · ★「설치·해체X·설치팀 패」 라운드 하나를 펼친다★ ══\n')
  const one = await prisma.$queryRaw<{ k: string; rnd: number; evs: unknown }[]>`
    WITH ev AS (
      SELECT r."matchKey" AS k, (e->>'round')::int AS rnd, e->>'event_text' AS txt,
             e->>'team_no' AS team, e->>'win_team_no' AS win, e->>'event_type' AS typ
        FROM "BarracksBattleLogRaw" r,
             LATERAL jsonb_array_elements(r."payload"->'battleLog') e
       WHERE r."status" = 'ok' AND jsonb_typeof(r."payload"->'battleLog') = 'array' AND e->>'round' IS NOT NULL AND e->>'round' <> ''
    ),
    pr AS (
      SELECT k, rnd, max(NULLIF(win,'')) AS winner,
             max(NULLIF(team,'')) FILTER (WHERE typ = 'bomb' OR txt = 'C4 설치') AS planter,
             bool_or(typ = 'bomb' OR txt = 'C4 설치') AS planted,
             bool_or(txt = 'C4 해체') AS defused
        FROM ev GROUP BY 1,2
    ),
    pick AS (
      SELECT k, rnd FROM pr
       WHERE planted AND NOT defused AND winner IS NOT NULL AND planter IS NOT NULL
         AND winner <> planter
       LIMIT 2
    )
    SELECT pick.k, pick.rnd,
           jsonb_agg(e ORDER BY e->>'event_time') AS evs
      FROM pick
      JOIN "BarracksBattleLogRaw" r ON r."matchKey" = pick.k AND r."status" = 'ok' AND jsonb_typeof(r."payload"->'battleLog') = 'array',
           LATERAL jsonb_array_elements(r."payload"->'battleLog') e
     WHERE (e->>'round')::int = pick.rnd
     GROUP BY 1,2
  `
  for (const o of one) {
    console.info(`  ── 경기 ${o.k} · 라운드 ${o.rnd}`)
    for (const e of o.evs as Record<string, unknown>[]) {
      console.info(`     ${JSON.stringify(e)}`)
    }
    console.info('')
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
