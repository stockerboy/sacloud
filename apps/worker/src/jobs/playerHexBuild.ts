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
 * 대상 리그는 `HEX_LEAGUE_SLUGS` 가 정한다 — 지금은 ★세 리그 전부★ 다 (2026-09-13 사장님).
 * ⚠ 옛 서술: «IPL 과 SPL 이다. 열산은 육각형을 주지 않는다 — 2026-09-10 사장님».
 *   그 판단이 2026-09-13 에 뒤집혔다 («세 리그 전부 공평하게 대한다»).
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
  /* ★라운드 시작 시각★ — 선짤의 25초 창을 재려면 필요하다 (2026-09-15).
     게임템포와 ★같은 상수★ 를 쓴다. 두 곳이 어긋나면 안 된다 */
  MATCH_TO_FIRST_ROUND_SECONDS,
  ROUND_GAP_SECONDS,
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
  mainWeaponOf,
  MIN_HOME_TIER_GAMES,
} from '../lib/playerHexScore.js'

export { PLAYER_HEX_FORMULA_VERSION }

/**
 * 육각형·개인 점수를 만드는 리그.
 *
 * ⚠ ★2026-09-13 — 열산을 넣었다★ (사장님: «열산도 그냥 랭킹 제대로 만들어주고
 *   플레이어 분석이랑 경기분석 그런 시스템 다 넣어줘 (…) 세 리그 전부 공평하게 대한다»).
 *   옛 값은 `['nolink', 'supply']` 였고, 그때 근거는 2026-09-10 «열산은 클랜도 개인도
 *   육각형 제공x» 였다. 사장님이 뒤집으셨다.
 */
export const HEX_LEAGUE_SLUGS = ['nolink', 'supply', 'sanply'] as const

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
  /** ★한 라운드에 몰아친 최대 킬★ 과 그 최고를 낸 라운드 수 (2026-09-15 사장님) */
  maxRoundKills: number
  maxRoundTimes: number
  /** ★우위를 만든 킬★ — 딴 그 순간 우리가 상대보다 많지 않았던 킬 (2026-09-15 사장님) */
  evenKills: number
  /** ★교환★ — 동료가 죽은 직후 그 킬러를 되잡은 횟수 · 그 분모(동료 죽음) */
  tradeKills: number
  mateDeaths: number
  aloneRounds: number
  aloneWon: number
  outRounds: number
  outWon: number
  duelWon: number
  duelLost: number
}

