/**
 * 라플/스나 판별 가능성 조사 (읽기 전용).
 *
 *   pnpm --filter @sacloud/worker exec tsx src/dev/probeWeaponRole.ts
 *
 * 답해야 하는 것
 *   1. 넥슨 원본 응답에 경기별 무기/역할 정보가 **실제로 들어 있는가**
 *   2. 들어 있다면 정확한 필드명과 값의 형태는 무엇인가
 *   3. 지금 normalize 과정에서 그 값을 버리고 있는가
 *   4. 우리 DB(스테이징·운영)에 남아 있는가
 *
 * 추측하지 않는다. 원본에 있는 키를 전부 세어서 그대로 보여 준다.
 */
import { prisma } from '@sacloud/db'

/** 중첩 객체의 모든 키 경로를 모은다 */
function collectKeys(value: unknown, prefix = '', out = new Map<string, Set<string>>()): Map<string, Set<string>> {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, `${prefix}[]`, out)
    return out
  }
  if (value === null || typeof value !== 'object') {
    const bucket = out.get(prefix) ?? new Set<string>()
    bucket.add(value === null ? '(null)' : String(value).slice(0, 40))
    out.set(prefix, bucket)
    return out
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    collectKeys(child, prefix ? `${prefix}.${key}` : key, out)
  }
  return out
}

async function main(): Promise<void> {
  /* --- 1) 원본 응답에 실제로 있는 키 전부 --- */
  console.info('=== 1. 넥슨 원본 응답 키 (match-detail) ===\n')
  const details = await prisma.rawImport.findMany({
    where: { source: 'nexon', endpoint: { contains: 'match-detail' } },
    select: { raw: true },
    take: 50,
  })
  console.info(`match-detail 원본 ${details.length}건`)

  const keys = new Map<string, Set<string>>()
  for (const row of details) collectKeys(row.raw, '', keys)
  for (const [path, values] of [...keys.entries()].sort()) {
    const sample = [...values].slice(0, 4).join(' | ')
    console.info(`  ${path.padEnd(34)} 예: ${sample}`)
  }

  /* --- 2) 무기/역할로 쓸 수 있어 보이는 키가 있는가 --- */
  console.info('\n=== 2. 무기·역할로 쓸 만한 키 ===')
  const candidates = [...keys.keys()].filter((path) =>
    /weapon|gun|rifle|sniper|role|class|position|무기/i.test(path),
  )
  console.info(candidates.length === 0 ? '  없음' : candidates.map((k) => `  ${k}`).join('\n'))

  /* --- 3) 목록 응답에도 없는가 --- */
  console.info('\n=== 3. 넥슨 원본 응답 키 (match 목록) ===')
  const lists = await prisma.rawImport.findMany({
    where: { source: 'nexon', endpoint: '/suddenattack/v1/match' },
    select: { raw: true },
    take: 30,
  })
  const listKeys = new Map<string, Set<string>>()
  for (const row of lists) collectKeys(row.raw, '', listKeys)
  console.info([...listKeys.keys()].sort().map((k) => `  ${k}`).join('\n') || '  (없음)')

  /* --- 4) 유저 기본정보에는 있는가 (경기별이 아니라 계정 단위) --- */
  console.info('\n=== 4. 넥슨 원본 응답 키 (user/basic) ===')
  const users = await prisma.rawImport.findMany({
    where: { source: 'nexon', endpoint: { contains: 'basic' } },
    select: { raw: true },
    take: 20,
  })
  const userKeys = new Map<string, Set<string>>()
  for (const row of users) collectKeys(row.raw, '', userKeys)
  console.info([...userKeys.keys()].sort().map((k) => `  ${k}`).join('\n') || '  (없음)')

  /* --- 5) 우리 DB에는 무엇이 남아 있는가 --- */
  console.info('\n=== 5. 우리 DB의 무기 관련 값 ===')
  const weaponGroups = await prisma.matchPlayerStat.groupBy({
    by: ['weapon'],
    _count: { _all: true },
  })
  for (const group of weaponGroups) {
    console.info(`  MatchPlayerStat.weapon = ${group.weapon ?? '(null)'}  ${group._count._all}건`)
  }

  const nexonWeapon = await prisma.matchPlayerStat.groupBy({
    by: ['weapon'],
    where: { match: { origin: 'nexon' } },
    _count: { _all: true },
  })
  console.info('\n  실수집(origin=nexon)만:')
  for (const group of nexonWeapon) {
    console.info(`    weapon = ${group.weapon ?? '(null)'}  ${group._count._all}건`)
  }

  console.info('\n  스테이징 참가자(NexonMatchParticipant) 컬럼:')
  const participant = await prisma.nexonMatchParticipant.findFirst()
  console.info(`    ${participant ? Object.keys(participant).join(', ') : '(행 없음)'}`)

  console.info('\n  운영 참가기록(MatchPlayerStat) 컬럼:')
  const stat = await prisma.matchPlayerStat.findFirst({ where: { match: { origin: 'nexon' } } })
  console.info(`    ${stat ? Object.keys(stat).join(', ') : '(행 없음)'}`)
  if (stat) console.info(`    실제 값 예: ${JSON.stringify(stat)}`)
}

main()
  .catch((error: unknown) => console.error(error))
  .finally(() => prisma.$disconnect())
