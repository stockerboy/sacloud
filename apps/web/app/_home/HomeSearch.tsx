'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  SEARCH_FAILED,
  SEARCH_MISS_BARRACKS,
  barracksUsnOf,
  clanSlugFromBarracksUrl,
  isBarracksUrl,
  normalizePastedQuery,
  searchMissMessage,
  type ClanSummary,
} from '@sacloud/contract'
import {
  FEATURED_LEAGUES,
  LeagueLabel,
  MainLogo,
  SEARCH_SUGGEST_ENABLED,
  SUGGEST_CACHE_MAX,
  SUGGEST_DEBOUNCE_MS,
  SUGGEST_MAX_ITEMS,
  SUGGEST_MIN_CHARS,
  SearchBar,
  isLeaguePreparing,
  type SearchSuggestion,
  type SearchType,
} from '@sacloud/ui'
import { ApiError, apiGet } from '@/lib/api'
import { HomeLeagueTiles } from './HomeLeagueTiles'
import { HomeTopPlayers } from './HomeTopPlayers'
import { HomeAnalyzedMatches } from './HomeAnalyzedMatches'
import { HomeLeagueFeatures } from './HomeLeagueFeatures'
import { HomeHeroHead } from './HomeHeroHead'
import { HERO_V2, HERO_V3 } from './heroV2'
import { HomeCatHero } from './HomeCatHero'
import { HomeLeagueButtons } from './HomeLeagueButtons'

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
/**
 * ★첫 화면 가운데 칸에 무엇을 둘 것인가★ (2026-09-16 사장님).
 *
 *   `true`  — 최근 분석 완료 경기 (2026-09-12 ~ 09-16)
 *   `false` — ★리그 셋과 기능 소개★ (지금)
 *
 * 옛 칸을 지우지 않는다 (`CLAUDE.md` 1-4). 한 줄로 되돌아간다.
 */
const HOME_RECENT_ON: boolean = false

const LEAGUE_SHORTCUTS = FEATURED_LEAGUES.filter(
  (league) => !isLeaguePreparing(league.href.split('/')[2] ?? ''),
).map((league) => ({ label: league.label, href: `${league.href}/rank/player` }))

/**
 * 자동완성이 부를 곳 — 검색 종류별로 하나씩 (O-002 · 2026-09-02).
 *
 * ★셋 다 이미 있던 것이다.★ 계약서(`endpoints.ts` 243·257·271행)에 「자동완성」이라고
 * 적힌 채로 운영에서 잘 돌고 있었는데, 화면에서 쓰는 곳이 리그 설정 한 군데뿐이었다.
 * 새로 만든 API 가 없다.
 *
 * 응답을 화면이 쓸 모양(`SearchSuggestion`)으로 바꾸는 것도 여기서 한다 —
 * `packages/ui` 는 API 를 모른다.
 */
const SUGGEST_SOURCE = {
  player: {
    endpoint: 'playersSearch',
    /** 누르면 `/player/{id}` 로 간다 — 제출로 찾았을 때 가던 곳과 **같다** */
    href: (key: string) => `/player/${key}`,
  },
  clan: {
    endpoint: 'clansSearch',
    href: (key: string) => `/clan/${key}`,
  },
  league: {
    endpoint: 'leaguesSearch',
    href: (key: string) => `/league/${key}`,
  },
} as const

/**
 * 자동완성 한 줄에 붙일 클랜을 고른다 (2026-09-10).
 *
 * ★세 종류를 여기 한 곳에서 가른다★ — 화면(`SearchBar`)은 종류를 모른다.
 * 리그는 `{}` 를 돌려주므로 `clan` 칸 자체가 생기지 않고, 그래서 마크 자리도 안 생긴다.
 * ★없는 마크를 지어내지 않는다★ — 모르면 `null` 이고 그 자리에 구름이 그려진다 (D-146).
 */
function clanOf(row: unknown): { clan?: ClanSummary | null } {
  if (typeof row !== 'object' || row === null) return {}
  /* 선수 후보 — 소속 클랜이 붙어 온다 (무소속이면 `null`) */
  if ('clan' in row) return { clan: (row as { clan: ClanSummary | null }).clan }
  /* 클랜 후보 — 자기 자신이 클랜이다. `slug` 를 가진 줄이 클랜·리그인데,
     리그에는 `mark` 가 없으므로 그것으로 가른다 */
  if ('slug' in row && 'mark' in row) return { clan: row as ClanSummary }
  return {}
}

