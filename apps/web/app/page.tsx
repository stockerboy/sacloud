'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  SEARCH_FAILED,
  SEARCH_MISS_BARRACKS,
  barracksUsnOf,
  clanSlugFromBarracksUrl,
  isBarracksUrl,
  normalizePastedQuery,
  searchMissMessage,
} from '@sacloud/contract'
import {
  FEATURED_LEAGUES,
  LeagueLabel,
  MainLogo,
  SearchBar,
  SiteIntro,
  isLeaguePreparing,
  type SearchType,
} from '@sacloud/ui'
import { ApiError, apiGet } from '@/lib/api'

/**
 * 홈.
 *
 * ── 2026-09-01 (밤): **알 모음집과 인기게시글을 뺐다** (사용자 지시)
 *   ```
 *   "애초에 알시스템은 걍 버려 필요없어 게시판 준비중으로 냅두고 마이페이지는 해야돼"
 *   ```
 *   남은 구성은 이렇게 짧아졌다.
 *   ```
 *   0 로고        ← 작게. 워드마크 하나 (MainLogo)
 *   1 통합검색     ← 화면의 주인공. 크고 가운데
 *   2 리그 바로가기 ← 누르면 **바로 랭킹**
 *   ─────────────
 *   3 사이트 소개 (꼬리말)
 *   ```
 *
 *   **알 모음집(`LeagueEggGallery` 두 벌 · SPL · IPL)** — 알 시스템을 버렸다.
 *   컴포넌트(`app/_egg/**` · `packages/ui/src/egg/**`)는 **지우지 않았다.**
 *   이 화면이 안 쓸 뿐이고, 스위치는 `EGG_SYSTEM_ENABLED` 하나다 (`CLAUDE.md` 10-4).
 *
 *   **인기게시글(`HotPostList`)** — 게시판을 준비중으로 닫았기 때문이다.
 *   목록은 `/board/hot/{id}` 로 들어가는데 그 문이 잠겼다. 눌러도 「준비중」만 뜨는
 *   제목 목록을 메인에 세워 두면 **막다른 길**이 된다. 목록만 있고 못 여는 것이
 *   없는 것보다 나쁘다. `HotPostList` 도 `packages/ui` 에 그대로 있다.
 *
 *   빈자리를 남기지 않았다 — 「윗머리」 아래 가르던 `<hr>` 까지 같이 뺐다.
 *   가를 것이 없는데 선만 남으면 아래가 잘려 보인다 (`CLAUDE.md` 4장의 광고 처리와 같다).
 *   그만큼 **메인에서 나가는 요청도 줄었다** — 아래 「나가는 요청」 참조.
 *
 * ── 메인에서 나가는 요청 (2026-09-01 밤 기준)
 *   ```
 *   없앰  GET /eggs/broken                    ← 알 (전역 EggBoot)
 *   없앰  GET /me/link                        ← 알 (전역 EggBoot)
 *   없앰  GET /players/{id} · /clans/{slug}   ← 알 (로그인·연동돼 있을 때만 나가던 것)
 *   없앰  GET /leagues/supply/clans (커서를 끝까지 따라감 · 최대 15장)
 *   없앰  GET /leagues/nolink/clans (〃)
 *   없앰  GET /boards?category=hot            ← 인기게시글
 *   남음  검색은 **누를 때만** 나간다. 가만히 있으면 한 건도 안 나간다
 *   ```
 *
 * ── 2026-09-01: **신전 히어로를 뺐다.** op.gg 식으로 정리 (사용자 지시)
 *   ```
 *   "파일 찾기 가챠샵 전부 삭제하고 심플이즈 더 베스트다 op.gg 스타일 Ui로
 *    걍 깔끔하게 간다 진짜 깔끔이 젤 중요하다"
 *   ```
 *   op.gg 메인은 **로고 하나 · 큰 검색창 하나 · 그 아래 조용한 목록**이 전부다.
 *   장식이 없다. 그게 «깔끔» 이다. 그래서 이렇게 됐다.
 *   ```
 *   0 로고        ← 작게. 워드마크 하나 (MainLogo)
 *   1 통합검색     ← 화면의 주인공. 크고 가운데
 *   2 리그 바로가기 ← 누르면 **바로 랭킹**. 리그홈 같은 중간 화면을 거치지 않는다
 *   ─────────────
 *   3 알 모음집
 *   4 인기게시글
 *   5 사이트 소개 (꼬리말)
 *   ```
 *
 *   **`TempleHero` 컴포넌트를 지우지 않았다** (CLAUDE.md 10-4). `packages/ui` 에
 *   그대로 있고 export 도 남아 있다. **이 화면이 안 쓸 뿐이다.**
 *
 *   히어로가 빠지면서 **IPL 1등 클랜 조회(`leagueRankOverall`)도 같이 없앴다.**
 *   히어로 말고는 그 값을 쓰는 곳이 없었다. 안 쓰는 조회를 남겨 두면 메인이 켜질
 *   때마다 DB 를 헛되이 때린다 — 지금 DB 사정이 넉넉하지 않다.
 *   **라우트(`/api/leagues/[id]/ranks/overall`)는 그대로 둔다.** 화면만 안 부른다.
 *
 *   `SearchBar` 는 손대지 않았다. 검색 종류 셋(플레이어/클랜/리그)·제출 흐름 전부 그대로다.
 *
 * ── 옛 서술 (2026-09-01 오전 · 지금은 위 구성이 대신한다)
 *   ```
 *   0 신전 히어로   ← 먹구름 · 번개 · 대리석 조각상 · SA CLOUD 워드마크 · IPL 1등 클랜
 *   1 통합검색      ← 히어로가 품었다
 *   2 알 모음집
 *   3 인기게시글
 *   ```
 *   그때는 히어로가 워드마크를 직접 그렸기 때문에 `MainLogo` 를 화면에서 뺐었다.
 *   히어로가 사라졌으므로 `MainLogo` 가 제자리로 돌아왔다.
 *
 * ── 옛 서술 (2026-08-30)
 *   `리그별 개인랭킹 TOP3` 는 사용자 지시로 뺐다. `GET /api/home/top` 호출도 함께 없앴다 —
 *   **라우트 파일은 그대로 둔다.**
 *
 * ── 한 화면을 꽉 채우지 않는다
 *   배경 장식을 깔지 않는다. 바탕은 `--color-page` 하나다.
 *   위아래 여백을 넉넉히 두고 본문 폭을 제한한다.
 */

