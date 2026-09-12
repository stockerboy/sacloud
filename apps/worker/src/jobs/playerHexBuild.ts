/**
 * ★선수 육각형 · 실력 점수 집계★ — `player-hex-build` (2026-09-10 · 사장님 확정)
 *
 * 두 단계다.
 *
 *   1. 재료 — 시즌 0 경기마다 배틀로그를 읽어 선수별 원시 횟수를 `MatchPlayerHex` 에 쌓는다.
 *      선짤 · 연속킬 · 세이브(혼자 남음) · 소수싸움(수 밀림) · 싸움(스나는 롱 안 스나 대 스나,
 *      라플은 라플 대 라플). 한 경기 배틀로그는 클랜마다 하나씩 두 벌이라 **둘 다 읽고
 *      (경기·라운드·시각·잡은이·죽은이) 로 겹침을 뺀다.** 라운드 승자는 `win_flag` 다 —
 *      `win_team_no` 는 빈 문자열이다 (2026-09-10 실측).
 *   2. 접기 — 리그마다 선수 한 명에 한 줄로 `LeaguePlayerHex` 를 쓴다. 백분위·등수·점수는
 *      `lib/playerHexScore.ts` 가 낸다. 화면은 이 줄만 읽는다.
 *
 * 대상 리그는 IPL(`nolink`) 과 SPL(`supply`) 이다. 열산(`sanply`)은 육각형을 주지 않는다 —
 * 사장님 2026-09-10: "열산은 클랜도 개인도 육각형 제공x".
 *
 * `--rebuild` 가 없으면 이미 같은 `formulaVersion` 으로 만든 경기는 건너뛴다 (재개 가능).
 * 접기(2단계)는 매번 통째로 다시 한다 — 등수는 모집단 전체를 봐야 한다.
 *
 * 스크래치 실측 스크립트(`axes.mjs` · `rounds2.mjs` · `rifleduel.mjs` · `snipe5.mjs` ·
 * `score3.mjs`, 2026-09-10)를 그대로 옮긴 것이다. 규칙을 바꾸지 않았다.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { prisma, Prisma } from '@sacloud/db'
import {
  A_LONG_ZONE_LABELS,
  B_LONG_ZONE_LABEL,
  inZone,
  zoneCellsOfLabels,
  type LabeledZoneFile,
  type ZoneCells,
} from '@sacloud/nexon'
import { REPO_ROOT } from '../lib/env.js'
import { log, warn } from '../lib/log.js'
import { SEASON0_FROM } from '../lib/season0Window.js'
import type { TierNo } from '../lib/iplTiers.js'
import { MIN_MEMBERS, SHORT_MEMBER_WEIGHT } from '../lib/iplTiers.js'
import {
  BURST_GAP_SECONDS,
  foldPlayerHex,
  PLAYER_HEX_FORMULA_VERSION,
  type PlayerHexInput,
  homeTierOf,
} from '../lib/playerHexScore.js'

export { PLAYER_HEX_FORMULA_VERSION }

/** 육각형을 주는 리그 — 열산은 없다 */
export const HEX_LEAGUE_SLUGS = ['nolink', 'supply'] as const

const ZONE_FILE = join(REPO_ROOT, 'data/barracks/style-zones.json')
/** 배틀로그를 한 번에 읽는 경기 수 — 운영 풀러의 문장 시간제한 안에 든다 (실측 150) */
const LOG_BATCH = 150

export interface PlayerHexBuildOptions {
  confirm: boolean
  rebuild: boolean
  /** 특정 리그만 (slug). 없으면 `HEX_LEAGUE_SLUGS` 전부 */
  leagueSlug: string | null
}

export interface PlayerHexBuildResult {
  leagues: string[]
  matches: number
  matchesSkipped: number
  events: number
  matchRows: number
  playerRows: number
  /** 규칙으로 MVP 를 정한 경기 수 (원본에 MVP 가 없던 경기) */
  mvpAssigned: number
  /** 리그별 · 무기별 모집단 크기 */
  pools: Record<string, { sniper: number; rifle: number; unmeasured: number }>
  zones: { file: string | null; aLong: number; bLong: number }
}

interface RawEvent {
  k: string
  et: string
  rd: string | null
  tm: string | null
  su: string | null
  tu: string | null
  tn: string | null
  ttn: string | null
  wf: string | null
  gun: string | null
  kx: number | null
  ky: number | null
  dx: number | null
  dy: number | null
}

