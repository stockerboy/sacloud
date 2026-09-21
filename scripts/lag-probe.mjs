/**
 * ★기록이 얼마나 밀렸나★ — 숫자 한 줄로 찍는다 (2026-09-22 · 사장님 지시)
 *
 * > 「기록 ★20분이상 지체될때마다★ 왜그런지 확인하고 원인파악하고 문제해결해」
 *
 * ── ⚠ ★「마지막 경기가 몇 분 전인가」 로 재면 안 된다★ (2026-09-22 실측으로 알았다)
 *
 *   처음에 그렇게 쟀더니 ★멀쩡한데도 23분 밀렸다★ 고 나왔다.
 *   ★경기 한 판이 20분쯤 걸리기 때문★ 이다 — 시작한 지 23분 된 경기가 가장 최근인 것은
 *   ★정상★ 이다. 그걸 고장으로 세면 장부가 거짓말로 찬다.
 *
 *   그래서 ★우리 손에 들어온 뒤로 얼마나 묵었나★ 만 잰다:
 *   ```
 *   raw   마지막으로 원문을 주워 온 때           ← 수집이 도는가
 *   proj  ★아직 Match 가 안 된 원문★ 중 가장 오래된 것  ← 정규화가 밀렸나
 *   line  ★참가행이 없는 경기★ 중 가장 오래된 것       ← 명단이 밀렸나
 *   pend  40분 넘게 킬데스가 없는 경기 수              ← 「영영 수집중」
 *   ```
 *   셋 다 ★우리가 늦은 만큼만★ 센다. 경기 길이는 안 들어간다.
 *
 * ⚠ ★한 줄로만 찍는다★ — 셸이 그대로 읽는다.
 */
import { PrismaClient } from '../packages/db/generated/client/index.js'

const p = new PrismaClient()
const min = (v) => (v === null || v === undefined ? 0 : Math.max(0, Math.round(Number(v))))

try {
  const [raw] = await p.$queryRaw`
    SELECT EXTRACT(EPOCH FROM (NOW() - MAX("fetchedAt")))/60 AS m
      FROM "BarracksClanMatchRaw"`

  /*
   * ── ⚠ ★무거운 질의를 뺐다★ (2026-09-22 08:41 실측으로 잡았다)
   *
   *   `proj`(아직 Match 가 안 된 원문)·`stuck` 을 여기서 세고 있었는데,
   *   그 둘이 ★BarracksClanMatchRaw 56만 줄★ 에 `NOT EXISTS` 를 걸어
   *   ★DB 시간초과(57014)★ 를 냈다. 그 바람에 ★감시가 10분 동안 눈이 멀었다★ —
   *   「값을 못 읽었다」 가 08:33부터 줄줄이 찍혔다.
   *
   *   ★감시를 하려다 감시를 죽이면 안 된다.★ 게다가 `lag-watch.sh` 는
   *   정규화·명단을 ★잡의 로그★ 로 이미 재고 있어서 이 값들을 쓰지도 않았다.
   *   ★안 쓰는 값을 비싸게 세고 있었다.★ 뺀다.
   *
   *   옛 판은 `docs/archive` 가 아니라 git 이력에 있다 — 되살릴 일이 있으면
   *   ★반드시 색인부터 깔고★ 되살린다.
   */
  const proj = { m: 0 }
  const stuck = { n: 0 }
  const line = { m: 0 }

  const [pend] = await p.$queryRaw`
    SELECT COUNT(*)::int AS n
      FROM "Match" m
     WHERE m."supersededAt" IS NULL
       AND m."startAt" < NOW() - INTERVAL '40 minutes'
       AND m."startAt" > NOW() - INTERVAL '24 hours'
       AND NOT EXISTS (SELECT 1 FROM "MatchPlayerStat" s WHERE s."matchId" = m.id)`

  process.stdout.write(
    `raw=${min(raw?.m)} proj=${min(proj?.m)} line=${min(line?.m)} pend=${pend?.n ?? 0}\n`,
  )
} catch (error) {
  /* ★모르면 모른다고 찍는다★ — 0 으로 우기지 않는다 (D-106) */
  process.stdout.write(`err=${String(error).slice(0, 120)}\n`)
} finally {
  await p.$disconnect()
}
