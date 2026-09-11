/**
 * ★★IPL 랭킹을 새 공식으로 다시 쓴다★★ (2026-09-10 · 사장님 확정)
 *
 * ── ★왜 별도 잡인가★
 *   점수를 한 번 써넣어도 ★30분마다 도는 `season0Apply` 가 옛 공식으로 덮어쓴다.★
 *   그래서 ★`season0Apply` 바로 뒤에 이 잡을 붙인다★ — IPL 만 새 공식으로 덮는다.
 *   `season0Apply` 는 ★한 글자도 안 고쳤다★ (`CLAUDE.md` 1-4).
 *   되돌리려면 `scripts/season0-apply.sh` 에서 이 잡을 부르는 줄만 지우면 된다.
 *
 * ── ★공식★ (`apps/worker/src/lib/iplTiers.ts` 가 값의 단일 출처다)
 *   ```
 *   클랜  점수 = 티어기준점 + (Elo − 3000) × √(경기수 ÷ 50)
 *              ASTRA 3200 · CHALLENGER1 3000 · CHALLENGER2 2800   (간격 200)
 *
 *   개인  점수 = 3000 + Σ(티어 t) 가중치[t] × (13.6 × 판수^0.67 + 6.4 × (승 − 0.5×판수))
 *                     − 18.6 × √(총 판수)
 *              가중치  ASTRA 1.000 · CHALLENGER1 0.367 · CHALLENGER2 0.347
 *   ```
 *   ★3000 을 더하는 것은 자릿수만 맞추는 일이다★ (사장님 «3000시작»).
 *   순서는 하나도 안 바뀐다.
 *
 * ── ★모집단★
 *   시즌0 창 · IPL(`nolink`) · `supersededAt` 없음 · 승패가 정해진 경기.
 *   ★티어가 없는 클랜이 낀 경기는 계산에서 뺀다★ — 뺀 클랜(`REMOVED`)이 여기 해당한다.
 *
 * ── ★안 건드리는 것★
 *   · 승·패·킬·데스 등 누적 칸 — `season0Apply` 가 쓴 값을 그대로 둔다
 *   · `LeaguePlayer.clanId` (지금 소속) — 명부 잡이 관리한다
 *   · 무기별 증감 — 이 공식은 무기를 나누지 않는다
 *   ★점수(`rating`)와 티어(`division`) 두 칸만 쓴다.★
 *
 * ```
 * pnpm --filter @sacloud/worker nexon ipl-rank-apply            # 미리보기
 * pnpm --filter @sacloud/worker nexon ipl-rank-apply --confirm  # 반영
 * ```
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { prisma } from '@sacloud/db'
import { REPO_ROOT } from '../lib/env.js'
import { log, warn } from '../lib/log.js'
import {
  ELO_DIV,
  ELO_FLOOR,
  ELO_INIT,
  ELO_K,
  PLAYER_BASE,
  REMOVED,
  TIER_NAME,
  TIER_OF,
  clanScore,
  playerRawScore,
  type TierNo,
} from '../lib/iplTiers.js'

/** 시즌0 시작 (KST 2026-09-03 07:00) */
const SEASON0_FROM = new Date('2026-09-02T22:00:00.000Z')
const LEAGUE = 'nolink'

export interface IplRankApplyResult {
  matches: number
  /** 티어를 아는 클랜 */
  clans: number
  /** 티어를 몰라 건너뛴 클랜 */
  unknownClans: string[]
  players: number
  clanWrites: number
  playerWrites: number
  /** 티어별 성적 줄 (보여 주기 전용) */
  tierStatWrites: number
  /** ★통합 = 기본 + 스나 + 라플★ 이 어긋난 선수 수. 0 이어야 한다 */
  invariantBroken: number
  confirmed: boolean
  backupFile: string | null
  topClans: Array<{ tier: string; name: string; score: number; games: number; rate: number | null }>
  topPlayers: Array<{ rank: number; nick: string; score: number; games: number; rate: number }>
}

interface MatchRow {
  win: string
  red: string
  blue: string
  redLeagueClanId: string
  blueLeagueClanId: string
}

