/**
 * **2티어끼리 한 경기의 킬뎃 — 무기별로** (2026-09-04 · ★읽기 전용★ · 사장님 요청).
 *
 * > «★6월부터 9월1일전까지★ 기간동안 ★현재 2티어에있는 클랜원들만★ 닉네임이랑 킬뎃좀 알려줘.
 * >  ★2티어끼리한 경기킬뎃만★ 보여주라»
 * > «★ㄴㄴ; 59.9이런거;;★»                       ← ★킬÷(킬+데스)×100★
 * > «★스나수는 스나킬뎃만 라플수는 라플킬뎃만★ 뽑아봐»
 *
 * ══ 어떻게 읽었나 ══
 * ```
 * 기간   ★2026-06-01 00:00 ~ 2026-09-01 00:00 (KST)★   ← 「9월 1일 전까지」
 * 대상   ★현재★ IPL 2티어 클랜의 소속 선수
 * 경기   ★양쪽 클랜이 다 2티어인 경기만★
 * 킬뎃   ★킬 ÷ (킬+데스) × 100★ · 소수점 한 자리 (배수가 아니다)
 * 무기   ★스나수는 스나 경기만 · 라플수는 라플 경기만★ — ★섞지 않는다★
 * ```
 *
 * ══ 「스나수/라플수」는 ★이미 있는 정의★ 를 쓴다 ══
 *
 * `contract/traits.ts` 의 `mainWeaponOf()` — ★그 무기로 뛴 판수가 절반을 넘으면★ 주무기다.
 * `LeaguePlayerWeaponStat.isMain` (D-173)과 같은 뜻이고, ★무기 랭킹의 모집단이 그 칸★ 이다.
 * ★다른 규칙으로 고르면 같은 선수가 두 화면에서 다른 무리와 견줘진다.★
 * ⚠ ★정확히 반반이면 `null`★ 이다 — 어느 쪽에도 안 넣는다. ★그 수를 따로 센다.★
 *
 * ══ ⚠ 무기는 ★경기 단위★ 다 ══
 *
 * `MatchPlayerStat.weapon` — ★그 경기에서 무엇을 들었나★ 다 (라운드 단위가 아니다).
 * ★그래서 「그 경기의 킬·데스 전부」가 그 무기 몫★ 이다.
 *
 * ══ ⚠ 먼저 세고 나중에 보여 준다 ══
 *
 * ★목록을 먼저 내면 사장님이 그 숫자를 믿으신다.★ ★표본 크기를 맨 위에 적는다.★
 */
import { mainWeaponOf } from '@sacloud/contract'
import { prisma } from '@sacloud/db'

const FROM = new Date('2026-06-01T00:00:00+09:00')
const TO = new Date('2026-09-01T00:00:00+09:00')
/**
 * ★그 무기로 이만큼은 뛰어야 표에 올린다★ — 사장님 «★최소 50경기★».
 *
 * ⚠ ★기준을 임의로 낮추지 않는다.★ 0명이면 ★0명이라고 적고★ 판수 상위만 재료로 붙인다 —
 *   ★사장님이 기준을 낮출지 정하실 수 있게★ 하는 것이지 우리가 정할 일이 아니다.
 */
const MIN_GAMES = 50

/** 사장님이 정하신 형식 — ★킬 ÷ (킬+데스) × 100★ */
const kd = (k: number, d: number): string => (k + d === 0 ? '—' : `${((100 * k) / (k + d)).toFixed(1)}%`)

interface Row {
  name: string
  clan: string
  weapon: number | null
  games: bigint
  kills: bigint
  deaths: bigint
}

