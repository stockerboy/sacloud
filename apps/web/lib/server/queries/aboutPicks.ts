/**
 * ★소개 페이지가 무엇을 보여 줄지 고른다★ (2026-09-14 사장님).
 *
 *   «개인기록은 실제 예시) 이렇게 해서 ★게임 제일 많이 한 사람★ 걸로 보여줘.
 *     클랜기록도 ★제일 많이 한 클랜★ 으로 보여줘 IPL SPL 각각 하나씩 개인 클랜
 *     전부 총 4개(ipl2 spl2) / 그리고 경기분석표도 ★라운드 가장 오랜간거★
 *     IPL SPL 하나씩 뽑아서 보여줘»
 *
 * ── ★여기서는 「누구를」 만 고른다★
 *   보여 줄 값은 ★기존 API 가 그대로 준다★ — 선수 상세 · 클랜 상세 · 경기 상세.
 *   소개 페이지용으로 값을 따로 만들지 않는다. 그러면 같은 선수인데 소개 페이지와
 *   선수 페이지가 다른 숫자를 말하게 된다. ★한 곳에서 나온 값만 쓴다.★
 *
 * ── 골라 둔 사람을 박아 두지 않는다
 *   «경기 제일 많이 한 사람» 은 내일 바뀐다. 이름을 코드에 적으면 그날로 거짓말이 된다.
 *   그래서 ★부를 때마다 다시 센다.★ 10분 캐시면 넉넉하다.
 */
import { prisma } from '@sacloud/db'
import type { LeagueClanShow, LeaguePlayerDetail, MatchDetail } from '@sacloud/contract'
import { getLeagueClanShow, getLeaguePlayerDetail } from './records'
import { getMatch } from './matches'

export interface AboutPick {
  league: string
  /** 화면에 쓰는 리그 이름 */
  label: string
  /**
   * ⚠ ★`Player.id` 다 — `LeaguePlayer.id` 가 아니다★ (2026-09-14 실측으로 찾음).
   *   선수 상세 API(`leaguePlayerShow`)가 `leagueId_playerId` 로 찾기 때문이다.
   *   처음에 `LeaguePlayer.id` 를 줬더니 소개 페이지의 선수 칸만 영영
   *   «불러오는 중…» 에서 멈춰 있었다.
   */
  player: { player_id: string; name: string; games: number } | null
  clan: { slug: string; name: string; games: number } | null
  /** 라운드가 가장 길었던 경기 */
  match: { id: string; rounds: number; red: string; blue: string; start_at: string } | null
}

export interface AboutPicks {
  leagues: AboutPick[]
}

/**
 * ★상세까지 한 덩어리로 내린다★ (2026-09-14 실측으로 이렇게 됐다).
 *
 *   처음에는 화면이 «누구를» 만 받고, 선수·클랜·경기 상세는 ★각각 따로★ 불렀다.
 *   그런데 리그 둘 × 상세 셋 = ★여섯 번이 동시에★ 날아가고,
 *   연결이 하나인 환경에서는 전부 연결 대기로 멈췄다 —
 *   화면이 «불러오는 중…» 여섯 개로 굳었다.
 *
 *   그래서 ★서버가 차례로 모아서 한 번에 준다.★ 왕복도 여섯에서 하나로 줄었다.
 *   ★값을 새로 만들지는 않는다★ — 선수 상세·클랜 상세·경기 상세를 만드는
 *   ★바로 그 함수★ 를 부른다. 소개 페이지와 실제 페이지가 다른 말을 하면 안 된다.
 */
export interface AboutShowcase extends AboutPick {
  player_detail: LeaguePlayerDetail | null
  clan_detail: LeagueClanShow | null
  match_detail: MatchDetail | null
}

export interface AboutShowcases {
  leagues: AboutShowcase[]
}

export function aboutShowcases(): Promise<AboutShowcases> {
  const now = Date.now()
  if (showMemo !== null && now - showMemo.at < TTL_MS) return showMemo.value
  const value = buildShowcases().catch((error: unknown) => {
    showMemo = null
    throw error
  })
  showMemo = { at: now, value }
  return value
}

