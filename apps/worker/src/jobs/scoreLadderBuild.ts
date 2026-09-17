/**
 * ★점수 래더 만들기★ — 개인 래더를 사장님 점수제로 다시 센다 (2026-09-18).
 *
 * > «래더점수도 이걸로 계산해»
 * > «내가 정해주는 클랜의 클랜원들은 개인래더에 저 점수를 집어 넣을때
 * >  0.5점 씩 더 줘(상위권보정)»
 * > «ㄷ. 현시각 기준 IPL 1듵부터 11등»
 *
 * ── 무엇을 쓰나
 *   `MatchPlayerHex.score` — 개인 육각 잡이 경기마다 쌓아 둔 점수다.
 *   배틀로그를 다시 읽지 않는다. 점수표는 `matchScore.ts` 하나가 정한다.
 *
 * ── 어떻게 세나
 *   ★경기당 평균★ 이다. 총점으로 세면 많이 뛴 사람이 이긴다.
 *   표본이 얇으면 순위를 안 매긴다 (`MIN_GAMES`).
 *
 * ── ★상위권 보정★
 *   그 리그 래더 ★위 `TOP_CLAN_COUNT` 클랜★ 소속이면 경기당 `TOP_CLAN_BONUS` 점을 더한다.
 *   IPL 은 지금 그 열한 자리가 ★1부 전부★ 다 (2026-09-18 실측).
 *
 *   왜 1.0 인가 — 실측으로 골랐다 (`scoreLadder.ts` 로 잰 값):
 *   ```
 *     보정    30등 안 상위권   최고 등수
 *      0점        5명            7등
 *    0.5점        5명            6등   ← 한 명도 안 늘어난다. 너무 약하다
 *    ★1점★       8명            3등   ← 메우되 뒤집지 않는다
 *    1.5점       11명            1등   ← 보정이 실력을 덮는다
 *   ```
 *
 * ⚠ ★옛 Elo 래더(`rating`)는 한 줄도 안 건드린다★ (`CLAUDE.md` 1-4).
 *   새 칸(`scoreRating` …)에만 쓴다. 되돌릴 때 재계산이 없어야 한다.
 * ⚠ `--confirm` 없이는 한 줄도 안 쓴다.
 */
import { prisma } from '@sacloud/db'
import { log } from '../lib/log.js'

/** 순위를 매길 최소 경기 수 — 얇은 표본이 1등을 하면 래더가 아니다 */
export const SCORE_LADDER_MIN_GAMES = 20
/** 보정을 받는 클랜 수 — 그 리그 래더 위에서부터 (사장님: «IPL 1등부터 11등») */
export const TOP_CLAN_COUNT = 11
/**
 * ★상위권 보정★ — 경기당 몇 점을 더하나.
 *
 * 0.5 는 30등 안 인원을 하나도 못 늘렸고, 1.5 는 1등을 바꿔 버렸다.
 * 1.0 이 «밀린 만큼 메우되 뒤집지는 않는» 자리다 (2026-09-18 실측).
 */
export const TOP_CLAN_BONUS = 1.0

/** 소수 두 자리를 정수 칸에 담는다 — 22.83점 → 2283 */
const SCALE = 100

export interface ScoreLadderResult {
  league: string
  players: number
  ranked: number
  bonused: number
  topClans: string[]
}

