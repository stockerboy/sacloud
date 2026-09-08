/* ★시간이 지나면 터지는 조건★ 을 적극적으로 찾는다 (읽기만) */
import { prisma, t } from './q.mjs'
const now = new Date()
console.log('★① 임대 — TTL 대비 timeout 이 더 길면 공백이 생긴다★')
const l = await prisma.$queryRaw`SELECT "name","host","releasedAt","expiresAt","heartbeatAt" FROM "CollectorLease" ORDER BY "name"`
const TTL = { 'barracks-collect': [1200, 3300], 'unified-project': [600, 540], 'battlelog-lineup': [1800, 900], 'season0-apply': [900, 1500] }
for (const r of l) {
  const [ttl, to] = TTL[r.name] ?? [0, 0]
  const gap = to > ttl ? `★timeout(${to}s) > TTL(${ttl}s) — 죽으면 최대 ${Math.round((to - ttl) / 60)}분 공백★` : `timeout ${to}s ≤ TTL ${ttl}s — 안전`
  console.log('  ' + String(r.name).padEnd(18) + (r.releasedAt ? '놓음' : '쥐고있음').padEnd(9) + gap)
}
console.log('\n★② 한 회차가 다음 회차보다 길어지는가 (겹침 위험)★')
console.log('  수집 한 바퀴 실측 1,267초(21분) · cron 주기 900초(15분) → ★겹친다. flock 이 막는다★')
console.log('  정규화 실측 15~28초 · 주기 300초 → 안전')
console.log('  라인업 실측 8~12초 · 주기 600초 → 안전')

console.log('\n★③ 오래된 timestamp 때문에 특정 클랜이 영구 우선되는가★')
const stuck = await prisma.$queryRaw`
  SELECT c."slug", q."requests", q."failures", q."requestedAt", q."okAt"
    FROM "BarracksListRequest" q JOIN "Clan" c ON c."slug"=q."subject"
   WHERE q."failures" >= 3 AND q."okAt" IS NULL
   ORDER BY q."failures" DESC LIMIT 5`
console.log(stuck.length
  ? '  ★계속 실패만 하는 클랜 ' + stuck.length + '곳★ — ' + stuck.map(s => s.slug + '(' + s.failures + '회)').join(' · ')
  : '  없음 — 요청한 곳은 전부 한 번은 200 을 받았다')

console.log('\n★④ 라인업이 영원히 안 붙는 경기가 쌓이는가★')
const lu = await prisma.$queryRaw`
  SELECT "lineupStatus" s, COUNT(*)::int n,
         SUM(CASE WHEN "lineupCheckedAt" < NOW() - INTERVAL '2 hours' THEN 1 ELSE 0 END)::int old
  FROM "Match" WHERE "supersededAt" IS NULL AND "startAt" >= NOW() - INTERVAL '7 days'
  GROUP BY 1 ORDER BY 2 DESC`
for (const r of lu) console.log('  ' + String(r.s ?? '(아직 안 봄)').padEnd(14) + t(r.n, 6) + '건 · 2시간 넘게 방치 ' + r.old + '건')

console.log('\n★⑤ 중복 Match 가 생기는가★')
const dup = await prisma.$queryRaw`
  SELECT COUNT(*)::int n FROM (
    SELECT "sourceMatchId", "origin", COUNT(*) c FROM "Match"
    WHERE "supersededAt" IS NULL AND "startAt" >= NOW() - INTERVAL '2 days'
    GROUP BY 1,2 HAVING COUNT(*) > 1) z`
console.log('  최근 2일 중복 ' + dup[0].n + '건' + (dup[0].n ? '  ★확인 필요★' : '  ✔'))

console.log('\n★⑥ DB 연결 오류 흔적★')
const q = await prisma.$queryRaw`SELECT COUNT(*)::int n FROM pg_stat_activity WHERE datname = current_database()`
console.log('  지금 이 DB 에 붙어 있는 연결 ' + q[0].n + '개')
await prisma.$disconnect()