interface Kill {
  k: string
  rd: string
  t: number
  killer: string
  victim: string
  kt: string | null
  vt: string | null
  wf: string | null
  own: string | null
  /** 잡은 쪽 무기 — kill 줄의 `weapon`, death 줄의 `target_weapon` */
  gun: string | null
  kx: number | null
  ky: number | null
  dx: number | null
  dy: number | null
}

interface Who {
  pid: string
  weapon: number | null
}

interface MatchTally {
  rounds: number
  kills: number
  firstKills: number
  burstRounds: number
  aloneRounds: number
  aloneWon: number
  outRounds: number
  outWon: number
  duelWon: number
  duelLost: number
}

const emptyTally = (): MatchTally => ({
  rounds: 0, kills: 0, firstKills: 0, burstRounds: 0,
  aloneRounds: 0, aloneWon: 0, outRounds: 0, outWon: 0, duelWon: 0, duelLost: 0,
})

const secondsOf = (t: string | null): number => {
  const [m, s] = String(t ?? '0:0').split(':')
  return Number(m) * 60 + Number(s)
}

function loadLongZones(): { file: string | null; aLong: ZoneCells | null; bLong: ZoneCells | null } {
  if (!existsSync(ZONE_FILE)) return { file: null, aLong: null, bLong: null }
  const parsed = JSON.parse(readFileSync(ZONE_FILE, 'utf8')) as LabeledZoneFile
  const aLong = zoneCellsOfLabels(parsed, A_LONG_ZONE_LABELS)
  const bLong = zoneCellsOfLabels(parsed, [B_LONG_ZONE_LABEL])
  return {
    file: ZONE_FILE,
    aLong: aLong.cells.length > 0 ? aLong : null,
    bLong: bLong.cells.length > 0 ? bLong : null,
  }
}