let showMemo: { at: number; value: Promise<AboutShowcases> } | null = null

async function buildShowcases(): Promise<AboutShowcases> {
  const picks = await aboutPicks()
  const leagues: AboutShowcase[] = []
  for (const pick of picks.leagues) {
    /* ★차례로★ 부른다 — 한꺼번에 부르면 연결이 모자라 전부 멈춘다 */
    const player =
      pick.player === null ? null : await getLeaguePlayerDetail(pick.league, pick.player.player_id)
    const clan = pick.clan === null ? null : await getLeagueClanShow(pick.league, pick.clan.slug)
    const league = await prisma.league.findFirst({ where: { slug: pick.league }, select: { id: true } })
    const match =
      pick.match === null || league === null ? null : await getMatch(league.id, pick.match.id, null)
    leagues.push({
      ...pick,
      player_detail: player,
      clan_detail: clan,
      match_detail: match,
    })
  }
  return { leagues }
}

/**
 * ★세 리그 전부★ (2026-09-14 저녁 사장님: «위 상단에 세개를 두고 클릭해서
 * 화면전환으로 각각 리그들을 볼 수 있게 해줘 / ★순서는 IPL이 먼저 SPL이 그 다음
 * 그 다음이 YSL★»).
 *
 * ⚠ 이름은 `app/about/leagueCopy.ts` 가 정한다 — 여기는 ★슬러그와 차례★ 만 안다.
 *   옛 판은 IPL·SPL 둘뿐이었고 이름표(`label`)를 여기서 들고 있었다.
 *   그러다 «SPL → LLM» 처럼 이름이 바뀌면 두 곳을 고쳐야 한다. 한 곳으로 모은다.
 */
const LEAGUES: readonly { slug: string; label: string }[] = [
  { slug: 'nolink', label: 'IPL' },
  { slug: 'supply', label: 'LLM' },
  { slug: 'sanply', label: 'YSL' },
]

/**
 * ⚠ ★한 줄씩 차례로 묻는다 — 한꺼번에 묻지 않는다★ (2026-09-14 실측).
 *
 *   처음에는 두 리그 × 세 질의를 ★전부 동시에★ 던졌다. 그랬더니 —
 *   ```
 *   Timed out fetching a new connection from the connection pool
 *   (connection limit: 1)
 *   ```
 *   연결이 ★하나★ 인 환경에서는 여섯 개를 동시에 달라는 요청이 그대로 멈춘다.
 *   이 화면은 10분 캐시라 ★빨리 끝날 이유가 없다.★ 차례로 묻는다.
 */
/** 라운드 최다 경기를 며칠 안에서 고르나 */
const MATCH_WINDOW_DAYS = 30

/**
 * ★한 번 센 것을 잠시 들고 있는다★ — 이 화면은 자주 바뀌지 않는다.
 * 엣지 캐시를 못 쓴다 (관리자만 보는 동안은 `guard` 라 캐시 머리말이 없다).
 */
const TTL_MS = 10 * 60 * 1000
let memo: { at: number; value: Promise<AboutPicks> } | null = null

export function clearAboutPicksCache(): void {
  memo = null
}

export function aboutPicks(): Promise<AboutPicks> {
  const now = Date.now()
  if (memo !== null && now - memo.at < TTL_MS) return memo.value
  /* 실패한 약속을 남기면 TTL 동안 같은 오류를 되돌려 준다. 지운다 */
  const value = buildAboutPicks().catch((error: unknown) => {
    memo = null
    throw error
  })
  memo = { at: now, value }
  return value
}

