'use client'

import { use, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { MatchDetail, MatchListItem } from '@sacloud/contract'
import { showsTier } from '@sacloud/contract'
import {
  ClanHexagon,
  ClanHexagonV2,
  ClanHeadCard,
  WeeklyTrendCard,
  ClanMetrics,
  ClanRoundMetrics,
  ClanRoster,
  ClanStatSidebar,
  CLAN_EGG_GUIDE,
  EggVeilPanel,
  MatchCard,
  ProfileEmpty,
  ProfileLoadMore,
  ProfileSkeleton,
  PROFILE_PANEL,
  RecentMatchSummary,
  SectionTitle,
  TeammateTable,
  useClanEgg,
} from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { useApiReady } from '@/app/providers'
import { useCursorQuery } from '@/lib/useCursorQuery'
import { ClanTop3 } from '@/components/clan/ClanTop3'

/**
 * 클랜 기록실 `/league/{slug}/clan/{slug}` — `적진` 팔레트.
 *
 * ── 읽는 순서 (위 → 아래)
 * ```
 * 1  클랜 육각형      여섯 축.  개인 기록실의 전투력 육각형과 같은 자리다
 * 2  라운드 지표      배틀로그에서 나온 숫자들
 * 3  포지션별 명단    클랜원이 어느 자리를 보는가
 * 4  클랜 지표        티어별 승률 · 승률 추이
 * 5  기록            래더 · 전적 · 부리그 · 순위 (예전 우측 `상세정보`)
 * 6  최근 경기        요약 → 경기 카드 목록
 * 7  더 보기          최근 클랜전 플레이어 승률 (접어 둔다)
 * ```
 *
 * 예전에는 3:1 두 칸이었고 지표·명단·경기가 한꺼번에 보였다.
 * 지표가 주인공이 되게 한 줄로 세우고, 마지막 표 하나는 접었다.
 *
 * **바뀐 것은 배치와 겉모습뿐이다.** 부르는 API · 넘기는 값 · 링크가 가는 곳은 그대로다.
 * 재료가 없는 블록은 여전히 `null` 이라 그리지 않는다 (D-106) — 0 으로 채우지 않는다.
 *
 * ── 「알」 (`docs/EGG_SYSTEM_SPEC.md` 2장)
 * ```
 * 가리지 않는다  경기 카드 목록(경기 상세기록) · 포지션별 명단 · 래더 · 부리그 · 순위
 * 가린다        클랜 육각형 · 라운드 지표 · 클랜 지표 · 최근매치 요약 · 승률 · N승N패
 * ```
 * 클랜 알은 클랜원의 30% 가 각자 깨거나, **클랜마스터가 본인 인증에 성공하면** 깨진다.
 */
export default function LeagueClanRecordPage({
  params,
}: {
  params: Promise<{ leagueSlug: string; clanSlug: string }>
}) {
  const { leagueSlug, clanSlug } = use(params)
  const ready = useApiReady()
  /* 이 클랜의 알 (사양 3장) */
  const egg = useClanEgg(clanSlug)
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState<Record<string, MatchDetail>>({})
  const [moreOpen, setMoreOpen] = useState(false)

  const detail = useQuery({
    queryKey: ['league', leagueSlug, 'clan', clanSlug, 'show'],
    queryFn: () => apiGet('leagueClanShow', { params: { leagueSlug, clanSlug } }),
    enabled: ready,
  })

  const matches = useCursorQuery<MatchListItem>(
    'leagueClanMatches',
    ['league', leagueSlug, 'clan', clanSlug, 'matches'],
    { params: { leagueClanId: detail.data?.data.id ?? '' } },
    !!detail.data,
  )

  /**
   * 매치 상세 지연 로드.
   * `league_clan_id`는 "어느 클랜 기준으로 보는지"를 알려준다 — 상대 클랜 소속 플레이어의
   * 딜량·헤드샷을 `알수없음`으로 지우는 데 쓰인다 (docs/DECISIONS.md D-004).
   * 이 값은 매치 자신이 들고 있다.
   */
  const loadDetail = (match: MatchListItem) => {
    const matchId = match.id
    if (expanded[matchId]) return
    const leagueClanId = match.league_clan.league_clan_id
    void queryClient
      .fetchQuery({
        queryKey: ['match', leagueSlug, matchId, leagueClanId],
        queryFn: () =>
          apiGet('matchShow', {
            params: { leagueId: leagueSlug, matchId },
            search: { league_clan_id: leagueClanId },
          }),
      })
      .then((response) => setExpanded((prev) => ({ ...prev, [matchId]: response.data })))
  }

  /*
   * ★로딩과 「없음」을 구분한다★ (2026-09-03 · O-008 ④ · O-033 ② 와 같은 처방).
   *
   * 없는 선수 주소로 들어가면 **푸터만 있는 빈 화면**이었다 (운영 실측).
   * 「없습니다」도 없고, 사람은 기다리다 나간다.
   *
   * ⚠ `isPending` 하나로는 모자란다 — **멈춰 있는 것도 참**이다.
   *   조회가 실패해 재시도를 기다리는데 그때 연결이 끊기면 react-query 가
   *   `fetchStatus: 'paused'` 로 세워 두고, 그러면 `isPending` 이 영영 참이다.
   *   그래서 **「지금 실제로 받아오는 중」일 때만** 스켈레톤을 그린다.
   */
  if (detail.isPending && detail.fetchStatus === 'fetching') {
    return (
      <div className="pc-container pt-[40px]">
        <ProfileSkeleton rows={2} height={180} />
      </div>
    )
  }

  if (!detail.data) {
    /* 받아오는 중이 아닌데 값이 없다 = **없는 것**이다. 스켈레톤을 계속 그리지 않는다 */
    return (
      <div className="pc-container pb-[40px] pt-[40px]">
        <ProfileEmpty message="기록을 찾을 수 없습니다." />
      </div>
    )
  }

  const data = detail.data.data

  return (
    <div className="pc-container pb-[40px]">
      {/* ── 1. 클랜 육각형. 배틀로그가 없으면 `null` 이라 통째로 빠진다
             2026-09-01 (D-217 · D-235 Q9): 육각형은 **새 6축**이 그린다
               스나싸움 · 소수싸움 · 세이브 · 게임템포 · B어택성공 · A어택성공
             옛 6축은 **지우지 않고** 바로 아래에 줄 표기로 남긴다.
             `기본거 없애고` 는 육각형에서 빼라는 말이지 값을 없애라는 말이 아니다
             (`CLAUDE.md` 3장 8번 — 데이터가 사라지면 그것은 결함이다). */}
      {/*
        ── 0. 주간 승률 그래프 + 클랜 정보줄 (2026-09-02 사용자 지시)

        > "클랜정보카드도 수정 / 그래프카드에 일주일 단위 승률기록(개인기록과 동일)
        >  클랜마크/클랜명/소속 / 래더 / 승률-통합 / 순위-색깔체계 선수카드와 동일
        >  이거 보여주고 밑에 육각 그래프"

        선수 카드와 **같은 컴포넌트**를 쓴다 — 선만 승률 하나로 줄인다.
        옛 `ClanStatSidebar` 는 아래에 그대로 살아 있다 (`CLAUDE.md` 10-4).
      */}
      {data.weekly === null ? null : (
        <section className="mt-[40px]">
          <EggVeilPanel state={egg} note={CLAN_EGG_GUIDE}>
            <WeeklyTrendCard weekly={data.weekly} show={['win_rate']} title="주간 승률" />
          </EggVeilPanel>
        </section>
      )}

      <section className="mt-4">
        <ClanHeadCard
          clan={{
            id: data.clan.id,
            slug: data.clan.slug,
            name: data.clan.name,
            mark: data.clan.mark,
            is_official_clan: data.clan.is_official_clan,
          }}
          leagueName={data.league.name}
          leagueCategory={data.league.category}
          division={data.division}
          /* 부리그를 화면에 내지 않는 리그(지시 #9 · D-265 ③). 규칙은 `leagueScreen` 한 곳 */
          showDivision={showsTier(leagueSlug)}
          rating={data.rating}
          placement={data.placement}
          win={data.win}
          lose={data.lose}
          winRate={data.win_rate}
          rank={data.rank}
        />
      </section>

      {data.hexagon_v2 || data.hexagon ? (
        <section className="mt-[40px]">
          <EggVeilPanel state={egg} note={CLAN_EGG_GUIDE}>
            <div className={`${PROFILE_PANEL} px-5 py-4`}>
              {/* 두 쪽 배치 + 왼쪽 위 클랜 TOP3 (지시 #27). TOP3 는 이미 읽은 명단에서 뽑는다 — 왕복 추가 없음.
                  명단이 없으면 자리를 비운다 */}
              {data.hexagon_v2 ? (
                <ClanHexagonV2
                  hexagon={data.hexagon_v2}
                  layout="split"
                  aside={
                    data.roster ? (
                      <ClanTop3
                        clanName={data.clan.name}
                        members={data.roster.members}
                        leagueSlug={leagueSlug}
                      />
                    ) : null
                  }
                />
              ) : null}
              {data.hexagon ? (
                <div className={data.hexagon_v2 ? 'mt-5 border-t border-line-soft pt-1' : ''}>
                  <ClanHexagon hexagon={data.hexagon} variant="list" />
                </div>
              ) : null}
            </div>
          </EggVeilPanel>
        </section>
      ) : null}

      {/* ── 2. 라운드 지표 (SITE_SPEC_V2 5-5절) — 육각형 바로 아래.
             그림으로 형태를 보고 여기서 값을 읽는다 */}
      {data.round_metrics ? (
        <section className="mt-[40px]">
          <EggVeilPanel state={egg}>
            <ClanRoundMetrics metrics={data.round_metrics} />
          </EggVeilPanel>
        </section>
      ) : null}

      {/* ── 3. 포지션별 명단 (SITE_SPEC_V2 5-2 · D-199).
             `클랜원` 탭(`/clan/{slug}/player`)의 명단을 대체하지 않는다 — 별개다 */}
      {data.roster ? (
        <section className="mt-[40px]">
          <ClanRoster roster={data.roster} leagueSlug={leagueSlug} />
        </section>
      ) : null}

      {/* ── 4. 클랜 지표 (SITE_SPEC_V2 5절).
             승률 추이(보름 막대)는 여기서 빠지고 **위의 주간 그래프**가 대신한다 */}
      {data.metrics ? (
        <section className="mt-[40px]">
          <EggVeilPanel state={egg}>
            <ClanMetrics
              metrics={data.metrics}
              leagueSlug={leagueSlug}
              leagueCategory={data.league.category}
              /* 래더가 세는 판수. 이 카드가 세는 판수와 다를 수 있어 나란히 적는다
                 (2026-09-02 사용자 지적 — IPL 은 라인업이 6.3%뿐이라 크게 갈린다) */
              ladderGames={data.win + data.lose}
            />
          </EggVeilPanel>
        </section>
      ) : null}

      {/* ── 5. 기록 — 예전 우측 사이드의 `상세정보` 를 본문 폭으로 내렸다.
             항목·순서·표기는 그대로다 */}
      {/* 카드가 스스로 `상세정보` 제목을 그린다 — 위에 제목을 또 얹지 않는다 */}
      <section className="mt-[40px]">
        <div>
          <ClanStatSidebar
            rating={data.rating}
            placement={data.placement}
            win={data.win}
            lose={data.lose}
            winRate={data.win_rate}
            division={data.division}
            showDivision={showsTier(leagueSlug)}
            rank={data.rank}
            /* 승률 · N승N패만 가린다. 래더 · 부리그 · 순위는 그대로다 (사양 2장) */
            egg={egg}
          />
        </div>
      </section>

      {/* ── 6. 최근 경기.
             클랜 화면의 상대 클랜 줄에는 킬뎃이 없다 (원본 실측 · UI_PARITY_AUDIT 5-7) */}
      <section className="mt-[40px]">
        <SectionTitle title="최근 경기" />
        <div className="mobile-scroll-x mt-4">
          <EggVeilPanel state={egg}>
            <RecentMatchSummary
              summary={data.match_summary}
              leagueSlug={leagueSlug}
              showKdRate={false}
            />
          </EggVeilPanel>
        </div>
        <div className="mt-3">
          {matches.loading ? (
            <ProfileSkeleton rows={3} height={104} />
          ) : matches.items.length === 0 ? (
            <ProfileEmpty message="기록된 경기가 없습니다." />
          ) : (
            matches.items.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                leagueSlug={leagueSlug}
                detail={expanded[match.id]}
                onExpand={loadDetail}
                variant="clan"
              />
            ))
          )}
          {/* 랭킹·게시판과 같은 커서 방식이다. 다음 커서가 없으면 렌더하지 않는다 */}
          {matches.hasMore ? (
            <ProfileLoadMore onClick={matches.loadMore} loading={matches.loadingMore} />
          ) : null}
        </div>
      </section>

      {/* ── 7. 더 보기 — 접어 둔다. 지우지 않는다 */}
      <section className="mt-[40px]">
        <SectionTitle
          title="더 보기"
          note={moreOpen ? undefined : '최근 클랜전 플레이어 승률'}
          action={
            <button
              type="button"
              onClick={() => setMoreOpen((value) => !value)}
              className="text-[12px] text-meta transition-colors hover:text-accent"
            >
              {moreOpen ? '접기' : '펼치기'}
            </button>
          }
        />
        {moreOpen ? (
          <div className="mt-4">
            <TeammateTable title="최근 클랜전 플레이어 승률" teammates={data.teammates} />
          </div>
        ) : null}
      </section>
    </div>
  )
}
