/* ★경기 종료 → 사이트 반영 까지 실제 지연★ — 오늘 저녁 경기 표본 */
import { prisma, t } from './q.mjs'
const rows = await prisma.$queryRaw`
  SELECT l."slug" lg, m."sourceMatchId" key, m."startAt", m."ingestedAt", m."lineupCheckedAt", m."lineupStatus",
         (SELECT MIN(r."fetchedAt") FROM "BarracksBattleLogRaw" r
           WHERE r."matchKey"=m."sourceMatchId" AND r."status"='ok') logAt
  FROM "Match" m JOIN "League" l ON l."id"=m."leagueId"
  WHERE m."supersededAt" IS NULL AND m."origin"='nexon_barracks'
    AND m."startAt" >= NOW() - INTERVAL '6 hours'
  ORDER BY m."startAt" DESC LIMIT 22`
const mm = (a, b) => (a && b ? Math.round((new Date(b) - new Date(a)) / 60000) : null)
const f = (v) => (v === null ? '  —  ' : String(v).padStart(4) + '분')
console.log('★오늘 저녁 경기 — 단계별 지연 (경기시각 기준)★')
console.log('  리그      경기시각    →Match  →배틀로그  →라인업  총지연  상태')
let done = [], mt = [], lu = []
for (const r of rows) {
  const a = mm(r.startAt, r.ingestedAt), b = mm(r.startAt, r.logat), c = mm(r.startAt, r.lineupCheckedAt)
  if (a !== null) mt.push(a)
  if (c !== null && r.lineupStatus === 'complete') { lu.push(c); done.push(c) }
  console.log('  ' + String(r.lg).padEnd(9) + new Date(r.startAt).toLocaleTimeString('ko-KR',{hour12:false})
    + f(a) + f(b) + f(c) + f(c) + '  ' + (r.lineupStatus ?? '대기'))
}
const med = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }
console.log('\n★요약 (표본 ' + rows.length + '경기)★')
console.log('  경기 → Match      중앙값 ' + (med(mt) ?? '-') + '분  (표본 ' + mt.length + ')')
console.log('  경기 → 라인업완료   중앙값 ' + (med(lu) ?? '-') + '분  (표본 ' + lu.length + ')')
console.log('  ★라인업까지 끝난 비율 ' + done.length + '/' + rows.length + '★')
await prisma.$disconnect()
