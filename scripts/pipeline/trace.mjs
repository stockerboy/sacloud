/* ★표본 경기를 끝까지 따라간다★ (2026-09-08 · 사장님 지시)
 *
 *   «내일 20:51에 「24시간 동안 서버가 안 죽었습니다」가 아니라
 *     ★실제 경기들이 자동으로 발견되고 사이트까지 올라온 증거★ 를 보여줘»
 *
 * 한 경기가 지나는 다섯 관문을 시각으로 찍는다.
 *
 *   ① 경기         Match.startAt                     (원본에서 실제로 열린 때)
 *   ② 목록 RAW     BarracksClanMatchRaw.fetchedAt    (병영수첩 목록에서 찾은 때)
 *   ③ 배틀로그 RAW BarracksBattleLogRaw.fetchedAt    (상세를 받은 때)
 *   ④ Match        Match.ingestedAt                  (우리 경기로 만든 때)
 *   ⑤ 라인업       Match.lineupCheckedAt + 참가자 수  (명단이 붙은 때)
 *   ⑥ 사이트       운영 API 가 실제로 내주나          (--api 를 주면 확인한다)
 *
 * ⚠ 읽기만 한다. 쓰지 않는다.
 *
 * 쓰는 법:
 *   node scripts/pipeline/trace.mjs            최근 12경기
 *   node scripts/pipeline/trace.mjs 20         최근 20경기
 *   node scripts/pipeline/trace.mjs 8 --api    사이트까지 확인 (느리다)
 */
import { prisma } from './q.mjs'

const args = process.argv.slice(2)
const N = Number(args.find((a) => /^\d+$/.test(a)) ?? 12)
const CHECK_API = args.includes('--api')
/** `--since=3` 이면 「3시간 전보다 오래된 경기」부터 본다 — 뒷단계가 끝날 시간을 준다 */
const SINCE_H = Number((args.find((a) => a.startsWith('--since=')) ?? '--since=0').slice(8))
const SITE = process.env.SACLOUD_SITE ?? 'https://3rdcloud.my'

const rows = await prisma.$queryRaw`
  SELECT m."id", m."sourceMatchId" src, l."slug" league,
         m."startAt", m."ingestedAt", m."lineupCheckedAt", m."lineupStatus",
         (SELECT COUNT(*)::int FROM "MatchPlayerStat" s WHERE s."matchId" = m."id") players,
         (SELECT MIN(r."fetchedAt") FROM "BarracksClanMatchRaw" r WHERE r."matchKey" = m."sourceMatchId") listAt,
         (SELECT MIN(b."fetchedAt") FROM "BarracksBattleLogRaw" b WHERE b."matchKey" = m."sourceMatchId") logAt
    FROM "Match" m
    JOIN "League" l ON l."id" = m."leagueId"
   WHERE m."supersededAt" IS NULL
     AND m."startAt" <= NOW() - (${SINCE_H} || ' hours')::interval
   ORDER BY m."startAt" DESC
   LIMIT ${N}`

const hhmm = (d) => (d ? new Date(d).toLocaleTimeString('ko-KR', { hour12: false }).padStart(8) : '   —    ')
const gap = (from, to) => {
  if (!from || !to) return '  —  '
  const m = Math.round((new Date(to) - new Date(from)) / 60000)
  return (m < 0 ? '<0' : m + '분').padStart(5)
}

console.log('═'.repeat(96))
console.log(`  표본 ${rows.length}경기 · 끝까지 따라가기 · ${new Date().toLocaleString('ko-KR', { hour12: false })}`)
console.log('═'.repeat(96))
console.log('  경기시각    리그   ②목록   ③로그   ④Match  ⑤라인업  │ 경기→목록 →로그 →Match →라인업 │ 명단')
console.log('─'.repeat(96))

let done = 0
const totals = { list: [], log: [], match: [], lineup: [] }
for (const r of rows) {
  const full = r.lineupStatus === 'complete'
  if (full) done++
  const push = (k, a, b) => { if (a && b) totals[k].push((new Date(b) - new Date(a)) / 60000) }
  push('list', r.startAt, r.listat)
  push('log', r.startAt, r.logat)
  push('match', r.startAt, r.ingestedAt)
  push('lineup', r.startAt, r.lineupCheckedAt)

  console.log(
    `  ${hhmm(r.startAt)}  ${r.league.padEnd(6)} ${hhmm(r.listat)} ${hhmm(r.logat)} ${hhmm(r.ingestedAt)} ${hhmm(r.lineupCheckedAt)} │` +
      ` ${gap(r.startAt, r.listat)} ${gap(r.startAt, r.logat)} ${gap(r.startAt, r.ingestedAt)} ${gap(r.startAt, r.lineupCheckedAt)} │` +
      ` ${full ? '★' + r.players + '명★' : (r.lineupStatus ?? '아직') + ' ' + r.players + '명'}`)
}

const med = (a) => (a.length ? Math.round([...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]) + '분' : '—')
console.log('─'.repeat(96))
console.log(`  중앙값   경기→목록 ${med(totals.list)} · →로그 ${med(totals.log)} · →Match ${med(totals.match)} · →라인업 ${med(totals.lineup)}`)
console.log(`  명단 완성 ★${done}/${rows.length}경기★`)

if (CHECK_API) {
  console.log('\n  ⑥ 사이트가 실제로 내주는가 (캐시를 깨고 확인)')
  for (const r of rows.slice(0, 8)) {
    const url = `${SITE}/api/leagues/${r.league}/matches/${r.id}?cb=${Date.now()}${Math.random()}`
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) })
      const j = await res.json().catch(() => null)
      const d = j?.data
      const n = (d?.player_stat ?? []).length
      console.log(`     ${r.id}  HTTP ${res.status}  ${d ? '★내준다★' : '데이터없음'}  명단 ${n}명`)
    } catch (e) {
      console.log(`     ${r.id}  ★못 받음★ ${String(e).slice(0, 60)}`)
    }
  }
}
await prisma.$disconnect()
