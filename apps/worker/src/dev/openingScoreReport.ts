/**
 * ★한 선수의 경기를 선짤 점수로 뜯어본다★ (2026-09-20 사장님)
 *
 * ```
 * pnpm --filter @sacloud/worker exec tsx src/dev/openingScoreReport.ts 현물 6
 * ```
 *
 * 경기마다 ★라운드 한 줄씩★ 무슨 일이 있었는지 적고, 점수와 MVP 를 낸다.
 * 결과를 JSON 으로 내보내 화면(아티팩트)이 그대로 그릴 수 있게 한다.
 *
 * 아무것도 저장하지 않는다 — 읽기만 한다.
 */
import { prisma } from '@sacloud/db'
import {
  clanByTeamNo,
  firstBloodsOf,
  killsOf,
  openingPointsOf,
  openingTalliesOf,
  roundResultsOf,
  roundSidesOf,
  roundStartsOf,
  roundStatesOf,
  rosterOf,
  weaponByPlayerOf,
  OPENING_PENALTY_WINDOW_SECONDS,
  OPENING_REVENGE_SECONDS,
  OPENING_SURVIVE_SECONDS,
  type DuelEvent,
  type OpeningEvent,
  type RoundSideEvent,
} from '@sacloud/nexon'

const NICK = process.argv[2] ?? '현물'
const WANT = Number(process.argv[3] ?? '6')

interface RawShape {
  battleLog?: (OpeningEvent & { user_nick?: string | null; target_user_nick?: string | null })[]
  teamList?: { team_no?: number | string | null; clan_no?: number | string | null }[]
}

const rawOf = (payload: unknown): RawShape => {
  if (typeof payload !== 'object' || payload === null) return {}
  const holder = payload as { raw?: unknown }
  const raw = typeof holder.raw === 'object' && holder.raw !== null ? holder.raw : payload
  return raw as RawShape
}

/* ── 그 사람이 낀 경기를 찾는다 — 배틀로그 안의 닉으로 ───────────────── */

const PAYLOAD_CHUNK = 100
const SCAN_LIMIT = 6000

const index = await prisma.barracksBattleLogRaw.findMany({
  where: { subjectKind: 'clan', status: 'ok' },
  select: { id: true, matchKey: true },
  orderBy: { fetchedAt: 'desc' },
  take: SCAN_LIMIT,
})

interface RoundLine {
  round: number
  /** 그 라운드에서 그 사람의 진영 */
  side: '레드' | '블루'
  /** 라운드 시작 후 몇 초에 첫 죽음이 났나 */
  elapsed: number | null
  killerNick: string
  victimNick: string
  /** 그 사람이 선짤을 냈나 / 당했나 / 아무것도 아닌가 */
  role: '선짤' | '선짤당함' | '-'
  /** 이 라운드에서 그 사람이 받은 점수 */
  points: number
  /** 왜 그 점수인가 */
  why: string
}

interface MatchReport {
  matchKey: string
  myTeam: string
  rounds: RoundLine[]
  points: number
  tally: Record<string, number>
  /** 그 경기 선짤 점수 1등 (MVP 근거) */
  best: { nick: string; points: number } | null
}

const reports: MatchReport[] = []
const seen = new Set<string>()

