/**
 * ★기록이 얼마나 밀렸나★ — 숫자 한 줄로 찍는다 (2026-09-22 · 사장님 지시)
 *
 * > 「기록 ★20분이상 지체될때마다★ 왜그런지 확인하고 원인파악하고 문제해결해
 * >  내가 자는동안 ★멈춘시간과 고친시간 등을 전부 기록★ 하고」
 *
 * ── 무엇을 재나 (넷 다 「지금으로부터 몇 분 전」 이다)
 *   ```
 *   raw    마지막으로 병영에서 원문을 주워 온 때     ← 수집이 도는가
 *   match  마지막으로 Match 한 줄이 생긴 때          ← 정규화가 도는가
 *   stat   마지막으로 참가행이 채워진 경기의 시각    ← 명단이 도는가
 *   pend   시작한 지 40분 넘었는데 아직 킬데스가 없는 경기 수
 *   ```
 *
 * ⚠ ★한 줄로만 찍는다★ — 셸이 그대로 읽는다. 꾸미지 않는다.
 *   `raw=3 match=5 stat=8 pend=2`
 */
import { PrismaClient } from '../packages/db/generated/client/index.js'

const p = new PrismaClient()
const min = (v) => (v === null || v === undefined ? -1 : Math.round(Number(v)))

try {
  const [raw] = await p.$queryRaw`
    SELECT EXTRACT(EPOCH FROM (NOW() - MAX("fetchedAt")))/60 AS m
      FROM "BarracksClanMatchRaw"`
  const [match] = await p.$queryRaw`
    SELECT EXTRACT(EPOCH FROM (NOW() - MAX("startAt")))/60 AS m
      FROM "Match" WHERE "supersededAt" IS NULL`
  const [stat] = await p.$queryRaw`
    SELECT EXTRACT(EPOCH FROM (NOW() - MAX(m."startAt")))/60 AS m
      FROM "Match" m
     WHERE m."supersededAt" IS NULL
       AND EXISTS (SELECT 1 FROM "MatchPlayerStat" s WHERE s."matchId" = m.id)`
  /* ★40분이 지났는데 아직 킬데스가 없는 경기★ — 사장님이 「영영 수집중」 이라 부르신 것 */
  const [pend] = await p.$queryRaw`
    SELECT COUNT(*)::int AS n
      FROM "Match" m
     WHERE m."supersededAt" IS NULL
       AND m."startAt" < NOW() - INTERVAL '40 minutes'
       AND m."startAt" > NOW() - INTERVAL '24 hours'
       AND NOT EXISTS (SELECT 1 FROM "MatchPlayerStat" s WHERE s."matchId" = m.id)`
  process.stdout.write(
    `raw=${min(raw?.m)} match=${min(match?.m)} stat=${min(stat?.m)} pend=${pend?.n ?? -1}\n`,
  )
} catch (error) {
  /* ★모르면 모른다고 찍는다★ — 0 으로 우기지 않는다 (D-106) */
  process.stdout.write(`raw=-1 match=-1 stat=-1 pend=-1 err=${String(error).slice(0, 80)}\n`)
} finally {
  await p.$disconnect()
}
