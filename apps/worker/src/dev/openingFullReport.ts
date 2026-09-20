/**
 * ★★한 선수의 경기를 전수 재조사한다★★ (2026-09-20 사장님)
 *
 * > 「점수를 선짤점수 포함해서 6경기 전수 재조사 하고 육각 그래프도 다시 그려서 달란 얘기야」
 * > 「mvp는 mvp인 이유 써주고」
 *
 * ```
 * pnpm --filter @sacloud/worker exec tsx src/dev/openingFullReport.ts --usn=... --keys=a,b,c
 * ```
 *
 * ── 무엇을 내나
 *
 *   ① 경기마다 ★라운드별 선짤 내역★ (누가 누구를 · 몇 초에 · 몇 점 · 왜)
 *   ② ★기존 실력 점수★ 와 ★선짤을 더한 점수★
 *   ③ ★MVP 가 바뀌나★ — 이긴 팀에서 점수 1등을 다시 뽑는다
 *   ④ ★육각 여섯 축★ — 선수 화면이 쓰는 것과 같은 재료
 *
 * ── ⚠ 진영은 ★세 겹★ 으로 정한다 (`openingSidesOf`)
 *   C4 · 전반 5승 · ★좌표(집)★. 좌표 규칙을 빠뜨려서 한 경기를 못 쟀던 적이 있다.
 *
 * 아무것도 저장하지 않는다 — 읽기만 한다.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { prisma } from '@sacloud/db'
import {
  HOME_FLOOR_LABELS,
  HOME_SNIPE_LABELS,
  firstBloodsOf,
  killsOf,
  openingPointsOf,
  openingSidesOf,
  openingTalliesOf,
  roundStartsOf,
  roundStatesOf,
  sideLookupOf,
  weaponByPlayerOf,
  zoneCellsOfAnyLabels,
  OPENING_PENALTY_WINDOW_SECONDS,
  OPENING_REVENGE_SECONDS,
  OPENING_SURVIVE_SECONDS,
  type AnyZoneFile,
  type DuelEvent,
  type OpeningEvent,
  type OpeningSideEvent,
  type ZoneCells,
} from '@sacloud/nexon'
import { REPO_ROOT } from '../lib/env.js'

const arg = (name: string): string =>
  (process.argv.find((a) => a.startsWith(`--${name}=`)) ?? '').slice(name.length + 3)

const USN = arg('usn')
const KEYS = arg('keys').split(',').filter(Boolean)

if (USN === '' || KEYS.length === 0) {
  console.error('쓰는 법: --usn=<str_usn> --keys=<경기키,경기키,...>')
  process.exit(1)
}

/* ── 구역 파일 — 좌표 규칙이 쓴다 ─────────────────────────── */

const ZONE_FILE = join(REPO_ROOT, 'data/barracks/style-zones.json')
const FLOOR_ZONE_FILE = join(REPO_ROOT, 'data/barracks/floor-zones.json')

function loadHomeZones(): { floor: ZoneCells | null; snipe: ZoneCells | null } {
  const files: AnyZoneFile[] = []
  for (const path of [ZONE_FILE, FLOOR_ZONE_FILE]) {
    if (!existsSync(path)) continue
    files.push(JSON.parse(readFileSync(path, 'utf8')) as AnyZoneFile)
  }
  if (files.length === 0) return { floor: null, snipe: null }
  return {
    floor: zoneCellsOfAnyLabels(files, HOME_FLOOR_LABELS),
    snipe: zoneCellsOfAnyLabels(files, HOME_SNIPE_LABELS),
  }
}

const home = loadHomeZones()

interface RawShape {
  battleLog?: (OpeningEvent & OpeningSideEvent & { user_nick?: string | null; target_user_nick?: string | null })[]
}

const rawOf = (payload: unknown): RawShape => {
  if (typeof payload !== 'object' || payload === null) return {}
  const holder = payload as { raw?: unknown }
  const raw = typeof holder.raw === 'object' && holder.raw !== null ? holder.raw : payload
  return raw as RawShape
}

/* ── 경기 정보와 기존 점수를 미리 읽는다 ─────────────────── */

