/* 되메우기 뒤 확인 — deluxe 경기 수 · 자이언트 마지막 경기 · 오늘 만든 경기 (읽기만) */
import { PrismaClient } from './packages/db/generated/client/index.js'
const p = new PrismaClient()
const q = (sql) => p.$queryRawUnsafe(sql)
console.log('deluxe Match 수/최근:', JSON.stringify(await q(`SELECT COUNT(*)::int n, MAX(m."startAt")::text last FROM "Match" m JOIN "LeagueClan" lc ON lc."id" IN (m."redLeagueClanId", m."blueLeagueClanId") JOIN "Clan" c ON c."id"=lc."clanId" WHERE c."slug"='ferwfwfwfwf'`)))
console.log('자이언트 참가:', JSON.stringify(await q(`SELECT COUNT(*)::int n, MAX(m."startAt")::text last FROM "MatchPlayerStat" s JOIN "Match" m ON m."id"=s."matchId" WHERE s."playerId"='cmtler9ah00lavlew9wb734vt'`)))
console.log('자이언트 라인업 없는 deluxe 경기(최근 7일):', JSON.stringify(await q(`SELECT COUNT(*)::int n FROM "Match" m JOIN "LeagueClan" lc ON lc."id" IN (m."redLeagueClanId", m."blueLeagueClanId") JOIN "Clan" c ON c."id"=lc."clanId" WHERE c."slug"='ferwfwfwfwf' AND m."startAt" > now() - interval '7 days' AND NOT EXISTS (SELECT 1 FROM "MatchPlayerStat" s WHERE s."matchId"=m."id")`)))
console.log('최근 2시간 만든 Match:', JSON.stringify(await q(`SELECT COUNT(*)::int n FROM "Match" WHERE "updatedAt" > now() - interval '2 hours'`)))
console.log('그중 라인업 아직 없음:', JSON.stringify(await q(`SELECT COUNT(*)::int n FROM "Match" m WHERE m."updatedAt" > now() - interval '2 hours' AND NOT EXISTS (SELECT 1 FROM "MatchPlayerStat" s WHERE s."matchId"=m."id")`)))
await p.$disconnect()
