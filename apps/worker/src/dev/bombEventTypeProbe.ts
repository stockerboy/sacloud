/**
 * **폭탄 사건은 `event_type` 에 있다** (2026-09-03 · 읽기 전용).
 *
 * 「해체만 있고 설치가 없는 라운드」 1,825개를 펼쳐 보니 —
 * ```
 * R15 22:49 event_type=bomb   (event_text 없음)   ← ★이게 설치다★
 * R15 23:19 event_text=C4 해체
 * ```
 * ★`event_text='C4 설치'` 로만 세면 설치를 놓친다.★ 종류부터 다시 센다.
 */
import { prisma } from '@sacloud/db'

async function main() {
  console.info('══ event_type 종류 ══\n')
  const t = await prisma.$queryRaw<{ typ: string | null; txt: string | null; n: bigint }[]>`
    SELECT e->>'event_type' AS typ, e->>'event_text' AS txt, count(*) AS n
      FROM "BarracksBattleLogRaw" r,
           LATERAL jsonb_array_elements(r."payload"->'battleLog') e
     WHERE r."status" = 'ok'
     GROUP BY 1,2 ORDER BY 3 DESC LIMIT 20
  `
  for (const x of t) {
    console.info(`  type=${(x.typ ?? 'null').padEnd(10)} text=${(x.txt ?? '(없음)').padEnd(12)} ${Number(x.n).toLocaleString()}회`)
  }

  console.info('\n══ ★라운드 단위 다시 세기 (bomb 을 설치로 본다)★ ══\n')
  const r = await prisma.$queryRaw<{ label: string; n: bigint }[]>`
    WITH rr AS (
      SELECT r."matchKey", e->>'round' AS rnd,
             bool_or(e->>'event_type' = 'bomb' OR e->>'event_text' = 'C4 설치') AS p,
             bool_or(e->>'event_text' = 'C4 해체')                              AS d
        FROM "BarracksBattleLogRaw" r,
             LATERAL jsonb_array_elements(r."payload"->'battleLog') e
       WHERE r."status" = 'ok' AND e->>'round' IS NOT NULL AND e->>'round' <> ''
       GROUP BY 1,2
    )
    SELECT CASE WHEN p AND d THEN '설치+해체' WHEN p THEN '★설치만 (해체 없음)★'
                WHEN d THEN '★해체만 (아직도 있으면 문제)★' ELSE '둘 다 없음' END AS label,
           count(*) AS n FROM rr GROUP BY 1 ORDER BY 2 DESC
  `
  let tot = 0
  for (const x of r) tot += Number(x.n)
  for (const x of r) {
    const n = Number(x.n)
    console.info(`  ${x.label.padEnd(30)} ${n.toLocaleString().padStart(7)}라운드 ${((100*n)/tot).toFixed(1)}%`)
  }
}
main().catch(console.error).finally(() => prisma.$disconnect())
