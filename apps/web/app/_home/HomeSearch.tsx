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
  isLeaguePreparing,
  type SearchType,
} from '@sacloud/ui'
import { ApiError, apiGet } from '@/lib/api'

/**
 * 홈 윗머리 — `0 로고 · 1 통합검색 · 2 리그 바로가기`.
 *
 * 2026-09-02 에 `app/page.tsx` 에서 **그대로 떼어 왔다.** 홈이 서버 컴포넌트가 되면서
 * (아래에 DB 를 읽는 랭킹·최근 경기가 붙었다) 검색 상태(`useState` · `useRouter`)를
 * 가진 이 부분만 클라이언트로 남긴다. **동작은 한 줄도 바뀌지 않았다** — 검색 종류 셋 ·
 * 제출 흐름 · 못 찾았을 때의 문구(D-254) · 리그 바로가기 전부 그대로다.
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

export function HomeSearch() {
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
    /* ================= 0 로고 · 1 검색 · 2 리그 바로가기 =================
       배경을 칠하지 않는다. 페이지 바탕(`--color-page`) 위에 글자와 선만 있다. */
    /* 아래 여백은 #13-c 로 절반이 됐다 (72 → 36 · 폰 56 → 28) — 랭킹 섹션이 검색 바로 아래 붙는다 */
    <section className="flex flex-col items-center pb-[36px] pt-[72px] max-md:pb-[28px] max-md:pt-[48px]">
      {/* --- 0 로고 — **3배** (2026-09-02 사장님 지시 #13-a). 42 → 126px · 폰 32 → 96px.
             그 전(#3)에는 «작게. 화면의 주인공은 검색창» 이었다 — 옛 값은 이 줄에 남긴다 --- */}
      <Link href="/" aria-label="3rd cloud 홈" className="block">
        <MainLogo className="h-[126px] w-auto text-[var(--color-text-strong,#f6eded)] max-md:h-[96px]" />
      </Link>

      {/* --- 1 통합검색 — 크고 가운데. 동작은 하나도 바뀌지 않았다 --- */}
      <div className="mt-9 w-full max-md:mt-7">
        <SearchBar onSubmit={handleSearch} notice={notice} />
      </div>

      {/* --- 2 리그 바로가기 — 누르면 **바로 랭킹** ---
             2026-09-02 사장님 지시 #13-b: «누르고 싶게» — 글자 링크 셋을 **버튼 셋**으로.
             `.btn-line`(테두리 · 투명 바탕) 위에 크기만 얹었다. 색은 `--color-accent` 토큰뿐이고
             hover 에서 테두리·글자에 닿는다. 면을 칠하지 않는다. 폰에서는 셋이 한 줄에 나란히.
             옛 모습(#3 · 13px 글자 링크 `text-meta` + hover 강조)은 지웠지만 동작은 같다 — 가는 곳 그대로. */}
      <nav aria-label="리그 랭킹 바로가기" className="mt-8 w-full max-md:mt-6">
        <ul className="flex flex-wrap items-center justify-center gap-3 max-md:flex-nowrap max-md:gap-2">
          {LEAGUE_SHORTCUTS.map((league) => (
            <li key={league.href} className="max-md:min-w-0 max-md:flex-1">
              <Link
                href={league.href}
                className="btn-line group h-12 min-w-[132px] px-6 text-[15px] font-bold tracking-wide hover:border-accent max-md:h-11 max-md:w-full max-md:min-w-0 max-md:px-2"
              >
                {/* `a { color: inherit }` 때문에 색은 안쪽 span 에 준다 (D-204) */}
                <span className="text-text-strong transition-colors duration-100 group-hover:text-accent">
                  <LeagueLabel name={league.label} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </section>
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
