/* ★파이프라인 건강 확인★ — 읽기만 한다.
 *
 *  사장님 지시(2026-09-08): «내가 사이트를 보고 몇 시간 뒤에야 「또 기록 안 들어오네?」라고
 *  발견하면 실패다» — 그래서 이 한 장으로 전 구간을 본다.
 *
 *  ⚠ ★「신규 경기가 없는 것」과 「수집기가 죽은 것」을 가른다.★
 *    경기가 없는 시간대(낮 2~6시)를 장애로 부르면 안 된다.
 */
import { prisma } from './q.mjs'
/* ★규칙은 한 곳에서만 온다★ — `queueRule.mjs` 가 잡과 같은 규칙을 들고 있다 */
import { coverage } from './queueRule.mjs'

const now = new Date()
const hhmm = (d) => (d ? new Date(d).toLocaleString('ko-KR', { hour12: false }).slice(5) : '없음')
const mins = (d) => (d ? Math.round((now - new Date(d)) / 60000) : null)
const pad = (s, n) => String(s).padEnd(n)
const OK = '✔'; const BAD = '✘'; const WARN = '△'

const q1 = await prisma.$queryRaw`
  SELECT (SELECT MAX("fetchedAt") FROM "BarracksClanMatchRaw") listRaw,
         (SELECT MAX("fetchedAt") FROM "BarracksBattleLogRaw")  logRaw,
         (SELECT MAX("ingestedAt") FROM "Match")                 matchAt,
         (SELECT MAX("lineupCheckedAt") FROM "Match" WHERE "lineupStatus"='complete') lineupAt,
         (SELECT MAX("startAt") FROM "Match" WHERE "supersededAt" IS NULL)            lastGame`
const x = q1[0]

/* 최근 시간대에 실제로 경기가 열리는 시간인가 — 최근 7일 같은 시간대 평균 */
const hr = new Date(now.getTime() + 9 * 3600000).getUTCHours()
const q2 = await prisma.$queryRaw`
  SELECT COUNT(*)::int n FROM "Match" m
  WHERE m."supersededAt" IS NULL AND m."startAt" >= NOW() - INTERVAL '7 days'
    AND EXTRACT(HOUR FROM (m."startAt" AT TIME ZONE 'Asia/Seoul'))::int = ${hr}`
const perHour = q2[0].n / 7

/* 큐 포함률 — 지금 뽑으면 오늘 경기한 클랜이 몇 % 들어오나 (수정판 규칙 그대로) */
const cov = await coverage(prisma)
const reqRows = (await prisma.$queryRaw`SELECT COUNT(*)::int n FROM "BarracksListRequest"`)[0].n

const covPct = cov.pct

const leases = await prisma.$queryRaw`
  SELECT "name","host","releasedAt","heartbeatAt" FROM "CollectorLease" ORDER BY "name"`

console.log('═'.repeat(64))
console.log(`  파이프라인 상태 · ${now.toLocaleString('ko-KR', { hour12: false })}`)
console.log('═'.repeat(64))
const line = (no, label, val, mark, extra) =>
  console.log(`  ${no} ${pad(label, 22)} ${pad(val, 22)} ${mark}${extra ? '  ' + extra : ''}`)

line('①', '큐 포함률',
  `${cov.inQueue}/${cov.total}곳 (${covPct}%)`,
  covPct >= 80 ? OK : covPct >= 50 ? WARN : BAD,
  `요청기록 ${reqRows}행`)
line('②', '마지막 clan list RAW', `${hhmm(x.listraw)} (${mins(x.listraw)}분 전)`,
  mins(x.listraw) === null ? BAD : mins(x.listraw) <= 90 ? OK : WARN)
line('  ', '마지막 battlelog RAW', `${hhmm(x.lograw)} (${mins(x.lograw)}분 전)`,
  mins(x.lograw) !== null && mins(x.lograw) <= 60 ? OK : WARN)
line('③', '마지막 Match 생성', `${hhmm(x.matchat)} (${mins(x.matchat)}분 전)`,
  mins(x.matchat) !== null && mins(x.matchat) <= 120 ? OK : WARN)
line('④', '마지막 complete lineup', `${hhmm(x.lineupat)} (${mins(x.lineupat)}분 전)`,
  mins(x.lineupat) !== null && mins(x.lineupat) <= 120 ? OK : WARN)
line('⑤', '가장 최근 경기(원본)', `${hhmm(x.lastgame)} (${mins(x.lastgame)}분 전)`, '·',
  `이 시간대 평균 ${perHour.toFixed(1)}경기/시간`)
console.log('')
console.log('  ★「경기가 없는 것」과 「수집기가 죽은 것」 구분★')
if (perHour < 15) {
  console.log(`     이 시간대는 원래 시간당 ${perHour.toFixed(1)}경기다 — 조용한 것이 정상일 수 있다.`)
  console.log(`     ★판정은 ②(clan list RAW)로 한다★ — 요청은 경기가 없어도 나간다.`)
} else {
  console.log(`     이 시간대는 시간당 ${perHour.toFixed(1)}경기가 정상이다 — 경기가 안 들어오면 이상이다.`)
}
console.log('\n  임대')
for (const l of leases) {
  const hb = mins(l.heartbeatAt)
  console.log(`     ${pad(l.name, 18)}${pad(l.host, 16)}${l.releasedAt ? '놓음' : '쥐고있음'}` +
    `  심장박동 ${hb === null ? '-' : hb + '분 전'}` +
    (!l.releasedAt && hb !== null && hb > 20 ? '   ★죽은 임대 의심★' : ''))
}
await prisma.$disconnect()
