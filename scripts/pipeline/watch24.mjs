/* ★24시간 무인검증 기록기★ (2026-09-08 · 사장님 지시)
 *
 *   «내일 20:51에 「24시간 동안 서버가 안 죽었습니다」가 아니라
 *     ★실제 경기들이 자동으로 발견되고 사이트까지 올라온 증거★ 를 보여줘»
 *
 * 사장님이 적어 주신 항목을 한 회차에 전부 찍는다 —
 *   신규 경기 · 경기→RAW→Match→라인업→API · 단계별 지연 · 누락 경기 수 ·
 *   cron 성공/실패 · VPS CPU/RAM · 크롬/노드 프로세스 · 죽은 임대 ·
 *   큐 포함률 · DB 오류 · 406 발생량과 낭비 시간
 *
 * ⚠ ★읽기만 한다.★ DB 에 한 줄도 쓰지 않는다.
 *
 * 쓰는 법:
 *   node scripts/pipeline/watch24.mjs            한 회차 (사람이 읽는 줄 + JSONL 적립)
 *   node scripts/pipeline/watch24.mjs --summary  지금까지 적립된 것을 요약
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { prisma } from './q.mjs'
import { coverage } from './queueRule.mjs'

const OUT = new URL('watch24.jsonl', import.meta.url)
const SITE = process.env.SACLOUD_SITE ?? 'https://3rdcloud.my'
const VPS = process.env.SACLOUD_VPS ?? 'root@49.247.203.71'
const KEY = process.env.SACLOUD_VPS_KEY ?? 'C:/Users/LG/.ssh/sacloud_vps'
const LEAGUES = ['nolink', 'supply', 'sanply']

if (process.argv.includes('--summary')) {
  summary()
  process.exit(0)
}

const now = new Date()
const mins = (d) => (d ? Math.round((now - new Date(d)) / 60000) : null)
const hhmm = (d) => (d ? new Date(d).toLocaleTimeString('ko-KR', { hour12: false }) : '—')

/* ── ① DB 쪽 — 한 번에 훑는다 ─────────────────────────────── */
let db = null
let dbError = null
try {
  db = (
    await prisma.$queryRaw`
    SELECT
      (SELECT MAX("requestedAt") FROM "BarracksListRequest")                       askedAt,
      (SELECT MAX("fetchedAt")   FROM "BarracksClanMatchRaw")                      listAt,
      (SELECT MAX("fetchedAt")   FROM "BarracksBattleLogRaw")                      logAt,
      (SELECT MAX("ingestedAt")  FROM "Match")                                     matchAt,
      (SELECT MAX("lineupCheckedAt") FROM "Match" WHERE "lineupStatus"='complete') lineupAt,
      (SELECT MAX("startAt") FROM "Match" WHERE "supersededAt" IS NULL)            gameAt,
      (SELECT COUNT(*)::int FROM "Match" WHERE "supersededAt" IS NULL)             matchRows,
      (SELECT COUNT(*)::int FROM "Match" WHERE "lineupStatus"='complete')          lineupRows,
      (SELECT SUM("requests")::int FROM "BarracksListRequest")                     reqTotal,
      (SELECT SUM("failures")::int FROM "BarracksListRequest")                     failTotal,
      (SELECT COUNT(*)::int FROM "CollectorLease"
        WHERE "releasedAt" IS NULL AND "heartbeatAt" < NOW() - INTERVAL '20 minutes') staleLease,
      (SELECT COUNT(*)::int FROM "Match"
        WHERE "supersededAt" IS NULL AND "startAt" < NOW() - INTERVAL '2 hours'
          AND "startAt" >= NOW() - INTERVAL '6 hours'
          AND "lineupStatus" IS DISTINCT FROM 'complete')                          missing6h,
      (SELECT COUNT(*)::int FROM "Match"
        WHERE "supersededAt" IS NULL AND "startAt" >= NOW() - INTERVAL '1 hour')   newGames1h`
  )[0]
} catch (e) {
  dbError = String(e?.message ?? e).split('\n')[0].slice(0, 160)
}

