/**
 * **미러 라인업이 이미 있는 경기에 배틀로그를 또 넣고 있다** (2026-09-04 · ★읽기 전용★).
 *
 * 20명짜리 경기를 펼쳤더니 ★`3rd.supply` 선수 10명 + `nexon_barracks` 선수 10명★ 이었다.
 * ★킬·데스가 한 쌍씩 정확히 일치한다. 같은 사람이다.★
 * `mane☆` 는 ★이름까지 같은데도★ 둘로 나뉘어 있었다 — ★출처가 달라 못 이은 것★ 이다.
 *
 * ★두 가지를 센다★
 * ```
 * ① IPL 경기 중 ★미러 라인업이 이미 있는 것★ 이 몇 건인가
 *    → ★그 경기들은 배틀로그를 받을 필요가 없다.★ 받으면 오염만 된다
 * ② 지금 밤새 받으려는 것 중 몇 건이 그런 경기인가
 *    → ★그만큼이 헛수고다★
 * ```
 */
import { prisma } from '@sacloud/db'

async function main(): Promise<void> {
  const rows = await prisma.$queryRaw<
    { total: bigint; mirror: bigint; barracks: bigint; both: bigint; none: bigint }[]
  >`
    WITH m AS (
      SELECT m."id",
             count(*) FILTER (WHERE pl."origin" = '3rd.supply')     AS mir,
             count(*) FILTER (WHERE pl."origin" = 'nexon_barracks') AS brk
        FROM "Match" m
        JOIN "League" l ON l."id" = m."leagueId" AND l."slug" = 'nolink'
        LEFT JOIN "MatchPlayerStat" s ON s."matchId" = m."id"
        LEFT JOIN "Player" pl ON pl."id" = s."playerId"
       GROUP BY m."id"
    )
    SELECT count(*) AS total,
           count(*) FILTER (WHERE mir > 0 AND brk = 0) AS mirror,
           count(*) FILTER (WHERE mir = 0 AND brk > 0) AS barracks,
           count(*) FILTER (WHERE mir > 0 AND brk > 0) AS both,
           count(*) FILTER (WHERE mir = 0 AND brk = 0) AS none
      FROM m
  `
  const r = rows[0]!
  const n = (v: bigint): string => Number(v).toLocaleString()
  console.info('══ ★IPL 경기 · 라인업이 어디서 왔나★ ══')
  console.info('')
  console.info(`  전체 IPL 경기                    ${n(r.total)}건`)
  console.info(`  ★미러 라인업만★                  ${n(r.mirror)}건  ← ★배틀로그 받을 필요 없다★`)
  console.info(`  병영수첩 라인업만                 ${n(r.barracks)}건`)
  console.info(`  ★★둘 다 있다 (두 배로 잡힌다)★★   ${n(r.both)}건  ← ★결함★`)
  console.info(`  라인업이 없다                    ${n(r.none)}건  ← ★진짜 받아야 할 것★`)
  console.info('')

  /* 밤새 받으려는 것 중 미러 라인업이 이미 있는 것 */
  const waste = await prisma.$queryRaw<{ pending: bigint; has_mirror: bigint }[]>`
    WITH pending AS (
      SELECT m."id", m."sourceMatchId" AS k
        FROM "Match" m
        JOIN "League" l ON l."id" = m."leagueId" AND l."slug" = 'nolink'
       WHERE NOT EXISTS (
         SELECT 1 FROM "BarracksBattleLogRaw" b WHERE b."matchKey" = m."sourceMatchId")
    )
    SELECT count(*) AS pending,
           count(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM "MatchPlayerStat" s
               JOIN "Player" pl ON pl."id" = s."playerId" AND pl."origin" = '3rd.supply'
              WHERE s."matchId" = pending."id")) AS has_mirror
      FROM pending
  `
  const w = waste[0]!
  const p = Number(w.pending)
  const hm = Number(w.has_mirror)
  console.info('══ ★밤새 받으려는 것 중 헛수고는 몇 건인가★ ══')
  console.info('')
  console.info(`  배틀로그가 없는 IPL 경기            ${p.toLocaleString()}건`)
  console.info(`  ★그중 미러 라인업이 이미 있는 것★    ${hm.toLocaleString()}건 (${p ? ((100 * hm) / p).toFixed(1) : '0'}%)`)
  console.info(`  ★진짜 받아야 할 것★                ${(p - hm).toLocaleString()}건`)
  console.info('')
  console.info('  ★읽는 법★ — 미러 라인업은 ★무기·어시스트·헤드샷까지★ 갖고 있다 (D-034).')
  console.info('  병영수첩 것은 킬·데스·무기뿐이다. ★미러가 있으면 미러가 낫다.★')
  console.info('  ★그 위에 또 넣으면 좋아지는 게 아니라 두 배로 잡힌다.★')
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
