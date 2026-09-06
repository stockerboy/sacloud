/**
 * ★IPL clan_unmapped — 원인을 범주로 나눈다★ (2026-09-06 · 사장님 지시). ★읽기만 한다.★
 *
 * > «24건을 임의 수정하지 말고 ★먼저 원인을 분류★ 해라»
 * > 개명 / 과거 클랜번호 / 미등록 / 같은 이름 다른 클랜 / 기타
 *
 * ── ★처음 쓴 자가 틀렸다★ (같은 날 · 남겨 둔다)
 *   `BarracksClanNumber` 표를 기준으로 「우리 DB 가 이 번호를 아는가」를 물었다.
 *   ★그 표는 0줄이다.★ 그래서 ★전부 「미등록」으로 몰렸다.★
 *   ★분모가 비어 있으면 어떤 분류든 한 칸으로 쏟아진다.★
 *
 * ── 지금 자
 *   클랜번호는 ★그 클랜을 주체로 훑었을 때만★ 배운다 (`iplClanNumberMap`).
 *   그래서 못 푼 번호는 ★그 경기의 두 클랜 중 하나★ 이고, 「왜 못 배웠나」를 그 클랜에 묻는다.
 */
import { prisma } from '@sacloud/db'
import { iplClanNumberMap } from '../jobs/iplClanNumber.js'

const CUT = "TIMESTAMP '2026-09-02 22:00:00'"

const league = await prisma.league.findUniqueOrThrow({
  where: { slug: 'nolink' },
  select: { id: true },
})
const table = await iplClanNumberMap(league.id)

/* 라인업이 없는데 배틀로그는 있는 IPL 경기 + 그 경기의 두 클랜 */
const rows = await prisma.$queryRawUnsafe<
  Array<{
    key: string; redName: string; redSlug: string; blueName: string; blueSlug: string
    nos: string[]
  }>
>(`
  SELECT m."sourceMatchId" AS key,
         rcl.name AS "redName", rcl.slug AS "redSlug",
         bcl.name AS "blueName", bcl.slug AS "blueSlug",
         (SELECT ARRAY_AGG(DISTINCT t->>'clan_no')
            FROM "BarracksBattleLogRaw" b,
                 LATERAL jsonb_array_elements(
                   CASE WHEN b."payload" ? 'teamList' THEN b."payload"->'teamList'
                        ELSE b."payload"->'raw'->'teamList' END) AS t
           WHERE b."matchKey" = m."sourceMatchId" AND b."status"='ok') AS nos
  FROM "Match" m JOIN "League" l ON l.id = m."leagueId"
  JOIN "LeagueClan" rc ON rc.id = m."redLeagueClanId" JOIN "Clan" rcl ON rcl.id = rc."clanId"
  JOIN "LeagueClan" bc ON bc.id = m."blueLeagueClanId" JOIN "Clan" bcl ON bcl.id = bc."clanId"
  LEFT JOIN (SELECT DISTINCT "matchId" FROM "MatchPlayerStat") x ON x."matchId" = m.id
  JOIN (SELECT DISTINCT "matchKey" FROM "BarracksBattleLogRaw"
        WHERE "subjectKind"='clan' AND "status"='ok') r ON r."matchKey" = m."sourceMatchId"
  WHERE m."startAt" >= ${CUT} AND m."supersededAt" IS NULL AND m.origin='nexon_barracks'
    AND x."matchId" IS NULL AND l.slug='nolink'
  ORDER BY m."startAt" DESC`)

/* 클랜별 사실: 주체로 훑은 줄 수 · 번호를 배웠나 · 이름이 겹치나 · 다른 리그에도 있나 */
const facts = new Map<
  string,
  { name: string; okRows: number; hasNo: boolean; sameName: number; leagues: string[] }