/* 단계별 지연 — 최근 3시간에 열린 경기의 중앙값 */
let lat = { list: null, log: null, match: null, lineup: null, n: 0 }
if (!dbError) {
  try {
    const r = (
      await prisma.$queryRaw`
      WITH s AS (
        SELECT m."startAt",
               (SELECT MIN(x."fetchedAt") FROM "BarracksClanMatchRaw" x WHERE x."matchKey"=m."sourceMatchId") l1,
               (SELECT MIN(b."fetchedAt") FROM "BarracksBattleLogRaw" b WHERE b."matchKey"=m."sourceMatchId") l2,
               m."ingestedAt" l3, m."lineupCheckedAt" l4
          FROM "Match" m
         WHERE m."supersededAt" IS NULL AND m."startAt" >= NOW() - INTERVAL '3 hours'
      )
      SELECT COUNT(*)::int n,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (l1-"startAt"))/60) m1,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (l2-"startAt"))/60) m2,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (l3-"startAt"))/60) m3,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (l4-"startAt"))/60) m4
        FROM s`
    )[0]
    const r0 = (v) => (v === null ? null : Math.round(v))
    lat = { n: r.n, list: r0(r.m1), log: r0(r.m2), match: r0(r.m3), lineup: r0(r.m4) }
  } catch (e) {
    dbError ??= 'latency: ' + String(e?.message ?? e).slice(0, 120)
  }
}

/* 큐 포함률 — ★잡과 같은 규칙★ (queueRule.mjs) */
let cov = null
if (!dbError) {
  try {
    cov = await coverage(prisma)
  } catch (e) {
    dbError ??= 'coverage: ' + String(e?.message ?? e).slice(0, 120)
  }
}

/* ── ② 사이트 — 캐시를 깨고 DB 와 맞춰 본다 ────────────────── */
const api = {}
for (const lg of LEAGUES) {
  try {
    const res = await fetch(
      `${SITE}/api/leagues/${lg}/matches?size=1&cb=${Date.now()}${Math.random()}`,
      { signal: AbortSignal.timeout(20000) },
    )
    const j = await res.json()
    const first = j?.data?.[0] ?? j?.data?.items?.[0] ?? null
    api[lg] = { status: res.status, startAt: first?.start_at ?? null }
  } catch (e) {
    api[lg] = { status: 0, error: String(e).slice(0, 60) }
  }
}

/* ── ③ VPS — 자원 · 프로세스 · cron · 406 ────────────────── */
/* ⚠ 백슬래시를 쓰지 않는다. 홑따옴표만으로 짠다 — 셸을 거치며 먹히기 때문 */
const VPS_SCRIPT = [
  `free -m | awk '/^Mem/{print "mem " $7}'`,
  `free -m | awk '/^Swap/{print "swap " $3}'`,
  `echo "load $(cut -d' ' -f1-3 /proc/loadavg)"`,
  `echo "sh $(pgrep -fc autocollect.sh || echo 0)"`,
  `echo "chrome $(pgrep -c chrome || echo 0)"`,
  `echo "node $(pgrep -fc 'node.*worker' || echo 0)"`,
  `echo "xvfb $(pgrep -c Xvfb || echo 0)"`,
  `echo "disk $(df --output=pcent / | tail -1 | tr -dc 0-9)"`,
  `echo "lapsOk $(grep -c '바퀴 (코드 0)' /root/log/autocollect.log)"`,
  `echo "lapsBad $(grep '바퀴 (코드' /root/log/autocollect.log | grep -vc '코드 0')"`,
  `echo "e406 $(grep -c 'HTTP 406' /root/log/autocollect.log)"`,
  `echo "e406u $(grep -o 'HTTP 406 — 넘어간다 ([0-9]*)' /root/log/autocollect.log | tr -dc '0-9\\n' | sort -u | wc -l)"`,
  `echo "killed $(grep -c Killed /root/log/cron.log)"`,
  `echo "guard $(wc -l < /root/log/memguard.log)"`,
].join('; ')

