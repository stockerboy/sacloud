/**
 * ★점수 래더★ — 사장님이 정한 점수제로 선수 순위를 낸다 (2026-09-18).
 *
 * > «레더 통째로 바꿔서 1등부터30등까지만 보여줘»
 * > «내가 정해주는 클랜의 클랜원들은 개인래더에 저 점수를 집어 넣을때 0.5점 씩 더 줘(상위권보정)»
 *
 * ⚠ ★DB 에 한 줄도 안 쓴다.★ 값을 먼저 보고 가중치를 정하기로 했으므로 화면용 숫자만 낸다.
 *
 * ── 점수표 (사장님 확정)
 * ```
 *   라플을 잡음                     1점
 *   ★라플이 스나를 잡음★  1·2번째 5점 · 3번째부터 3점
 *   스나가 스나를 잡음     1·2번째 3점 · 3번째부터 2점
 *   폭탄 심고 이김                  2점
 *   폭탄 심고 짐          B쪽 2점 · A쪽 1점
 *   세이브                1명 1점 · 2명 3점 · 3명 5점 (2n−1)
 * ```
 *
 * ⚠ ★클랜 단위 응답을 쓴다★ — 열 명이 한 응답에 다 들어 있고 `team_no` 가 붙어 온다.
 *   선수 단위 응답은 그 선수가 얽힌 줄만 와서 라운드를 복원할 수 없다 (D-184).
 *
 * 쓰는 법:
 *   pnpm --filter @sacloud/worker exec tsx src/scoreLadder.ts <리그slug> <며칠> <최소경기>
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { REPO_ROOT } from './lib/env.js'
import { prisma } from '@sacloud/db'

const SLUG = process.argv[2] ?? 'nolink'
const DAYS = Number(process.argv[3] ?? 120)
const MIN_GAMES = Number(process.argv[4] ?? 20)
const BATCH = 400

/* ------------------------------------------------------------- 구역 --- */

/* ⚠ ★`process.cwd()` 를 쓰면 안 된다★ — pnpm 이 `apps/worker` 에서 돌린다 */
const ROOT = join(REPO_ROOT, 'data/barracks')
const style = JSON.parse(readFileSync(join(ROOT, 'style-zones.json'), 'utf-8')) as {
  cell: number
  zone: Record<string, string | string[]>
}
const floor = JSON.parse(readFileSync(join(ROOT, 'floor-zones.json'), 'utf-8')) as {
  zone: Record<string, string | string[]>
}
const CELL = style.cell

const A_ZONE = ['NIEUN', 'JUNGGIL', 'SEOLDAEAP', 'THREEKKANG', 'MERI', 'NOKDWI', 'SEOLDAE']
const B_ZONE = ['BIRONG', 'BUNKER', 'BADAK', 'ILMUN']
const SHORT_ZONE = ['SHORT', 'HOLJEONG']

/** 그 자리가 ★B쪽★ 인가 — 폭탄 점수만 이걸 본다 */
function onBSide(x: number | null, y: number | null): boolean {
  if (x === null || y === null) return false
  const k = `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`
  for (const src of [style.zone, floor.zone]) {
    const v = src[k]
    if (v === undefined) continue
    for (const z of Array.isArray(v) ? v : [v]) if (B_ZONE.includes(z)) return true
  }
  return false
}
/* A·숏 묶음은 지금 셈에 안 쓰지만 이름을 남겨 둔다 — 자리별로 쪼갤 때 쓴다 */
void A_ZONE
void SHORT_ZONE

/* ------------------------------------------------------------- 점수 --- */

const SCORE_RIFLE = 1
const SCORE_RIFLE_KILLS_SNIPER_EARLY = 5
const SCORE_RIFLE_KILLS_SNIPER_LATE = 3
const SCORE_SNIPER_KILLS_SNIPER_EARLY = 3
const SCORE_SNIPER_KILLS_SNIPER_LATE = 2
const EARLY_RANK = 2
const SCORE_BOMB_WIN = 2
const SCORE_BOMB_LOSS_B = 2
const SCORE_BOMB_LOSS_A = 1
/** 스나로 보는 문턱 — 잡은 것의 절반 이상이 스나 무기 */
const SNIPER_SHARE = 0.5
const SNIPER_MIN_KILLS = 2