const matches = await prisma.match.findMany({
  where: { sourceMatchId: { in: KEYS } },
  select: {
    id: true,
    sourceMatchId: true,
    startAt: true,
    winnerSide: true,
    mvpPlayerId: true,
    map: { select: { name: true } },
    redClan: { select: { clan: { select: { name: true, slug: true } } } },
    blueClan: { select: { clan: { select: { name: true, slug: true } } } },
    stats: {
      select: { playerId: true, side: true, kill: true, death: true, assist: true, weapon: true, mvp: true },
    },
  },
})

const matchIds = matches.map((m) => m.id)
const hexRows = await prisma.matchPlayerHex.findMany({
  where: { matchId: { in: matchIds } },
  select: {
    matchId: true,
    playerId: true,
    weapon: true,
    score: true,
    rounds: true,
    kills: true,
    aloneRounds: true,
    aloneWon: true,
    outRounds: true,
    fewScore: true,
    crackScore: true,
    atkScore: true,
    atkRounds: true,
    defScore: true,
    defRounds: true,
    firstKills: true,
    burstRounds: true,
    scoreLog: true,
    tradeKills: true,
    mateDeaths: true,
  },
})

const playerIds = [...new Set([...matches.flatMap((m) => m.stats.map((s) => s.playerId))])]
const players = await prisma.player.findMany({
  where: { id: { in: playerIds } },
  select: { id: true, name: true, sourcePlayerId: true },
})
/** `str_usn` → playerId (`sourcePlayerId` 가 `BRK-<str_usn>` 이다) */
const idOfUsn = new Map<string, string>()
const nameOfId = new Map<string, string>()
for (const p of players) {
  nameOfId.set(p.id, p.name)
  const src = p.sourcePlayerId ?? ''
  if (src.startsWith('BRK-')) idOfUsn.set(src.slice(4), p.id)
}

const logs = await prisma.barracksBattleLogRaw.findMany({
  where: { matchKey: { in: KEYS }, subjectKind: 'clan', status: 'ok' },
  select: { matchKey: true, payload: true },
})
const logOf = new Map(logs.map((l) => [l.matchKey, l]))

/* ── 경기마다 뜯어본다 ────────────────────────────────────── */

interface RoundLine {
  round: number
  side: 'red' | 'blue'
  sideBy: 'bomb' | 'home' | null
  elapsed: number | null
  killer: string
  victim: string
  mine: 'kill' | 'death'
  points: number
  why: string
}

interface Person {
  usn: string
  nick: string
  playerId: string | null
  name: string | null
  team: string
  isMe: boolean
  weapon: number | null
  kill: number | null
  death: number | null
  /** 기존 실력 점수 */
  baseScore: number | null
  /** 선짤 점수 */
  opening: number
  /** 둘의 합 */
  total: number | null
  tally: Record<string, number>
}

const out: Record<string, unknown>[] = []

