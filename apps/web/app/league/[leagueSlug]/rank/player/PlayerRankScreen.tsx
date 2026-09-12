'use client'

import { use, useEffect, useRef, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { PlayerRankRow, RankWeapon } from '@sacloud/contract'
import { PAGE_SIZE, RANK_WEAPON_LABEL, leagueScreen, parseRankWeapon } from '@sacloud/contract'
import {
  FilterChip,
  divisionLabel,
  FormTop3,
  PageHead,
  Pager,
  PlayerRankTable,
  useSeasonLabel,
} from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { useApiReady } from '@/app/providers'
import { PodiumCards } from './PodiumCards'

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
const TIER_OPTIONS: readonly RankTier[] = ['all', '1', '2', '3']

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
          title="개인랭킹"
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
            {(league.data?.data.division_count ?? 1) >= 2 ? (
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
        {page === 1 ? (
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
        {columns.rating ? (
          <FormTop3
            leagueSlug={leagueSlug}
            form={form.data?.data}
            loading={form.isPending}
            error={form.isError}
          />
        ) : null}

        {/* ★표는 900px★ (시안 `TABLE_W`). 표 자체는 옛 컴포넌트 그대로다 */}
        <div ref={tableRef} className="mx-auto mt-[30px] w-full max-w-[900px] scroll-mt-[120px]">
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
