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
   * ★주워는 왔는데 아직 Match 가 안 된 원문★ 중 가장 오래된 것.
   *
   * ⚠ ★두 시간 창 안에서만 본다★ (2026-09-22 실측으로 고쳤다).
   *   처음에 24시간으로 쟀더니 ★1,435분(=창의 끝) 밀렸다★ 고 나왔다.
   *   ★영영 Match 가 안 되는 옛 원문★ 이 창 끝에 눌러앉아 있었기 때문이다
   *   (클랜을 모르는 경기 등). 그건 ★지연이 아니라 막힘★ 이다 — 아래 `stuck` 으로 따로 센다.
   *   지연은 ★지금 흐름이 늦는가★ 만 묻는 값이어야 한다.
   */
  const [proj] = await p.$queryRaw`
    SELECT EXTRACT(EPOCH FROM (NOW() - MIN(r."fetchedAt")))/60 AS m
      FROM "BarracksClanMatchRaw" r
     WHERE r."fetchedAt" > NOW() - INTERVAL '2 hours'
       AND r."status" = 'ok'
       AND NOT EXISTS (
             SELECT 1 FROM "Match" m
              WHERE m."sourceMatchId" = r."matchKey" AND m."supersededAt" IS NULL)`

  /* ★막힌 것★ — 두 시간이 넘도록 Match 가 안 된 원문. 지연과 다른 문제다 */
  const [stuck] = await p.$queryRaw`
    SELECT COUNT(*)::int AS n
      FROM "BarracksClanMatchRaw" r
     WHERE r."fetchedAt" < NOW() - INTERVAL '2 hours'
       AND r."fetchedAt" > NOW() - INTERVAL '24 hours'
       AND r."status" = 'ok'
       AND NOT EXISTS (
             SELECT 1 FROM "Match" m
              WHERE m."sourceMatchId" = r."matchKey" AND m."supersededAt" IS NULL)`

  /*
   * ★Match 는 생겼는데 참가행이 한 줄도 없는 경기★ 중 가장 오래된 것.
   * 여기도 ★세 시간 창★ 안만 본다 — 그보다 묵은 것은 `pend` 가 센다.
   */
  const [line] = await p.$queryRaw`
    SELECT EXTRACT(EPOCH FROM (NOW() - MIN(m."startAt")))/60 AS m
      FROM "Match" m
     WHERE m."supersededAt" IS NULL
       AND m."startAt" > NOW() - INTERVAL '3 hours'
       AND m."startAt" < NOW() - INTERVAL '40 minutes'
       AND NOT EXISTS (SELECT 1 FROM "MatchPlayerStat" s WHERE s."matchId" = m.id)`

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
