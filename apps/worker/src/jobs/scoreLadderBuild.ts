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
/*
 * ⚠ ★11 → 10★ (2026-09-18 사장님: 「무조건 10등까지만 보정 줘」).
 *   10등 amaryllis 3136 · 11등 grave 3132 로 4점 차였지만 사장님이 10 으로 못 박으셨다.
 */
export const TOP_CLAN_COUNT = 10
/**
 * ★상위권 보정★ — 경기당 몇 점을 더하나.
 *
 * 0.5 는 30등 안 인원을 하나도 못 늘렸고, 1.5 는 1등을 바꿔 버렸다.
 * 1.0 이 «밀린 만큼 메우되 뒤집지는 않는» 자리다 (2026-09-18 실측).
 */
/*
 * ⚠ ★1.0 → 2.0★ (2026-09-18 사장님: 「지금 하위권 클랜원들이 너무 많아 순위권에」).
 *
 *   상위 30명 안에 상위클랜이 몇 명인가 (825명 실측):
 *   ```
 *     +1.0 · 수축 없음    8명   ← 옛 판
 *     +1.0 · 수축 40     10명
 *     +2.0 · 수축 40    ★15명★  ← 채택
 *     +2.5 · 수축 60     17명   (순위가 거의 안 바뀌어 실익 없음)
 *   ```
 */
export const TOP_CLAN_BONUS = 2.0

/**
 * ★판수가 적으면 평균 쪽으로 끌어당긴다★ (2026-09-18 사장님:
 *   「판수가 일단 많아야돼 상위권 오려면 적을 수록 유리하면 절대 안돼」).
 *
 * ── 왜 필요한가
 *   그냥 «총점 ÷ 판수» 면 ★20판만 뛴 사람이 운 좋은 20판으로 1등★ 할 수 있다.
 *   실제로 옛 상위 20명 중 다섯이 20~28경기였다.
 *
 *   그런데 실측은 ★판수가 많을수록 진짜로 더 잘한다★ 고 말한다 (IPL 825명):
 *   ```
 *     20~29경기  219명  평균 12.67점
 *     30~49경기  300명  평균 12.47점
 *     50~79경기  210명  평균 12.92점
 *     80경기~     96명  평균 13.19점   ← 가장 높다
 *   ```
 *   적은 판수가 유리해 보인 것은 실력이 아니라 ★들쭉날쭉함★ 이었다.
 *
 * ── 어떻게 누르나
 *   ```
 *     점수 = (총점 + 리그평균 × C) ÷ (판수 + C)
 *   ```
 *   판수가 적으면 «리그평균» 쪽으로 끌려 내려가고, 판수가 쌓이면 제 실력이 드러난다.
 *   C=40 이면 40판을 뛰어야 자기 점수의 절반이 제 몫이 된다.
 *
 * ⚠ 0 으로 두면 ★옛 셈 그대로★ 다 (`CLAUDE.md` 1-4).
 */
export const SCORE_SHRINK_GAMES = 40

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

  /*
   * ★리그 평균★ — 수축이 끌어당길 자리다. ★순위 대상(`minGames` 이상)만★ 으로 잰다:
   * 한두 판 뛴 사람까지 넣으면 평균이 흔들려 기준이 해마다 달라진다.
   */
  const pool = rows.filter((r) => r.games >= minGames)
  const poolGames = pool.reduce((s, r) => s + r.games, 0)
  const leagueMean = poolGames > 0 ? pool.reduce((s, r) => s + r.total, 0) / poolGames : 0

  for (const r of rows) {
    const seat = seatOf.get(r.playerId)
    if (!seat) continue
    const bonus = seat.clanId !== null && topClanIds.has(seat.clanId) ? TOP_CLAN_BONUS : 0
    if (bonus > 0) bonused += 1
    /* 표본이 얇으면 ★순위를 안 매긴다★ — 값은 `null` 이고 경기 수만 남긴다 (D-106) */
    const C = SCORE_SHRINK_GAMES
    const avg =
      r.games > 0 ? (r.total + leagueMean * C) / (r.games + C) + bonus : null
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