for (let i = 0; i < index.length && reports.length < WANT; i += PAYLOAD_CHUNK) {
  const part = await prisma.barracksBattleLogRaw.findMany({
    where: { id: { in: index.slice(i, i + PAYLOAD_CHUNK).map((r) => r.id) } },
    select: { matchKey: true, payload: true },
  })

  for (const row of part) {
    if (reports.length >= WANT) break
    if (seen.has(row.matchKey)) continue
    const raw = rawOf(row.payload)
    const events = raw.battleLog ?? []
    if (events.length === 0) continue

    /* 닉 → usn (양쪽 칸 모두 훑는다) */
    const nickOf = new Map<string, string>()
    for (const e of events) {
      const a = String(e.str_usn ?? '').trim()
      const an = String(e.user_nick ?? '').trim()
      if (a !== '' && an !== '') nickOf.set(a, an)
      const b = String(e.target_str_usn ?? '').trim()
      const bn = String(e.target_user_nick ?? '').trim()
      if (b !== '' && bn !== '') nickOf.set(b, bn)
    }
    const me = [...nickOf.entries()].find(([, nick]) => nick === NICK)?.[0]
    if (me === undefined) continue

    const roster = rosterOf(events as RoundSideEvent[])
    if (roster.teams.length !== 2) continue
    const myTeam = roster.teamOf.get(me)
    if (myTeam === undefined) continue

    const rounds = new Set<number>()
    for (const e of events) {
      const n = Number(String(e.round ?? '').trim())
      if (Number.isInteger(n) && n >= 1) rounds.add(n)
    }
    if (rounds.size === 0) continue

    const teamNo = clanByTeamNo(raw.teamList ?? []).entries().next().value?.[0]
    const base = typeof teamNo === 'string' ? teamNo : roster.teams[0]!
    const results = roundResultsOf(events as RoundSideEvent[])
    const sides = roundSidesOf(events as RoundSideEvent[], base, Math.max(...rounds), (r) => {
      const v = results.get(r)
      return v === undefined ? null : v
    })
    if (sides.side.size === 0) continue

    const sideOf = (round: number, team: string): 'attack' | 'defense' | null => {
      const side = sides.side.get(round)
      if (side === undefined) return null
      if (team === base) return side
      return side === 'attack' ? 'defense' : 'attack'
    }

    const tallies = openingTalliesOf({ events, sideOf })
    const mine = tallies.get(me)
    /* 그 사람이 선짤에 한 번도 안 얽힌 경기는 보여 줄 게 없다 */
    if (mine === undefined || openingPointsOf(mine) === 0) continue

    seen.add(row.matchKey)

    /* ── 라운드마다 무슨 일이 있었나 ───────────────────────── */
    const starts = roundStartsOf(events)
    const bloods = firstBloodsOf(events)
    const states = roundStatesOf(events as RoundSideEvent[])
    const weaponOf = weaponByPlayerOf(killsOf(events as readonly DuelEvent[]))
    const nick = (usn: string): string => nickOf.get(usn) ?? usn.slice(0, 6)
    const isSniper = (usn: string): boolean | null => {
      const w = weaponOf.get(usn)
      return w === undefined ? null : w === 1
    }
    const deathAt = (round: number, usn: string): number | null => {
      for (const d of states.get(round)?.deaths ?? []) if (d.usn === usn) return d.at
      return null
    }

    const lines: RoundLine[] = []
    for (const [round, blood] of [...bloods].sort((a, b) => a[0] - b[0])) {
      if (blood === null) continue
      const mySide = sideOf(round, myTeam)
      if (mySide === null) continue
      const involved = blood.killer === me || blood.victim === me
      if (!involved) continue

      const start = starts.get(round)
      const elapsed = start === undefined ? null : Math.round((blood.at - start) * 10) / 10
      const early = elapsed !== null && elapsed <= OPENING_PENALTY_WINDOW_SECONDS
      const killerDeath = deathAt(round, blood.killer)
      const survived = killerDeath === null || killerDeath - blood.at >= OPENING_SURVIVE_SECONDS
      const revenged = killerDeath !== null && killerDeath - blood.at <= OPENING_REVENGE_SECONDS

      let points = 0
      let why = ''
      const victimSide = sideOf(round, blood.victimTeam)

      if (blood.victim === me) {
        if (victimSide === 'attack') {
          if (!early) why = `${elapsed}초 — 22초를 넘어 안 깎음`
          else if (revenged) why = `${elapsed}초에 선짤당했지만 팀이 ${OPENING_REVENGE_SECONDS}초 안에 되잡아 면제`
          else {
            points = -1
            why = `${elapsed}초에 선짤당함 (되잡기 없음)`
          }
        } else {
          const sniper = isSniper(me)
          if (sniper === null) why = '무기를 몰라 안 깎음'
          else if (sniper) {
            points = -2
            why = '블루에서 ★스나★ 가 첫 사망'
          } else {
            points = -1
            why = '블루에서 라플이 첫 사망'
          }
        }
      } else {
        /* 내가 선짤을 냈다 */
        if (victimSide === 'defense') {
          if (!early) why = `${elapsed}초 — 22초를 넘어 상 없음`
          else if (!survived) why = '선짤했지만 3초 안에 같이 죽음 (맞트레이드)'
          else {
            points = 1
            why = `${elapsed}초에 선짤 + ${OPENING_SURVIVE_SECONDS}초 이상 생존`
          }
        } else {
          const sniper = isSniper(blood.victim)
          if (!early) why = `${elapsed}초 — 22초를 넘어 상 없음`
          else if (sniper !== true) why = '라플을 잡아서 상 없음 (블루는 스나만)'
          else if (!survived) why = '스나를 잡았지만 맞트레이드'
          else {
            points = 1
            why = `${elapsed}초에 상대 ★스나★ 를 선짤`
          }
        }
      }

      lines.push({
        round,
        side: mySide === 'attack' ? '레드' : '블루',
        elapsed,
        killerNick: nick(blood.killer),
        victimNick: nick(blood.victim),
        role: blood.killer === me ? '선짤' : '선짤당함',
        points,
        why,
      })
    }

    /* 그 경기에서 선짤 점수가 가장 높은 사람 — MVP 근거 */
    let best: { nick: string; points: number } | null = null
    for (const [usn, t] of tallies) {
      const p = openingPointsOf(t)
      if (best === null || p > best.points) best = { nick: nick(usn), points: p }
    }

    reports.push({
      matchKey: row.matchKey,
      myTeam,
      rounds: lines,
      points: openingPointsOf(mine),
      tally: { ...mine },
      best,
    })
  }
}

console.info(JSON.stringify({ nick: NICK, matches: reports }, null, 2))
await prisma.$disconnect()
