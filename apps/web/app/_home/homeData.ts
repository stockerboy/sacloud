import { unstable_cache } from 'next/cache'
import { HOME_LEAGUES, RANK_SPLIT_LEAGUES } from '@sacloud/contract'
import { getPlayerRanks, resolveLeagueId } from '@/lib/server/queries/leagues'
import { getLeagueRecentMatches, getLeagueRecentRows } from '@/lib/server/queries/homeRecent'
import { HOME_RECENT_LOOK, type HomeRankPreviewLeague, type HomeRecentLeague } from './homeTypes'

/**
 * 홈이 서버에서 읽는 값 두 묶음 (2026-09-02 사장님 지시).
 *
 * ```
 * ① 리그별 개인랭킹 미리보기   SPL · IPL 각 상위 30명 · 10mountain 5명 (지시 #13-d)
 * ② 최근 경기                 SPL(왼쪽) · IPL(오른쪽) 각 6경기 — 한 줄 모양 (지시 #11)
 * ```
 *
 * ── 순서대로 읽는다. `Promise.all` 을 쓰지 않는다
 *   운영 DB 통로가 하나뿐이다. 병렬로 던져도 줄을 설 뿐이고, 풀 대기 시간이 넘으면
 *   전부 실패한다. 리그를 **차례로** 읽는다.
 *
 * ── 10분 데이터 캐시 (`unstable_cache`) — **리그 단위**
 *   홈은 제일 많이 열리는 화면인데 한 번 여는 데 왕복이 열 번 넘게 든다.
 *   API 쪽은 엣지 캐시(`next.config.ts` 의 `CACHE_SOURCES_RECORD` · 30분)가 받아 주지만,
 *   홈은 서버 컴포넌트라 그 표에 없다. 그래서 여기서 **데이터 캐시**로 막는다 —
 *   10분에 한 번만 DB 로 내려가고, 그 사이는 같은 값을 낸다.
 *   30분이 아니라 10분인 이유: 최근 경기는 «방금 뛴 경기» 가 보여야 뜻이 있다.
 *   랭킹은 어차피 한 시간에 한 번 다시 계산된다 (`RankHeader` 안내문).
 *
 *   ⚠ **캐시는 리그 하나의 값만 담는다** (2026-09-02 검수관 지적 · 지시 #11).
 *     처음에는 리그 배열을 통째로 캐시했더니 **섹션 순서·개수까지 10분간 갇혔다** —
 *     좌우를 바꿔 배포해도 캐시가 살아 있는 동안 옛 순서가 나왔다.
 *     지금은 `cached*Of(slug, size)` 로 리그 하나씩 캐시하고, **어느 리그를 어떤 순서로**
 *     보여 줄지는 아래 `getHome*` 이 렌더 때마다 조립한다. 순서·구성은 캐시 밖이다.
 *     거기에 `HOME_CACHE_VERSION` 을 키에 붙여, 값의 **모양**이 바뀌면 옛 캐시를 버린다.
 *     (`unstable_cache` 는 함수 인자도 키에 넣는다 — slug 마다 따로 저장된다.)
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
 *
 * ── 최근 경기의 두 모양
 *   `HOME_RECENT_LOOK`(`homeTypes.ts`)이 `'list'` 면 한 줄 모양만, `'card'` 면 카드 모양만 읽는다.
 *   안 쓰는 쪽은 읽지 않는다 — 빈 배열이다.
 */

/**
 * 리그마다 몇 명 (2026-09-02 사장님 지시 #13-d).
 *
 * > SPL · IPL 각 **상위 30명**. 10mountain 은 **5명** (사장님 답).
 *
 * 리그별 값은 **표**에 둔다 — 화면에 `if (slug === …)` 를 두지 않는다 (`leagueScreen` 과 같은 방식).
 * 표에 없는 리그는 기본값이다. ⚠ 옛 값은 전 리그 5 였다 (지시 #3 «5명 권장»).
 */
export const HOME_RANK_PREVIEW_SIZE_DEFAULT = 30
export const HOME_RANK_PREVIEW_SIZES: Readonly<Record<string, number>> = { sanply: 5 }
function rankPreviewSizeOf(slug: string): number {
  return HOME_RANK_PREVIEW_SIZES[slug] ?? HOME_RANK_PREVIEW_SIZE_DEFAULT
}
/**
 * 리그마다 몇 경기 — 사장님 지시 #11 «가장최신경기 6건씩».
 * ⚠ 옛 값은 5 였다 (지시 #3). 되돌리려면 이 숫자 하나다.
 */