let vps = null
try {
  const out = execFileSync(
    'ssh',
    ['-i', KEY, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=25', VPS, VPS_SCRIPT],
    { encoding: 'utf8', timeout: 90000 },
  )
  vps = Object.fromEntries(
    out
      .trim()
      .split('\n')
      .map((l) => {
        const [k, ...v] = l.trim().split(/\s+/)
        return [k, v.join(' ')]
      }),
  )
} catch (e) {
  vps = { error: String(e?.message ?? e).split('\n')[0].slice(0, 120) }
}

/* ── ④ 적립 + 사람이 읽는 한 줄 ─────────────────────────── */
const row = {
  at: now.toISOString(),
  dbError,
  ask: db?.askedat ?? null,
  list: db?.listat ?? null,
  log: db?.logat ?? null,
  match: db?.matchat ?? null,
  lineup: db?.lineupat ?? null,
  game: db?.gameat ?? null,
  matchRows: db?.matchrows ?? null,
  lineupRows: db?.lineuprows ?? null,
  reqTotal: db?.reqtotal ?? null,
  failTotal: db?.failtotal ?? null,
  staleLease: db?.stalelease ?? null,
  missing6h: db?.missing6h ?? null,
  newGames1h: db?.newgames1h ?? null,
  cov,
  lat,
  api,
  vps,
}
appendFileSync(OUT, JSON.stringify(row) + '\n')

/* ★사람이 개입해야 하는가★ — 이 목록이 비어야 검증이 이어진다 */
const bad = []
if (dbError) bad.push('DB오류')
if (db && mins(db.listat) > 90) bad.push('목록RAW 정지')
if (db && mins(db.matchat) > 120) bad.push('Match 정지')
if (db?.stalelease) bad.push(`죽은임대 ${db.stalelease}`)
if (cov && cov.pct < 80) bad.push(`포함률 ${cov.pct}%`)
for (const lg of LEAGUES) if (api[lg]?.status !== 200) bad.push(`API ${lg} ${api[lg]?.status}`)
if (vps?.error) bad.push('VPS 접속 실패')

console.log(
  [
    now.toLocaleString('ko-KR', { hour12: false }).slice(5),
    cov ? `포함률 ${String(cov.pct).padStart(3)}%(${cov.inQueue}/${cov.total})` : '포함률 —',
    `1시간새경기 ${String(db?.newgames1h ?? '—').padStart(3)}`,
    `지연 목록${lat.list ?? '—'}/로그${lat.log ?? '—'}/Match${lat.match ?? '—'}/명단${lat.lineup ?? '—'}분`,
    `누락(2h+) ${String(db?.missing6h ?? '—').padStart(3)}`,
    `최근경기 ${hhmm(db?.gameat)}`,
    `임대 ${db?.stalelease ? '★' + db.stalelease + '★' : 'OK'}`,
    `여유 ${vps?.mem ?? '?'}MB 부하 ${(vps?.load ?? '?').split(' ')[0]} 크롬 ${vps?.chrome ?? '?'}`,
    `406 ${vps?.e406 ?? '?'}회/${vps?.e406u ?? '?'}종`,
    `바퀴 ok ${vps?.lapsOk ?? '?'}/실패 ${vps?.lapsBad ?? '?'}`,
    bad.length ? `★★${bad.join(' · ')}★★` : '정상',
  ].join(' | '),
)

await prisma.$disconnect()

function summary() {
  if (!existsSync(OUT)) {
    console.log('아직 기록이 없다')
    return
  }
  const rows = readFileSync(OUT, 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l))
  const first = rows[0]
  const last = rows.at(-1)
  const hrs = ((new Date(last.at) - new Date(first.at)) / 3600000).toFixed(1)
  const covs = rows.map((r) => r.cov?.pct).filter((v) => v != null)
  const bad = rows.filter((r) => r.dbError || r.staleLease || (r.cov && r.cov.pct < 80))
  const t = (d) => new Date(d).toLocaleString('ko-KR', { hour12: false })
  console.log('═'.repeat(70))
  console.log(`  24시간 무인검증 — ${rows.length}회차 · ${hrs}시간`)
  console.log(`  ${t(first.at)}  →  ${t(last.at)}`)
  console.log('═'.repeat(70))
  console.log(
    `  큐 포함률        최소 ${Math.min(...covs)}% · 100%인 회차 ${covs.filter((v) => v === 100).length}/${covs.length}`,
  )
  console.log(`  Match 늘어남     ${last.matchRows - first.matchRows}경기`)
  console.log(`  명단 완성 늘어남  ${last.lineupRows - first.lineupRows}경기`)
  console.log(`  목록 요청 늘어남  ${last.reqTotal - first.reqTotal}건`)
  console.log(`  406 늘어남       ${(last.vps?.e406 ?? 0) - (first.vps?.e406 ?? 0)}회`)
  console.log(`  ★사람이 봐야 했던 회차 ${bad.length}회★`)
  for (const r of bad.slice(0, 12))
    console.log(
      `     ${t(r.at).slice(5)}  ${r.dbError ?? ''} 임대${r.staleLease ?? 0} 포함률${r.cov?.pct ?? '—'}%`,
    )
}
