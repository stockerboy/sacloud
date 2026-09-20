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
/*
 * ⚠ ★20 → 40★ (2026-09-19 사장님)
 *
 * > 「내가 젤 싫어하는게 몇판 하지도 않은 애들이 이렇게 100위 안에 들어와잇는거
 * >  이게 젤 싫어」
 *
 *   수축(C=40)만으로는 모자랐다 — 실측으로 ★100등 안에 40경기 미만이 27명★ 이고
 *   7등이 22경기, 10등이 21경기였다. 수축은 «끌어내릴» 뿐 «빼지» 못한다.
 *
 *   ── 40 으로 올리면 몇 명이 남나 (실측)
 *   ```
 *     IPL   855명 → ★458명(54%)★
 *     PL    121명 →    66명(55%)
 *     열산  128명 →    63명(49%)
 *   ```
 *   절반이 빠지지만 ★남는 사람은 전부 「제대로 뛴 사람」★ 이다.
 *   ⚠ 되돌리려면 이 한 줄만 20 으로. 재계산하면 바로 돌아온다.
 */
export const SCORE_LADDER_MIN_GAMES = 40

/**
 * ★★리그마다 문턱이 다르다 — 계약 한 곳이 정한다★★ (2026-09-20)
 *
 * > 「이건 아니잖아 진짜 말이되냐 ★DF가 저 등수인게..?★」 (사장님)
 *   PL 개인랭킹 15위에 ★17판에 승률 35%★ 인 선수가 서 있었다.
 *
 *   ★이 값이 워커와 화면 두 곳에 따로 적혀 있었다.★ 워커는 40, 화면은 15 라
 *   ★점수를 못 매긴 사람이 목록에는 들어왔다.★
 *
 *   그래서 ★`packages/contract/src/rankMinGames.ts` 한 곳★ 으로 옮겼다.
 *   왜 리그마다 다른지도 그 파일에 적혀 있다.
 *
 * ⚠ 옛 기본값(`SCORE_LADDER_MIN_GAMES`)은 지우지 않는다 (CLAUDE.md 1-4) —
 *   `--min-games` 로 손수 줄 때의 기준이다.
 */
export { rankMinGamesOf as minGamesOf } from '@sacloud/contract'
import { rankMinGamesOf } from '@sacloud/contract'
/** 보정을 받는 클랜 수 — 그 리그 래더 위에서부터 (사장님: «IPL 1등부터 11등») */
/*
 * ⚠ ★11 → 10★ (2026-09-18 사장님: 「무조건 10등까지만 보정 줘」).
 *   10등 amaryllis 3136 · 11등 grave 3132 로 4점 차였지만 사장님이 10 으로 못 박으셨다.
 */
export const TOP_CLAN_COUNT = 13

/**
 * ★★상위권에서 빼는 클랜★★ (2026-09-20 사장님)
 *
 * > 「내가 말하는 상위클랜은 지금 클랜순위 ★1등부터 13등까지에서 ASTERISK 뺀 게★
 * >  상위클랜이야」
 *
 *   래더 순으로 13등까지 자른 뒤 ★여기 적힌 클랜을 뺀다.★ 그래서 ★12곳★ 이 남는다.
 *
 * ⚠ ★이름이 아니라 slug 로 짝짓는다★ — 클랜 이름은 바뀐다.
 *   실측 (2026-09-20) — 하루에 94곳이 이름을 바꿨다. 이름으로 적어 두면
 *   ★이름이 바뀌는 순간 조용히 안 빠진다.★
 * ⚠ 순위가 바뀌어 그 클랜이 13등 밖으로 나가면 ★이 줄이 아무 일도 안 한다.★
 *   그때는 13등까지가 그대로 상위권이다.
 */
export const TOP_CLAN_EXCLUDE_SLUGS: readonly string[] = ['clanhanul']
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
/*
 * ⚠ ★2.0 → 3.0★ (2026-09-20 사장님: 「상위 클랜 보정을 ★지금보다 더 세게★ 줄 수 있게」).
 *
 *   ★0.5 씩 올릴 때마다 상위 30명 안의 상위클랜이 두 명쯤 는다★ (2026-09-18 실측표).
 *   3.0 은 그 표의 바깥이라 ★재계산 뒤에 실제로 몇 명이 되는지 재서 보고한다.★
 *   너무 세면 ★상위클랜 하위권 선수가 다른 클랜 상위권을 밀어낸다★ — 그때는 내린다.
 */
/*
 * ⚠ ★★3.0 → 0 (보정을 끈다)★★ (2026-09-20 밤 사장님)
 *
 * > 「IPL은 이제 ★모든 상위권 클랜보정을 제거★ 하라 이제 그딴거 필요없다
 * >  어차피 ★진짜 실력자들의 실력싸움은 c1에 기록★ 된다.
 * >  그냥 ★기록순으로만★ 랭킹내기고 c1에서도 기록순으로 매기면 된다」
 *
 *   보정은 ★강한 클랜과 붙어 점수를 못 낸 사람★ 을 메우려던 장치였다.
 *   이제 그 사람들의 진짜 싸움은 ★C1 이라는 따로 된 리그★ 에 기록되므로
 *   IPL 에서 보정을 줄 이유가 없다.
 *
 * ⚠ ★0 으로 두면 클랜을 고르는 일도 무의미해진다★ — 그래도 `TOP_CLAN_COUNT` 와
 *   `TOP_CLAN_EXCLUDE_SLUGS` 는 ★지우지 않는다★ (CLAUDE.md 1-4).
 *   되돌리려면 이 한 줄만 3.0 으로. 재계산하면 바로 돌아온다.
 */
export const TOP_CLAN_BONUS = 0

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
  /* ★리그마다 다르다★ (2026-09-20) — PL 은 판이 적어 40 이면 목록이 얇아진다 */
  const minGames = options.minGames ?? rankMinGamesOf(options.leagueSlug)
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
    select: { clanId: true, rating: true, clan: { select: { name: true, slug: true } } },
  })
  /*
   * ★사장님이 빼라고 하신 클랜을 뺀다★ (2026-09-20) —
   * 「1등부터 13등까지에서 ASTERISK 뺀 게 상위클랜이야」.
   * ⚠ ★slug 로 짝짓는다★ — 이름은 바뀐다 (하루에 94곳이 바뀐 날이 있다).
   */
  const kept = top.filter((t) => !TOP_CLAN_EXCLUDE_SLUGS.includes(t.clan?.slug ?? ''))
  const dropped = top.filter((t) => TOP_CLAN_EXCLUDE_SLUGS.includes(t.clan?.slug ?? ''))
  const topClanIds = new Set(kept.map((t) => t.clanId))
  const topNames = kept.map((t) => t.clan?.name ?? '?')
  log(`★상위권 ${kept.length}클랜★ (경기당 +${TOP_CLAN_BONUS}) — ${kept.map((t) => `${t.clan?.name ?? '?'}(${t.rating})`).join(' · ')}`)
  if (dropped.length > 0) {
    log(`  ★뺀 클랜★ — ${dropped.map((t) => `${t.clan?.name ?? '?'}(${t.clan?.slug ?? '?'})`).join(' · ')}`)
  }

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