export const HOME_RECENT_SIZE = 6
/** 데이터 캐시 수명(초) */
const HOME_CACHE_SECONDS = 600
/**
 * 캐시 키 버전. 캐시에 든 값의 **모양**(행 타입 · 칸)이 바뀔 때 올린다 — 순서·개수는 여기와 무관하다
 * (그건 캐시 밖에서 조립한다). `v2` = 지시 #11 (한 줄 모양 도입 · 리그 단위 캐시).
 * `v3` = 지시 #13-g (최근 경기 행에 MVP 가 붙었다).
 */
const HOME_CACHE_VERSION = 'v3'

/**
 * 최근 경기의 좌우 — **SPL 왼쪽 · IPL 오른쪽** (2026-09-02 사장님 지시 #10 · #11 «iplspl 둘다 마찬가지»).
 *
 * > "spl,ipl,열산 순서로 배치해라"
 *
 * 랭킹 화면(`RANK_SPLIT_LEAGUES`)과 **같은 순서**다. 표를 그대로 쓴다.
 *
 * ⚠ 옛 서술 (같은 날 오전 · 지시 #3) — 그때는 «IPL 왼쪽 / SPL 오른쪽» 이었고
 *   `[...RANK_SPLIT_LEAGUES].reverse()` 였다. 되돌리려면 그 한 줄이다 (`CLAUDE.md` 10-4).
 */
export const HOME_RECENT_LEAGUES: readonly { slug: string; name: string }[] = RANK_SPLIT_LEAGUES

/* ---------------------------------------------------------- 리그 단위 캐시 --- */

const cachedRankPreviewOf = unstable_cache(
  async (slug: string, size: number) => {
    const leagueId = await resolveLeagueId(slug)
    /* 리그가 없으면 빈 칸이다. 다른 리그 선수를 끌어오지 않는다 (CLAUDE.md 3장 7번) */
    const page = leagueId ? await getPlayerRanks(leagueId, null, size) : null
    return page?.items ?? []
  },
  ['home-rank-preview', HOME_CACHE_VERSION],
  { revalidate: HOME_CACHE_SECONDS, tags: ['home'] },
)

const cachedRecentRowsOf = unstable_cache(
  async (slug: string, size: number) => (await getLeagueRecentRows(slug, size)) ?? [],
  ['home-recent-rows', HOME_CACHE_VERSION],
  { revalidate: HOME_CACHE_SECONDS, tags: ['home'] },
)

/* 옛 카드 모양 — `HOME_RECENT_LOOK === 'card'` 일 때만 불린다 */
const cachedRecentMatchesOf = unstable_cache(
  async (slug: string, size: number) => (await getLeagueRecentMatches(slug, size)) ?? [],
  ['home-recent-matches', HOME_CACHE_VERSION],
  { revalidate: HOME_CACHE_SECONDS, tags: ['home'] },
)

/* ------------------------------------------------------------ 렌더용 조립 --- */

/** ① 리그별 개인랭킹 미리보기. 못 읽으면 `null` — 홈 전체를 죽이지 않는다 */
export async function getHomeRankPreview(): Promise<HomeRankPreviewLeague[] | null> {
  try {
    const leagues: HomeRankPreviewLeague[] = []
    for (const league of HOME_LEAGUES) {
      const rows = await cachedRankPreviewOf(league.slug, rankPreviewSizeOf(league.slug))
      leagues.push({ slug: league.slug, name: league.name, rows })
    }
    return leagues
  } catch (error) {
    console.error('[home] rank preview failed', error)
    return null
  }
}

/** ② 최근 경기. 못 읽으면 `null` */
export async function getHomeRecentMatches(): Promise<HomeRecentLeague[] | null> {
  try {
    const leagues: HomeRecentLeague[] = []
    for (const league of HOME_RECENT_LEAGUES) {
      const rows =
        HOME_RECENT_LOOK === 'list' ? await cachedRecentRowsOf(league.slug, HOME_RECENT_SIZE) : []
      const matches =
        HOME_RECENT_LOOK === 'card' ? await cachedRecentMatchesOf(league.slug, HOME_RECENT_SIZE) : []
      leagues.push({ slug: league.slug, name: league.name, rows, matches })
    }
    return leagues
  } catch (error) {
    console.error('[home] recent matches failed', error)
    return null
  }
}