/**
 * 메인의 리그 바로가기.
 *
 * GNB 와 같은 목록(`FEATURED_LEAGUES`)에서 온다 — 여기에 리그명을 다시 적지 않는다.
 * **준비중 리그(`daerule`)는 뺀다.** 눌러도 랭킹이 없는 리그를 랭킹 바로가기에
 * 세워 두면 거짓말이 된다. GNB 링크는 그대로 살아 있다 (거기서는 안내가 뜬다).
 *
 * 대상은 `/league/{slug}/rank/player` — **개인랭킹**이다. `/league/{slug}` 로 보내면
 * 리그홈(`/home/info`)으로 한 번 더 튕긴다.
 */
const LEAGUE_SHORTCUTS = FEATURED_LEAGUES.filter(
  (league) => !isLeaguePreparing(league.href.split('/')[2] ?? ''),
).map((league) => ({ label: league.label, href: `${league.href}/rank/player` }))

export default function HomePage() {
  const router = useRouter()
  /** 못 찾았을 때 검색창 밑에 띄우는 한 줄. 성공하면 즉시 지운다 (D-254) */
  const [notice, setNotice] = useState<string | null>(null)

  /**
   * 검색 제출.
   * 정확일치 조회에 성공하면 해당 상세로 이동하고, 결과가 없으면 **왜 없는지 말한다.**
   *
   * 플레이어는 닉네임뿐 아니라 **병영수첩 주소·계정 번호**도 받는다 — 서버의
   * `playersByName` 이 거기서 식별자를 뽑아 조회한다 (D-162 · D-254).
   * 화면에서 따로 파싱하지 않는다. 여기서 `isBarracksUrl` 을 보는 것은 **문구를
   * 고르기 위해서**일 뿐이고, 조회 결과를 바꾸지 않는다.
   *
   * ── 2026-09-01 이전에는 실패가 **아무 표시도 남기지 않았다.**
   *   엔터를 쳐도 화면이 그대로라 사용자는 「없음」과 「멈춤」을 구별할 수 없었다.
   */
  const handleSearch = async (type: SearchType, query: string) => {
    setNotice(null)
    try {
      if (type === 'player') {
        const found = await apiGet('playersByName', { params: { name: query } })
        router.push(`/player/${found.data.id}`)
        return
      }
      if (type === 'clan') {
        const found = await apiGet('clansByName', { params: { name: query } })
        router.push(`/clan/${found.data.slug}`)
        return
      }
      const found = await apiGet('leaguesByName', { params: { name: query } })
      router.push(`/league/${found.data.slug}`)
    } catch (error) {
      setNotice(missMessageFor(type, query, error))
    }
  }

  return (
    <div className="mx-auto w-full max-w-[var(--layout-max,1120px)] px-5 max-md:px-3">
      {/* ================= 0 로고 · 1 검색 · 2 리그 바로가기 =================
             배경을 칠하지 않는다. 페이지 바탕(`--color-page`) 위에 글자와 선만 있다. */}
      <section className="flex flex-col items-center pb-[72px] pt-[104px] max-md:pb-[56px] max-md:pt-[64px]">
        {/* --- 0 로고 — 작게. 화면의 주인공은 아래 검색창이다 --- */}
        <Link href="/" aria-label="3rd cloud 홈" className="block">
          <MainLogo className="h-[42px] w-auto text-[var(--color-text-strong,#f6eded)] max-md:h-[32px]" />
        </Link>

        {/* --- 1 통합검색 — 크고 가운데. 동작은 하나도 바뀌지 않았다 --- */}
        <div className="mt-9 w-full max-md:mt-7">
          <SearchBar onSubmit={handleSearch} notice={notice} />
        </div>

        {/* --- 2 리그 바로가기 — 누르면 **바로 랭킹** ---
               면을 칠하지 않는다. 글자 한 줄이고 진홍은 hover 에만 닿는다. */}
        <nav aria-label="리그 랭킹 바로가기" className="mt-7 max-md:mt-6">
          <ul className="flex flex-wrap items-center justify-center gap-x-7 gap-y-2 max-md:gap-x-5">
            {LEAGUE_SHORTCUTS.map((league) => (
              <li key={league.href}>
                <Link href={league.href} className="block">
                  {/* `a { color: inherit }` 때문에 색은 안쪽 span 에 준다 (D-204) */}
                  <span className="text-[13px] text-meta transition-colors duration-100 hover:text-accent">
                    <LeagueLabel name={league.label} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </section>

      {/* --- 3 꼬리말: 사이트 소개 + 관리자 서약서 ---
             윗머리와 이것 사이의 `<hr>` 은 뺐다. 알 모음집·인기게시글이 있을 때는
             «윗머리와 목록» 을 갈랐는데, 목록이 사라져 가를 것이 없어졌다.
             선만 남기면 아래가 잘려 보인다. 여백으로만 띄운다. */}
      <div className="pb-[var(--section-gap,40px)] pt-[80px] max-md:pt-[56px]">
        <SiteIntro />
      </div>
    </div>
  )
}

/**
 * 못 찾았을 때 무슨 말을 할 것인가 (D-254).
 *
 * 세 갈래다. **셋을 뭉치면 사용자가 자기 입력을 의심한다.**
 * ```
 * 404 아님   서버가 답을 못 줬다        → 「없다」고 말하면 거짓말이다
 * 404 + 알아본 주소   그 선수가 아직 없다
 * 404 + 못 알아봄     오타이거나 다른 사이트 주소다
 * ```
 */
function missMessageFor(type: SearchType, query: string, error: unknown): string {
  /* 404 가 아니면 「없음」이 아니다 — 못 물어본 것이다 */
  if (!(error instanceof ApiError) || error.status !== 404) return SEARCH_FAILED

  const keyword = normalizePastedQuery(query)
  if (!keyword) return SEARCH_FAILED

  /* 붙여넣은 것이 병영수첩에서 온 것임을 알아봤다면, 그 사실을 말해 준다 —
     사용자가 오타를 의심하며 같은 주소를 다시 붙여 넣지 않게 한다 */
  const recognized =
    type === 'player'
      ? isBarracksUrl(keyword) || barracksUsnOf(keyword) !== null
      : type === 'clan'
        ? clanSlugFromBarracksUrl(keyword) !== null
        : false
  return recognized ? SEARCH_MISS_BARRACKS : searchMissMessage(keyword)
}