for (const key of KEYS) {
  const m = matches.find((x) => x.sourceMatchId === key)
  const log = logOf.get(key)
  if (!m || !log) {
    out.push({ key, error: '경기나 배틀로그가 없다' })
    continue
  }

  const events = rawOf(log.payload).battleLog ?? []
  if (events.length === 0) {
    out.push({ key, error: '배틀로그가 비었다' })
    continue
  }

  /* 닉 — 배틀로그는 ★그때 닉★ 을 적는다 */
  const nickOf = new Map<string, string>()
  for (const e of events) {
    const a = String(e.str_usn ?? '').trim()
    const an = String(e.user_nick ?? '').trim()
    if (a !== '' && an !== '') nickOf.set(a, an)
    const b = String(e.target_str_usn ?? '').trim()
    const bn = String(e.target_user_nick ?? '').trim()
    if (b !== '' && bn !== '') nickOf.set(b, bn)
  }

  const weaponOf = weaponByPlayerOf(killsOf(events as readonly DuelEvent[]))
  const isSniper = (usn: string): boolean => weaponOf.get(usn) === 1

  /* ★진영 — 세 겹★ */
  const sides = openingSidesOf({ events, homeFloor: home.floor, homeSnipe: home.snipe, isSniper })
  const sideOf = sideLookupOf(sides)

  const tallies = openingTalliesOf({ events, sideOf })
  const starts = roundStartsOf(events)
  const bloods = firstBloodsOf(events)
  const states = roundStatesOf(events)

  const deathAt = (round: number, usn: string): number | null => {
    for (const d of states.get(round)?.deaths ?? []) if (d.usn === usn) return d.at
    return null
  }

  /* ── 사람마다 점수 ─────────────────────────────────── */
  const teamOf = new Map<string, string>()
  for (const e of events) {
    const a = String(e.str_usn ?? '').trim()
    const at = String(e.team_no ?? '').trim()
    if (a !== '' && at !== '') teamOf.set(a, at)
    const b = String(e.target_str_usn ?? '').trim()
    const bt = String(e.target_team_no ?? '').trim()
    if (b !== '' && bt !== '') teamOf.set(b, bt)
  }

  const hexOfPlayer = new Map(hexRows.filter((h) => h.matchId === m.id).map((h) => [h.playerId, h]))
  const statOfPlayer = new Map(m.stats.map((s) => [s.playerId, s]))

  const people: Person[] = []
  for (const usn of teamOf.keys()) {
    const pid = idOfUsn.get(usn) ?? null
    const hex = pid === null ? undefined : hexOfPlayer.get(pid)
    const stat = pid === null ? undefined : statOfPlayer.get(pid)
    const t = tallies.get(usn)
    const opening = t === undefined ? 0 : openingPointsOf(t)
    const base = hex?.score ?? null
    people.push({
      usn,
      nick: nickOf.get(usn) ?? usn.slice(0, 6),
      playerId: pid,
      name: pid === null ? null : (nameOfId.get(pid) ?? null),
      team: teamOf.get(usn) as string,
      isMe: usn === USN,
      weapon: stat?.weapon ?? hex?.weapon ?? (weaponOf.get(usn) ?? null),
      kill: stat?.kill ?? null,
      death: stat?.death ?? null,
      baseScore: base,
      opening,
      total: base === null ? null : base + opening,
      tally: t === undefined ? {} : { ...t },
    })
  }

  /* ── 내 라운드 내역 ────────────────────────────────── */
  const lines: RoundLine[] = []
  const myTeam = teamOf.get(USN)
  for (const [round, blood] of [...bloods].sort((a, b) => a[0] - b[0])) {
    if (blood === null) continue
    if (blood.killer !== USN && blood.victim !== USN) continue
    if (myTeam === undefined) continue
    const mySide = sideOf(round, myTeam)
    if (mySide === null) continue

    const start = starts.get(round)
    const elapsed = start === undefined ? null : Math.round((blood.at - start) * 10) / 10
    const early = elapsed !== null && elapsed <= OPENING_PENALTY_WINDOW_SECONDS
    const killerDeath = deathAt(round, blood.killer)
    const survived = killerDeath === null || killerDeath - blood.at >= OPENING_SURVIVE_SECONDS
    const revenged = killerDeath !== null && killerDeath - blood.at <= OPENING_REVENGE_SECONDS
    const victimSide = sideOf(round, blood.victimTeam)

    let points = 0
    let why = ''
    if (blood.victim === USN) {
      if (victimSide === 'attack') {
        if (!early) why = `${elapsed}초 — 22초를 넘어 안 깎음`
        else if (revenged) why = `${elapsed}초에 선짤당했지만 팀이 ${OPENING_REVENGE_SECONDS}초 안에 되잡아 면제`
        else {
          points = -1
          why = `${elapsed}초에 선짤당함`
        }
      } else if (isSniper(USN)) {
        points = -2
        why = '블루에서 스나가 첫 사망'
      } else {
        points = -1
        why = '블루에서 라플이 첫 사망'
      }
    } else if (victimSide === 'defense') {
      if (!early) why = `${elapsed}초 — 22초를 넘어 상 없음`
      else if (!survived) why = '선짤했지만 3초 안에 같이 죽음'
      else {
        points = 1
        why = `${elapsed}초에 선짤 + 3초 이상 생존`
      }
    } else {
      const foeSniper = isSniper(blood.victim)
      if (!early) why = `${elapsed}초 — 22초를 넘어 상 없음`
      else if (!foeSniper) why = '라플을 잡아서 상 없음 (블루는 스나만)'
      else if (!survived) why = '스나를 잡았지만 맞트레이드'
      else {
        points = 1
        why = `${elapsed}초에 상대 스나를 선짤`
      }
    }

    lines.push({
      round,
      side: mySide === 'attack' ? 'red' : 'blue',
      sideBy: sides.by.get(round) ?? null,
      elapsed,
      killer: nickOf.get(blood.killer) ?? blood.killer.slice(0, 6),
      victim: nickOf.get(blood.victim) ?? blood.victim.slice(0, 6),
      mine: blood.killer === USN ? 'kill' : 'death',
      points,
      why,
    })
  }

  /* ── MVP — 이긴 팀에서 점수 1등 ─────────────────────── */
  const mvpOf = (useOpening: boolean): Person | null => {
    const winners = people.filter((p) => {
      const stat = p.playerId === null ? undefined : statOfPlayer.get(p.playerId)
      return stat?.side === m.winnerSide
    })
    const scored = winners.filter((p) => p.baseScore !== null)
    if (scored.length === 0) return null
    return [...scored].sort((a, b) => {
      const av = useOpening ? (a.total as number) : (a.baseScore as number)
      const bv = useOpening ? (b.total as number) : (b.baseScore as number)
      if (av !== bv) return bv - av
      if ((a.kill ?? -1) !== (b.kill ?? -1)) return (b.kill ?? -1) - (a.kill ?? -1)
      return (a.death ?? 99) - (b.death ?? 99)
    })[0] as Person
  }

  const me = people.find((p) => p.isMe) ?? null
  const myHex = me?.playerId ? hexOfPlayer.get(me.playerId) : undefined

  out.push({
    key,
    at: m.startAt,
    map: m.map?.name ?? null,
    red: m.redClan?.clan?.name ?? null,
    redSlug: m.redClan?.clan?.slug ?? null,
    blue: m.blueClan?.clan?.name ?? null,
    blueSlug: m.blueClan?.clan?.slug ?? null,
    winnerSide: m.winnerSide,
    mySide: me?.playerId ? (statOfPlayer.get(me.playerId)?.side ?? null) : null,
    roundsKnown: sides.defenceOf.size,
    roundsBy: { bomb: [...sides.by.values()].filter((v) => v === 'bomb').length, home: [...sides.by.values()].filter((v) => v === 'home').length },
    me: me === null ? null : {
      nick: me.nick,
      weapon: me.weapon,
      kill: me.kill,
      death: me.death,
      baseScore: me.baseScore,
      opening: me.opening,
      total: me.total,
      tally: me.tally,
      hex: myHex === undefined ? null : {
        rounds: myHex.rounds,
        kills: myHex.kills,
        aloneRounds: myHex.aloneRounds,
        aloneWon: myHex.aloneWon,
        outRounds: myHex.outRounds,
        fewScore: myHex.fewScore,
        crackScore: myHex.crackScore,
        atkScore: myHex.atkScore,
        defScore: myHex.defScore,
        firstKills: myHex.firstKills,
        burstRounds: myHex.burstRounds,
        tradeKills: myHex.tradeKills,
        mateDeaths: myHex.mateDeaths,
      },
    },
    rounds: lines,
    people: people
      .map((p) => {
        /*
         * ★★점수를 갈라서 보여 준다★★ (2026-09-20 사장님:
         *   「세이브점수 킬점수 폭탄설치점수 선짤추가점수 선짤감점 (…)
         *    점수의 구성을 전부 해부해서 볼 수 있게 하고싶은데」)
         *
         * ⚠ ★평범한 1점짜리 라플킬은 `scoreLog` 에 안 담긴다★ — 워커가 안 담는다
         *   (사장님이 「그건 세지 말라」 하셨다). 그래서 ★킬 점수는 나머지로 구한다★ —
         *   `score` 에서 세이브·폭탄을 빼면 남는 것이 킬 몫이다.
         *   ★이렇게 해야 칸의 합이 총점과 항상 맞는다.★
         */
        const hex2 = p.playerId === null ? undefined : hexOfPlayer.get(p.playerId)
        const rawLog = hex2?.scoreLog
        const log = Array.isArray(rawLog) ? (rawLog as { k?: unknown; p?: unknown }[]) : []
        let save = 0
        let bomb = 0
        for (const e of log) {
          const k = String(e.k ?? '')
          const pt = Number(e.p ?? 0)
          if (!Number.isFinite(pt)) continue
          if (k.startsWith('save')) save += pt
          else if (k.startsWith('bomb')) bomb += pt
        }
        return {
          nick: p.nick, name: p.name, team: p.team, isMe: p.isMe, weapon: p.weapon,
          kill: p.kill, death: p.death, baseScore: p.baseScore, opening: p.opening, total: p.total,
          side: p.playerId === null ? null : (statOfPlayer.get(p.playerId)?.side ?? null),
          parts: {
            kill: p.baseScore === null ? null : p.baseScore - save - bomb,
            save,
            bomb,
            opening: p.opening,
          },
        }
      })
      .sort((a, b) => (b.total ?? -999) - (a.total ?? -999)),
    mvpNow: m.mvpPlayerId ? (nameOfId.get(m.mvpPlayerId) ?? null) : null,
    mvpByScore: mvpOf(false),
    mvpWithOpening: mvpOf(true),
  })
}

