/**
 * **어느 출처가 정말 더 많이 아나** (2026-09-04 · ★읽기 전용★ · D-273 의 근거 확인).
 *
 * `lineupDedupe` 주석에 ★「미러는 무기·어시스트·헤드샷까지 갖고 있다」★ 고 적었다 (D-034 인용).
 * ★그런데 실제 경기 하나를 API 로 열어 보니 미러 행의 `assist`·`headshot`·`damage` 가 전부 비어 있었다.★
 * ★내가 인용한 근거가 이 리그에서는 맞지 않을 수 있다.★ ★그래서 센다.★
 *
 * ⚠ ★결론이 바뀌어도 이미 한 정리는 안 뒤집힌다★ — 최종 규칙은 「좋은 출처」가 아니라
 *   ★「이 경기에서 10명인 쪽」★ 이었다. 다만 ★주석의 근거는 사실이어야 한다.★
 */
import { prisma } from '@sacloud/db'

async function main(): Promise<void> {
  const rows = await prisma.$queryRaw<
    {
      origin: string
      n: bigint
      kill: bigint
      assist: bigint
      headshot: bigint
      damage: bigint
      weapon: bigint
      weapon_zero: bigint
      mvp: bigint
    }[]
  >`
    SELECT coalesce(p."origin", '-') AS origin,
           count(*) AS n,
           count(s."kill")     AS kill,
           count(s."assist")   AS assist,
           count(s."headshot") AS headshot,
           count(s."damage")   AS damage,
           count(s."weapon")   AS weapon,
           count(*) FILTER (WHERE s."weapon" = 0) AS weapon_zero,
           count(s."mvp")      AS mvp
      FROM "Match" m
      JOIN "League" l ON l."id" = m."leagueId" AND l."slug" = 'nolink'
      JOIN "MatchPlayerStat" s ON s."matchId" = m."id"
      JOIN "Player" p ON p."id" = s."playerId"
     GROUP BY 1 ORDER BY 2 DESC
  `
  console.info('══ ★IPL 참가 기록 — 출처별로 무엇이 채워져 있나★ ══')
  console.info('')
  console.info('  출처                행수     킬    어시   헤드샷   데미지   무기   무기=0    MVP')
  console.info('  ' + '─'.repeat(80))
  for (const r of rows) {
    const n = Number(r.n)
    const pc = (v: bigint): string => `${((100 * Number(v)) / n).toFixed(0)}%`.padStart(6)
    console.info(
      `  ${r.origin.padEnd(16)} ${String(n).padStart(6)} ${pc(r.kill)} ${pc(r.assist)} ` +
        `${pc(r.headshot)} ${pc(r.damage)} ${pc(r.weapon)} ${pc(r.weapon_zero)} ${pc(r.mvp)}`,
    )
  }
  console.info('')
  console.info('  ★읽는 법★ — ★「미러가 더 많이 안다」가 이 리그에서도 참인지★ 를 본다.')
  console.info('  ★어시·헤드샷이 양쪽 다 0% 면 그 말은 이 리그에서 틀린 것이다.★')
  console.info('  ★무기=0 이 대부분이면 「무기를 안다」도 사실상 모르는 것이다★ — 0 은 알 수 없음일 수 있다.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
