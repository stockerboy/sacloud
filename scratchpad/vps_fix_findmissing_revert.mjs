/**
 * ★clan-find-missing 이 만든 미등록 클랜 22곳 — 다시 숨기고, 그 때문에 생긴 경기를 되돌린다★ (2026-09-24 사장님 「arcenciel 등록도 안 됐는데 왜 자꾸 떠」)
 *
 * 무슨 일이 있었나
 *   09-22 00:15  clan-find-missing 이 만든 23줄 등록을 expelledAt 로 숨겼다 (657b0cd8 「개잡사와 한 경기는 기록하지 않는다」)
 *   09-23 밤     인계 세션이 그 23줄을 「cpl-setup 이 잘못 내린 것」 으로 오판하고 probe22 로 되살렸다
 *   09-24 새벽   되메우기(--from-start)가 그 클랜들의 경기 193건을 다시 만들었다 (arcenciel 15건 …)
 *
 * 하는 일 (되돌릴 파일을 먼저 쓴다)
 *   1. 그 22 LeagueClan 줄을 다시 숨긴다 (expelledAt = now)
 *   2. 그 줄이 낀 Match 는 ★지우지 않고 supersededAt 로 숨긴다★ — 657b0cd8 이 115경기를 되돌린 방법 그대로 (지우지 않는다 · CLAUDE.md 2-2)
 *   3. 그 클랜 22곳 Clan.active=false (랭킹에서 안 보이게 · 657b0cd8 과 같음). 전부 백업 파일에 먼저 적는다
 *
 *   node fix_findmissing_revert.mjs            # 미리보기
 *   node fix_findmissing_revert.mjs --confirm  # 반영 (백업: data/findmissing-revert/<시각>.json)
 */
import { PrismaClient } from './packages/db/generated/client/index.js'
import { mkdirSync, writeFileSync } from 'node:fs'
const p = new PrismaClient()
const confirm = process.argv.includes('--confirm')
const FROM = '2026-09-21 16:00'
const TO = '2026-09-21 18:00'

const lcs = await p.$queryRawUnsafe(`
  SELECT lc.*, c."name" clan_name, c."slug" clan_slug, l."slug" league_slug
  FROM "LeagueClan" lc JOIN "Clan" c ON c."id"=lc."clanId" JOIN "League" l ON l."id"=lc."leagueId"
  WHERE c."createdAt" >= '${FROM}' AND c."createdAt" < '${TO}' AND lc."expelledAt" IS NULL`)
const lcIds = lcs.map((r) => r.id)
console.log(`숨길 등록 ${lcs.length}줄:`, lcs.map((r) => `${r.clan_name}(${r.league_slug})`).join(' · '))
if (lcIds.length === 0) { await p.$disconnect(); process.exit(0) }
const inList = lcIds.map((id) => `'${id}'`).join(',')
const matches = await p.$queryRawUnsafe(`SELECT * FROM "Match" m WHERE (m."redLeagueClanId" IN (${inList}) OR m."blueLeagueClanId" IN (${inList})) AND m."supersededAt" IS NULL`)
const mIds = matches.map((m) => m.id)
const mIn = mIds.length ? mIds.map((id) => `'${id}'`).join(',') : `''`
const stats = await p.$queryRawUnsafe(`SELECT * FROM "MatchPlayerStat" WHERE "matchId" IN (${mIn})`)
const hexes = await p.$queryRawUnsafe(`SELECT * FROM "MatchPlayerHex" WHERE "matchId" IN (${mIn})`)
const clanHex = await p.$queryRawUnsafe(`SELECT * FROM "MatchClanHexV2" WHERE "matchId" IN (${mIn})`)
console.log(`숨길 경기 ${matches.length} · 참가 ${stats.length} · 선수육각 ${hexes.length} · 클랜육각 ${clanHex.length}`)
const byLeague = {}
for (const m of matches) byLeague[m.leagueId] = (byLeague[m.leagueId] ?? 0) + 1
console.log('리그별', JSON.stringify(byLeague))
if (!confirm) { console.log('미리보기다. 반영하려면 --confirm'); await p.$disconnect(); process.exit(0) }

mkdirSync('data/findmissing-revert', { recursive: true })
const path = `data/findmissing-revert/${new Date().toISOString().replace(/[:.]/g, '-')}.json`
writeFileSync(path, JSON.stringify({ at: new Date().toISOString(), leagueClans: lcs, matches, stats, hexes, clanHex }, (k, v) => (typeof v === 'bigint' ? Number(v) : v)))
console.log('백업', path)
const now = new Date()
await p.$transaction(async (tx) => {
  const d = mIds.length ? await tx.match.updateMany({ where: { id: { in: mIds } }, data: { supersededAt: now } }) : { count: 0 }
  const e = await tx.leagueClan.updateMany({ where: { id: { in: lcIds } }, data: { expelledAt: now } })
  let a = { count: 0 }
  try { a = await tx.clan.updateMany({ where: { id: { in: lcs.map((r) => r.clanId) } }, data: { active: false } }) } catch { console.log('Clan.active 칸 없음 — 건너뜀') }
  console.log(`숨긴 경기 ${d.count} · 숨긴 등록 ${e.count} · 비활성 클랜 ${a.count}`)
})
await p.$disconnect()