/* ── ★여섯 축★ — 6경기 합으로 낸다 ──────────────────────────
 *
 * ⚠ ★시즌 육각은 못 쓴다★ — 사장님은 5경기뿐이라 문턱을 못 넘어 전부 `null` 이다
 *   (백분위는 모집단이 있어야 나온다). 그래서 ★이 6경기 안에서의 원값★ 을 그린다.
 *
 * ⚠ ★식은 `playerHexScore.axisValuesOf` 와 같다.★ 새로 짜지 않았다 —
 *   두 곳이 어긋나면 화면의 같은 이름이 두 뜻이 된다.
 */
const myId = idOfUsn.get(USN) ?? null
const myHexes = myId === null ? [] : hexRows.filter((h) => h.playerId === myId)
const sum = (f: (h: (typeof myHexes)[number]) => number): number => myHexes.reduce((s, h) => s + f(h), 0)
const round1 = (n: number): number => Math.round(n * 10) / 10
const rate = (total: number, rounds: number): number | null => (rounds <= 0 ? null : round1((total / rounds) * 10))
const games = myHexes.length

const axes = games === 0 ? null : {
  /* 세이브 — 받은 점수의 ★총합★ (여섯 중 이 축만 총합이다) */
  save: sum((h) => h.fewScore),
  /* 스나싸움 — 롱 안 스나 대 스나 승률. 재료가 경기별로 안 쌓여 여기선 못 낸다 */
  duel: null as number | null,
  /* A어택 — 공격(레드) 라운드에서 딴 점수의 평균 */
  chance: rate(sum((h) => h.atkScore), sum((h) => h.atkRounds)),
  /* 크랙 — 판당 크랙 점수 */
  safe: round1((sum((h) => h.crackScore) / games) * 10),
  /* 방어율 — 수비(블루) 라운드에서 딴 점수의 평균 */
  gap: rate(sum((h) => h.defScore), sum((h) => h.defRounds)),
  /* 소수싸움 — 판당 소수싸움 점수 */
  outnumbered: round1((sum((h) => h.fewScore) / games) * 10),
  /* ★선짤 — 새 축★. 판당 선짤 점수 */
  opening: round1(out.reduce((acc: number, m) => acc + ((m.me as { opening?: number } | null)?.opening ?? 0), 0) / games),
  /* 되짚을 재료 */
  raw: {
    atkScore: sum((h) => h.atkScore), atkRounds: sum((h) => h.atkRounds),
    defScore: sum((h) => h.defScore), defRounds: sum((h) => h.defRounds),
    crackScore: sum((h) => h.crackScore), fewScore: sum((h) => h.fewScore),
    aloneWon: sum((h) => h.aloneWon), aloneRounds: sum((h) => h.aloneRounds),
    outRounds: sum((h) => h.outRounds), firstKills: sum((h) => h.firstKills),
    kills: sum((h) => h.kills), rounds: sum((h) => h.rounds),
    score: sum((h) => h.score),
  },
}

console.info(JSON.stringify({ usn: USN, matches: out, axes, games }, null, 1))
await prisma.$disconnect()