async function buildAboutPicks(): Promise<AboutPicks> {
  const leagues: AboutPick[] = []
  {
    for (const { slug, label } of LEAGUES) {
      const league = await prisma.league.findFirst({ where: { slug }, select: { id: true } })
      if (league === null) {
        leagues.push({ league: slug, label, player: null, clan: null, match: null })
        continue
      }

      const [playerRows, clanRows, matchRows] = await sequence([
        /* 경기를 가장 많이 한 선수 */
        () => prisma.$queryRawUnsafe(
          `SELECT lp."playerId" AS id, pl.name, (lp.win + lp.lose) AS games
             FROM "LeaguePlayer" lp
             JOIN "Player" pl ON pl.id = lp."playerId"
            WHERE lp."leagueId" = $1
            ORDER BY (lp.win + lp.lose) DESC
            LIMIT 1`,
          league.id,
        ) as Promise<{ id: string; name: string; games: number }[]>,

        /* 경기를 가장 많이 한 클랜 — 쫓겨난 클랜은 뺀다 */
        () => prisma.$queryRawUnsafe(
          `SELECT c.slug, c.name, (lc.win + lc.lose) AS games
             FROM "LeagueClan" lc
             JOIN "Clan" c ON c.id = lc."clanId"
            WHERE lc."leagueId" = $1 AND lc."expelledAt" IS NULL
            ORDER BY (lc.win + lc.lose) DESC
            LIMIT 1`,
          league.id,
        ) as Promise<{ slug: string; name: string; games: number }[]>,

        /*
         * ★라운드가 가장 길었던 경기★
         *
         * 라운드 수는 `Match` 에 칸이 없다 — 클랜 육각 집계 행의 `tally.roundsWon` 이
         * 경기당 두 줄(양 팀)로 들어 있고, 그 둘을 더한 것이 총 라운드다.
         * 경기 목록 화면(`roundsWonInList`)이 읽는 자리와 ★같은 자리★ 다.
         *
         * ⚠ ★최근 `MATCH_WINDOW_DAYS` 일로 좁힌다★ (2026-09-14 실측).
         *   시즌 전체를 묶으면 이 질의 하나가 ★18.8초★ 를 먹었다 — 소개 페이지
         *   첫 화면이 그만큼 비어 있게 된다. 한 판의 최대 라운드는 정해져 있어서
         *   («18라운드») 최근 한 달 안에도 같은 값이 반드시 있다.
         *   소개에는 ★요즘 경기★ 가 더 어울리기도 한다.
         */
        () => prisma.$queryRawUnsafe(
          `SELECT m.id, m."startAt", rc.name AS red, bc.name AS blue,
                  SUM((h.tally->>'roundsWon')::int)::int AS rounds
             FROM "Match" m
             JOIN "MatchClanHexV2" h ON h."matchId" = m.id
             JOIN "LeagueClan" rl ON rl.id = m."redLeagueClanId"
             JOIN "Clan" rc ON rc.id = rl."clanId"
             JOIN "LeagueClan" bl ON bl.id = m."blueLeagueClanId"
             JOIN "Clan" bc ON bc.id = bl."clanId"
            WHERE m."leagueId" = $1 AND m."supersededAt" IS NULL
              AND m."startAt" >= $2
            GROUP BY m.id, m."startAt", rc.name, bc.name
            ORDER BY rounds DESC NULLS LAST, m."startAt" DESC
            LIMIT 1`,
          league.id,
          new Date(Date.now() - MATCH_WINDOW_DAYS * 24 * 60 * 60 * 1000),
        ) as Promise<{ id: string; startAt: Date; red: string; blue: string; rounds: number }[]>,
      ] as const)

      const p = playerRows[0]
      const c = clanRows[0]
      const m = matchRows[0]
      leagues.push({
        league: slug,
        label,
        player: p === undefined ? null : { player_id: p.id, name: p.name, games: Number(p.games) },
        clan: c === undefined ? null : { slug: c.slug, name: c.name, games: Number(c.games) },
        match:
          m === undefined
            ? null
            : {
                id: m.id,
                rounds: Number(m.rounds),
                red: m.red,
                blue: m.blue,
                start_at: m.startAt.toISOString(),
              },
      })
    }
  }
  return { leagues }
}

/** 약속들을 ★차례로★ 기다린다. `Promise.all` 과 달리 한 번에 하나만 연결을 쓴다 */
async function sequence<T extends readonly unknown[]>(
  tasks: readonly [...{ [K in keyof T]: () => Promise<T[K]> }],
): Promise<T> {
  const out: unknown[] = []
  for (const task of tasks) out.push(await task())
  return out as unknown as T
}