interface Row {
  round?: string | number | null
  event_type?: string | null
  weapon?: string | null
  target_weapon?: string | null
  str_usn?: string | null
  target_str_usn?: string | null
  team_no?: string | number | null
  target_team_no?: string | number | null
  win_flag?: string | null
  user_nick?: string | null
  target_user_nick?: string | null
  kill_x?: number | null
  kill_y?: number | null
  event_time?: string | null
}

interface Tally {
  usn: string
  nick: string
  games: number
  points: number
  kills: number
  deaths: number
  saves: number
  bombs: number
  sniperKills: number
  /** 라플로 스나를 잡은 횟수 — 값이 제일 큰 항목이라 따로 본다 */
  rifleOnSniper: number
  sniperGames: number
}

const tally = new Map<string, Tally>()
function of(usn: string, nick: string): Tally {
  let t = tally.get(usn)
  if (!t) {
    t = {
      usn, nick, games: 0, points: 0, kills: 0, deaths: 0,
      saves: 0, bombs: 0, sniperKills: 0, rifleOnSniper: 0, sniperGames: 0,
    }
    tally.set(usn, t)
  }
  if (nick) t.nick = nick
  return t
}

/* --------------------------------------------------------- 경기 하나 --- */

function runMatch(rows: Row[]): void {
  /* ── ① 무기. ★그 경기에서 실제로 든 총★ 으로 본다 (자리표를 안 쓴다) */
  const wt = new Map<string, { s: number; n: number }>()
  for (const r of rows) {
    if (r.event_type !== 'kill' && r.event_type !== 'death') continue
    const killer = r.event_type === 'death' ? r.target_str_usn : r.str_usn
    if (!killer) continue
    const e = wt.get(killer) ?? { s: 0, n: 0 }
    e.n += 1
    if (r.weapon === 'sniper') e.s += 1
    wt.set(killer, e)
  }
  const snipers = new Set<string>()
  for (const [u, e] of wt) {
    if (e.n >= SNIPER_MIN_KILLS && e.s / e.n >= SNIPER_SHARE) snipers.add(u)
  }

  /* ── ② 줄을 라운드별로 세운다. ★같은 죽음이 두 줄로 올 수 있어 접는다★ */
  const byRound = new Map<number, Map<string, {
    killer: string; victim: string; killerTeam: string; victimTeam: string
  }>>()
  const bombs = new Map<number, { who: string; team: string; x: number | null; y: number | null }[]>()
  const teamOf = new Map<string, string>()
  const nickOf = new Map<string, string>()
  /** 라운드 → 이긴 팀 */
  const wonBy = new Map<number, string>()

  for (const r of rows) {
    const round = Number(r.round)
    if (!Number.isFinite(round)) continue

    /* 폭탄. ★설치 자리는 `kill_x/kill_y`★ 다 */
    if (r.weapon === 'c4-install' || r.target_weapon === 'c4-install') {
      const who = r.weapon === 'c4-install' ? r.str_usn : r.target_str_usn
      const team = r.weapon === 'c4-install' ? r.team_no : r.target_team_no
      if (who && team != null) {
        const list = bombs.get(round) ?? []
        list.push({ who, team: String(team), x: r.kill_x ?? null, y: r.kill_y ?? null })
        bombs.set(round, list)
      }
      continue
    }
    if (r.event_type !== 'kill' && r.event_type !== 'death') continue

    /* ⚠ ★`team_no` 는 줄 주인의 팀★ 이다 — death 줄은 주인이 victim (D-184) */
    const owner = String(r.str_usn ?? '')
    const other = String(r.target_str_usn ?? '')
    if (!owner || !other) continue
    const ownerTeam = r.team_no == null ? '' : String(r.team_no)
    const otherTeam = r.target_team_no == null ? '' : String(r.target_team_no)
    const isDeath = r.event_type === 'death'
    const killer = isDeath ? other : owner
    const victim = isDeath ? owner : other
    const killerTeam = isDeath ? otherTeam : ownerTeam
    const victimTeam = isDeath ? ownerTeam : otherTeam
    if (ownerTeam) teamOf.set(owner, ownerTeam)
    if (otherTeam) teamOf.set(other, otherTeam)
    if (r.user_nick) nickOf.set(owner, r.user_nick)
    if (r.target_user_nick) nickOf.set(other, r.target_user_nick)

    /* 라운드 승자 — `win_flag` 는 ★줄 주인★ 기준이다 */
    if (r.win_flag === 'win' && ownerTeam) wonBy.set(round, ownerTeam)
    else if (r.win_flag === 'lose' && otherTeam) wonBy.set(round, otherTeam)

    const m = byRound.get(round) ?? new Map()
    /* 같은 죽음은 ★라운드 + 죽은 사람 + 시각★ 이 같다 */
    m.set(`${victim}|${r.event_time ?? ''}`, { killer, victim, killerTeam, victimTeam })
    byRound.set(round, m)
  }

  if (byRound.size === 0) return

  /* 이 경기에 나온 사람 — 경기 수를 센다 */
  const seen = new Set<string>()

  /* ── ③ 라운드마다 점수 */
  for (const [round, kills] of [...byRound.entries()].sort((a, b) => a[0] - b[0])) {
    const list = [...kills.values()]
    const seq = new Map<string, number>()
    const winner = wonBy.get(round) ?? null

    for (const k of list) {
      seen.add(k.killer)
      seen.add(k.victim)
      const t = of(k.killer, nickOf.get(k.killer) ?? '')
      const v = of(k.victim, nickOf.get(k.victim) ?? '')
      t.kills += 1
      v.deaths += 1

      const rank = (seq.get(k.killerTeam) ?? 0) + 1
      seq.set(k.killerTeam, rank)
      const early = rank <= EARLY_RANK
      const victimIsSniper = snipers.has(k.victim)
      const killerIsSniper = snipers.has(k.killer)

      let pts = SCORE_RIFLE
      if (victimIsSniper) {
        t.sniperKills += 1
        if (killerIsSniper) {
          pts = early ? SCORE_SNIPER_KILLS_SNIPER_EARLY : SCORE_SNIPER_KILLS_SNIPER_LATE
        } else {
          pts = early ? SCORE_RIFLE_KILLS_SNIPER_EARLY : SCORE_RIFLE_KILLS_SNIPER_LATE
          t.rifleOnSniper += 1
        }
      }
      t.points += pts
    }

    /* 폭탄 */
    for (const b of bombs.get(round) ?? []) {
      seen.add(b.who)
      const t = of(b.who, nickOf.get(b.who) ?? '')
      t.bombs += 1
      t.points += winner === b.team
        ? SCORE_BOMB_WIN
        : (onBSide(b.x, b.y) ? SCORE_BOMB_LOSS_B : SCORE_BOMB_LOSS_A)
    }

    /* 세이브 — ★수적 열세를 뒤집은★ 라운드. 그 라운드 마지막 킬의 주인 것이다 */
    if (winner !== null) {
      const alive = new Map<string, number>()
      for (const k of list) {
        alive.set(k.killerTeam, alive.get(k.killerTeam) ?? 5)
        alive.set(k.victimTeam, alive.get(k.victimTeam) ?? 5)
      }
      let minGap = 0
      for (const k of list) {
        alive.set(k.victimTeam, (alive.get(k.victimTeam) ?? 5) - 1)
        let mine = 0
        let foe = 0
        for (const [team, n] of alive) {
          if (team === winner) mine = n
          else foe = n
        }
        if (mine - foe < minGap) minGap = mine - foe
      }
      if (minGap < 0) {
        const last = list.filter((k) => k.killerTeam === winner).pop()
        if (last) {
          const t = of(last.killer, nickOf.get(last.killer) ?? '')
          t.saves += 1
          t.points += 2 * -minGap - 1
        }
      }
    }
  }

  for (const u of seen) {
    const t = of(u, nickOf.get(u) ?? '')
    t.games += 1
    if (snipers.has(u)) t.sniperGames += 1
  }
}

