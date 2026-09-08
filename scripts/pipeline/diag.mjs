/* ★어디에서 멈췄는지 1~2분 안에 말해 주는 진단기★
 *
 * 사장님 지시(2026-09-08): «사이트를 보고 「왜 기록이 안 들어왔지?」 할 때
 *  30분 조사하지 않고 ★어느 단계가 문제인지 바로★ 알 수 있게»
 *
 * ⚠ ★「경기가 없는 것」과 「수집기가 죽은 것」을 반드시 가른다.★
 */
import { prisma } from './q.mjs'
const now = new Date()
const mins = (d) => (d ? Math.round((now - new Date(d)) / 60000) : null)
const hhmm = (d) => (d ? new Date(d).toLocaleTimeString('ko-KR', { hour12: false }) : '없음')

const x = (await prisma.$queryRaw`
  SELECT (SELECT MAX("requestedAt") FROM "BarracksListRequest")            askedAt,
         (SELECT MAX("fetchedAt")  FROM "BarracksClanMatchRaw")            listAt,
         (SELECT MAX("fetchedAt")  FROM "BarracksBattleLogRaw")            logAt,
         (SELECT MAX("ingestedAt") FROM "Match")                           matchAt,
         (SELECT MAX("lineupCheckedAt") FROM "Match" WHERE "lineupStatus"='complete') lineupAt,
         (SELECT MAX("startAt") FROM "Match" WHERE "supersededAt" IS NULL) gameAt`)[0]

/* 이 시간대에 원래 경기가 얼마나 열리나 — 최근 7일 같은 시각 */
const hr = new Date(now.getTime() + 9 * 3600000).getUTCHours()
const perHour = (await prisma.$queryRaw`
  SELECT COUNT(*)::int n FROM "Match" m
  WHERE m."supersededAt" IS NULL AND m."startAt" >= NOW() - INTERVAL '7 days'
    AND EXTRACT(HOUR FROM (m."startAt" AT TIME ZONE 'Asia/Seoul'))::int = ${hr}`)[0].n / 7

const stage = [
  ['① 병영수첩에 물어봤나', x.askedat, 40, '수집기가 안 돈다 — VPS cron/프로세스/임대를 본다'],
  ['② 클랜목록 RAW 가 왔나', x.listat, 90, '요청은 하는데 새 경기를 못 찾는다 — 큐가 죽은 클랜만 보는지 확인'],
  ['③ 배틀로그 RAW 가 왔나', x.logat, 60, '목록은 오는데 상세를 못 받는다 — 406/403 확인'],
  ['④ Match 를 만들었나', x.matchat, 120, '정규화(unified-project)가 안 돈다 — */5 cron 과 임대 확인'],
  ['⑤ 라인업 10명이 붙었나', x.lineupat, 150, '라인업 잡이 안 돈다 — */10 cron 과 임대 확인'],
]
console.log('═'.repeat(60))
console.log('  진단 · ' + now.toLocaleString('ko-KR', { hour12: false }))
console.log('═'.repeat(60))
let culprit = null
for (const [label, at, limit, hint] of stage) {
  const m = mins(at)
  const bad = m === null || m > limit
  if (bad && !culprit) culprit = [label, hint]
  console.log(`  ${bad ? '✘' : '✔'} ${label.padEnd(22)} ${hhmm(at).padEnd(10)} ${m === null ? '기록없음' : m + '분 전'}` +
    (bad ? `   ★${limit}분 넘음★` : ''))
}
console.log('')
const gm = mins(x.gameat)
if (!culprit) {
  console.log('  ★전 구간 정상★ — 마지막 경기 ' + hhmm(x.gameat) + ' (' + gm + '분 전)')
  if (gm > 60 && perHour < 15) {
    console.log(`  경기가 뜸한 건 ★이 시간대가 원래 시간당 ${perHour.toFixed(1)}경기★ 라서다. 고장이 아니다.`)
  }
} else {
  console.log('  ★★여기서 멈췄다 — ' + culprit[0] + '★★')
  console.log('     ' + culprit[1])
  if (perHour < 15 && culprit[0].startsWith('②')) {
    console.log(`     ⚠ 단 이 시간대는 원래 시간당 ${perHour.toFixed(1)}경기다 — ①이 정상이면 「새 경기가 없는 것」일 수 있다.`)
  }
}
await prisma.$disconnect()