export async function buildScoreLadder(options: {
  leagueSlug: string
  confirm: boolean
  minGames?: number
}): Promise<ScoreLadderResult> {
  const minGames = options.minGames ?? SCORE_LADDER_MIN_GAMES
  await prisma.$executeRawUnsafe('SET statement_timeout = 180000')

  const league = await prisma.league.findFirst({
    where: { slug: options.leagueSlug },
    select: { id: true, slug: true },
  })
  if (!league) throw new Error(`리그 ${options.leagueSlug} 이 없다`)

  /* ── ① 보정을 받을 클랜 — 그 리그 래더 위 열한 개 */
  /*
   * ⚠ ★화면의 클랜 랭킹과 ★똑같은 조건★ 이어야 한다★ (2026-09-18).
   *
   *   처음에 조건 없이 `rating` 만 보고 뽑았더니 ★화면에 없는 클랜★ 다섯이 섞였다
   *   (배치 미완료 · 감춘 클랜 · 이번 시즌 한 판도 안 뛴 클랜). 사장님이 말씀하신
   *   「현시각 기준 IPL 1등부터 11등」 은 ★화면에 보이는 그 열한 줄★ 이다.
   *
   *   `apps/web/lib/server/queries/leagues.ts` 의 클랜 랭킹 `where` 와 짝이다 —
   *   거기가 바뀌면 여기도 바뀌어야 한다.
   */
  const top = await prisma.leagueClan.findMany({
    where: {
      leagueId: league.id,
      /* 배치가 안 끝난 클랜은 랭킹에 안 나온다 */
      placement: false,
      /* 감춘 클랜·내보낸 클랜은 랭킹에 안 나온다 (O-044) */
      clan: { active: true },
      expelledAt: null,
      /* 이번 시즌 한 판도 안 뛴 클랜도 뺀다 (2026-09-15) */
      NOT: { win: 0, lose: 0 },
    },
    orderBy: [{ rating: 'desc' }, { id: 'asc' }],
    take: TOP_CLAN_COUNT,
    select: { clanId: true, rating: true, clan: { select: { name: true } } },
  })
  const topClanIds = new Set(top.map((t) => t.clanId))
  const topNames = top.map((t) => t.clan?.name ?? '?')
  log(`★상위권 ${top.length}클랜★ — ${top.map((t) => `${t.clan?.name ?? '?'}(${t.rating})`).join(' · ')}`)

  /*
   * ── ② 선수별 점수 합계.
   *
   * ⚠ ★그 리그 경기만★ 센다 — 선수가 여러 리그를 뛰면 섞이면 안 된다.
   * ⚠ `score` 가 0 인 줄도 경기 수에는 들어간다 — 한 점도 못 딴 경기도 뛴 경기다.
   */
  const rows = await prisma.$queryRawUnsafe<{
    playerId: string; games: number; total: number
  }[]>(`
    SELECT h."playerId", COUNT(*)::int AS games, COALESCE(SUM(h."score"), 0)::int AS total
      FROM "MatchPlayerHex" h
      JOIN "Match" m ON m."id" = h."matchId"
     WHERE m."leagueId" = $1
     GROUP BY h."playerId"`, league.id)

  /* ── ③ 리그 소속(클랜)을 붙여 보정을 정한다 */
  const members = await prisma.leaguePlayer.findMany({
    where: { leagueId: league.id },
    select: { id: true, playerId: true, clanId: true },
  })
  const seatOf = new Map(members.map((m) => [m.playerId, m]))

  let ranked = 0
  let bonused = 0
  const updates: { id: string; rating: number | null; games: number; total: number; bonus: number }[] = []

  for (const r of rows) {
    const seat = seatOf.get(r.playerId)
    if (!seat) continue
    const bonus = seat.clanId !== null && topClanIds.has(seat.clanId) ? TOP_CLAN_BONUS : 0
    if (bonus > 0) bonused += 1
    /* 표본이 얇으면 ★순위를 안 매긴다★ — 값은 `null` 이고 경기 수만 남긴다 (D-106) */
    const avg = r.games > 0 ? r.total / r.games + bonus : null
    const rating = r.games >= minGames && avg !== null ? Math.round(avg * SCALE) : null
    if (rating !== null) ranked += 1
    updates.push({
      id: seat.id,
      rating,
      games: r.games,
      total: r.total,
      bonus: Math.round(bonus * SCALE),
    })
  }

  log(`선수 ${updates.length}명 · 순위 매김 ${ranked}명 (${minGames}경기 이상) · 보정 받음 ${bonused}명`)

  if (options.confirm) {
    /* 한 번에 다 쓰면 잠금이 오래 잡힌다 — 200 명씩 끊는다 */
    for (let i = 0; i < updates.length; i += 200) {
      const part = updates.slice(i, i + 200)
      await prisma.$transaction(
        part.map((u) => prisma.leaguePlayer.update({
          where: { id: u.id },
          data: {
            scoreRating: u.rating,
            scoreGames: u.games,
            scoreTotal: u.total,
            scoreBonus: u.bonus,
            scoredAt: new Date(),
          },
        })),
      )
    }
    log('★썼다★')
  } else {
    log('`--confirm` 이 없어 한 줄도 안 썼다')
  }

  return { league: league.slug, players: updates.length, ranked, bonused, topClans: topNames }
}