void HomeLeagueTiles
void HomeTopPlayers

export function HomeSearch() {
  const router = useRouter()
  /** 못 찾았을 때 검색창 밑에 띄우는 한 줄. 성공하면 즉시 지운다 (D-254) */
  const [notice, setNotice] = useState<string | null>(null)

  /* ==================== 자동완성 (O-002 · 2026-09-02) ====================
     홈은 엣지 캐시라 서버에 안 닿는데 **자동완성만은 글자마다 DB 로 간다.**
     그래서 규칙 넷을 여기서 전부 건다 — 2글자 · 300ms · 이전 요청 취소 · 캐시.
     값은 `packages/ui/src/home/searchSuggest.ts` 한 곳에서 온다. */
  const [suggestions, setSuggestions] = useState<readonly SearchSuggestion[]>([])
  /** 방금 받아 둔 결과. `Jaehyu → Jaehy → Jaehyu` 처럼 되돌아올 때 요청을 아예 안 낸다 */
  const cacheRef = useRef(new Map<string, readonly SearchSuggestion[]>())
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  /* 홈을 떠날 때 도는 타이머와 나간 요청을 정리한다 */
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      abortRef.current?.abort()
    },
    [],
  )

  const handleQueryChange = useCallback((type: SearchType, query: string) => {
    if (!SEARCH_SUGGEST_ENABLED) return

    /* 앞서 예약된 조회와 이미 나간 요청을 먼저 접는다.
       이게 없으면 늦게 온 옛 응답이 새 응답을 덮어쓴다 */
    if (timerRef.current) clearTimeout(timerRef.current)
    abortRef.current?.abort()

    if (query.length < SUGGEST_MIN_CHARS) {
      setSuggestions([])
      return
    }

    /* 받아 둔 게 있으면 요청을 아예 안 낸다 */
    const cacheKey = `${type}:${query}`
    const cached = cacheRef.current.get(cacheKey)
    if (cached) {
      setSuggestions(cached)
      return
    }

    timerRef.current = setTimeout(() => {
      const controller = new AbortController()
      abortRef.current = controller
      const source = SUGGEST_SOURCE[type]

      void apiGet(source.endpoint, { params: { q: query }, signal: controller.signal })
        .then((found) => {
          const rows = found.data.slice(0, SUGGEST_MAX_ITEMS).map((row) => ({
            /* 선수는 id 로, 클랜·리그는 slug 로 간다 (제출로 찾았을 때와 같은 곳) */
            key: 'slug' in row ? row.slug : row.id,
            name: row.name,
            /* 선수 후보에만 소속 클랜을 붙인다 — 같은 이름이 여럿일 때 그것으로 가른다 */
            sub: 'clan' in row && row.clan ? row.clan.name : null,
            /*
             * ★이름 앞에 그릴 클랜마크★ (2026-09-10 · 사장님 상시 지시).
             *
             * > «클랜명 혹은 선수닉네임 앞에는 언제나 반드시 (…) 클랜마크를 앞에 반드시 달아야한다»
             *
             *   선수 후보  그 선수의 ★소속 클랜★. 무소속이면 `null` → 구름
             *   클랜 후보  ★그 클랜 자신★ — 클랜을 찾는데 마크가 없으면 고르기가 어렵다
             *   리그 후보  클랜이라는 개념이 없다 → ★아예 안 넘긴다★(`undefined`) → 마크 칸이 안 생긴다
             */
            ...clanOf(row),
          }))
          if (cacheRef.current.size >= SUGGEST_CACHE_MAX) cacheRef.current.clear()
          cacheRef.current.set(cacheKey, rows)
          setSuggestions(rows)
        })
        .catch(() => {
          /* 취소된 요청도 여기로 온다. **후보가 없는 것과 조회 실패를 구별하지 않는다** —
             자동완성은 거들 뿐이라 실패해도 아무 말도 하지 않는다.
             「없다」고 말해야 하는 것은 엔터를 눌렀을 때뿐이다 (D-254) */
          setSuggestions([])
        })
    }, SUGGEST_DEBOUNCE_MS)
  }, [])

  /** 후보를 골랐다. 제출로 찾았을 때 가던 곳과 **같은 곳**으로 보낸다 */
  const handlePick = useCallback(
    (type: SearchType, suggestion: SearchSuggestion) => {
      setNotice(null)
      setSuggestions([])
      router.push(SUGGEST_SOURCE[type].href(suggestion.key))
    },
    [router],
  )

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
    setSuggestions([])
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
    /* 여백 (#13-c · 검수 #13-2)
         #3     pt 104 · 로고 42 · pb 72             → 윗머리 높이 ≈ 282 + 검색·링크
         #13-c  pt 72 · 로고 126 · pb 36            → 로고가 84px 커져 랭킹 제목이 **37px 내려갔다** (검수 실측)
         지금   pt 40 · 로고 126 · pb 12 · 안쪽 여백도 줄임 → ≈ 258 + … — 원래보다 확실히 위 */
    /* ★2026-09-07 (Part 10 ④)★ — 시안의 세로 리듬. 위 74 · 로고 아래 38 · 타일 위 16.
       옛 값은 `pt-[40px] pb-[12px]` 였다 */
    <section className="flex w-full flex-col items-center pb-[12px]">
      {/* --- 0 로고 — **3배** (2026-09-02 사장님 지시 #13-a). 42 → 126px · 폰 32 → 96px.
             그 전(#3)에는 «작게. 화면의 주인공은 검색창» 이었다 — 옛 값은 이 줄에 남긴다 --- */}
      {/* `v2-brand` — 로고의 `.my` 만 언제나 빨강 (리그색을 안 따라간다) */}
      {/*
        ⚠ ★2026-09-16 — 폰에서 로고를 줄였다★ (사장님: «모바일 버전에서 메인화면에
          로고가 너무 큼»).

          ★폰에서만★ 줄인다 — PC 높이 110px 는 그대로다.
          폰 84px → ★56px★. 그림이 바뀌면서 가로도 같이 줄었다:

          ```
          옛 벡터 로고(비율 2.885)  84px 높이 → ★242px 폭★  (390px 화면의 62%)
          새 그림 로고(비율 1.808)  56px 높이 → ★101px 폭★  (390px 화면의 26%)
          ```
          아래 여백도 24 → 18 로 같이 줄였다. 로고만 줄이면 그 밑이 휑해진다.

          ★되돌리려면 이 두 줄의 `max-md:` 값을 `h-[84px]` · `mb-[24px]` 로 되돌린다.★
      */}
      {/*
        ⚠ ★2026-09-17 — 코드 배경 시안에서는 이 큰 로고 대신 `Log_ / in SA CLOUD_` 글자다.★
          ★지우지 않았다★ — `heroV2.ts` 의 `HERO_V2` 를 `false` 로 두면 그대로 돌아온다
          (`CLAUDE.md` 1-4). 상단바의 작은 로고는 건드리지 않았다.
      */}
      {/*
        ★2026-09-18 — 「구름 홈」★ (사장님). 로고 하나 + 고양이 애니메이션.
        ⚠ 여백을 안 준다 — 고양이 무대가 검색창에 ★딱 붙어야★ 구름이 검색창 위에 얹힌다.
      */}
      {HERO_V3 ? (
        <HomeCatHero />
      ) : HERO_V2 ? (
        <div className="mb-[18px] w-full max-w-[940px] max-md:mb-[14px]">
          <HomeHeroHead />
        </div>
      ) : (
        <Link href="/" aria-label="3rd cloud 홈" className="v2-brand mb-[38px] block max-md:mb-[18px]">
          <MainLogo className="h-[110px] w-auto text-[var(--color-text-strong,#f6eded)] max-md:h-[56px]" />
        </Link>
      )}

      {/* --- 1 통합검색 — 크고 가운데. 동작은 하나도 바뀌지 않았다 --- */}
      {/* ★시안 검색창은 720px 다★ (`width: 720, maxWidth: '100%'`).
             옛 값은 `mt-6 w-full` — 본문 폭을 다 썼다 */}
      {/* ★코드 배경 시안에서는 검색창이 아래 리그 칸과 ★같은 폭★ 이다 (940px).
             옛 값 720 은 아래 `maxWidth` 에 그대로 살아 있다 (`CLAUDE.md` 1-4) */}
      <div
        className={
          HERO_V3 ? 'w-full max-w-[720px]' : HERO_V2 ? 'w-full max-w-[940px]' : 'w-full max-w-[720px]'
        }
      >
        <SearchBar
          /* ★시안 홈 검색창은 720px★ (`width: 720`). 기본값 560 은 그대로 살아 있다 */
          maxWidth={HERO_V3 ? 720 : HERO_V2 ? 940 : 720}
          /* ★구름 껍데기★ (2026-09-18) — 둥근 유리. 동작은 한 줄도 안 건드렸다 */
          cloud={HERO_V3}
          /* ★터미널 껍데기★ — 껍데기만 바뀐다. 동작은 한 줄도 안 건드렸다 */
          terminal={!HERO_V3 && HERO_V2}
          sweep
          onSubmit={handleSearch}
          notice={notice}
          suggestions={suggestions}
          onQueryChange={handleQueryChange}
          onPick={handlePick}
        />
      </div>

      {/* --- 2 리그 바로가기 ---
             ★2026-09-07 (Part 10 ④)★ — 버튼 셋을 ★시안의 타일 셋★ 으로 바꿨다.
             ★가는 곳은 그대로다★ (`/league/{slug}/rank/player`).
             옛 버튼 모습은 아래 `LeagueShortcutButtons` 에 ★그대로 남겼다★ (`CLAUDE.md` 1-4) —
             되돌리려면 이 한 줄을 `<LeagueShortcutButtons />` 로 바꾸면 된다. */}
      {/*
        ⚠ ★2026-09-12 — 리그 단추 셋을 상단바로 올렸다★ (사장님: «저거 다 상단바에 올려줘»).
          `HomeLeagueTiles` 파일은 ★그대로 있다★ — 되살리려면 이 줄만 되돌린다
          (`CLAUDE.md` 1-4). 그 자리에는 부문별 1위 판이 들어간다.
      */}
      {/* ⚠ 2026-09-12 — 「부문별 1위」를 「최근 분석 완료 경기」로 바꿨다 (사장님).
          HomeTopPlayers 는 지우지 않았다 (CLAUDE.md 1-4) */}
      {/*
        ⚠ ★2026-09-16 — 「최근 경기」를 내리고 ★리그 셋★ 을 올렸다★ (사장님:
          «메인화면에 최근경기 없애고 pl ipl 열산리그 세개로 카텍 나눠서 클릭하면
           모든기능 (…) 깔아놓고 리그별로 제공하는 기능별 예시 전부 보여주고
           제공되지 않는 기능은 미제공 이라고 해줘»).

          ★왜 바꿨나★ — 「최근 경기」는 ★이미 우리를 아는 사람★ 만 쓸 수 있는 칸이었다.
          처음 온 사람은 이 사이트가 무엇을 해 주는지 첫 화면에서 알 길이 없었다.

          ★지우지 않는다★ (`CLAUDE.md` 1-4) — `HOME_RECENT_ON` 을 `true` 로 두면
          최근 경기가 그대로 돌아온다. 파일도 import 도 남아 있다.
      */}
      {/*
        ⚠ ★2026-09-18 — 「리그 참가신청 3장」을 걷어 냈다★ (사장님:
          「메인에 저거 밑에 리그 참가신청 저거 3장 전부 없애고 IPL PL 열산리그
           이렇게 버튼 세개 만들고 누르면 개인랭킹 , 클랜랭킹 , 최근경기 이렇게 나오고
           누를 수 있게 해줘」).

          ★`HomeLeagueFeatures` 는 지우지 않았다★ (`CLAUDE.md` 1-4) — `HERO_V3` 를
          `false` 로 두면 기능 소개와 참가 신청 단추가 그대로 돌아온다.
      */}
      {HERO_V3 ? (
        <HomeLeagueButtons />
      ) : HOME_RECENT_ON ? (
        <HomeAnalyzedMatches />
      ) : (
        <HomeLeagueFeatures />
      )}
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

/**
 * ★옛 리그 바로가기 버튼 셋★ (2026-09-02 지시 #13-b ~ 2026-09-07).
 *
 * Part 10 ④ 에서 시안의 타일로 바뀌었다. ★지우지 않는다★ (`CLAUDE.md` 1-4).
 * 되돌리려면 위 `<HomeLeagueTiles />` 를 `<LeagueShortcutButtons />` 로.
 */
export function LeagueShortcutButtons() {
  return (
    <nav aria-label="리그 랭킹 바로가기" className="mt-5 w-full max-md:mt-4">
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
  )
}