async function main(): Promise<void> {
  const clans = await prisma.$queryRaw<{ name: string }[]>`
    SELECT c."name"
      FROM "LeagueClan" lc
      JOIN "League" l ON l."id" = lc."leagueId" AND l."slug" = 'nolink'
      JOIN "Clan" c ON c."id" = lc."clanId"
     WHERE lc."division" = 2 ORDER BY c."name"
  `
  console.info(`══ ★현재 IPL 2티어 클랜 ${clans.length}곳★ ══\n  ${clans.map((c) => c.name).join(' · ')}`)

  /* ── 표본 크기부터 ───────────────────────────────────────── */
  const scope = await prisma.$queryRaw<
    { all: bigint; lineup: bigint; both2: bigint; usable: bigint; sameThen: bigint }[]
  >`
    WITH t2 AS (
      SELECT lc."id" AS lcid FROM "LeagueClan" lc
        JOIN "League" l ON l."id" = lc."leagueId" AND l."slug" = 'nolink'
       WHERE lc."division" = 2
    ), m AS (
      SELECT m."id",
             (m."redLeagueClanId" IN (SELECT lcid FROM t2)
              AND m."blueLeagueClanId" IN (SELECT lcid FROM t2)) AS both2,
             (m."redDivisionAtMatch" = 2 AND m."blueDivisionAtMatch" = 2) AS then2,
             EXISTS (SELECT 1 FROM "MatchPlayerStat" s WHERE s."matchId" = m."id") AS lineup
        FROM "Match" m JOIN "League" l ON l."id" = m."leagueId" AND l."slug" = 'nolink'
       WHERE m."startAt" >= ${FROM} AND m."startAt" < ${TO}
    )
    SELECT count(*) AS all, count(*) FILTER (WHERE lineup) AS lineup,
           count(*) FILTER (WHERE both2) AS both2,
           count(*) FILTER (WHERE both2 AND lineup) AS usable,
           count(*) FILTER (WHERE both2 AND lineup AND then2) AS "sameThen"
      FROM m
  `
  const s = scope[0]!
  const usable = Number(s.usable)
  console.info('\n══ ★★표본 — 이것부터 보십시오★★ ══\n')
  console.info(`  기간의 IPL 경기        ${Number(s.all).toLocaleString()}건`)
  console.info(`  그중 라인업이 있는 것   ${Number(s.lineup).toLocaleString()}건`)
  console.info(`  양쪽이 다 현재 2티어    ${Number(s.both2).toLocaleString()}건`)
  console.info(`  ★★그중 라인업이 있는 것 ${usable.toLocaleString()}건★★  ← ★실제로 셀 수 있는 전부★`)
  console.info(
    `\n  ⚠ 그중 ★경기 당시에도 양쪽이 2티어★ 였던 것 ${Number(s.sameThen).toLocaleString()}건` +
      ` (${usable === 0 ? '—' : `${((100 * Number(s.sameThen)) / usable).toFixed(1)}%`})` +
      `\n     나머지는 ★그때는 다른 티어★ 였다 — 「현재 2티어」로 세라 하셔서 그것도 넣었다`,
  )
  if (usable === 0) {
    console.info('\n  ★★셀 수 있는 경기가 0건이다 — 목록을 낼 수 없다★★')
    return
  }

  /* ── 선수 × 무기 ─────────────────────────────────────────── */
  const rows = await prisma.$queryRaw<Row[]>`
    WITH t2 AS (
      SELECT lc."id" AS lcid, lc."clanId" FROM "LeagueClan" lc
        JOIN "League" l ON l."id" = lc."leagueId" AND l."slug" = 'nolink'
       WHERE lc."division" = 2
    )
    SELECT p."name", c."name" AS clan, st."weapon",
           count(*) AS games,
           coalesce(sum(st."kill"), 0)  AS kills,
           coalesce(sum(st."death"), 0) AS deaths
      FROM "Match" m
      JOIN "League" l ON l."id" = m."leagueId" AND l."slug" = 'nolink'
      JOIN "MatchPlayerStat" st ON st."matchId" = m."id"
      JOIN "Player" p ON p."id" = st."playerId"
      JOIN "LeaguePlayer" lp ON lp."playerId" = p."id" AND lp."leagueId" = m."leagueId"
      JOIN "Clan" c ON c."id" = lp."clanId"
     WHERE m."startAt" >= ${FROM} AND m."startAt" < ${TO}
       AND m."redLeagueClanId" IN (SELECT lcid FROM t2)
       AND m."blueLeagueClanId" IN (SELECT lcid FROM t2)
       AND lp."clanId" IN (SELECT "clanId" FROM t2)
       AND st."kill" IS NOT NULL AND st."death" IS NOT NULL
     GROUP BY 1, 2, 3
  `

  /* 선수마다 무기별로 모은다 */
  interface Agg {
    clan: string
    rifle: { g: number; k: number; d: number }
    sniper: { g: number; k: number; d: number }
    unknown: number
  }
  const by = new Map<string, Agg>()
  for (const r of rows) {
    const a =
      by.get(r.name) ??
      ({ clan: r.clan, rifle: { g: 0, k: 0, d: 0 }, sniper: { g: 0, k: 0, d: 0 }, unknown: 0 } as Agg)
    const g = Number(r.games)
    const k = Number(r.kills)
    const d = Number(r.deaths)
    if (r.weapon === 0) {
      a.rifle = { g: a.rifle.g + g, k: a.rifle.k + k, d: a.rifle.d + d }
    } else if (r.weapon === 1) {
      a.sniper = { g: a.sniper.g + g, k: a.sniper.k + k, d: a.sniper.d + d }
    } else {
      a.unknown += g
    }
    by.set(r.name, a)
  }

  const snipers: [string, Agg][] = []
  const rifles: [string, Agg][] = []
  let half = 0
  let noWeapon = 0
  for (const [name, a] of by) {
    const w = mainWeaponOf(a.rifle.g, a.sniper.g)
    if (w === 1) snipers.push([name, a])
    else if (w === 0) rifles.push([name, a])
    else if (a.rifle.g + a.sniper.g === 0) noWeapon += 1
    else half += 1
  }
  console.info(
    `\n  선수 ★${by.size}명★ — 스나수 ★${snipers.length}★ · 라플수 ★${rifles.length}★` +
      ` · ★반반 ${half}명★ · 무기를 아는 판이 0인 사람 ${noWeapon}명`,
  )
  console.info('  ★주무기 = 그 무기로 뛴 판수가 절반을 넘는 쪽★ (`mainWeaponOf` · D-173 과 같은 규칙)')
  console.info('  ★무기는 경기 단위다★ — 그 경기의 킬·데스 전부가 그 무기 몫이다')
  console.info('  ★킬뎃 = 킬 ÷ (킬+데스) × 100★')

  /* ★맨 위에 한 줄★ — 50경기 이상이 몇 명인지 */
  const over = (list: [string, Agg][], pick: (a: Agg) => Agg['rifle']): [string, Agg][] =>
    list.filter(([, a]) => pick(a).g >= MIN_GAMES)
  const s50 = over(snipers, (a) => a.sniper)
  const r50 = over(rifles, (a) => a.rifle)
  console.info(`\n  ★★${MIN_GAMES}경기 이상 — 스나수 ${s50.length}명 · 라플수 ${r50.length}명★★`)

  const line = (i: number, name: string, a: Agg, v: Agg['rifle']): string =>
    `  ${String(i).padStart(3)}  ${name.padEnd(18)} ${a.clan.padEnd(14)}` +
    ` ${String(v.g).padStart(4)} ${String(v.k).padStart(5)} ${String(v.d).padStart(5)}` +
    `  ${kd(v.k, v.d).padStart(6)}`

  const byKd =
    (pick: (a: Agg) => Agg['rifle']) =>
    (a: [string, Agg], b: [string, Agg]): number => {
      const x = pick(a[1])
      const y = pick(b[1])
      const xv = x.k + x.d === 0 ? -1 : x.k / (x.k + x.d)
      const yv = y.k + y.d === 0 ? -1 : y.k / (y.k + y.d)
      return yv - xv
    }

  const show = (
    title: string,
    all: [string, Agg][],
    kept: [string, Agg][],
    pick: (a: Agg) => Agg['rifle'],
  ): void => {
    console.info(`\n══ ★${title} · ${MIN_GAMES}경기 이상★ ══\n`)
    const head = '   순  닉네임              클랜             경기    킬   데스   킬뎃'
    if (kept.length === 0) {
      /* ★기준을 임의로 낮추지 않는다.★ 0명이면 0명이라 하고 ★재료만★ 준다 */
      console.info(`  ★★0명입니다★★ — ${MIN_GAMES}경기를 채운 사람이 없다`)
      console.info('  ★기준을 임의로 낮추지 않는다.★ 아래는 ★판수 상위 10명★ 이다 (재료)\n')
      console.info(head)
      let j = 0
      for (const [name, a] of [...all].sort((x, y) => pick(y[1]).g - pick(x[1]).g).slice(0, 10)) {
        j += 1
        console.info(line(j, name, a, pick(a)))
      }
      return
    }
    console.info(head)
    let i = 0
    for (const [name, a] of [...kept].sort(byKd(pick))) {
      i += 1
      console.info(line(i, name, a, pick(a)))
    }
  }
  show('스나수 — 스나로 뛴 경기만', snipers, s50, (a) => a.sniper)
  show('라플수 — 라플로 뛴 경기만', rifles, r50, (a) => a.rifle)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
