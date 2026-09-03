/**
 * **받은 배틀로그가 실제로 화면까지 가나** (2026-09-04 · ★읽기 전용★).
 *
 * 8월 배틀로그 원문이 ★5,997건★ 인데 라인업이 붙은 8월 경기는 ★1,512건★ 이었다.
 * ★한 경기에 원문이 둘(적·청)★ 이니 5,997 ≈ 3,000경기다 — ★그래도 절반이 빈다.★
 * ★밤새 받는 것이 절반만 화면에 닿는다면 밤의 절반을 버리는 것이다.★ 그래서 센다.
 *
 * ⚠ ★★리그를 안 걸렀다가 숫자가 부풀었다★★ (같은 날 바로 고쳤다).
 *   처음엔 `count(*)` 에 리그 조건이 없어서 ★8,459건★ 이 나왔다. 그런데 ★같은 경기키가
 *   여러 리그의 `Match` 에 붙어 있다★ (미러가 준 것과 병영수첩이 준 것). 조인이 그만큼 불어난 것이다.
 *   ★`count(DISTINCT matchKey)` + IPL 만★ 으로 고쳤다. ★조인 뒤에는 무엇을 세는지 봐야 한다.★
 */
import { prisma } from '@sacloud/db'

async function main(): Promise<void> {
  const rows = await prisma.$queryRaw<
    { raw_keys: bigint; have_match: bigint; have_lineup: bigint }[]
  >`
    WITH b AS (
      SELECT DISTINCT "matchKey" FROM "BarracksBattleLogRaw" WHERE "matchKey" ~ '^[0-9]{12}'
    )
    SELECT (SELECT count(*) FROM b) AS raw_keys,
           (SELECT count(DISTINCT b."matchKey") FROM b
              JOIN "Match" m ON m."sourceMatchId" = b."matchKey"
              JOIN "League" l ON l."id" = m."leagueId" AND l."slug" = 'nolink') AS have_match,
           (SELECT count(DISTINCT b."matchKey") FROM b
              JOIN "Match" m ON m."sourceMatchId" = b."matchKey"
              JOIN "League" l ON l."id" = m."leagueId" AND l."slug" = 'nolink'
             WHERE EXISTS (SELECT 1 FROM "MatchPlayerStat" s WHERE s."matchId" = m."id")) AS have_lineup
  `
  const r = rows[0]!
  const keys = Number(r.raw_keys)
  const mt = Number(r.have_match)
  const lu = Number(r.have_lineup)
  console.info('══ ★받은 배틀로그가 어디까지 가나★ ══\n')
  console.info(`  ① 배틀로그를 받은 ★경기★      ★${keys.toLocaleString()}★건`)
  console.info(`  ② 그중 우리 \`Match\` 에 있는 것 ★${mt.toLocaleString()}★건 (${((100 * mt) / keys).toFixed(0)}%)`)
  console.info(`  ③ 그중 ★라인업까지 붙은 것★    ★${lu.toLocaleString()}★건 (${((100 * lu) / keys).toFixed(0)}%)`)
  console.info(
    `\n  ★①→② 에서 ${(keys - mt).toLocaleString()}건이 샌다★ — ` +
      '경기가 우리 표에 없다 (★시즌0 창 밖(7/1 이전)이거나 IPL 클랜이 아니다★)',
  )
  console.info(
    `  ★②→③ 에서 ${(mt - lu).toLocaleString()}건이 샌다★ — ` +
      '경기는 있는데 ★라인업 투영이 아직 안 됐다★ (`battlelog-lineup` 이 할 일)',
  )
}

/** ★새는 6,058건이 무엇인가★ — 창 밖인가, 상대가 IPL 이 아닌가, 아니면 우리가 모르는 경기인가 */
async function why(): Promise<void> {
  const rows = await prisma.$queryRaw<{ bucket: string; n: bigint }[]>`
    WITH b AS (
      SELECT DISTINCT "matchKey" AS k FROM "BarracksBattleLogRaw" WHERE "matchKey" ~ '^[0-9]{12}'
    ),
    miss AS (
      SELECT b.k FROM b
       WHERE NOT EXISTS (
         SELECT 1 FROM "Match" m
           JOIN "League" l ON l."id" = m."leagueId" AND l."slug" = 'nolink'
          WHERE m."sourceMatchId" = b.k)
    )
    SELECT CASE
             WHEN substr(k,1,4) < '2607' THEN 'A 시즌0 창 밖 (7/1 이전)'
             WHEN EXISTS (SELECT 1 FROM "Match" m2 WHERE m2."sourceMatchId" = miss.k)
               THEN 'B 다른 리그 경기로는 있다'
             ELSE 'C ★어느 리그에도 없다★ (IPL 클랜의 리그 밖 경기로 보인다)'
           END AS bucket,
           count(*) AS n
      FROM miss GROUP BY 1 ORDER BY 1
  `
  console.info('')
  console.info('══ ★새는 것이 무엇인가★ ══')
  console.info('')
  for (const r of rows) console.info(`  ${r.bucket}  ★${Number(r.n).toLocaleString()}★건`)
  console.info('')
  console.info(
    '  ★C 가 크면 「병영수첩 클랜 목록은 그 클랜의 IPL 경기만 주는 게 아니다」는 뜻이다★ —' +
      '  ★목록을 뒤로 넘겨 받은 것의 상당수가 리그 밖 경기일 수 있다.★ ★받기 전에 알아야 한다★',
  )
}

main()
  .then(why)
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
