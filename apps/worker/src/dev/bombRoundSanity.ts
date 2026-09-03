/**
 * **라운드 칸을 믿을 수 있나** (2026-09-03 · 읽기 전용).
 *
 * 라운드 단위로 세니 ★해체 1,983라운드 중 설치가 같은 라운드에 있는 건 158개뿐★ 이었다.
 * ★게임상 설치 없는 해체는 불가능하다.★ 그러면 `round` 칸이나 이벤트 짝짓기가 틀린 것이다.
 * ★세기 전에 이것부터 밝힌다.★ 안 밝히면 사장님께 틀린 숫자가 간다.
 */
import { prisma } from '@sacloud/db'

async function main() {
  console.info('══ 1 · C4 이벤트의 round 칸 모양 ══\n')
  const shape = await prisma.$queryRaw<{ txt: string; kind: string; n: bigint }[]>`
    SELECT e->>'event_text' AS txt,
           CASE WHEN e->>'round' IS NULL THEN 'null'
                WHEN e->>'round' = ''    THEN '빈 문자열'
                ELSE '숫자 ' || (e->>'round') END AS kind,
           count(*) AS n
      FROM "BarracksBattleLogRaw" r,
           LATERAL jsonb_array_elements(r."payload"->'battleLog') e
     WHERE r."status" = 'ok' AND e->>'event_text' IN ('C4 설치','C4 해체')
     GROUP BY 1,2 ORDER BY 1, 3 DESC LIMIT 24
  `
  for (const s of shape) console.info(`  ${s.txt}  ${s.kind.padEnd(12)} ${Number(s.n).toLocaleString()}회`)

  console.info('\n══ 2 · ★해체는 있는데 설치가 없는 라운드★ ══\n')
  const odd = await prisma.$queryRaw<{ label: string; n: bigint }[]>`
    WITH rr AS (
      SELECT r."matchKey", e->>'round' AS rnd,
             bool_or(e->>'event_text' = 'C4 설치') AS p,
             bool_or(e->>'event_text' = 'C4 해체') AS d
        FROM "BarracksBattleLogRaw" r,
             LATERAL jsonb_array_elements(r."payload"->'battleLog') e
       WHERE r."status" = 'ok' AND e->>'round' IS NOT NULL AND e->>'round' <> ''
       GROUP BY 1,2
    )
    SELECT CASE WHEN p AND d THEN '설치+해체' WHEN p THEN '설치만'
                WHEN d THEN '★해체만 (있을 수 없다)★' ELSE '둘 다 없음' END AS label,
           count(*) AS n FROM rr GROUP BY 1 ORDER BY 2 DESC
  `
  for (const o of odd) console.info(`  ${o.label.padEnd(26)} ${Number(o.n).toLocaleString()}라운드`)

  console.info('\n══ 3 · 해체만 있는 라운드 하나를 펼쳐 본다 ══\n')
  const one = await prisma.$queryRaw<{ k: string; rnd: string; evs: unknown }[]>`
    WITH rr AS (
      SELECT r."matchKey" AS k, e->>'round' AS rnd,
             bool_or(e->>'event_text' = 'C4 설치') AS p,
             bool_or(e->>'event_text' = 'C4 해체') AS d
        FROM "BarracksBattleLogRaw" r,
             LATERAL jsonb_array_elements(r."payload"->'battleLog') e
       WHERE r."status" = 'ok' AND e->>'round' IS NOT NULL AND e->>'round' <> ''
       GROUP BY 1,2
    ), pick AS (SELECT k, rnd FROM rr WHERE d AND NOT p LIMIT 1)
    SELECT pick.k, pick.rnd,
           jsonb_agg(jsonb_build_object('round', e->>'round', 't', e->>'event_time',
                                        'txt', e->>'event_text', 'typ', e->>'event_type',
                                        'team', e->>'team_no')) AS evs
      FROM pick JOIN "BarracksBattleLogRaw" r ON r."matchKey" = pick.k AND r."status" = 'ok',
           LATERAL jsonb_array_elements(r."payload"->'battleLog') e
     GROUP BY 1,2
  `
  if (one.length === 0) { console.info('  ★해체만 있는 라운드가 없다★'); return }
  const o = one[0]!
  console.info(`  경기 ${o.k} · 문제의 라운드 ${o.rnd}\n`)
  for (const e of o.evs as Record<string, unknown>[]) {
    if (e.txt !== null || e.round === o.rnd) console.info(`    R${e.round} ${e.t} ${e.typ} ${e.txt ?? ''} team=${e.team}`)
  }
}
main().catch(console.error).finally(() => prisma.$disconnect())