const emptyTally = (): MatchTally => ({
  rounds: 0, kills: 0, firstKills: 0, burstRounds: 0, maxRoundKills: 0, maxRoundTimes: 0, evenKills: 0, tradeKills: 0, mateDeaths: 0,
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
    /**
     * ★교환★ 의 창 — 동료가 죽고 이 안에 그 킬러를 잡으면 «되갚았다» 로 센다 (2026-09-15).
     * 5초는 클랜 육각 6번 축에서 사장님이 확정한 값이다 (D-256). 둘을 같은 값으로 둔다.
     */
    const TRADE_WINDOW_SECONDS = 5

    /**
     * ★선짤의 창★ — 라운드 시작 후 이 안에 난 첫 킬만 «선짤» 이다 (2026-09-15 사장님).
     * 실측 라운드 시작 → 첫 킬 중앙 22초 · 25초 안이 58.9%.
     */
    const OPENING_WINDOW_SECONDS = 25
    const kills = new Map<string, Kill>()
    /* ★라운드 승자★ — `win_flag` 는 그 배틀로그를 낸 클랜 쪽 시각이다. «lose» 만 있는 라운드는 상대가 이긴 것.
       겹침을 빼기 전에 두 벌 모두에서 읽는다 (2026-09-11 · 이걸 안 읽어 상대 쪽 세이브가 전부 0 이었다) */
    const roundWinner = new Map<string, string | null>()
    for (const g of raw) {
      /*
       * ⚠ ★`!g.tn` 은 «0번 팀» 을 통째로 버렸다★ (2026-09-15 사장님이 화면에서 잡아 주심:
       *   «양팀 다 아무도 세이브 한적이 없는데 40:10으로 뜨는 이유가 궁금해»).
       *
       *   `team_no` 는 «0» 과 «1» 두 값이다 (teamList: team 0→clan A · team 1→clan B).
       *   그런데 문자열 «0» 은 자바스크립트에서 ★거짓★ 이라 `!g.tn` 이 참이 된다.
       *   그래서 0번 팀 쪽 줄이 승자 표에 하나도 안 들어갔고, 0번 응답만 있는 경기는
       *   라운드 승자를 아예 못 읽어 세이브·소수싸움이 ★전부 «못 이김»★ 으로 쌓였다.
       *   실측: 개인 세이브 6.7% · 클랜 세이브 14.5% — 같은 것을 재는데 두 배 차이였다.
       *
       *   라운드도 같은 함정이 있다 — 지금은 1부터라 안 걸리지만 뜻으로 막아 둔다.
       */
      const noRound = g.rd === null || g.rd === undefined || g.rd === ''
      const noTeam = g.tn === null || g.tn === undefined || g.tn === ''
      if (noRound || noTeam || (g.wf !== 'win' && g.wf !== 'lose')) continue
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

    /*
     * ★라운드가 몇 초에 시작했나★ — 선짤의 25초 창을 재려면 필요하다 (2026-09-15 사장님:
     * «라운드 시작 후 25초 안에 가장 먼저 죽이면 선짤점수가 올라야해»).
     *
     * `event_time` 은 ★경기 시작부터의 누적 시간★ 이라 라운드 시작을 따로 짚어야 한다.
     * 값은 게임템포에서 사장님이 실측해 주신 것을 그대로 쓴다 —
     *   1라운드  경기 시작 + 10초
     *   그 뒤    직전 라운드 ★마지막 킬★ + 8.45초
     * 두 곳이 어긋나면 안 되므로 `@sacloud/nexon` 의 같은 상수를 가져다 쓴다.
     */
    const roundStartAt = new Map<string, number>()
    {
      const byMatch = new Map<string, { rd: number; key: string; last: number }[]>()
      for (const [key, arr] of byRound) {
        const head = arr[0] as Kill
        let last = head.t
        for (const e of arr) if (e.t > last) last = e.t
        const list = byMatch.get(head.k) ?? []
        list.push({ rd: Number(head.rd), key, last })
        byMatch.set(head.k, list)
      }
      for (const [, list] of byMatch) {
        list.sort((a, b) => a.rd - b.rd)
        let prevEnd: number | null = null
        for (const r of list) {
          roundStartAt.set(r.key, prevEnd === null ? MATCH_TO_FIRST_ROUND_SECONDS : prevEnd + ROUND_GAP_SECONDS)
          prevEnd = r.last
        }
      }
    }

    for (const [roundKey, arr] of byRound) {
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

      /*
       * ★캐리력 — 이 라운드에 몇 킬을 했나★ (2026-09-15 사장님).
       * 최고를 새로 세우면 «몇 번 냈나» 를 1로 되돌리고, 같으면 하나 더한다.
       */
      const killsHere = new Map<string, number>()
      for (const e of arr) {
        const K = whoOf(mk, e.killer)
        if (K) killsHere.set(K.pid, (killsHere.get(K.pid) ?? 0) + 1)
      }
      for (const [pid, n] of killsHere) {
        const t = tallyOf(mk, pid)
        if (n > t.maxRoundKills) {
          t.maxRoundKills = n
          t.maxRoundTimes = 1
        } else if (n === t.maxRoundKills) {
          t.maxRoundTimes += 1
        }
      }
      /*
       * ★선짤 — 라운드 시작 후 25초 안의 첫 킬만★ (2026-09-15 사장님).
       *
       * ⚠ 옛 판은 «그 라운드의 첫 킬» 을 무조건 셌다. 그러면 40초쯤 지나 한 명이
       *   슬쩍 잡은 것도 «선짤» 이 됐다. 사장님이 재 주신 25초는 실측 중앙(22초)
       *   바로 뒤라, 라운드 6,975개 중 ★58.9%★ 가 걸린다 — 절반 조금 넘는 좋은 자리다.
       *
       * 라운드 시작을 못 짚은 경기(첫 라운드 정보가 없는 등)는 ★안 센다★ —
       * 25초인지 모르면서 선짤이라 적지 않는다 (D-106).
       */
      const opener = arr[0] as Kill
      const startedAt = roundStartAt.get(roundKey)
      if (startedAt !== undefined && opener.t - startedAt <= OPENING_WINDOW_SECONDS) {
        const firstK = whoOf(mk, opener.killer)
        if (firstK) tallyOf(mk, firstK.pid).firstKills += 1
      }
      /*
       * ★교환율★ (2026-09-15 사장님 «교환율로 해줘») — 동료가 죽은 직후 그 킬러를 되잡았나.
       *
       * 분자 `tradeKills`  동료가 죽고 ★5초 안★ 에 그 킬러를 잡은 횟수
       * 분모 `mateDeaths`  그 라운드에 죽은 ★내 동료★ 수 (나는 안 센다)
       *
       * 클랜 육각 6번 축과 같은 뜻이고 그걸 개인 단위로 내린 것이다.
       * 5초는 클랜 축에서 사장님이 확정한 값이다 (D-256).
       */
      for (let n = 0; n < arr.length; n += 1) {
        const e = arr[n] as Kill
        const K = whoOf(mk, e.killer)
        if (!K) continue
        for (let m = n - 1; m >= 0; m -= 1) {
          const past = arr[m] as Kill
          if (e.t - past.t > TRADE_WINDOW_SECONDS) break
          /* 먼저 죽은 사람이 ★내 편★ 이고, 그 사람을 잡은 자가 ★지금 내가 잡은 자★ 인가 */
          if (past.vt !== null && e.kt !== null && past.vt === e.kt && past.killer === e.victim) {
            tallyOf(mk, K.pid).tradeKills += 1
            break
          }
        }
      }
      /*
       * 분모 — ★내가 살아 있을 때★ 죽은 동료 수.
       *
       * ⚠ 옛 판은 «그 라운드에 죽은 동료» 를 다 셌다. 그러면 ★내가 먼저 죽은 뒤★ 의
       *   동료 죽음까지 분모에 들어가서, 되갚을 수 없었던 것을 «안 갚았다» 로 적는다.
       *   실측 그 판의 교환율 평균 4.4% · 중앙 3.4% 로 바닥에 깔렸다.
       *   모르는 것도 못 한 것도 아닌 ★할 수 없었던 것★ 은 빼는 게 맞다 (D-106).
       */
      {
        const myDeathAt = new Map<string, number>()
        for (const e of arr) {
          if (!myDeathAt.has(e.victim)) myDeathAt.set(e.victim, e.t)
        }
        for (const e of arr) {
          if (e.vt === null) continue
          const team = teams?.get(e.vt)
          if (!team) continue
          for (const u of team) {
            if (u === e.victim) continue
            /* 내가 그 전에 죽었으면 되갚을 수 없었다 — 분모에 안 넣는다 */
            const mine = myDeathAt.get(u)
            if (mine !== undefined && mine < e.t) continue
            const W = whoOf(mk, u)
            if (!W) continue
            tallyOf(mk, W.pid).mateDeaths += 1
          }
        }
      }

      /* 세이브 · 소수싸움 — 살아 있는 수를 따라가며 밀린 쪽을 본다 */
      if (!teams || teams.size !== 2) continue
      const [tA, tB] = [...teams.keys()] as [string, string]
      const flagged = roundWinner.get(`${mk}|${(arr[0] as Kill).rd}`) ?? null
      /* «!팀» 은 그 팀이 졌다는 뜻 — 두 팀뿐이니 남은 쪽이 이겼다 */
      const win = flagged === null ? null : flagged.startsWith('!') ? (flagged.slice(1) === tA ? tB : tA) : flagged
      /*
       * ★그 라운드를 이겼는지 모르면 세이브·소수싸움을 아예 안 센다★
       * (2026-09-15 사장님: «양팀 다 아무도 세이브 한적이 없는데 40:10으로 뜨는 이유가 궁금해»).
       *
       * ⚠ 옛 판은 `win` 이 `null` 이어도 ★분모만★ 늘렸다. 그러면 «혼자 남았는데 못 이김»
       *   으로 쌓여서, 승패를 모르는 경기가 통째로 «세이브 0/15» 로 보였다.
       *   실측(260915013708124001): 개인 합계 0/15 인데 클랜은 4/10 · 1/10 이었다 —
       *   ★클랜 쪽(`clanHexV2.ts`)에는 `won !== null` 조건이 있었고 여기만 빠져 있었다.★
       *
       * 모르는 것을 «못 했다» 로 적지 않는다 (D-106).
       * 킬·선짤·연속킬은 승패와 무관하므로 위에서 이미 다 셌다 — 여기서만 끊는다.
       */
      /*
       * ★게임영향력 — «우위를 만든 킬»★ (2026-09-15 사장님:
       * «나는 킬을 가장 많이했다고 무조건 걔가 잘한것처럼 되는 그 구조가 싫은거야»
       *  → «너무 좋다 그걸 게임영향력으로 넣자»).
       *
       * 킬을 날린 ★그 순간★ 우리 생존자가 상대보다 많지 않았던 킬만 센다.
       * 4대1로 이기고 있을 때 딴 킬은 안 센다 — 이미 이긴 판이다.
       * 5대5·4대5 처럼 팽팽하거나 밀리는 순간에 따낸 킬만 «영향» 으로 본다.
       *
       * 실측(515판 · 4,078 «경기×선수»)
       *   총 킬과의 상관 ★0.620★ — 최대 라운드 킬은 0.913, 총 킬은 1.000
       *   한 판 열 명이 갈리는 갈래 5.01 (최대 라운드 킬은 3.43)
       *   무기 편향 1.33배 — 킬 자체 편향(1.34배)과 같은 수준이라 보정하지 않는다
       *
       * ⚠ ★승패를 몰라도 센다★ — 이 축은 라운드 승패와 무관하다.
       *   그래서 바로 아래 `win === null` 문보다 ★먼저★ 둔다.
       */
      {
        const left = new Map<string, number>([
          [tA, (teams.get(tA) as Set<string>).size],
          [tB, (teams.get(tB) as Set<string>).size],
        ])
        const sideOf = new Map<string, string>()
        for (const [t, set] of teams) for (const u of set) sideOf.set(u, t)
        for (const e of arr) {
          const mine = sideOf.get(e.killer)
          if (mine !== undefined) {
            const foe = mine === tA ? tB : tA
            /* «많지 않았다» 이므로 동수도 센다 — 5대5 에서 먼저 따낸 킬이 제일 크다 */
            if ((left.get(mine) ?? 0) <= (left.get(foe) ?? 0)) {
              const K = whoOf(mk, e.killer)
              if (K) tallyOf(mk, K.pid).evenKills += 1
            }
          }
          const vt = sideOf.get(e.victim)
          if (vt !== undefined) left.set(vt, (left.get(vt) ?? 1) - 1)
        }
      }

      if (win === null) continue
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

        /*
         * ★세이브는 상대 수를 안 본다★ (2026-09-15 사장님:
         * «1대1세이브같은경우에 무조건 두팀중 한명은 세이브인데»).
         *
         * ⚠ 옛 판은 세이브와 소수싸움을 ★한 줄에서★ 셌다. 그래서 «수가 같으면
         *   건너뛴다» 가 세이브에도 걸려 ★1대1 이 통째로 빠졌다.★
         *   1대1 은 ★이길 확률이 가장 높은 세이브★ 라, 빠지니 승률이 절반이 됐다 —
         *   실측 개인 6.7% vs 클랜 14.5%. `roundState.ts` 주석은 처음부터
         *   «1대1 이든 1대5 든 전부 세이브» 라고 말하고 있었는데 구현이 안 따랐다.
         *
         * 혼자 남았으면 ★양 팀 다 따로★ 센다 — 1대1 이면 두 사람 다 세이브 상황이다.
         */
        if (na === 1) for (const u of alive.get(tA) as Set<string>) sawAlone.add(u)
        if (nb === 1) for (const u of alive.get(tB) as Set<string>) sawAlone.add(u)

        /* 소수싸움은 ★밀릴 때만★ 이다 — 수가 같으면 우리가 밀린 게 아니다 */
        if (na === nb) continue
        const few = alive.get(na < nb ? tA : tB) as Set<string>
        for (const u of few) sawOut.add(u)
      }
      for (const u of sawOut) {
        const W = whoOf(mk, u)
        if (!W) continue
        const t = tallyOf(mk, W.pid)
        t.outRounds += 1
        if (teamOf.get(u) === win) t.outWon += 1
      }
      for (const u of sawAlone) {
        const W = whoOf(mk, u)
        if (!W) continue
        const t = tallyOf(mk, W.pid)
        t.aloneRounds += 1
        if (teamOf.get(u) === win) t.aloneWon += 1
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
        maxroundkills: number
        evenkills: number
        tradekills: number
        matedeaths: number
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
             -- ★게임영향력★ (2026-09-15 사장님) — 경기마다의 «한 라운드 최대 킬» 을 더한다.
             -- 시즌 값은 이걸 판수로 나눈 ★평균★ 이다. 시즌 최대를 쓰면 거의 전원이
             -- 4~5킬(80~100%)로 몰려 줄이 안 선다.
             SUM(h."maxRoundKills" * mw.w) AS maxroundkills,
             -- ★게임영향력★ — «우위를 만든 킬» 의 합. 값은 이걸 라운드로 나눈다
             SUM(h."evenKills" * mw.w) AS evenkills,
             -- ★교환율★ — 동료가 죽은 직후 그 킬러를 되잡은 횟수 / 동료가 죽은 횟수
             SUM(h."tradeKills" * mw.w) AS tradekills,
             SUM(h."mateDeaths" * mw.w) AS matedeaths,
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
    /**
     * ★구간 × 무기 킬·데스★ (2026-09-12 사장님) — 점수의 킬뎃 몫이 쓴다.
     * 칸을 열여덟 개 늘리는 대신 작은 질의 하나를 더 둔다. 한 리그에 수천 줄이다.
     */
    const tw = await prisma.$queryRaw<
      { lpid: string; tier: number | null; wp: number | null; g: number; k: number; d: number }[]
    >`
      SELECT lp."id" AS lpid, foe."division" AS tier, s."weapon" AS wp,
             COUNT(s.*)::int AS g,
             COALESCE(SUM(s."kill"), 0)::int AS k,
             COALESCE(SUM(s."death"), 0)::int AS d
        FROM "LeaguePlayer" lp
        JOIN "MatchPlayerStat" s ON s."playerId" = lp."playerId"
        JOIN "Match" m ON m."id" = s."matchId" AND m."leagueId" = lp."leagueId"
        LEFT JOIN "LeagueClan" foe ON foe."id" =
          CASE WHEN s."side" = 'red' THEN m."blueLeagueClanId" ELSE m."redLeagueClanId" END
       WHERE lp."leagueId" = ${league.id}
         AND m."supersededAt" IS NULL AND m."startAt" >= ${SEASON0_FROM}
         AND s."kill" IS NOT NULL AND s."death" IS NOT NULL
         AND (s."participantRole" IS NULL OR s."participantRole" <> 'dropout')
       GROUP BY lp."id", foe."division", s."weapon"`
    const twOf = new Map<string, typeof tw>()
    for (const row of tw) {
      const list = twOf.get(row.lpid) ?? []
      list.push(row)
      twOf.set(row.lpid, list)
    }
    /**
     * ★내 구간 + 내 무기 킬뎃★ — 표본이 모자라면 한 칸씩 넓힌다.
     *   ① 내 구간 · 내 무기 (10판 이상)  ② 내 구간 전체 (10판 이상)  ③ 시즌 전체
     * 셋 다 모자라면 `null` — 여섯 축 값으로 대신한다 (지어내지 않는다).
     */
    const kdRateOf = (lpid: string, homeTier: TierNo | null, weapon: 0 | 1 | null): number | null => {
      const list = twOf.get(lpid) ?? []
      const sum = (f: (r: (typeof list)[number]) => boolean) => {
        let g = 0, k = 0, d = 0
        for (const r of list) if (f(r)) { g += r.g; k += r.k; d += r.d }
        return { g, k, d }
      }
      const pick =
        homeTier !== null && weapon !== null && sum((r) => r.tier === homeTier && r.wp === weapon).g >= MIN_HOME_TIER_GAMES
          ? sum((r) => r.tier === homeTier && r.wp === weapon)
          : homeTier !== null && sum((r) => r.tier === homeTier).g >= MIN_HOME_TIER_GAMES
            ? sum((r) => r.tier === homeTier)
            : sum(() => true)
      return pick.k + pick.d > 0 ? Math.round((pick.k / (pick.k + pick.d)) * 1000) / 10 : null
    }

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
        /* ★내 구간 + 내 무기 킬뎃★ (2026-09-12 사장님) */
        kdRate: kdRateOf(b.lpid, tiered ? homeTierOf({ 1: b.t1, 2: b.t2, 3: b.t3 }) : null, mainWeaponOf({ sniperGames: b.sniperg, rifleGames: b.rifleg })),
        clanTier: asTier(b.clantier),
        rounds: h?.rounds ?? 0,
        firstKills: h?.firstkills ?? 0,
        burstRounds: h?.burstrounds ?? 0,
        /* 경기별 «한 라운드 최대 킬» 의 합 — 값은 판수로 나눠 평균을 낸다 (2026-09-15) */
        maxRoundKills: h?.maxroundkills ?? 0,
        evenKills: h?.evenkills ?? 0,
        tradeKills: h?.tradekills ?? 0,
        mateDeaths: h?.matedeaths ?? 0,
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