>()
for (const f of await prisma.$queryRawUnsafe<
  Array<{ slug: string; name: string; okRows: number; sameName: number; leagues: string[] }>
>(`
  SELECT c.slug, c.name,
    (SELECT COUNT(*)::int FROM "BarracksClanMatchRaw" r
      WHERE r."subject" = c.slug AND r."status"='ok' AND r."payload"->>'clan_no' IS NOT NULL) AS "okRows",
    (SELECT COUNT(*)::int FROM "Clan" c2 WHERE c2.name = c.name) AS "sameName",
    COALESCE(ARRAY_AGG(DISTINCT l.slug) FILTER (WHERE l.slug IS NOT NULL), '{}') AS leagues
  FROM "Clan" c
  LEFT JOIN "LeagueClan" lc ON lc."clanId" = c.id AND lc."expelledAt" IS NULL
  LEFT JOIN "League" l ON l.id = lc."leagueId"
  GROUP BY c.id, c.slug, c.name`))
  facts.set(f.slug, {
    name: f.name,
    okRows: f.okRows,
    hasNo: [...table.values()].length > 0 && false,
    sameName: f.sameName,
    leagues: f.leagues,
  })

/* 표가 이미 아는 clanId 들 */
const knownClanIds = new Set(table.values())
const clanIdOfSlug = new Map(
  (await prisma.clan.findMany({ select: { id: true, slug: true } })).map((c) => [c.slug, c.id]),
)

type Kind = '개명' | '과거 클랜번호' | '미등록' | '같은 이름 다른 클랜' | '기타'
const tally: Record<Kind, number> = {
  개명: 0, '과거 클랜번호': 0, 미등록: 0, '같은 이름 다른 클랜': 0, 기타: 0,
}
const byClan = new Map<string, { kind: Kind; why: string; matches: number }>()
let unmappedMatches = 0

for (const row of rows) {
  const nos = (row.nos ?? []).filter(Boolean)
  const missing = nos.filter((no) => !table.has(no))
  if (missing.length === 0) continue
  unmappedMatches += 1

  /* 못 푼 번호는 이 경기의 두 클랜 중 ★표에 없는 쪽★ 이다 */
  for (const side of [
    { name: row.redName, slug: row.redSlug },
    { name: row.blueName, slug: row.blueSlug },
  ]) {
    const clanId = clanIdOfSlug.get(side.slug)
    if (clanId && knownClanIds.has(clanId)) continue /* 이 쪽은 풀린다 */
    const f = facts.get(side.slug)
    let kind: Kind
    let why: string
    if (!f) {
      kind = '기타'
      why = `slug ${side.slug} 를 Clan 표에서 못 찾았다`
    } else if (f.sameName > 1) {
      kind = '같은 이름 다른 클랜'
      why = `이름 ${f.name} 을 쓰는 클랜이 ${f.sameName}곳 — 이름으로 못 고른다`
    } else if (!f.leagues.includes('nolink')) {
      kind = '미등록'
      why = `IPL 활성 등록이 아니다 (지금 ${f.leagues.join(',') || '리그 없음'})`
    } else if (f.okRows === 0) {
      kind = '기타'
      why = `★주체로 한 번도 안 훑혔다★ — slug ${side.slug} 로 매치목록이 0줄이라 ★번호를 배울 길이 없다★`
    } else {
      kind = '개명'
      why = `주체로 ${f.okRows}줄 훑혔는데 번호가 표에 없다 — 이름/번호가 어긋난다`
    }
    const seen = byClan.get(side.slug)
    if (seen) seen.matches += 1
    else byClan.set(side.slug, { kind, why, matches: 1 })
  }
}

console.info(
  `══ IPL — 라인업 없는 경기 ${rows.length}건 중 ★클랜번호를 못 푼 경기 ${unmappedMatches}건★ ══\n`,
)
console.info('  ── 클랜별 ──')
for (const [slug, v] of [...byClan].sort((a, b) => b[1].matches - a[1].matches)) {
  const name = facts.get(slug)?.name ?? '(모름)'
  console.info(`  ${name.padEnd(14)} slug ${slug.padEnd(20)} ${String(v.matches).padStart(3)}경기 · ★${v.kind}★`)
  console.info(`     ${v.why}`)
  tally[v.kind] += v.matches
}

console.info('\n══ 범주별 (★경기 수 기준★) ══\n')
let sum = 0
for (const [k, n] of Object.entries(tally) as Array<[Kind, number]>) {
  console.info(`  ${k.padEnd(12)} ${String(n).padStart(4)}건`)
  sum += n
}
console.info(`  ${'─'.repeat(18)}`)
console.info(`  ${'합계'.padEnd(12)} ${String(sum).padStart(4)}건   (못 푼 경기 ${unmappedMatches}건과 ${sum === unmappedMatches ? '★맞는다★' : '★안 맞는다★'})`)
await prisma.$disconnect()
