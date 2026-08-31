/**
 * **가짜 시드 고아 행 청소** (2026-08-31).
 *
 * ── 왜 따로 필요한가
 *   `mockLeaguePurge` 가 운영에서 **선수 삭제 단계에 타임아웃**으로 끊겼다.
 *   그때 이미 `LeagueClan` · `LeaguePlayer` 는 지워진 뒤였고, 그러면
 *   "이 리그에만 있는 클랜/선수" 를 찾는 조건이 **더 이상 안 걸린다.**
 *   결과: 리그는 사라졌는데 가짜 선수 920명 · 가짜 클랜 62곳이 **고아로 남았다.**
 *
 *   실행 순서에 따라 이런 구멍이 생기므로, 고아만 따로 치우는 도구를 둔다.
 *
 * ── 무엇을 지우나 — **고아이면서 가짜인 것만**
 *   ```
 *   선수   origin = 'mock'        그리고 어느 리그에도 안 속함
 *   클랜   sourceClanId 가 없음    그리고 어느 리그에도 안 속함
 *   ```
 *   둘 다 만족해야 지운다. 진짜 데이터는 `origin`·`sourceClanId` 가 있어서 안 걸린다.
 *
 * ── 안전 장치
 *   · `--confirm` 없이는 한 줄도 지우지 않는다
 *   · 지우기 전에 **이름 목록을 백업**한다
 *   · 50개씩 끊어 지운다 — 한 번에 지우면 운영에서 statement timeout 이 난다
 *   · 경기 기록이 하나라도 붙어 있는 선수는 **건너뛴다** (고아가 아니라는 뜻이다)
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { prisma } from '@sacloud/db'
import { REPO_ROOT } from '../lib/env.js'

const confirm = process.argv.includes('--confirm')
const CHUNK = 50

const orphanPlayers = await prisma.player.findMany({
  where: { origin: 'mock', leaguePlayers: { none: {} }, matchStats: { none: {} } },
  select: { id: true, name: true },
})
const orphanClans = await prisma.clan.findMany({
  where: { sourceClanId: null, leagueClans: { none: {} } },
  select: { id: true, name: true, slug: true },
})

/** 경기 기록이 붙어 있어 못 지우는 선수 — 세어서 알린다 */
const withStats = await prisma.player.count({
  where: { origin: 'mock', leaguePlayers: { none: {} }, matchStats: { some: {} } },
})

console.info(`고아 선수(mock · 기록 없음) ${orphanPlayers.length.toLocaleString()}`)
console.info(`고아 클랜(원본id 없음)      ${orphanClans.length.toLocaleString()}`)
if (withStats > 0) console.info(`⚠ 기록이 붙어 있어 안 지우는 mock 선수 ${withStats.toLocaleString()}`)

if (!confirm) {
  console.info('\n--confirm 없이는 한 줄도 지우지 않았다')
  console.info(`표본 선수: ${orphanPlayers.slice(0, 5).map((p) => p.name).join(', ')}`)
  console.info(`표본 클랜: ${orphanClans.slice(0, 5).map((c) => c.name).join(', ')}`)
  await prisma.$disconnect()
  process.exit(0)
}

const dir = join(REPO_ROOT, 'apps', 'worker', 'backups', 'mock-league')
mkdirSync(dir, { recursive: true })
const file = join(dir, `orphan-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
writeFileSync(file, JSON.stringify({ purgedAt: new Date().toISOString(), orphanPlayers, orphanClans }), 'utf8')
console.info(`\n백업을 떴다: ${file}`)

const chunk = <T,>(xs: T[]) => {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += CHUNK) out.push(xs.slice(i, i + CHUNK))
  return out
}

let players = 0
for (const part of chunk(orphanPlayers.map((p) => p.id))) {
  players += (await prisma.player.deleteMany({ where: { id: { in: part } } })).count
  console.info(`  ... 선수 ${players.toLocaleString()} / ${orphanPlayers.length.toLocaleString()}`)
}
let clans = 0
for (const part of chunk(orphanClans.map((c) => c.id))) {
  clans += (await prisma.clan.deleteMany({ where: { id: { in: part } } })).count
}

console.info(`\n삭제 완료 — 선수 ${players.toLocaleString()} · 클랜 ${clans.toLocaleString()}`)
await prisma.$disconnect()
