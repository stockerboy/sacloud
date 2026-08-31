/**
 * 전반 공수(선레드/선블루) 백필의 **재료와 결과를 센다** (D-207).
 *
 * ```
 * node scripts/prod-run.mjs match-first-side-check
 * ```
 *
 * ── 모순은 둘이다. 둘 다 0 이어야 한다
 *   ① 근거는 있는데 값이 없다 (`firstSideEvidence` O / `firstHalfAttackSide` X)
 *   ② 값은 있는데 근거가 없다 (그 반대)
 *   ③ 값이 `red`/`blue` 가 아니다
 */
import { prisma } from '@sacloud/db'

const raw = await prisma.barracksBattleLogRaw.groupBy({
  by: ['subjectKind', 'status'],
  _count: { _all: true },
})
const clanNumbers = await prisma.barracksClanNumber.count()
const matches = await prisma.match.count()
const filled = await prisma.match.count({ where: { firstHalfAttackSide: { not: null } } })
const red = await prisma.match.count({ where: { firstHalfAttackSide: 'red' } })
const blue = await prisma.match.count({ where: { firstHalfAttackSide: 'blue' } })

/* ① 근거만 있고 값이 없다 */
const evidenceWithoutSide = await prisma.match.count({
  where: { firstSideEvidence: { not: null }, firstHalfAttackSide: null },
})
/* ② 값만 있고 근거가 없다 */
const sideWithoutEvidence = await prisma.match.count({
  where: { firstHalfAttackSide: { not: null }, firstSideEvidence: null },
})
/* ③ red/blue 가 아닌 값 */
const badValue = await prisma.match.count({
  where: { firstHalfAttackSide: { notIn: ['red', 'blue'], not: null } },
})

console.info(
  JSON.stringify(
    {
      재료: { battleLogRaw: raw, clanNumbers },
      결과: { matches, filled, red, blue },
      모순: { evidenceWithoutSide, sideWithoutEvidence, badValue },
    },
    null,
    2,
  ),
)
const contradictions = evidenceWithoutSide + sideWithoutEvidence + badValue
console.info(contradictions === 0 ? '\n모순 0 — 통과' : `\n모순 ${contradictions}건 — 실패`)
await prisma.$disconnect()
if (contradictions !== 0) process.exitCode = 1
