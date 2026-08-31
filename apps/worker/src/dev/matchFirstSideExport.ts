/**
 * 로컬에서 정한 **전반 공수**를 운영으로 옮기기 위한 **내보내기** (D-207 후속).
 *
 * ── 왜 운영에서 `matchFirstSideBuild` 를 못 돌리는가
 *   그 잡의 재료는 병영수첩 배틀로그 원문(`BarracksBattleLogRaw`)과
 *   클랜번호 대응표(`BarracksClanNumber`)다. **운영에는 둘 다 0건이다** (실측).
 *   원문은 한 줄이 수 MB 라 운영으로 통째로 올릴 물건이 아니다.
 *   그래서 **판정 결과만** 옮긴다. 판정은 로컬에서 이미 근거를 갖고 냈다.
 *
 * ── 슬롯 이름을 그대로 옮기지 않는다
 *   `firstHalfAttackSide` 는 `"red"`/`"blue"` 라는 **우리 슬롯 자리**다.
 *   같은 경기라도 운영의 슬롯 배정이 로컬과 같다는 보장을 여기서 하지 않는다.
 *   그래서 슬롯 대신 **전반에 공격한 클랜의 slug** 를 옮기고, 받는 쪽에서
 *   자기 슬롯과 대조해 다시 `red`/`blue` 를 정한다 (`matchFirstSidePush.ts`).
 *
 * ```
 * pnpm --filter @sacloud/worker exec tsx src/dev/matchFirstSideExport.ts [--out <경로>]
 * ```
 */
import { writeFileSync } from 'node:fs'
import { prisma } from '@sacloud/db'

/** `--out <경로>` 를 주지 않았거나 값이 비었으면 기본 이름으로 쓴다 */
const outIndex = process.argv.indexOf('--out')
const out = (outIndex >= 0 ? process.argv[outIndex + 1] : undefined) ?? 'first-side-export.json'

const rows = await prisma.match.findMany({
  where: { firstSideEvidence: 'barracks_bomb', firstHalfAttackSide: { not: null } },
  select: {
    sourceMatchId: true,
    firstHalfAttackSide: true,
    redClan: { select: { clan: { select: { slug: true } } } },
    blueClan: { select: { clan: { select: { slug: true } } } },
  },
})

/** `sourceMatchId` → 전반에 공격한 클랜 slug. 같은 키가 여러 리그에 있어도 사실은 하나다 */
const attacker = new Map<string, string>()
let conflicts = 0
for (const row of rows) {
  if (!row.sourceMatchId) continue
  const slug =
    row.firstHalfAttackSide === 'red' ? row.redClan.clan.slug : row.blueClan.clan.slug
  const seen = attacker.get(row.sourceMatchId)
  if (seen !== undefined && seen !== slug) {
    /* 같은 물리 경기인데 리그마다 답이 다르다 — 옮기지 않는다 */
    conflicts += 1
    attacker.delete(row.sourceMatchId)
    continue
  }
  attacker.set(row.sourceMatchId, slug)
}

const payload = {
  evidence: 'barracks_bomb',
  exportedAt: new Date().toISOString(),
  matchRows: rows.length,
  conflicts,
  /** `sourceMatchId` → 전반 공격 클랜 slug */
  attackerBySourceMatchId: Object.fromEntries(attacker),
}
writeFileSync(out, JSON.stringify(payload), 'utf8')
console.info(
  JSON.stringify(
    { matchRows: rows.length, keys: attacker.size, conflicts, out },
    null,
    2,
  ),
)
await prisma.$disconnect()
