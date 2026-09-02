import { unstable_cache } from 'next/cache'
import { HOME_LEAGUES, RANK_SPLIT_LEAGUES } from '@sacloud/contract'
import { getPlayerRanks, resolveLeagueId } from '@/lib/server/queries/leagues'
import { getLeagueRecentMatches } from '@/lib/server/queries/homeRecent'
import type { HomeRankPreviewLeague, HomeRecentLeague } from './homeTypes'

/**
 * 홈이 서버에서 읽는 값 두 묶음 (2026-09-02 사장님 지시).
 *
 * ```
 * ① 리그별 개인랭킹 미리보기   SPL · IPL · 10mountain 각 상위 5명
 * ② 최근 경기                 IPL(왼쪽) · SPL(오른쪽) 각 5경기
 * ```
 *
 * ── 순서대로 읽는다. `Promise.all` 을 쓰지 않는다
 *   운영 DB 통로가 하나뿐이다. 병렬로 던져도 줄을 설 뿐이고, 풀 대기 시간이 넘으면
 *   전부 실패한다. 리그 셋을 **차례로** 읽는다.
 *
 * ── 10분 데이터 캐시 (`unstable_cache`)
 *   홈은 제일 많이 열리는 화면인데 한 번 여는 데 왕복이 열 번 넘게 든다.
 *   API 쪽은 엣지 캐시(`next.config.ts` 의 `CACHE_SOURCES_RECORD` · 30분)가 받아 주지만,
 *   홈은 서버 컴포넌트라 그 표에 없다. 그래서 여기서 **데이터 캐시**로 막는다 —
 *   10분에 한 번만 DB 로 내려가고, 그 사이는 같은 값을 낸다.
 *   30분이 아니라 10분인 이유: 최근 경기는 «방금 뛴 경기» 가 보여야 뜻이 있다.
 *   랭킹은 어차피 한 시간에 한 번 다시 계산된다 (`RankHeader` 안내문).
 *
 *   ⚠ 실패는 캐시하지 않는다. 캐시 함수가 던지면 값이 저장되지 않고, 바깥의
 *     `getHome*` 이 받아 `null` 로 바꾼다. 화면은 그 칸에 «불러오지 못함» 을 적고
 *     검색은 그대로 된다 — DB 가 죽어도 홈이 500 이 되지 않는다.
 *
 * ── 랭킹은 랭킹 화면과 **같은 질의**다
 *   `getPlayerRanks(leagueId, null, 5)` — 개인랭킹 첫 쪽의 앞 다섯 줄이다.
 *   모집단·정렬·순위 규칙이 한 곳(`leagues.ts`)에서 나오므로 홈과 랭킹이 갈라지지 않는다.
 *   옛 `getHomeTop`(`homeTop.ts` · `rank·player·clan·rating` 넉 칸)은 **지우지 않았다**
 *   (`CLAUDE.md` 10-4). 그쪽은 `/api/home/top` 이 아직 쓴다.
 */

/** 리그마다 몇 명 — 사장님 권장값 5 */
export const HOME_RANK_PREVIEW_SIZE = 5
/** 리그마다 몇 경기 — 사장님 지시 5 */
export const HOME_RECENT_SIZE = 5
/** 데이터 캐시 수명(초) */
const HOME_CACHE_SECONDS = 600

/**
 * 최근 경기의 좌우 — **IPL 왼쪽 · SPL 오른쪽** (사장님 지시).
 * 랭킹 화면(`RANK_SPLIT_LEAGUES` · SPL 왼쪽)과 **반대**다. 이름은 그 표에서 가져오고 순서만 뒤집는다.
 */
export const HOME_RECENT_LEAGUES: readonly { slug: string; name: string }[] = [
  ...RANK_SPLIT_LEAGUES,
].reverse()

async function loadRankPreview(): Promise<HomeRankPreviewLeague[]> {
  const leagues: HomeRankPreviewLeague[] = []
  for (const league of HOME_LEAGUES) {
    const leagueId = await resolveLeagueId(league.slug)
    /* 리그가 없으면 빈 칸이다. 다른 리그 선수를 끌어오지 않는다 (CLAUDE.md 3장 7번) */
    const page = leagueId ? await getPlayerRanks(leagueId, null, HOME_RANK_PREVIEW_SIZE) : null
    leagues.push({ slug: league.slug, name: league.name, rows: page?.items ?? [] })
  }
  return leagues
}

async function loadRecentMatches(): Promise<HomeRecentLeague[]> {
  const leagues: HomeRecentLeague[] = []
  for (const league of HOME_RECENT_LEAGUES) {
    const matches = await getLeagueRecentMatches(league.slug, HOME_RECENT_SIZE)
    leagues.push({ slug: league.slug, name: league.name, matches: matches ?? [] })
  }
  return leagues
}

const cachedRankPreview = unstable_cache(loadRankPreview, ['home-rank-preview'], {
  revalidate: HOME_CACHE_SECONDS,
  tags: ['home'],
})

const cachedRecentMatches = unstable_cache(loadRecentMatches, ['home-recent-matches'], {
  revalidate: HOME_CACHE_SECONDS,
  tags: ['home'],
})

/** ① 리그별 개인랭킹 미리보기. 못 읽으면 `null` — 홈 전체를 죽이지 않는다 */
export async function getHomeRankPreview(): Promise<HomeRankPreviewLeague[] | null> {
  try {
    return await cachedRankPreview()
  } catch (error) {
    console.error('[home] rank preview failed', error)
    return null
  }
}

/** ② 최근 경기. 못 읽으면 `null` */
export async function getHomeRecentMatches(): Promise<HomeRecentLeague[] | null> {
  try {
    return await cachedRecentMatches()
  } catch (error) {
    console.error('[home] recent matches failed', error)
    return null
  }
}
