'use client'

import { use, useEffect, useRef, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { PlayerRankRow, RankWeapon } from '@sacloud/contract'
import { PAGE_SIZE, RANK_WEAPON_LABEL, leagueScreen, parseRankWeapon, showsTier } from '@sacloud/contract'
import {
  DailyPodium,
  FilterChip,
  divisionLabel,
  FormTop3,
  LeagueTabsInline,
  PageHead,
  Pager,
  PlayerRankTable,
  leaguePlayerPath,
  useSeasonLabel,
} from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { useApiReady } from '@/app/providers'
import { PodiumCards } from './PodiumCards'

/**
 * ★시즌 누적 1·2·3등 육각 카드를 그리나★ — 지금은 ★아니다★ (2026-09-15 사장님 지시).
 * 그날 마감 기준 1·2·3등 육각은 리그 홈의 「오늘의 깃발」이 그린다.
 * 부품(`PodiumCards`)은 지우지 않았다 — 이 줄만 `true` 로 바꾸면 돌아온다.
 */
const SEASON_PODIUM_ON = false

/**
 * ★개인랭킹 표를 본문 폭까지 펼 것인가★ (2026-09-17 무한 QA).
 * `false` 로 두면 옛 시안 폭(900px)으로 돌아간다 (`CLAUDE.md` 1-4).
 *
 * ⚠ ★폈다가 되돌렸다★ — 펌더니 빈칸이 ★늘었다★ (2026-09-17 실측).
 *   1440×900 — 표 상자 900 → 1132px 로 넓어졌는데
 *   닉네임 끝과 승률 사이가 ★517 → 814px★ 로 벌어졌다.
 *   바깥 여백이 줄 안쪽으로 옮겨 갔을 뿐이다.
 *   사장님이 짚으신 «빈공간» 이 더 커졌으므로 되돌렸다.
 *
 *   ★메울 값을 세우기 전까지는 좁은 폭이 낫다.★
 *   후보는 `PlayerRankRow` 의 `score`·`hex` 둘인데 둘 다 이 리그가
 *   일부러 칸을 내린 값이라 사장님 판단이 필요하다.
 */
const TABLE_FULL_WIDTH: boolean = false

/**
 * 「개인랭킹」 `/league/{slug}/rank/player`.
 *
 * ══ 2026-09-07 · Part 10 ⑤ — 시안으로 갈아끼웠다 ══
 *
 *   ```
 *   전                                    후 (시안)
 *   ─────────────────────────────────────────────────────────────
 *   제목 + 안내문구 한 줄                  ▬▬ 리그이름 / 개인랭킹 + 설명 + WEAPON 칩
 *   무기 탭 3개 (통합·스나·라플)           ★같은 셋을 칩 하나로★ — 고르는 값은 그대로
 *   (없음)                                1~3위 ★포디움 카드★ 3장
 *   표 (본문 폭 전부)                      표 (★900px★ · 시안 폭)
 *   ```
 *
 *   ★기능은 하나도 안 없앴다.★
 *   무기 축 셋 · 커서 페이지네이션(`더 불러오기`) · 폼 TOP3 · 리그별 칸 구성 ·
 *   닉네임/클랜 링크 · 로딩/오류/재시도 전부 그대로다. `PlayerRankTable` 은
 *   ★한 줄도 안 고쳤다★ — 색은 `.sac-v2` 의 「다리」가 바꾼다.
 *
 *   ★옛 화면은 `PlayerRankScreenV1.tsx` 에 그대로 있다★ (`CLAUDE.md` 1-4).
 *
 * ── 옛 서술 (그대로 남긴다)
 *   기능 두 가지가 여기 붙는다 (D-169, 사용자 지시).
 *     ① 무기 탭 `통합 / 스나 / 라플` — 바꾸면 목록과 폼 TOP3 가 함께 그 축으로 바뀐다
 *     ② 폼 TOP3 — 랭킹 표 위, 탭 아래
 *   탭 상태를 URL 이 아니라 컴포넌트 상태로 둔다 — 부리그 탭과 달리 라우트가 나뉘지 않는다.
 *
 *   2026-09-02 (D-260) — 두 칸 분할을 폐지했다. 분할 화면(`PlayerRankSplit.tsx`)은
 *   지우지 않았다. 이름도 `플레이어 개인랭킹` → `개인순위` → ★개인랭킹★ 으로 두 번 바뀌었다
 *   (O-040 ③ · 사장님: «개인순위>개인랭킹»).
 */
/**
 * ★그날 1·2·3위 카드를 랭킹 화면에도 둘 것인가★ (2026-09-16 사장님이 내리심).
 * 그 자리는 홈의 「최근 폼 1위」 카드 하나로 모았다. `true` 면 옛 모습이 돌아온다.
 */
const DAILY_PODIUM_ON: boolean = false

export default function PlayerRankPage({ params }: { params: Promise<{ leagueSlug: string }> }) {
  const { leagueSlug } = use(params)
  return <SingleLeaguePlayerRank leagueSlug={leagueSlug} />
}

/** 시안의 WEAPON 칩이 고르는 값 — ★옛 무기 탭과 같은 셋★ 이다 */
const WEAPON_OPTIONS: readonly RankWeapon[] = ['all', 'sniper', 'rifle']

/**
 * ★구간 고르개★ — `전체 / ASTRA / CHALLENGER1 / CHALLENGER2` (2026-09-11 사장님).
 *
 * > «개인랭킹 전체/astra/challenger1/challenger2 이렇게 선택해서 볼 수 있게끔해»
 *
 * 고르는 구간은 ★그 선수가 가장 많이 뛴 구간★ 이다 — 클랜 소속이 아니다.
 * 용병으로 다른 티어에서 뛴 판도 점수에는 그대로 들어간다 (구간은 자리만 정한다).
 * 무기 칩과 같은 ★거르개★ 라 점수 순서는 바뀌지 않는다.
 */
type RankTier = 'all' | '1' | '2' | '3'
/**
 * ⚠ ★2026-09-13 — CHALLENGER 를 하나로★ (사장님: «모든 페이지에 있는 challenger1,2
 *   없애고 challenge로 통일해»).
 *
 *   옛 값 `['all', '1', '2', '3']`. 이름을 합치고 나니 고르개에 «CHALLENGER» 가
 *   ★두 개★ 떴다 — 눌러도 뭐가 다른지 알 수 없다.
 *   `'2'` 하나로 두고, 서버가 그것을 ★2와 3 둘 다★ 로 읽는다
 *   (`parseRankTier` · `getPlayerRanksByScore`).
 */
const TIER_OPTIONS: readonly RankTier[] = ['all', '1', '2']

/**
 * ★한 쪽에 몇 명★ — 20명 (2026-09-12 사장님이 고르심).
 *
 * > «개인랭킹은 페이지로 만들고싶어 한페이지에 몇명씩 들어가는게 좋을까?
 * >  (…) 쟤 1페야 ㄴㄴ 쟤 2페이지로 내려감 ㅋㅋㅋ 이런거» → «20명가자»
 *
 * 서버 기본값(`PAGE_SIZE.RANK`)과 ★같은 수★ 라야 «1페 = 1~20위» 가 맞는다.
 * 따로 숫자를 적지 않고 그 값을 그대로 쓴다 — 두 곳이 갈라지지 않게.
 */
const RANK_PER_PAGE = PAGE_SIZE.RANK

function SingleLeaguePlayerRank({ leagueSlug }: { leagueSlug: string }) {
  const [weapon, setWeapon] = useState<RankWeapon>('all')
  /** ★구간 고르개★ — `all` 이면 전체다 (2026-09-11 사장님) */
  const [tier, setTier] = useState<RankTier>('all')
  /** 지금 열려 있는 칩. ★한 번에 하나만★ 열린다 (칩이 상태를 안 갖는 이유) */
  const [openChip, setOpenChip] = useState<'weapon' | 'tier' | null>(null)
  /** ★지금 쪽★ — 1부터. 칩을 바꾸면 1쪽으로 돌아간다 (다른 목록의 3쪽은 뜻이 없다) */
  const [page, setPage] = useState(1)
  /* 보여 줄 칸은 `leagueScreen()` 이 정한다 —
     `10🏔`(`sanply`)는 비공식이라 래더도 순위도 없다 (2026-09-01 사용자 지시) */
  const columns = leagueScreen(leagueSlug).playerColumns
  const ready = useApiReady()

  /**
   * ★쪽 단위로 받는다★ (2026-09-12 사장님). 옛 판은 커서 «더 불러오기» 였다
   * (`useCursorQuery` — 지우지 않았다. 다른 목록이 그대로 쓴다).
   *
   * `keepPreviousData` 로 쪽을 넘길 때 표가 ★안 비워진다★ — 깜빡임 없이 갈린다.
   */
  /** ★오늘의 셋★ — 개인 셋·클랜 셋이 한 응답으로 온다 (2026-09-14) */
  const daily = useQuery({
    queryKey: ['league', leagueSlug, 'daily-podium'],
    queryFn: () => apiGet('leagueDailyPodium', { params: { leagueId: leagueSlug } }),
    enabled: ready,
  })

  const ranksQuery = useQuery({
    /* 무기 축·구간·쪽이 쿼리 키에 들어가야 칩을 바꿀 때 캐시가 섞이지 않는다 */
    queryKey: ['ranks', 'players', 'page', leagueSlug, weapon, tier, page],
    enabled: ready,
    placeholderData: keepPreviousData,
    queryFn: () =>
      apiGet('leagueRankPlayers', {
        params: { leagueId: leagueSlug },
        search: { weapon, page, ...(tier === 'all' ? {} : { tier }) },
      }),
  })
  const rows = ranksQuery.data?.data as readonly PlayerRankRow[] | undefined
  /* 서버가 «모두 몇 줄» 을 같이 보낸다. 못 받으면 쪽 단추를 안 그린다 — 지어내지 않는다 */
  const total = ranksQuery.data?.metadata.total ?? null
  const lastPage = total === null ? 1 : Math.max(1, Math.ceil(total / RANK_PER_PAGE))
  const ranks = {
    items: rows,
    loading: !ready || ranksQuery.isPending,
    error: ranksQuery.isError,
    retry: () => void ranksQuery.refetch(),
  }

  /* 칩을 바꾸면 1쪽으로. 3쪽을 보다 구간을 바꾸면 그 3쪽은 딴 사람들이다 */
  useEffect(() => {
    setPage(1)
  }, [weapon, tier])

  /* 쪽을 넘기면 표 머리로 올린다 — 폰에서 20줄 아래에 그대로 서 있으면 뭐가 바뀐지 모른다 */
  const tableRef = useRef<HTMLDivElement>(null)
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    tableRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [page])

  const form = useQuery({
    queryKey: ['ranks', 'form', leagueSlug, weapon],
    enabled: ready,
    queryFn: () =>
      apiGet('leagueRankForm', { params: { leagueId: leagueSlug }, search: { weapon } }),
  })

  /* 리그 이름·클랜 수. ★리그 레이아웃이 이미 받아 둔 것과 같은 키★ 라
     캐시에서 그대로 나온다 — 요청이 늘지 않는다 */
  const league = useQuery({
    queryKey: ['league', leagueSlug],
    enabled: ready,
    queryFn: () => apiGet('leagueShow', { params: { leagueSlug } }),
  })
  const clanCount = league.data?.data.clan_count

  /*
   * ★지금 시즌★ — `Cloud 0`.
   *
   * ⚠ ★리그 API 의 `season_type` 을 안 쓴다.★ 2026-09-07 실측에서 SPL 만 `beta` 로
   *   남아 있어 같은 시각에 리그마다 다른 시즌 이름이 떴다. 그건 DB 행 문제라
   *   이번 작업에서 안 고친다 — 화면은 ★홈과 같은 자리★(`SEASON_WINDOWS`)를 본다.
   *   자세한 것은 `useSeasonLabel` 주석에.
   */
  const seasonKicker = useSeasonLabel()?.toUpperCase() ?? null

  return (
    <div className="pc-container">
      <div className="pb-[var(--section-gap)] max-md:pb-8">
        {/* ★리그 탭★ — 상단 고정 띠에서 내려왔다 (2026-09-16 사장님) */}
        <LeagueTabsInline leagueSlug={leagueSlug} />
        <PageHead
          /*
           * ★시안의 자리에 무엇을 넣었나★
           *
           *   시안은 여기에 리그 영문 정식명칭(`INDEPENDENT PREMIER LEAGUE`)을 뒀다.
           *   ① 세 리그의 확정 영문명이 없다 — ★지어내지 않는다★
           *   ② 리그 이름은 ★바로 위 히어로 띠가 이미 말하고 있다★ — 같은 말을 두 번 한다
           *
           *   그래서 ★지금 시즌★ 을 넣는다. 실제 값이고, 위에서 안 하는 말이다.
           *   이름은 `seasonDisplayLabel()` 한 곳에서 온다 (`Cloud 0`). 모르면 안 그린다.
           */
          kicker={seasonKicker}
          /* ⚠ 2026-09-16 — 제목은 바로 위 탭이 대신한다 (사장님) */
          title=""
          subtitle={
            <>
              약 1시간마다 갱신
              {/* 클랜 수가 아직 안 왔으면 ★그 조각을 안 그린다★ — 0 을 찍지 않는다 */}
              {clanCount === undefined ? null : ` · ${clanCount.toLocaleString('ko-KR')}개 클랜`}
            </>
          }
          right={
            /* ★구간 + 무기★ 두 칩. 구간 칩은 ★티어가 있는 리그에서만★ 그린다 (2026-09-11 사장님) */
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {/*
              ★티어를 쓰는 리그는 IPL 뿐이다★ (2026-09-12 사장님: «SPL티어 없애 SPL에는 티어가 없어»).
              옛 판은 `division_count >= 2` 만 봤다 — DB 에 부리그 수가 남아 있는 SPL 에도 칩이 떴다.
              규칙은 계약의 `showsTier` 한 곳이다 (`CLAUDE.md` 5장).
            */}
            {showsTier(leagueSlug) && (league.data?.data.division_count ?? 1) >= 2 ? (
              <FilterChip
                kind="구간"
                value={tier}
                options={TIER_OPTIONS}
                labelOf={(value) => (value === 'all' ? '전체' : divisionLabel(Number(value), league.data?.data.category))}
                open={openChip === 'tier'}
                onToggle={() => setOpenChip((now) => (now === 'tier' ? null : 'tier'))}
                onSelect={(value) => {
                  setTier(value)
                  setOpenChip(null)
                }}
              />
            ) : null}
            <FilterChip
              kind="WEAPON"
              value={weapon}
              options={WEAPON_OPTIONS}
              labelOf={(value) => RANK_WEAPON_LABEL[parseRankWeapon(value)]}
              open={openChip === 'weapon'}
              onToggle={() => setOpenChip((now) => (now === 'weapon' ? null : 'weapon'))}
              onSelect={(value) => {
                setWeapon(value)
                setOpenChip(null)
              }}
            />
            </div>
          }
        />

        {/* ★1~3위 포디움★ — 1·2·3위가 다 있을 때만 그린다 */}
        {/*
          ★폰에서는 포디움을 접는다★ (2026-09-10 · 사장님).

          > «카드 한장한장이 너무 크지 않은것도 맘에 듦» · «순위가 모바일에서 한눈에 안보여서»

          390px 실측: 포디움 3장이 ★위에서 1,093px★ 을 먹어
          첫 화면에 1위가 한 명도 안 보였다. 목록 첫 줄이 이미 1위라 같은 것을 두 번 보여 준다.
          ★PC 에서는 그대로 둔다★ — 지우지 않았다 (`CLAUDE.md` 1-4).
        */}
        {/* ★1쪽에서만★ — 2쪽에 21~23위를 포디움으로 세우면 «1등» 처럼 보인다 (2026-09-12) */}
        {/*
          ⚠ ★2026-09-12 — 폰에서도 보인다★ (사장님: «모바일에서도 카드형태로 1,2,3등은
            그래프 넣어서 만들어줘 pc처럼»).

          옛 판은 폰에서 접었다 (2026-09-10 사장님: «순위가 모바일에서 한눈에 안보여서»).
          그때 카드는 ★숫자만★ 이라 목록 첫 줄과 같은 말을 두 번 하는 셈이었다.
          이제 카드마다 육각형이 들어가서 목록에 없는 것을 보여 준다.
        */}
        {/*
          ★오늘의 셋★ (2026-09-14 사장님: «그 날 클랜전한 인원들을 일열로 세워서
          육각축이 고르게 전부 잘한 사람 + 승률도 좋아야함 3명 그리고 3개씩 뽑아서
          올려주는거 어때? 그 날 승률이랑 킬뎃 적어주고 (IPL도 여기에만 예외로 킬뎃 적어줌)»).

          ★첫 쪽에만★ 올린다 — 두 쪽부터는 목록을 보러 온 것이지 오늘을 보러 온 게 아니다.
          그날 경기가 없으면 부품이 스스로 아무것도 안 그린다.
        */}
        {/*
          ⚠ ★2026-09-16 — 「오늘의 선수」 를 내렸다★ (사장님이 화면에 ✕ 를 그어 주심).
            그날 1·2·3위는 ★홈의 「최근 폼 1위」 카드★ 한 곳으로 모은다.
            ★지우지 않는다★ — `DAILY_PODIUM_ON` 을 `true` 로 두면 돌아온다.
        */}
        {DAILY_PODIUM_ON && page === 1 ? (
          <DailyPodium
            day={daily.data?.data.day ?? null}
            rows={daily.data?.data.players ?? []}
            kind="player"
            hrefOf={(row) => (row.player_id === null ? null : leaguePlayerPath(leagueSlug, row.player_id))}
          />
        ) : null}
        {/*
          ⚠ ★맨 위 1·2·3등 육각을 치웠다★ (2026-09-15 사장님:
            «맨위 육각그래프는 1,2,3등껄 보여주는게 아니라 그 날 오전2시마감기준으로
             1,2,3등 육각그래프 보여줘 (…) 기존에 있단 개인랭킹 1,2,3등 육각은 치워버려»).

          이 카드 셋은 ★시즌 누적★ 1·2·3등이었다. 사장님이 보고 싶은 것은
          ★그날(17:00~03:00) 마감 기준★ 1·2·3등이고, 그것은 이제 리그 ★홈★ 의
          「오늘의 깃발」이 그린다 (`FlagMountain`).

          ★부품은 지우지 않았다★ (`CLAUDE.md` 1-4) — `PodiumCards.tsx` 는 그대로 있다.
          되돌리려면 `SEASON_PODIUM_ON` 을 `true` 로 바꾸면 된다.
        */}
        {SEASON_PODIUM_ON && page === 1 ? (
          <div>
          <PodiumCards
            leagueSlug={leagueSlug}
            rows={ranks.items ?? []}
            columns={columns}
            weapon={weapon}
          />
          </div>
        ) : null}

        {/* 폼 TOP3 는 **래더 증감**만 보여 주는 칸이다. 래더가 없는 리그에서는 그리지 않는다.
            ⚠ 시안에는 없다. ★우리 기능이라 지우지 않는다★ (`CLAUDE.md` 1-4) */}
        {/* ⚠ 감싸는 `<div>` 를 두지 않는다 — 폼 TOP3 가 그릴 것이 없을 때
               ★빈 상자에 여백만 26px 남아★ 표가 아래로 밀린다 (2026-09-07 실측).
               옛 화면(V1)도 감싸지 않고 그대로 뒀다 */}
        {/*
          ⚠ ★2026-09-16 — 조건을 `columns.rating` 에서 `scoreLeague` 로 바꿨다★
            (사장님: «랭킹 전부 살려»).
            폼 TOP3 는 ★래더 증감★ 을 보여 주는 칸인데, 막는 조건이 «층 칸을 그리나»
            였다. 2026-09-15 밤에 층을 끄면서 ★세 리그 모두에서 같이 사라졌다.★
            래더가 있는 리그인가(`scoreLeague`)가 맞는 물음이다 — 층을 화면에 적는지와
            래더를 매기는지는 다른 이야기다.
        */}
        {leagueScreen(leagueSlug).scoreLeague ? (
          <FormTop3
            leagueSlug={leagueSlug}
            form={form.data?.data}
            loading={form.isPending}
            error={form.isError}
          />
        ) : null}

        {/*
          ⚠ ★2026-09-17 — 표를 본문 폭까지 폈다★ (무한 QA · 총괄 지시).

            옛 값은 시안 폭 ★900px★ 였다 (`TABLE_W`). 그런데 본문은 1180px 이라
            ★표 양옆이 140px 씩 죽어 있었다★ (1440px 실측: 컨테이너 130~1310 · 표 270~1170).
            바로 옆 탭의 ★클랜랭킹은 본문 폭을 다 쓴다★ — 같은 자리에서 두 표의 폭이 달랐다.

            ⚠ ★맞바꾼 것을 분명히 적어 둔다★ — 이걸로 줄 안쪽이 더 비었다.
              닉네임 끝 ~ 승률 시작:  ★517px → 797px★ (실측)
              죽은 바깥 여백 280px 이 ★줄 안쪽 빈칸으로 옮겨 간 것★ 이다.
              그 빈칸을 메우려면 줄마다 값을 하나 더 세워야 하는데,
              `PlayerRankRow` 에는 지금 화면이 안 쓰는 값이 `score`·`hex` 뿐이고
              둘 다 이 리그에서 칸을 내린 값이라 ★내 판단으로 되살리지 않는다.★

            옛 폭이 필요하면 `TABLE_FULL_WIDTH` 를 `false` 로 (`CLAUDE.md` 1-4).
        */}
        <div
          ref={tableRef}
          className={`mx-auto mt-[30px] w-full scroll-mt-[120px] ${TABLE_FULL_WIDTH ? '' : 'max-w-[900px]'}`}
        >
          <PlayerRankTable
            leagueSlug={leagueSlug}
            weapon={weapon}
            rows={ranks.items}
            loading={ranks.loading}
            error={ranks.error}
            onRetry={ranks.retry}
            columns={columns}
            /* 소속 클랜명 — 닉네임 아래 줄 (2026-09-02 사장님 지시 #10-2) */
            clanName="line"
            /* ★시안: 순위·닉네임을 등급 색으로★ (3 / 20 / 40 / 100). 옛 표는 1위만 강조색 */
            rankTone
            /* ★모집단★ — 색을 «상위 몇 %» 로 칠한다 (2026-09-16 사장님) */
            rankTotal={total}
          />
          {/*
            ★쪽 번호★ (2026-09-12 사장님). 옛 판은 «더 불러오기» 였다 —
            이어 붙이는 목록에는 경계가 없어서 «몇 페이지» 라는 말 자체가 안 생겼다.
          */}
          <Pager
            page={page}
            lastPage={lastPage}
            onSelect={setPage}
            note={total === null ? null : `${total.toLocaleString('ko-KR')}명 · ${lastPage}쪽`}
          />
        </div>
      </div>
    </div>
  )
}