/* ------------------------------------------------------------- 본체 --- */

async function main(): Promise<void> {
  await prisma.$executeRawUnsafe('SET statement_timeout = 120000')

  const keys = await prisma.$queryRawUnsafe<{ matchKey: string }[]>(`
    SELECT DISTINCT m."sourceMatchId" AS "matchKey"
      FROM "Match" m JOIN "League" l ON l."id" = m."leagueId"
     WHERE l."slug" = '${SLUG}'
       AND m."sourceMatchId" IS NOT NULL
       AND m."startAt" > NOW() - INTERVAL '${DAYS} days'`)
  console.log(`${SLUG} 최근 ${DAYS}일 경기 ${keys.length}건`)

  let done = 0
  let withLog = 0
  for (let i = 0; i < keys.length; i += BATCH) {
    const chunk = keys.slice(i, i + BATCH).map((k) => k.matchKey)
    const rows = await prisma.$queryRawUnsafe<{ payload: { battleLog?: Row[] } }[]>(`
      SELECT DISTINCT ON (r."matchKey") r."payload"
        FROM "BarracksBattleLogRaw" r
       WHERE r."matchKey" = ANY($1::text[]) AND r."subject" <> 'player'`, chunk)
    for (const r of rows) {
      const log = r.payload?.battleLog
      if (!Array.isArray(log) || log.length === 0) continue
      withLog += 1
      runMatch(log)
    }
    done += chunk.length
    if (i % (BATCH * 10) === 0) console.log(`  ${done}/${keys.length} · 로그 ${withLog}건 · 사람 ${tally.size}명`)
  }

  console.log(`\n읽은 경기 ★${withLog}★ · 사람 ★${tally.size}★`)

  /* 닉·클랜을 붙인다 — 배틀로그의 `user_nick` 은 위장닉이 섞인다 (D-221) */
  const usns = [...tally.keys()]
  const members = await prisma.$queryRawUnsafe<{ strUsn: string; userNick: string | null; clanSlug: string }[]>(`
    SELECT DISTINCT ON ("strUsn") "strUsn", "userNick", "clanSlug"
      FROM "BarracksClanMember"
     WHERE "strUsn" = ANY($1::text[])
     ORDER BY "strUsn", "observedAt" DESC`, usns)
  const clanOf = new Map(members.map((m) => [m.strUsn, m.clanSlug]))
  const realNick = new Map(members.map((m) => [m.strUsn, m.userNick ?? '']))

  const list = [...tally.values()]
    .filter((t) => t.games >= MIN_GAMES)
    .map((t) => ({
      ...t,
      nick: realNick.get(t.usn) || t.nick,
      clan: clanOf.get(t.usn) ?? '?',
      avg: t.points / t.games,
      kd: t.deaths === 0 ? t.kills : t.kills / t.deaths,
      sniper: t.sniperGames / t.games >= 0.5,
    }))
    .sort((a, b) => b.avg - a.avg)

  console.log(`\n${MIN_GAMES}경기 이상 ★${list.length}명★ · 점수 래더 1~30등\n`)
  console.log('  등수  선수             클랜           경기  경기당   총점   킬/뎃  세이브 라플→스나')
  list.slice(0, 30).forEach((t, i) => {
    console.log(
      '  ' + String(i + 1).padStart(3) +
      '  ' + (t.nick || t.usn.slice(0, 8)).padEnd(16) +
      (t.clan.slice(0, 12)).padEnd(14) +
      String(t.games).padStart(5) +
      t.avg.toFixed(2).padStart(8) +
      String(t.points).padStart(7) +
      t.kd.toFixed(2).padStart(7) +
      String(t.saves).padStart(7) +
      String(t.rifleOnSniper).padStart(9) +
      (t.sniper ? '  [S]' : ''),
    )
  })

  /* 가중치를 정하려면 ★점수 차이가 얼마나 촘촘한지★ 를 알아야 한다 */
  const at = (n: number): string => (list[n - 1] ? list[n - 1].avg.toFixed(2) : '—')
  console.log(`
경기당 점수 분포 — 1위 ${at(1)} · 5위 ${at(5)} · 10위 ${at(10)} · 20위 ${at(20)} · 30위 ${at(30)} · 50위 ${at(50)} · 100위 ${at(100)}`)

  /*
   * ── ★상위권 보정★ 을 얼마로 줄까 (2026-09-18 사장님: «ㄱ보고 몇점 가중치를 줄지 결정하자»)
   *
   * 보정 대상은 ★현 시각 IPL 1~11등★ 이다 — 그게 곧 ★1부 전부★ 다.
   */
  const top = await prisma.$queryRawUnsafe<{ slug: string; name: string; rating: number }[]>(`
    SELECT c."slug", c."name", lc."rating"
      FROM "LeagueClan" lc
      JOIN "League" l ON l."id" = lc."leagueId"
      JOIN "Clan" c ON c."id" = lc."clanId"
     WHERE l."slug" = '${SLUG}'
     ORDER BY lc."rating" DESC NULLS LAST
     LIMIT 11`)
  const topSlugs = new Set(top.map((t) => t.slug))
  console.log(`
★상위권 클랜 11★ — ${top.map((t) => t.name).join(' · ')}`)

  const inTop = list.filter((t) => topSlugs.has(t.clan))
  const ranks = inTop.map((t) => list.indexOf(t) + 1)
  console.log(`  그 클랜 선수 ${inTop.length}명 (${MIN_GAMES}경기 이상)`)
  if (ranks.length > 0) {
    console.log(`  지금 순위 — 제일 높은 ★${Math.min(...ranks)}등★ · 중간값 ${ranks.sort((a, b) => a - b)[Math.floor(ranks.length / 2)]}등 · 30등 안 ${ranks.filter((r) => r <= 30).length}명`)
  }

  /* 보정을 얼마 줬을 때 몇 명이 30등 안에 드나 */
  console.log('
  보정   30등 안 상위권  1등 클랜        최고 등수 변화')
  for (const bonus of [0, 0.5, 1, 1.5, 2, 3]) {
    const bumped = list
      .map((t) => ({ ...t, adj: t.avg + (topSlugs.has(t.clan) ? bonus : 0) }))
      .sort((a, b) => b.adj - a.adj)
    const n30 = bumped.slice(0, 30).filter((t) => topSlugs.has(t.clan)).length
    const best = bumped.findIndex((t) => topSlugs.has(t.clan)) + 1
    console.log(
      '  ' + String(bonus).padStart(4) + '점' +
      String(n30).padStart(12) + '명' +
      '   ' + (bumped[0]?.clan ?? '?').padEnd(14) +
      '  ' + String(best) + '등',
    )
  }

  /* 보정이 ★몇 등짜리★ 인지 — 이웃 등수 차이로 환산 */
  const gaps: string[] = []
  for (const n of [10, 30, 100, 300]) {
    const a = list[n - 1]?.avg
    if (a === undefined) continue
    const moved = list.filter((t) => t.avg >= a + 0.5).length
    gaps.push(`${n}등 → 0.5점 주면 ${moved + 1}등`)
  }
  console.log('
  0.5점이 몇 등짜리인가 — ' + gaps.join(' · '))

  await prisma.$disconnect()
}

await main()