export async function buildPlayerHex(options: PlayerHexBuildOptions): Promise<PlayerHexBuildResult> {
  const slugs = options.leagueSlug ? [options.leagueSlug] : [...HEX_LEAGUE_SLUGS]
  const leagues = await prisma.league.findMany({
    where: { slug: { in: slugs } },
    select: { id: true, slug: true, divisionCount: true },
  })
  if (leagues.length === 0) throw new Error(`리그를 못 찾았다: ${slugs.join(', ')}`)

  const zones = loadLongZones()
  const longZones = [zones.aLong, zones.bLong].filter((z): z is ZoneCells => !!z)
  if (longZones.length === 0) warn('구역 파일이 없다 — 스나싸움을 못 잰다 (null 로 남는다)')
  const inLong = (x: number | null, y: number | null): boolean =>
    x !== null && y !== null && longZones.some((zone) => inZone(zone, { x, y }))

  const result: PlayerHexBuildResult = {
    leagues: leagues.map((l) => l.slug),
    matches: 0,
    matchesSkipped: 0,
    events: 0,
    matchRows: 0,
    playerRows: 0,
    mvpAssigned: 0,
    pools: {},
    zones: { file: zones.file, aLong: zones.aLong?.cells.length ?? 0, bLong: zones.bLong?.cells.length ?? 0 },
  }

  /* ── 1. 재료 ──────────────────────────────────────────────────────────── */
  const matches = await prisma.match.findMany({
    where: {
      leagueId: { in: leagues.map((l) => l.id) },
      supersededAt: null,
      startAt: { gte: SEASON0_FROM },
      sourceMatchId: { not: null },
    },
    select: { id: true, sourceMatchId: true },
  })
  const matchIdOfKey = new Map<string, string>()
  for (const m of matches) if (m.sourceMatchId) matchIdOfKey.set(m.sourceMatchId, m.id)

  let todo = [...matchIdOfKey.entries()]
  if (!options.rebuild) {
    const built = new Set(
      (
        await prisma.matchPlayerHex.findMany({
          where: { matchId: { in: matches.map((m) => m.id) }, formulaVersion: PLAYER_HEX_FORMULA_VERSION },
          select: { matchId: true },
          distinct: ['matchId'],
        })
      ).map((r) => r.matchId),
    )
    result.matchesSkipped = todo.filter(([, id]) => built.has(id)).length
    todo = todo.filter(([, id]) => !built.has(id))
  }
  log(`경기 ${matchIdOfKey.size}건 · 셀 것 ${todo.length}건 · 건너뜀 ${result.matchesSkipped}건`)

  for (let i = 0; i < todo.length; i += LOG_BATCH) {
    const part = todo.slice(i, i + LOG_BATCH)
    const keys = part.map(([k]) => k)
    const ids = part.map(([, id]) => id)

    /* 누가 누구인가 — 병영 usn → 우리 선수 · 그 경기 무기 */
    const who = new Map<string, Who>()
    for (const r of await prisma.$queryRaw<{ k: string; usn: string; w: number | null; pid: string }[]>`
      SELECT m."sourceMatchId" AS k, substring(p."sourcePlayerId" from 5) AS usn,
             s."weapon" AS w, p."id" AS pid
        FROM "MatchPlayerStat" s
        JOIN "Match" m ON m."id" = s."matchId"
        JOIN "Player" p ON p."id" = s."playerId"
       WHERE s."matchId" IN (${Prisma.join(ids)})
         AND p."sourcePlayerId" LIKE 'BRK-%'`) {
      who.set(`${r.k}|${r.usn}`, { pid: r.pid, weapon: r.w })
    }

    /* 배틀로그 — 두 벌을 읽고 겹침을 뺀다 */
    const raw = await prisma.$queryRaw<RawEvent[]>`
      SELECT r."matchKey" AS k, e->>'event_type' AS et, e->>'round' AS rd, e->>'event_time' AS tm,
             e->>'str_usn' AS su, e->>'target_str_usn' AS tu,
             e->>'team_no' AS tn, e->>'target_team_no' AS ttn, e->>'win_flag' AS wf,
             CASE WHEN e->>'event_type' = 'kill' THEN e->>'weapon' ELSE e->>'target_weapon' END AS gun,
             (e->>'kill_x')::int AS kx, (e->>'kill_y')::int AS ky,
             (e->>'death_x')::int AS dx, (e->>'death_y')::int AS dy
        FROM "BarracksBattleLogRaw" r, jsonb_array_elements(r."payload"->'battleLog') e
       WHERE r."matchKey" IN (${Prisma.join(keys)}) AND r."status" = 'ok'
         AND jsonb_typeof(r."payload"->'battleLog') = 'array'
         AND e->>'event_type' IN ('kill', 'death')`
    const kills = new Map<string, Kill>()
    /* ★라운드 승자★ — `win_flag` 는 그 배틀로그를 낸 클랜 쪽 시각이다. «lose» 만 있는 라운드는 상대가 이긴 것.
       겹침을 빼기 전에 두 벌 모두에서 읽는다 (2026-09-11 · 이걸 안 읽어 상대 쪽 세이브가 전부 0 이었다) */
    const roundWinner = new Map<string, string | null>()
    for (const g of raw) {
      if (!g.rd || (g.wf !== 'win' && g.wf !== 'lose') || !g.tn) continue
      const key = `${g.k}|${g.rd}`
      if (g.wf === 'win') roundWinner.set(key, g.tn)
      else if (!roundWinner.has(key)) roundWinner.set(key, `!${g.tn}`)
    }
    for (const g of raw) {
      const killer = g.et === 'kill' ? g.su : g.tu
      const victim = g.et === 'kill' ? g.tu : g.su
      const kt = g.et === 'kill' ? g.tn : g.ttn
      const vt = g.et === 'kill' ? g.ttn : g.tn
      if (!killer || !victim || g.rd === null) continue
      const id = `${g.k}|${g.rd}|${g.tm}|${killer}|${victim}`
      if (kills.has(id)) continue
      kills.set(id, {
        k: g.k, rd: g.rd, t: secondsOf(g.tm), killer, victim, kt, vt,
        wf: g.wf, own: g.tn, gun: g.gun, kx: g.kx, ky: g.ky, dx: g.dx, dy: g.dy,
      })
    }
    result.events += kills.size

    /* 경기별 팀 명부 · 라운드별 킬 */
    const roster = new Map<string, Map<string, Set<string>>>()
    const byRound = new Map<string, Kill[]>()
    for (const e of kills.values()) {
      let teams = roster.get(e.k)
      if (!teams) { teams = new Map(); roster.set(e.k, teams) }
      for (const [u, t] of [[e.killer, e.kt], [e.victim, e.vt]] as const) {
        if (t === null) continue
        let s = teams.get(t)
        if (!s) { s = new Set(); teams.set(t, s) }
        s.add(u)
      }
      const rk = `${e.k}|${e.rd}`
      const arr = byRound.get(rk)
      if (arr) arr.push(e)
      else byRound.set(rk, [e])
    }

    const tallies = new Map<string, MatchTally>()
    const tallyOf = (k: string, pid: string): MatchTally => {
      const id = `${k}|${pid}`
      let t = tallies.get(id)
      if (!t) { t = emptyTally(); tallies.set(id, t) }
      return t
    }
    const whoOf = (k: string, usn: string): Who | undefined => who.get(`${k}|${usn}`)

    for (const [, arr] of byRound) {
      arr.sort((a, b) => a.t - b.t)
      const mk = (arr[0] as Kill).k
      const teams = roster.get(mk)

      /* 선짤 · 연속킬 · 등장 라운드 */
      const seen = new Set<string>()
      const lastKillAt = new Map<string, number>()
      const burstHere = new Set<string>()
      for (const e of arr) {
        const K = whoOf(mk, e.killer)
        const V = whoOf(mk, e.victim)
        if (K) {
          seen.add(K.pid)
          const prev = lastKillAt.get(K.pid)
          if (prev !== undefined && e.t - prev <= BURST_GAP_SECONDS) burstHere.add(K.pid)
          lastKillAt.set(K.pid, e.t)
          tallyOf(mk, K.pid).kills += 1
        }
        if (V) seen.add(V.pid)

        /* 싸움 — 둘 다 스나(롱 안) 또는 둘 다 라플(맵 전체). 무기는 그 경기 기록으로 판정한다 */
        if (K && V) {
          if (K.weapon === 1 && V.weapon === 1 && e.gun === 'sniper') {
            if (inLong(e.kx, e.ky) && inLong(e.dx, e.dy)) {
              tallyOf(mk, K.pid).duelWon += 1
              tallyOf(mk, V.pid).duelLost += 1
            }
          } else if (K.weapon === 0 && V.weapon === 0 && e.gun === 'riple') {
            tallyOf(mk, K.pid).duelWon += 1
            tallyOf(mk, V.pid).duelLost += 1
          }
        }
      }
      for (const pid of seen) tallyOf(mk, pid).rounds += 1
      for (const pid of burstHere) tallyOf(mk, pid).burstRounds += 1
      const firstK = whoOf(mk, (arr[0] as Kill).killer)
      if (firstK) tallyOf(mk, firstK.pid).firstKills += 1

      /* 세이브 · 소수싸움 — 살아 있는 수를 따라가며 밀린 쪽을 본다 */
      if (!teams || teams.size !== 2) continue
      const [tA, tB] = [...teams.keys()] as [string, string]
      const flagged = roundWinner.get(`${mk}|${(arr[0] as Kill).rd}`) ?? null
      /* «!팀» 은 그 팀이 졌다는 뜻 — 두 팀뿐이니 남은 쪽이 이겼다 */
      const win = flagged === null ? null : flagged.startsWith('!') ? (flagged.slice(1) === tA ? tB : tA) : flagged
      const alive = new Map<string, Set<string>>([[tA, new Set(teams.get(tA))], [tB, new Set(teams.get(tB))]])
      const teamOf = new Map<string, string>()
      for (const [t, s] of teams) for (const u of s) teamOf.set(u, t)
      const sawOut = new Set<string>()
      const sawAlone = new Set<string>()
      for (const e of arr) {
        const vt = teamOf.get(e.victim)
        if (vt !== undefined) alive.get(vt)?.delete(e.victim)
        const na = (alive.get(tA) as Set<string>).size
        const nb = (alive.get(tB) as Set<string>).size
        if (na === nb) continue
        const few = alive.get(na < nb ? tA : tB) as Set<string>
        for (const u of few) sawOut.add(u)
        if (few.size === 1) for (const u of few) sawAlone.add(u)
      }
      for (const u of sawOut) {
        const W = whoOf(mk, u)
        if (!W) continue
        const t = tallyOf(mk, W.pid)
        t.outRounds += 1
        if (win !== null && teamOf.get(u) === win) t.outWon += 1
      }
      for (const u of sawAlone) {
        const W = whoOf(mk, u)
        if (!W) continue
        const t = tallyOf(mk, W.pid)
        t.aloneRounds += 1
        if (win !== null && teamOf.get(u) === win) t.aloneWon += 1
      }
    }

    const weaponOf = new Map<string, number | null>()
    for (const [key, w] of who) {
      const [k] = key.split('|') as [string]
      weaponOf.set(`${k}|${w.pid}`, w.weapon)
    }
    const rows = [...tallies.entries()].map(([id, t]) => {
      const [k, pid] = id.split('|') as [string, string]
      return {
        matchId: matchIdOfKey.get(k) as string,
        playerId: pid,
        weapon: weaponOf.get(id) ?? null,
        ...t,
        formulaVersion: PLAYER_HEX_FORMULA_VERSION,
      }
    })
    result.matches += part.length
    const mvpPicks = await pickMvps(ids, rows)
    result.mvpAssigned += mvpPicks.length
    if (options.confirm && mvpPicks.length > 0) {
      for (const pick of mvpPicks) {
        await prisma.$transaction([
          prisma.matchPlayerStat.updateMany({ where: { matchId: pick.matchId, mvp: true }, data: { mvp: false } }),
          prisma.matchPlayerStat.updateMany({ where: { matchId: pick.matchId, playerId: pick.playerId }, data: { mvp: true } }),
          prisma.match.update({ where: { id: pick.matchId }, data: { mvpPlayerId: pick.playerId } }),
        ])
      }
    }
    if (options.confirm && rows.length > 0) {
      await prisma.$transaction([
        prisma.matchPlayerHex.deleteMany({ where: { matchId: { in: ids } } }),
        prisma.matchPlayerHex.createMany({ data: rows, skipDuplicates: true }),
      ])
    }
    result.matchRows += rows.length
    if ((i / LOG_BATCH) % 5 === 0) log(`  ${Math.min(i + LOG_BATCH, todo.length)} / ${todo.length} 경기 · 킬 ${result.events}`)
  }

  /* ── 2. 접기 ──────────────────────────────────────────────────────────── */
  for (const league of leagues) {
    const tiered = league.divisionCount >= 3
    /* ★인원수 규칙은 IPL 에만★ (2026-09-12 사장님). 다른 리그는 무게를 늘 1 로 둔다 */
    const shortRule = league.slug === 'nolink'
    const minMembers = shortRule ? MIN_MEMBERS : 0
    const shortWeight = shortRule ? SHORT_MEMBER_WEIGHT : 1
    const base = await prisma.$queryRaw<
      {
        lpid: string
        games: number
        wins: number
        sniperg: number
        rifleg: number
        kills: number
        t1: number
        t2: number
        t3: number
        t1w: number
        t2w: number
        t3w: number
        clantier: number | null
      }[]
    >`
      WITH mw AS (
        -- ★인원수 규칙★ (2026-09-12 사장님) — 양 팀 클랜원 합이 모자란 판은 10%만 센다.
        -- IPL 에만 먹인다. 다른 리그는 ${shortRule ? '' : '이 값이 늘 1 이라'} 그대로다
        SELECT m."id" AS mid,
               CASE WHEN COALESCE((
                 SELECT count(*)::int FROM "MatchPlayerStat" st
                  WHERE st."matchId" = m."id"
                    AND st."playerClanId" IS NOT NULL
                    AND st."playerClanId" = CASE WHEN st."side" = 'red' THEN rl."clanId" ELSE bl."clanId" END
               ), 0) >= ${minMembers} THEN 1::float ELSE ${shortWeight}::float END AS w
          FROM "Match" m
          LEFT JOIN "LeagueClan" rl ON rl."id" = m."redLeagueClanId"
          LEFT JOIN "LeagueClan" bl ON bl."id" = m."blueLeagueClanId"
         WHERE m."leagueId" = ${league.id} AND m."supersededAt" IS NULL
      )
      SELECT lp."id" AS lpid,
             SUM(mw.w) AS games,
             SUM(CASE WHEN m."winnerSide" = s."side" THEN mw.w ELSE 0 END) AS wins,
             SUM(CASE WHEN s."weapon" = 1 THEN mw.w ELSE 0 END) AS sniperg,
             SUM(CASE WHEN s."weapon" = 0 THEN mw.w ELSE 0 END) AS rifleg,
             COALESCE(SUM(s."kill" * mw.w), 0) AS kills,
             SUM(CASE WHEN foe."division" = 1 THEN mw.w ELSE 0 END) AS t1,
             SUM(CASE WHEN foe."division" = 2 THEN mw.w ELSE 0 END) AS t2,
             SUM(CASE WHEN foe."division" = 3 THEN mw.w ELSE 0 END) AS t3,
             -- ★구간별 승수★ (2026-09-12 사장님: 승률은 «내 구간» 것을 쓴다)
             SUM(CASE WHEN foe."division" = 1 AND m."winnerSide" = s."side" THEN mw.w ELSE 0 END) AS t1w,
             SUM(CASE WHEN foe."division" = 2 AND m."winnerSide" = s."side" THEN mw.w ELSE 0 END) AS t2w,
             SUM(CASE WHEN foe."division" = 3 AND m."winnerSide" = s."side" THEN mw.w ELSE 0 END) AS t3w,
             MAX(own."division") AS clantier
        FROM "LeaguePlayer" lp
        JOIN "MatchPlayerStat" s ON s."playerId" = lp."playerId"
        JOIN "Match" m ON m."id" = s."matchId" AND m."leagueId" = lp."leagueId"
        JOIN mw ON mw."mid" = m."id"
        LEFT JOIN "LeagueClan" foe ON foe."id" =
          CASE WHEN s."side" = 'red' THEN m."blueLeagueClanId" ELSE m."redLeagueClanId" END
        LEFT JOIN "LeagueClan" own ON own."leagueId" = lp."leagueId" AND own."clanId" = lp."clanId"
       WHERE lp."leagueId" = ${league.id}
         AND m."supersededAt" IS NULL AND m."startAt" >= ${SEASON0_FROM}
         AND (s."participantRole" IS NULL OR s."participantRole" <> 'dropout')
       GROUP BY lp."id"`
    const hex = await prisma.$queryRaw<
      {
        lpid: string
        rounds: number
        firstkills: number
        burstrounds: number
        alonerounds: number
        alonewon: number
        outrounds: number
        outwon: number
        sduelwon: number
        sduellost: number
        rduelwon: number
        rduellost: number
      }[]
    >`
      WITH mw AS (
        -- ★인원수 규칙★ (2026-09-12 사장님) — 양 팀 클랜원 합이 모자란 판은 10%만 센다.
        -- IPL 에만 먹인다. 다른 리그는 ${shortRule ? '' : '이 값이 늘 1 이라'} 그대로다
        SELECT m."id" AS mid,
               CASE WHEN COALESCE((
                 SELECT count(*)::int FROM "MatchPlayerStat" st
                  WHERE st."matchId" = m."id"
                    AND st."playerClanId" IS NOT NULL
                    AND st."playerClanId" = CASE WHEN st."side" = 'red' THEN rl."clanId" ELSE bl."clanId" END
               ), 0) >= ${minMembers} THEN 1::float ELSE ${shortWeight}::float END AS w
          FROM "Match" m
          LEFT JOIN "LeagueClan" rl ON rl."id" = m."redLeagueClanId"
          LEFT JOIN "LeagueClan" bl ON bl."id" = m."blueLeagueClanId"
         WHERE m."leagueId" = ${league.id} AND m."supersededAt" IS NULL
      )
      SELECT lp."id" AS lpid,
             SUM(h."rounds" * mw.w) AS rounds,
             SUM(h."firstKills" * mw.w) AS firstkills,
             SUM(h."burstRounds" * mw.w) AS burstrounds,
             SUM(h."aloneRounds" * mw.w) AS alonerounds,
             SUM(h."aloneWon" * mw.w) AS alonewon,
             SUM(h."outRounds" * mw.w) AS outrounds,
             SUM(h."outWon" * mw.w) AS outwon,
             SUM(CASE WHEN h."weapon" = 1 THEN h."duelWon" * mw.w ELSE 0 END) AS sduelwon,
             SUM(CASE WHEN h."weapon" = 1 THEN h."duelLost" * mw.w ELSE 0 END) AS sduellost,
             SUM(CASE WHEN h."weapon" = 0 THEN h."duelWon" * mw.w ELSE 0 END) AS rduelwon,
             SUM(CASE WHEN h."weapon" = 0 THEN h."duelLost" * mw.w ELSE 0 END) AS rduellost
        FROM "LeaguePlayer" lp
        JOIN "MatchPlayerHex" h ON h."playerId" = lp."playerId"
        JOIN "Match" m ON m."id" = h."matchId" AND m."leagueId" = lp."leagueId"
        JOIN mw ON mw."mid" = m."id"
       WHERE lp."leagueId" = ${league.id} AND h."formulaVersion" = ${PLAYER_HEX_FORMULA_VERSION}
         AND m."supersededAt" IS NULL
       GROUP BY lp."id"`
    const hexOf = new Map(hex.map((h) => [h.lpid, h]))
    const inputs: PlayerHexInput[] = base.map((b) => {
      const h = hexOf.get(b.lpid)
      const asTier = (n: number | null): TierNo | null => (tiered && (n === 1 || n === 2 || n === 3) ? n : null)
      return {
        leaguePlayerId: b.lpid,
        games: b.games,
        wins: b.wins,
        sniperGames: b.sniperg,
        rifleGames: b.rifleg,
        kills: b.kills,
        tierGames: tiered ? { 1: b.t1, 2: b.t2, 3: b.t3 } : { 1: 0, 2: 0, 3: 0 },
        tierWins: tiered ? { 1: b.t1w, 2: b.t2w, 3: b.t3w } : { 1: 0, 2: 0, 3: 0 },
        clanTier: asTier(b.clantier),
        rounds: h?.rounds ?? 0,
        firstKills: h?.firstkills ?? 0,
        burstRounds: h?.burstrounds ?? 0,
        aloneRounds: h?.alonerounds ?? 0,
        aloneWon: h?.alonewon ?? 0,
        outRounds: h?.outrounds ?? 0,
        outWon: h?.outwon ?? 0,
        sniperDuelWon: h?.sduelwon ?? 0,
        sniperDuelLost: h?.sduellost ?? 0,
        rifleDuelWon: h?.rduelwon ?? 0,
        rifleDuelLost: h?.rduellost ?? 0,
      }
    })
    const folded = foldPlayerHex(inputs)
    const inputOf = new Map(inputs.map((p) => [p.leaguePlayerId, p]))
    result.pools[league.slug] = {
      sniper: folded.filter((r) => r.weapon === 1).length,
      rifle: folded.filter((r) => r.weapon === 0).length,
      unmeasured: folded.filter((r) => r.weapon === null).length,
    }
    if (!options.confirm) continue
    for (const r of folded) {
      const p = inputOf.get(r.leaguePlayerId) as PlayerHexInput
      const data = {
        weapon: r.weapon,
        games: p.games,
        weaponGames: r.weaponGames,
        wins: p.wins,
        rounds: p.rounds,
        save: r.axes.save.value, savePct: r.axes.save.pct, saveRank: r.axes.save.rank, saveTotal: r.axes.save.total,
        duel: r.axes.duel.value, duelPct: r.axes.duel.pct, duelRank: r.axes.duel.rank, duelTotal: r.axes.duel.total,
        carry: r.axes.carry.value, carryPct: r.axes.carry.pct, carryRank: r.axes.carry.rank, carryTotal: r.axes.carry.total,
        opening: r.axes.opening.value, openingPct: r.axes.opening.pct, openingRank: r.axes.opening.rank, openingTotal: r.axes.opening.total,
        burst: r.axes.burst.value, burstPct: r.axes.burst.pct, burstRank: r.axes.burst.rank, burstTotal: r.axes.burst.total,
        outnumbered: r.axes.outnumbered.value, outnumberedPct: r.axes.outnumbered.pct,
        outnumberedRank: r.axes.outnumbered.rank, outnumberedTotal: r.axes.outnumbered.total,
        winRate: r.winRate.value, winRatePct: r.winRate.pct, winRateRank: r.winRate.rank, winRateTotal: r.winRate.total,
        hex: r.hex,
        tierFactor: r.tierFactor,
        shrink: r.shrink,
        clanBonus: r.clanBonus,
        score: r.score,
        scoreRank: r.scoreRank,
        scoreTotal: r.scoreTotal,
        duelWon: r.duelWon,
        duelLost: r.duelLost,
        aloneRounds: p.aloneRounds,
        aloneWon: p.aloneWon,
        outRounds: p.outRounds,
        outWon: p.outWon,
        firstKills: p.firstKills,
        burstRounds: p.burstRounds,
        /* ★내 구간★ — 가장 많이 뛴 티어 (2026-09-11 사장님). 구간별 랭킹이 이 칸을 거른다 */
        homeTier: homeTierOf(p.tierGames),
        tier1Games: p.tierGames[1],
        tier2Games: p.tierGames[2],
        tier3Games: p.tierGames[3],
        formulaVersion: PLAYER_HEX_FORMULA_VERSION,
      }
      await prisma.leaguePlayerHex.upsert({
        where: { leaguePlayerId: r.leaguePlayerId },
        create: { leaguePlayerId: r.leaguePlayerId, ...data },
        update: data,
      })
      result.playerRows += 1
    }
    log(`${league.slug} — 스나 ${result.pools[league.slug]?.sniper} · 라플 ${result.pools[league.slug]?.rifle} · 미측정 ${result.pools[league.slug]?.unmeasured}`)
  }
  return result
}

