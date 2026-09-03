/**
 * **배틀로그는 있는데 우리 경기가 없는 5,255건** (O-051 뒤 · 2026-09-03 · ★읽기 전용★).
 *
 * ══ 왜 보나 ══
 *
 * `battlelog-lineup` 이 건너뛴 이유 중 제일 큰 것이 ★`no_match` 5,255건★ 이다 —
 * 배틀로그가 있는 8,380경기의 ★63%★ 다. `clan_unmapped` 683 보다 훨씬 크다.
 *
 * ★버려지는 것인지 원래 안 들어오는 게 맞는 것인지★ 를 가른다. 그 둘은 사장님께 드릴 말이 다르다.
 * ```
 * 원래 안 들어오는 게 맞다  → IPL 클랜이 아닌 상대와 붙은 경기다. ★알릴 일이 아니다★
 * 들어와야 하는데 빠졌다    → «IPL 기록 일부가 안 들어옵니다» 를 알려야 한다
 * ```
 *
 * ⚠ `iplmatch-project` 는 ★양쪽이 다 IPL 등록 클랜이고 시즌 창 안일 때만★ 넣는다 (D-210 · D-175).
 *   그러면 ★한쪽이 IPL 클랜이 아닌 경기는 안 들어오는 게 맞다.★ 그걸 숫자로 확인한다.
 */
import { prisma } from '@sacloud/db'

const pc = (a: number, b: number): string => (b === 0 ? '  —  ' : `${((100 * a) / b).toFixed(1)}%`)

async function main(): Promise<void> {
  console.info('══ 1 · ★배틀로그 경기가 우리 Match 와 이어지나★ ══\n')
  const link = await prisma.$queryRaw<{ keys: bigint; linked: bigint }[]>`
    WITH k AS (
      SELECT DISTINCT "matchKey" FROM "BarracksBattleLogRaw"
       WHERE "status" = 'ok' AND "subjectKind" = 'clan'
    )
    SELECT count(*) AS keys,
           count(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM "Match" m JOIN "League" l ON l."id" = m."leagueId"
              WHERE m."sourceMatchId" = k."matchKey" AND l."slug" = 'nolink'
           )) AS linked
      FROM k
  `
  const l = link[0]!
  const keys = Number(l.keys)
  const linked = Number(l.linked)
  console.info(`  배틀로그 경기 ★${keys.toLocaleString()}★ · 이어진 것 ★${linked.toLocaleString()}★ ${pc(linked, keys)}`)
  console.info(`  ★안 이어진 것 ${(keys - linked).toLocaleString()}★`)

  /* ── 2 · 안 이어진 경기의 두 클랜이 IPL 에 등록돼 있나 ─────────── */
  console.info('\n══ 2 · ★안 이어진 경기의 상대가 IPL 클랜인가★ ══\n')
  console.info('  `iplmatch-project` 는 ★양쪽이 다 IPL 등록 클랜★ 일 때만 넣는다 (D-210)\n')
  const sides = await prisma.$queryRaw<{ registered: number; n: bigint }[]>`
    WITH nolinked AS (
      SELECT DISTINCT b."matchKey"
        FROM "BarracksBattleLogRaw" b
       WHERE b."status" = 'ok' AND b."subjectKind" = 'clan'
         AND NOT EXISTS (SELECT 1 FROM "Match" m JOIN "League" l ON l."id" = m."leagueId"
                         WHERE m."sourceMatchId" = b."matchKey" AND l."slug" = 'nolink')
    ),
    teams AS (
      SELECT n."matchKey",
             jsonb_array_elements(b."payload"->'teamList')->>'clan_no' AS clan_no
        FROM nolinked n
        JOIN "BarracksBattleLogRaw" b
          ON b."matchKey" = n."matchKey" AND b."status" = 'ok'
       WHERE jsonb_typeof(b."payload"->'teamList') = 'array'
    ),
    per AS (
      SELECT "matchKey",
             count(DISTINCT clan_no)                                        AS clans,
             count(DISTINCT clan_no) FILTER (WHERE EXISTS (
               SELECT 1
                 FROM "BarracksClanNumber" cn
                 JOIN "LeagueClan" lc ON lc."clanId" = cn."clanId"
                 JOIN "League" lg ON lg."id" = lc."leagueId" AND lg."slug" = 'nolink'
                WHERE cn."clanNo" = teams.clan_no
             ))                                                             AS registered
        FROM teams GROUP BY 1
    )
    SELECT registered::int AS registered, count(*) AS n FROM per GROUP BY 1 ORDER BY 1
  `
  let tot = 0
  for (const s of sides) tot += Number(s.n)
  for (const s of sides) {
    const n = Number(s.n)
    const label =
      s.registered === 0
        ? '★양쪽 다 IPL 클랜이 아니다★'
        : s.registered === 1
          ? '★한쪽만 IPL 클랜이다★'
          : '양쪽 다 IPL 클랜이다'
    console.info(`  IPL 등록 클랜 ${s.registered}곳  ${n.toLocaleString().padStart(7)}건 ${pc(n, tot)}  ${label}`)
  }
  console.info(
    '\n  ★읽는 법★ — 0곳·1곳이면 ★안 들어오는 게 맞다★ (규칙이 그렇다).\n' +
      '             ★2곳인데 안 들어왔으면 그건 결손이다★ — 그때만 알려야 한다',
  )

  /* ── 3 · 시즌 창 밖인가 ────────────────────────────────────── */
  console.info('\n══ 3 · ★언제 경기인가★ — 시즌 창 밖이면 그것도 이유다 ══\n')
  const when = await prisma.$queryRaw<{ yr: string; n: bigint }[]>`
    SELECT substring(b."matchKey" from 1 for 4) AS yr, count(DISTINCT b."matchKey") AS n
      FROM "BarracksBattleLogRaw" b
     WHERE b."status" = 'ok' AND b."subjectKind" = 'clan'
       AND NOT EXISTS (SELECT 1 FROM "Match" m JOIN "League" l ON l."id" = m."leagueId"
                         WHERE m."sourceMatchId" = b."matchKey" AND l."slug" = 'nolink')
     GROUP BY 1 ORDER BY 1
  `
  console.info('  (경기키 앞 4자리 = YYMM — 병영수첩 키 규칙)')
  for (const w of when) {
    console.info(`  ${w.yr}  ${Number(w.n).toLocaleString().padStart(7)}건`)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
