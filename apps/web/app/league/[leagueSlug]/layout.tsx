'use client'

import { use } from 'react'
import { useQuery } from '@tanstack/react-query'
import { isOfficialLeague } from '@sacloud/contract'
/* ★2026-09-07 (Part 10 ③) — 탭바를 v2 로 갈아끼웠다★
   옛 판(`LeagueTopBar`)은 ★그대로★ 있다. 되돌리려면 아래에서 이름만 되돌린다 */
import {
  LeagueHeroBand,
  LeaguePreparing,
  LeagueTopBarV2 as LeagueTopBar,
  isLeaguePreparing,
  leagueDisplayName,
} from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { useApiReady } from '@/app/providers'

/**
 * 리그 화면 공통 레이아웃.
 *
 * 원본은 전역 GNB(4.5rem) 아래에 리그 서브내비(3rem)를 하나 더 고정하고,
 * 본문을 그만큼(`pt-12`) 아래로 민다.
 *
 * 모바일에서는 서브내비가 **두 줄**(리그명 줄 + 탭 줄)이라 그만큼 더 민다 — `pt-24`.
 *
 * ── 준비중인 리그 (D-178)
 *   `isLeaguePreparing(slug)` 이면 **본문을 그리지 않고** 안내만 띄운다.
 *   리그 하위 경로(리그홈 · 클랜랭킹 · 개인랭킹 · 클랜/선수 상세)가 전부 이 레이아웃을
 *   지나므로 여기 한 곳만 막으면 랭킹·집계가 어느 경로로도 나가지 않는다.
 *   페이지마다 조건을 뿌리면 새 경로가 생길 때 빠진다.
 *   서브내비 탭도 그리지 않는다 — 누를 곳을 주면 "준비중인데 왜 탭이 있나" 가 된다.
 */
/* ★히어로 띠★ — 2026-09-10 사장님 목업(v3)에는 없다. 컴포넌트(`LeagueHeroBand`)는 그대로 두고 안 그린다 */
const SHOW_HERO_BAND: boolean = false


/**
 * ★리그 탭을 상단에 고정할 것인가★ (2026-09-16 사장님이 내리심).
 * `false` 면 탭이 본문 맨 위(`LeagueTabsInline`)로 내려가 스크롤과 함께 올라간다.
 * `true` 로 두면 옛 모습(고정 띠 둘)이 그대로 돌아온다.
 */
/*
 * ⚠ ★2026-09-22 밤 — 다시 ★true★ 로 올렸다★ (사장님: 「껍데기는 서플라이랑 똑같은데
 *   몇 가지 기능이 추가된 그런 사이트 / 모든 카드 디자인·색 전부 서플라이랑 똑같이」).
 *
 *   서플라이를 재어 보니 리그 화면 맨 위에 ★고정된 어두운 띄(42px · #292929)★ 가 있고
 *   그 안에 리그이름과 탭 셋이 들어 있다. 우리는 9/16 에 그 띄를 내렸었다 —
 *   그때의 까닭(폰에서 띄 둘이 150px 을 먹음)은 ★띄 높이를 서플라이 값으로
 *   낮춰서★ 푼 간다 — PC 54→42 · 폰 47→35 (`supply-skin.css`).
 *
 *   재본 값: `docs/SUPPLY_MEASURED.md` §1.
 *   ★되돌리려면 이 값을 `false` 로 두면 된다.★ 본문 맨 위 탭(`LeagueTabsInline`)도
 *   그대로 있다 — 지금은 `supply-skin.css` 가 감추고 있을 뿐이다 (`CLAUDE.md` 1-4).
 */
const LEAGUE_TOPBAR_FIXED: boolean = true

export default function LeagueLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ leagueSlug: string }>
}) {
  const { leagueSlug } = use(params)
  const ready = useApiReady()
  const preparing = isLeaguePreparing(leagueSlug)

  const league = useQuery({
    queryKey: ['league', leagueSlug],
    queryFn: () => apiGet('leagueShow', { params: { leagueSlug } }),
    /* 준비중인 리그는 조회조차 하지 않는다. 그려 줄 것이 없는데 요청을 보내면
       응답(랭킹 링크 · 참가 클랜 수)이 클라이언트 캐시에 남는다 */
    enabled: ready && !preparing,
  })

  if (preparing) return <LeaguePreparing />

  const data = league.data?.data

  return (
    <>
      {/*
        ── 2026-09-01 (D-251) — `LeagueSubNav` → `LeagueTopBar` 로 갈아 끼웠다
          탭에서 **리그홈을 뺐다** (사용자 지시). 옛 컴포넌트는 지우지 않았다 —
          `packages/ui/src/league/LeagueSubNav.tsx` 에 그대로 있고, 되돌리려면
          이 import 한 줄만 되돌리면 된다 (`CLAUDE.md` 10-4).

        ⚠ 2026-09-07 (Part 10 ③) — 띠 높이가 바뀌었다: PC 48 → ★54★ · 모바일 96 → ★102★.
        본문 밀림도 같이 바뀌었다. 두 값은 `styles.css` 의 `--spacing-leaguebar*` 한 곳에 있다.
      */}
      {/*
        ⚠ ★2026-09-16 — 고정 띠를 하나로★ (사장님: «위 두번째 바 없애버리고 저 파란색
          원 세개에 각각 나눠서 최근경기 클랜랭킹 개인랭킹 넣어
          (상단고정 드래그내리면 고정돼있어서 안보임)»).

          상단에 고정된 띠가 ★둘★ 이라 폰에서 150px 을 늘 먹고, 스크롤을 내려도
          따라와 화면을 가렸다. 리그 탭은 ★본문 맨 위★(`LeagueTabsInline`)로 내려가
          제목 자리를 겸한다 — 각 화면이 그린다.

          ★부품은 지우지 않았다★ (`CLAUDE.md` 1-4) — `LEAGUE_TOPBAR_FIXED` 를
          `true` 로 두면 옛 모습이 그대로 돌아온다. 본문 밀림도 같이 돌아온다.
      */}
      {LEAGUE_TOPBAR_FIXED ? (
        <LeagueTopBar leagueSlug={leagueSlug} leagueName={leagueDisplayName(leagueSlug, data?.name ?? '')} />
      ) : null}
      <div
        className={
          LEAGUE_TOPBAR_FIXED
            ? 'pt-[var(--spacing-leaguebar-m,102px)] md:pt-[var(--spacing-leaguebar,54px)]'
            : ''
        }
      >
        {/*
          버건디 히어로 띠. 리그 이름이 아직 안 왔으면 **빈 문자열**로 띠만 먼저 깔린다 —
          띠가 나중에 «생겨나면» 본문이 통째로 밀려 내려가 깜빡이는 것처럼 보인다.
        */}
        {SHOW_HERO_BAND ? <LeagueHeroBand
          leagueName={data?.name ?? ''}
          /* 공식/비공식 **표기**는 계약의 표(`leagueScreen`)가 정한다 (#17). `data.official`(DB 열)은
             안 읽는다 — 운영 행이 틀려 IPL 에 「비공식」 이 떴었다. 옛 줄: `official={data?.official}` */
          official={isOfficialLeague(leagueSlug)}
          clanCount={data?.clan_count}
        /> : null}
        {children}
      </div>
    </>
  )
}