/* ────────────────────────────────────────────────────────────────────────── */
/* ★MVP 규칙★ (2026-09-11 · 사장님 확정)                                          */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * 원본 자료에 MVP 가 없는 경기(IPL 병영 로그 전부 · SPL 일부)에서 규칙으로 MVP 를 정한다.
 *
 *   후보   = ★이긴 팀★ 선수 (목업: 진 팀에는 MVP 없음)
 *   1순위  = 세이브(혼자 남아 이긴 라운드) 2회 이상 → 무조건. 여럿이면 세이브 많은 쪽
 *   2순위  = 킬 많은 순 → 같으면 데스 적은 순
 *   그래도 같으면 무작위 — 단 «경기마다 고정된 무작위» (경기·선수 id 해시) 라 새로고침해도 안 바뀐다
 *
 * 원본 MVP 가 있는 경기(`MatchPlayerStat.mvp = true` 가 하나라도 있으면)는 손대지 않는다.
 * 세이브가 이 규칙에 들어가므로 `MatchPlayerHex` 를 센 뒤에 정한다.
 */
export const MVP_SAVE_THRESHOLD = 2

function stableHash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h
}

export interface MvpCandidate {
  playerId: string
  saves: number
  kill: number | null
  death: number | null
}

/** 순수 규칙 — 테스트가 이 함수를 본다 */
export function pickMvp(matchId: string, candidates: readonly MvpCandidate[]): string | null {
  if (candidates.length === 0) return null
  const sorted = [...candidates].sort((a, b) => {
    const aSave = a.saves >= MVP_SAVE_THRESHOLD ? a.saves : 0
    const bSave = b.saves >= MVP_SAVE_THRESHOLD ? b.saves : 0
    if (aSave !== bSave) return bSave - aSave
    const ak = a.kill ?? -1
    const bk = b.kill ?? -1
    if (ak !== bk) return bk - ak
    const ad = a.death ?? Number.MAX_SAFE_INTEGER
    const bd = b.death ?? Number.MAX_SAFE_INTEGER
    if (ad !== bd) return ad - bd
    return stableHash(`${matchId}|${a.playerId}`) - stableHash(`${matchId}|${b.playerId}`)
  })
  return (sorted[0] as MvpCandidate).playerId
}