export async function runIplRankApply(input: { confirm: boolean }): Promise<IplRankApplyResult> {
  const league = await prisma.league.findUnique({ where: { slug: LEAGUE }, select: { id: true } })
  if (!league) throw new Error(`리그 ${LEAGUE} 이 없다`)

  const rows = await prisma.$queryRaw<MatchRow[]>`
    SELECT m."winnerSide" AS win,
           rc."name" AS red, bc."name" AS blue,
           m."redLeagueClanId"  AS "redLeagueClanId",
           m."blueLeagueClanId" AS "blueLeagueClanId"
      FROM "Match" m
      JOIN "LeagueClan" rl ON rl."id" = m."redLeagueClanId"
      JOIN "Clan" rc ON rc."id" = rl."clanId"
      JOIN "LeagueClan" bl ON bl."id" = m."blueLeagueClanId"
      JOIN "Clan" bc ON bc."id" = bl."clanId"
     WHERE m."leagueId" = ${league.id}
       AND m."supersededAt" IS NULL
       AND m."winnerSide" IN ('red','blue')
       AND m."startAt" >= ${SEASON0_FROM}
     ORDER BY m."startAt" ASC, m."id" ASC`

  /* ★티어를 모르는 클랜이 낀 경기는 계산에서 뺀다★ — 뺀 클랜이 여기 걸린다 */
  const used = rows.filter((m) => TIER_OF.has(m.red) && TIER_OF.has(m.blue))

  /* ── 클랜 Elo ─────────────────────────────────────────── */
  const elo = new Map<string, number>()
  const games = new Map<string, number>()
  const wins = new Map<string, number>()
  /* ★도전 가산★ 이 쓰는 칸 — 자기보다 윗 구간과 붙은 판수 (2026-09-12 사장님) */
  const upGames = new Map<string, number>()
  const leagueClanIdOf = new Map<string, string>()
  const E = (c: string): number => elo.get(c) ?? ELO_INIT

  for (const m of used) {
    leagueClanIdOf.set(m.red, m.redLeagueClanId)
    leagueClanIdOf.set(m.blue, m.blueLeagueClanId)
    const ra = E(m.red)
    const rb = E(m.blue)
    const ea = 1 / (1 + 10 ** ((rb - ra) / ELO_DIV))
    const redWon = m.win === 'red' ? 1 : 0
    for (const [c, won] of [
      [m.red, redWon],
      [m.blue, 1 - redWon],
    ] as const) {
      games.set(c, (games.get(c) ?? 0) + 1)
      wins.set(c, (wins.get(c) ?? 0) + won)
    }
    /* 티어 숫자는 작을수록 윗 구간이다 (1 ASTRA) */
    const tRed = TIER_OF.get(m.red)
    const tBlue = TIER_OF.get(m.blue)
    if (tRed !== undefined && tBlue !== undefined) {
      if (tBlue < tRed) upGames.set(m.red, (upGames.get(m.red) ?? 0) + 1)
      if (tRed < tBlue) upGames.set(m.blue, (upGames.get(m.blue) ?? 0) + 1)
    }
    elo.set(m.red, Math.max(ELO_FLOOR, ra + ELO_K * (redWon - ea)))
    elo.set(m.blue, Math.max(ELO_FLOOR, rb + ELO_K * (1 - redWon - (1 - ea))))
  }

  /* ── 개인 점수 ─────────────────────────────────────────── */
  const stats = await prisma.$queryRaw<
    Array<{
      playerId: string
      side: string
      win: string
      red: string
      blue: string
      weapon: number | null
      kill: number | null
      death: number | null
    }>
  >`
    SELECT s."playerId" AS "playerId", s."side" AS side, m."winnerSide" AS win,
           rc."name" AS red, bc."name" AS blue,
           s."weapon" AS weapon, s."kill" AS kill, s."death" AS death
      FROM "MatchPlayerStat" s
      JOIN "Match" m ON m."id" = s."matchId"
      JOIN "LeagueClan" rl ON rl."id" = m."redLeagueClanId"
      JOIN "Clan" rc ON rc."id" = rl."clanId"
      JOIN "LeagueClan" bl ON bl."id" = m."blueLeagueClanId"
      JOIN "Clan" bc ON bc."id" = bl."clanId"
     WHERE m."leagueId" = ${league.id}
       AND m."supersededAt" IS NULL
       AND m."winnerSide" IN ('red','blue')
       AND m."startAt" >= ${SEASON0_FROM}`

  interface Cell {
    games: number
    win: number
  }
  /** ★보여 주기용 티어별 성적★ — 순위 계산에는 안 쓴다 (사장님 «미리준비해두면 좋다») */
  interface TierStat {
    games: number
    win: number
    knownGames: number
    kill: number
    death: number
    rifleGames: number
    rifleKill: number
    rifleDeath: number
    sniperGames: number
    sniperKill: number
    sniperDeath: number
  }
  const emptyStat = (): TierStat => ({
    games: 0,
    win: 0,
    knownGames: 0,
    kill: 0,
    death: 0,
    rifleGames: 0,
    rifleKill: 0,
    rifleDeath: 0,
    sniperGames: 0,
    sniperKill: 0,
    sniperDeath: 0,
  })
  const byPlayer = new Map<string, Partial<Record<TierNo, Cell>>>()
  const totalOf = new Map<string, Cell>()
  const tierStatOf = new Map<string, Partial<Record<TierNo, TierStat>>>()

  for (const r of stats) {
    const opponent = r.side === 'red' ? r.blue : r.red
    const tier = TIER_OF.get(opponent)
    /* 상대 티어를 모르면 점수에 안 넣는다 — 뺀 클랜과의 경기가 여기서 빠진다 */
    if (!tier) continue
    const won = r.win === r.side ? 1 : 0
    const cells = byPlayer.get(r.playerId) ?? {}
    const cell = cells[tier] ?? { games: 0, win: 0 }
    cell.games += 1
    cell.win += won
    cells[tier] = cell
    byPlayer.set(r.playerId, cells)
    const t = totalOf.get(r.playerId) ?? { games: 0, win: 0 }
    t.games += 1
    t.win += won
    totalOf.set(r.playerId, t)

    /* ── 보여 주기용 누적 ── */
    const stats = tierStatOf.get(r.playerId) ?? {}
    const st = stats[tier] ?? emptyStat()
    st.games += 1
    st.win += won
    /* ★K/D 를 모르는 경기는 분모에서 뺀다★ (D-149) */
    if (r.kill !== null && r.death !== null) {
      st.knownGames += 1
      st.kill += r.kill
      st.death += r.death
      if (r.weapon === 0) {
        st.rifleGames += 1
        st.rifleKill += r.kill
        st.rifleDeath += r.death
      } else if (r.weapon === 1) {
        st.sniperGames += 1
        st.sniperKill += r.kill
        st.sniperDeath += r.death
      }
    }
    stats[tier] = st
    tierStatOf.set(r.playerId, stats)
  }

  /* ── 쓸 값 ────────────────────────────────────────────── */
  const clanPlan: Array<{ leagueClanId: string; name: string; tier: TierNo; rating: number }> = []
  const unknownClans: string[] = []
  for (const [name, tier] of TIER_OF) {
    const lcId = leagueClanIdOf.get(name)
    const n = games.get(name) ?? 0
    if (!lcId) {
      /* 시즌0 경기가 없는 클랜 — 기준점만 준다. 그 리그클랜 id 는 따로 찾는다 */
      continue
    }
    clanPlan.push({
      leagueClanId: lcId,
      name,
      tier,
      rating: Math.round(clanScore(tier, E(name), n, upGames.get(name) ?? 0)),
    })
  }
  /* 경기가 없어 위에서 못 찾은 클랜도 티어·기준점은 넣어 준다 */
  const missing = [...TIER_OF.keys()].filter((n) => !leagueClanIdOf.has(n))
  if (missing.length > 0) {
    const found = await prisma.$queryRaw<Array<{ id: string; name: string }>>`
      SELECT lc."id", c."name"
        FROM "LeagueClan" lc JOIN "Clan" c ON c."id" = lc."clanId"
       WHERE lc."leagueId" = ${league.id} AND c."name" = ANY(${missing})`
    for (const f of found) {
      const tier = TIER_OF.get(f.name)
      if (!tier) continue
      clanPlan.push({ leagueClanId: f.id, name: f.name, tier, rating: Math.round(clanScore(tier, ELO_INIT, 0)) })
    }
    for (const n of missing) if (!found.some((f) => f.name === n)) unknownClans.push(n)
  }

  const playerPlan: Array<{ playerId: string; rating: number }> = []
  for (const [playerId, cells] of byPlayer) {
    playerPlan.push({ playerId, rating: Math.round(PLAYER_BASE + playerRawScore(cells)) })
  }

  const result: IplRankApplyResult = {
    matches: used.length,
    clans: clanPlan.length,
    unknownClans,
    players: playerPlan.length,
    clanWrites: 0,
    playerWrites: 0,
    tierStatWrites: 0,
    invariantBroken: 0,
    confirmed: input.confirm,
    backupFile: null,
    topClans: clanPlan
      .slice()
      .sort((a, b) => a.tier - b.tier || b.rating - a.rating)
      .slice(0, 15)
      .map((c) => {
        const n = games.get(c.name) ?? 0
        const w = wins.get(c.name) ?? 0
        return {
          tier: TIER_NAME[c.tier],
          name: c.name,
          score: c.rating,
          games: n,
          rate: n ? Math.round((100 * w) / n) : null,
        }
      }),
    topPlayers: [],
  }

  /* 미리보기용 상위 선수 — 닉네임은 여기서만 읽는다 */
  const top = playerPlan
    .slice()
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 15)
  if (top.length > 0) {
    const names = await prisma.player.findMany({
      where: { id: { in: top.map((t) => t.playerId) } },
      select: { id: true, name: true },
    })
    const nameOf = new Map(names.map((n) => [n.id, n.name]))
    result.topPlayers = top.map((t, i) => {
      const tot = totalOf.get(t.playerId) ?? { games: 0, win: 0 }
      return {
        rank: i + 1,
        nick: nameOf.get(t.playerId) ?? t.playerId,
        score: t.rating,
        games: tot.games,
        rate: tot.games ? Math.round((100 * tot.win) / tot.games) : 0,
      }
    })
  }

  if (input.confirm) {
    /* ★쓰기 전에 지금 값을 통째로 남긴다★ — 되돌릴 수 있어야 한다 */
    const before = {
      clans: await prisma.leagueClan.findMany({
        where: { leagueId: league.id },
        select: { id: true, rating: true, division: true },
      }),
      players: await prisma.leaguePlayer.findMany({
        where: { leagueId: league.id },
        select: { id: true, playerId: true, rating: true },
      }),
    }
    const dir = path.join(REPO_ROOT, 'backup')
    mkdirSync(dir, { recursive: true })
    const file = path.join(dir, `ipl-rank-${Date.now()}.json`)
    writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), before }, null, 0), 'utf8')
    result.backupFile = file
    log(`되돌리기 파일 — ${file}`)

    for (const c of clanPlan) {
      await prisma.leagueClan.update({
        where: { id: c.leagueClanId },
        data: { rating: c.rating, division: c.tier },
      })
      result.clanWrites += 1
    }
    /*
     * ★불변식을 지킨다 — 통합 = 기본 + 스나 + 라플★ (`CLAUDE.md` 6장 2번).
     *
     * ⚠ ★2026-09-10 실측 — 이걸 안 지켜서 화면 두 곳의 숫자가 갈라졌다.★
     *   랭킹표는 `rating`(3,127)을 그대로 쓰는데, 선수 기본정보 화면은
     *   ★기본 + 무기증감★ 으로 다시 더해서 3,831 을 보여 줬다. 같은 사람 같은 시각인데
     *   ★두 숫자가 704점 달랐다.★ (사장님이 화면으로 찾아 주셨다)
     *
     * 새 공식은 무기를 나누지 않는다. 그렇다고 무기별 증감을 지우면
     * ★무기 랭킹이 통째로 사라진다★ — 그건 다른 기능이다.
     * 그래서 ★기본값이 나머지를 받는다★ — `기본 = 통합 − 무기증감합`.
     * 무기별 증감은 한 줄도 안 건드리고, 두 화면의 숫자가 같아진다.
     */
    const deltaRows = await prisma.$queryRaw<Array<{ playerId: string; d: number }>>`
      SELECT lp."playerId" AS "playerId",
             COALESCE(SUM(ws."ratingDelta"), 0)::int AS d
        FROM "LeaguePlayer" lp
        LEFT JOIN "LeaguePlayerWeaponStat" ws ON ws."leaguePlayerId" = lp."id"
       WHERE lp."leagueId" = ${league.id}
       GROUP BY lp."playerId"`
    const deltaOf = new Map(deltaRows.map((r) => [r.playerId, r.d]))

    /* 같은 (점수 · 기본값) 짝끼리 묶어서 한 번에 쓴다 — 한 줄씩 쓰면 왕복이 수천 번이다 */
    const byPair = new Map<string, string[]>()
    for (const p of playerPlan) {
      const base = p.rating - (deltaOf.get(p.playerId) ?? 0)
      const key = `${p.rating}|${base}`
      const got = byPair.get(key)
      if (got) got.push(p.playerId)
      else byPair.set(key, [p.playerId])
    }
    for (const [key, ids] of byPair) {
      const [ratingText, baseText] = key.split('|')
      const rating = Number(ratingText)
      const baseRating = Number(baseText)
      for (let i = 0; i < ids.length; i += 500) {
        const r = await prisma.leaguePlayer.updateMany({
          where: { leagueId: league.id, playerId: { in: ids.slice(i, i + 500) } },
          data: { rating, baseRating },
        })
        result.playerWrites += r.count
      }
    }

    /* ★쓰고 나서 확인한다★ — 「했다」가 아니라 숫자를 낸다 (`CLAUDE.md` 2장 1번) */
    const broken = await prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT COUNT(*) AS n FROM (
        SELECT lp."rating", lp."baseRating",
               COALESCE(SUM(ws."ratingDelta"), 0) AS d
          FROM "LeaguePlayer" lp
          LEFT JOIN "LeaguePlayerWeaponStat" ws ON ws."leaguePlayerId" = lp."id"
         WHERE lp."leagueId" = ${league.id}
         GROUP BY lp."id", lp."rating", lp."baseRating") t
       WHERE t."rating" <> t."baseRating" + t.d`
    result.invariantBroken = Number(broken[0]?.n ?? 0)

    /*
     * ── ★티어별 성적★ (2026-09-10 · 사장님 «미리준비해두면 좋다»)
     *
     * 순위에는 안 쓴다. ★보여 주기 전용★ 이다.
     * 매번 통째로 다시 쓴다 — 위에서 경기를 다시 셌으니 이 표도 그 값으로 맞춘다.
     * ★지우고 넣지 않는다★ — `upsert` 라 중간에 죽어도 남은 값이 헛것이 되지 않는다.
     */
    const idOf = new Map(
      (
        await prisma.leaguePlayer.findMany({
          where: { leagueId: league.id },
          select: { id: true, playerId: true },
        })
      ).map((r) => [r.playerId, r.id]),
    )
    for (const [playerId, tiers] of tierStatOf) {
      const leaguePlayerId = idOf.get(playerId)
      /* 명부에 줄이 없으면 붙일 곳이 없다. ★만들지 않는다★ — 0판짜리가 랭킹에 끼어든다 */
      if (!leaguePlayerId) continue
      for (const key of [1, 2, 3] as const) {
        const v = tiers[key]
        if (!v) continue
        const data = {
          games: v.games,
          win: v.win,
          lose: v.games - v.win,
          knownGames: v.knownGames,
          kill: v.kill,
          death: v.death,
          rifleGames: v.rifleGames,
          rifleKill: v.rifleKill,
          rifleDeath: v.rifleDeath,
          sniperGames: v.sniperGames,
          sniperKill: v.sniperKill,
          sniperDeath: v.sniperDeath,
        }
        await prisma.leaguePlayerTierStat.upsert({
          where: { leaguePlayerId_tier: { leaguePlayerId, tier: key } },
          create: { leaguePlayerId, tier: key, ...data },
          update: data,
        })
        result.tierStatWrites += 1
      }
    }
  }

  if (unknownClans.length > 0) warn(`리그에서 못 찾은 클랜: ${unknownClans.join(', ')}`)
  log(
    `경기 ${result.matches.toLocaleString()}건 · 클랜 ${result.clans} · 선수 ${result.players.toLocaleString()} · ` +
      `쓴 클랜 ${result.clanWrites} · 쓴 선수 ${result.playerWrites.toLocaleString()} · ` +
      `티어별 ${result.tierStatWrites.toLocaleString()}줄 · ` +
      `불변식 어긋남 ${result.invariantBroken}${result.invariantBroken === 0 ? ' ✓' : ' ★✗★'}` +
      `${result.confirmed ? '' : ' (미리보기)'} · 뺀 클랜 ${REMOVED.join(',') || '없음'}`,
  )
  return result
}
