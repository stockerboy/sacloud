/**
 * 로컬에서 정한 **전반 공수**를 운영에 채운다 (D-207 후속).
 * 재료(`matchFirstSideExport.ts` 가 만든 JSON)를 읽어 `Match.firstHalfAttackSide` 를 쓴다.
 *
 * ```
 * node scripts/prod-run.mjs match-first-side-push                # 미리보기
 * node scripts/prod-run.mjs match-first-side-push --confirm      # 실제 저장
 * ```
 *
 * ── 슬롯은 여기서 **다시 정한다**
 *   옮겨 온 것은 `sourceMatchId → 전반에 공격한 클랜 slug` 다.
 *   그 클랜이 이 DB 에서 red 슬롯이면 `red`, blue 슬롯이면 `blue` 다.
 *   어느 슬롯도 아니면(클랜 신원이 다르면) **그 경기는 건너뛴다.** 추측하지 않는다.
 *
 * ── 근거는 그대로 `barracks_bomb`
 *   판정의 근거는 병영수첩 폭탄이다. 옮겼다고 근거가 바뀌지 않는다.
 *
 * 멱등이다 — 이미 같은 값인 행은 쓰지 않는다.
 */
import { readFileSync } from 'node:fs'
import { prisma } from '@sacloud/db'

const EVIDENCE = 'barracks_bomb'
const WRITE_CHUNK = 500

/** `--file <경로>` 를 주지 않았거나 값이 비었으면 기본 이름을 읽는다 */
const fileIndex = process.argv.indexOf('--file')
const file = (fileIndex >= 0 ? process.argv[fileIndex + 1] : undefined) ?? 'first-side-export.json'
const confirm = process.argv.includes('--confirm')

const input = JSON.parse(readFileSync(file, 'utf8')) as {
  attackerBySourceMatchId: Record<string, string>
}
const attacker = new Map(Object.entries(input.attackerBySourceMatchId))

const result = {
  keys: attacker.size,
  matchRows: 0,
  /** 그 `sourceMatchId` 를 이 DB 에서 못 찾은 키 */
  noMatch: 0,
  /** 공격 클랜이 이 경기의 어느 슬롯도 아니어서 건너뛴 행 */
  clanMismatch: 0,
  decided: 0,
  redSlotAttacked: 0,
  blueSlotAttacked: 0,
  updated: 0,
  written: false,
}

const keys = [...attacker.keys()]
const matches: {
  id: string
  sourceMatchId: string | null
  firstHalfAttackSide: string | null
  redClan: { clan: { slug: string } }
  blueClan: { clan: { slug: string } }
}[] = []
for (let i = 0; i < keys.length; i += 1000) {
  matches.push(
    ...(await prisma.match.findMany({
      where: { sourceMatchId: { in: keys.slice(i, i + 1000) } },
      select: {
        id: true,
        sourceMatchId: true,
        firstHalfAttackSide: true,
        redClan: { select: { clan: { select: { slug: true } } } },
        blueClan: { select: { clan: { select: { slug: true } } } },
      },
    })),
  )
}
result.matchRows = matches.length
result.noMatch = keys.length - new Set(matches.map((m) => m.sourceMatchId)).size

const changed: { red: string[]; blue: string[] } = { red: [], blue: [] }
for (const match of matches) {
  const slug = match.sourceMatchId ? attacker.get(match.sourceMatchId) : undefined
  if (slug === undefined) continue
  let side: 'red' | 'blue' | null = null
  if (match.redClan.clan.slug === slug) side = 'red'
  else if (match.blueClan.clan.slug === slug) side = 'blue'
  if (side === null) {
    result.clanMismatch += 1
    continue
  }
  result.decided += 1
  if (side === 'red') result.redSlotAttacked += 1
  else result.blueSlotAttacked += 1
  if (match.firstHalfAttackSide === side) continue
  changed[side].push(match.id)
}
result.updated = changed.red.length + changed.blue.length

if (confirm) {
  for (const side of ['red', 'blue'] as const) {
    const ids = changed[side]
    for (let i = 0; i < ids.length; i += WRITE_CHUNK) {
      await prisma.match.updateMany({
        where: { id: { in: ids.slice(i, i + WRITE_CHUNK) } },
        data: { firstHalfAttackSide: side, firstSideEvidence: EVIDENCE },
      })
    }
  }
  result.written = true
}

console.info(JSON.stringify(result, null, 2))
if (!confirm) console.info('\n미리보기다. 저장하려면 --confirm 을 붙인다.')
await prisma.$disconnect()