async function pickMvps(
  matchIds: readonly string[],
  hexRows: readonly { matchId: string; playerId: string; aloneWon: number }[],
): Promise<{ matchId: string; playerId: string }[]> {
  if (matchIds.length === 0) return []
  const matches = await prisma.match.findMany({
    where: { id: { in: [...matchIds] } },
    select: {
      id: true,
      winnerSide: true,
      stats: { select: { playerId: true, side: true, kill: true, death: true, mvp: true } },
    },
  })
  const savesOf = new Map(hexRows.map((r) => [`${r.matchId}|${r.playerId}`, r.aloneWon]))
  const out: { matchId: string; playerId: string }[] = []
  for (const m of matches) {
    if (m.winnerSide !== 'red' && m.winnerSide !== 'blue') continue
    /* 원본 MVP 가 있으면 그대로 둔다 — 단, 규칙으로 정한 것은 다시 정해도 된다 (같은 규칙이면 같은 답) */
    const hasSourceMvp = m.stats.some((s) => s.mvp === true) && !RULE_MVP_LEAGUES_REPICK
    if (hasSourceMvp) continue
    const winners = m.stats.filter((s) => s.side === m.winnerSide)
    const pick = pickMvp(m.id, winners.map((s) => ({ playerId: s.playerId, saves: savesOf.get(`${m.id}|${s.playerId}`) ?? 0, kill: s.kill, death: s.death })))
    if (pick) out.push({ matchId: m.id, playerId: pick })
  }
  return out
}

/**
 * true 면 이미 MVP 가 찍힌 경기도 규칙으로 다시 정한다. SPL 원본 MVP(102건)를 지키려면 false.
 * 처음 소급(2026-09-11)은 false — 원본이 있는 경기는 원본을 믿는다.
 */
const RULE_MVP_LEAGUES_REPICK: boolean = false
