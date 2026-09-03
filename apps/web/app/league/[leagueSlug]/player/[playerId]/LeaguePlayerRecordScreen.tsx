'use client'

import { use, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { MatchDetail, MatchListItem } from '@sacloud/contract'
import {
  EggVeilPanel,
  MatchCard,
  PlaystyleBars,
  PlayerHeadCard,
  WeeklyTrendCard,
  mainWeaponFromStats,
  ProfileEmpty,
  ProfileLoadMore,
  ProfileSkeleton,
  RecentMatchSummary,
  SectionTitle,
  TeammateTable,
  TierBreakdown,
  TraitHexagon,
  usePlayerEgg,
  EGG_BREAK_GUIDE,
} from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { useApiReady } from '@/app/providers'
import { useCursorQuery } from '@/lib/useCursorQuery'

/**
 * 개인 기록실 `/league/{slug}/player/{id}` — `적진` 팔레트.
 *
 * ── 읽는 순서 (위 → 아래)
 * ```
 * 1  전투력          육각형 여섯 축.  이 화면의 주인공이다
 * 2  플레이스타일     블루/레드 축 바
 * 3  기록            래더 · 전적 · 킬뎃 (예전 우측 `상세정보`)
 * 4  최근 경기        오늘 기록 + 최근매치 요약 → 경기 카드 목록
 * 5  더 보기          티어별 게임빈도 · 최근 같이한 플레이어 (접어 둔다)
 * ```
 *
 * 예전에는 3:1 두 칸에 여섯 덩어리를 한꺼번에 쏟았다. 육각형 옆에 상세정보가 붙고
 * 그 아래로 바 · 최근매치 · 경기 · 티어 · 같이한 플레이어가 동시에 보였다.
 * 지표가 주인공이 되게 **한 줄로 세우고**, 덜 중요한 두 표는 접었다.
 *
 * **바뀐 것은 배치와 겉모습뿐이다.** 부르는 API · 넘기는 값 · 링크가 가는 곳은 그대로다.
 * 육각형 · 바 · 오늘 줄은 원본에 없는 화면이고, 값이 없는 축은 여전히 0 이 아니라
 * `측정중` 으로 남는다 (D-106 · D-185 · D-186).
 *
 * ── 「알」 (`docs/EGG_SYSTEM_SPEC.md` 2장)
 * ```
 * 가리지 않는다  경기 카드 목록(경기 상세기록) · 최근 같이한 플레이어
 * 가린다        전투력 육각형 · 플레이스타일 · 최근매치 요약(승률·오늘) · 티어별 게임빈도
 *               상세정보의 승률 · N승N패 · 킬뎃 · 평균킬
 * ```
 * 가려도 **값을 지우지 않는다.** 자리와 크기를 그대로 두고 읽지 못하게만 한다 —
 * 비어 있으면 없는 줄 알지만, 덮여 있으면 궁금해진다.
 *
 * > `[미확인]` 사양 2장의 *"그 밖에 우리가 만든 지표"* 의 정확한 목록은 아직 확정되지
 * > 않았다. 지금은 **지표성 카드**(육각형 · 플레이스타일 · 오늘 · 티어빈도)까지 가리고,
 * > **관계 정보**(같이한 플레이어)는 가리지 않는다. 사용자 확인이 필요하다.
 */
export default function LeaguePlayerRecordPage({
  params,
}: {
  params: Promise<{ leagueSlug: string; playerId: string }>
}) {
  const { leagueSlug, playerId } = use(params)
  const ready = useApiReady()
  /* 이 선수의 알 — 본인이 인증해 깨야 기록이 열린다 (사양 3장) */
  const egg = usePlayerEgg(playerId)
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState<Record<string, MatchDetail>>({})
  /* 덜 중요한 표는 기본으로 접는다 — 화면을 한 번에 다 쏟지 않기 위해서다 */
  const [moreOpen, setMoreOpen] = useState(false)

  const detail = useQuery({
    queryKey: ['league', leagueSlug, 'player', playerId],
    queryFn: () => apiGet('leaguePlayerShow', { params: { leagueSlug, playerId } }),
    enabled: ready,
  })

  const matches = useCursorQuery<MatchListItem>(
    'leaguePlayerMatches',
    ['league', leagueSlug, 'player', playerId, 'matches'],
    { params: { leagueId: leagueSlug, playerId } },
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

  /* 로딩과 "없음"을 구분한다.
     예전에는 둘 다 스켈레톤이라, 조회가 404를 내면 화면이 **영원히 로딩 중**으로 보였다.
     실제로 이 리그 선수 전원이 그 상태였다 (D-117). */
  /* ⚠ `isPending` 은 **멈춰 있는 것도 참**이다 (O-033 ②). 「지금 받아오는 중」만 로딩으로 친다 */
  if (detail.isPending && detail.fetchStatus === 'fetching') {
    return (
      <div className="pc-container pt-[40px]">
        <ProfileSkeleton rows={2} height={180} />
      </div>
    )
  }

  if (!detail.data) {
    return (
      <div className="pc-container pt-[40px]">
        <ProfileEmpty message="기록을 찾을 수 없습니다." />
      </div>
    )
  }

  const data = detail.data.data

  return (
    /*
     * ★`sa-skin` — 시안 톤 껍데기★ (O-050 2단계 · 2026-09-03).
     *
     * 사장님: «만약 선수카드 시안이 나로부터 통과되면
     *          ★시안에 쓴 텍스쳐와 글씨 글자색 전부 똑같이 써서★ 사이트의 분위기를 통일해라»
     * → «3회전차 껄로 해» 로 통과됐다.
     *
     * ⚠ ★바꾼 것은 톤뿐이다 — 값도 배치도 한 개도 안 지웠다.★
     *   사장님 말씀이 「텍스쳐·글씨·글자색」이고, 시안은 ★다른 정보 구조★ 다
     *   (육각형·플레이스타일·알·티어별이 시안에 없다). ★그걸 지우는 건 시안이 시킨 게 아니다.★
     *
     * ⚠ ★이 클래스 하나가 경계다.★ 안쪽만 시안 값으로 다시 칠해지고 ★바깥은 그대로다.★
     *   「이 톤 아니다」가 나오면 ★이 클래스만 지우면 원래 화면이다★ (CLAUDE.md 1-4).
     *   자세한 것은 `packages/ui/src/styles.css` 의 `.sa-skin` 주석.
     */
    <div className="sa-skin pc-container pb-[40px]">
      {/* ── 1. 전투력 — 이 화면에서 제일 먼저 보여 주고 싶은 것 */}
      {data.traits === null ? null : (
        /* 카드가 스스로 `전투력` 제목을 그린다 — 위에 제목을 또 얹지 않는다 */
        <section className="mt-[40px]">
          <EggVeilPanel state={egg} note={EGG_BREAK_GUIDE}>
            <TraitHexagon traits={data.traits} />
          </EggVeilPanel>
        </section>
      )}

      {/* ── 2. 플레이스타일 */}
      {data.playstyle === null ? null : (
        <section className="mt-[40px]">
          <EggVeilPanel state={egg}>
            <PlaystyleBars playstyle={data.playstyle} />
          </EggVeilPanel>
        </section>
      )}

      {/*
        ── 3. 주간 추이 그래프 + 정보줄 (2026-09-02 사용자 지시)

        > "기존선수카드 삭제 및 그래프카드 추가
        >  (개인기록SPL,IPL,열산 모두 전부 적용-열산 차별x)"

        **세 리그가 같은 화면을 쓴다.** 리그별로 칸을 감추는 분기를 여기 만들지 않는다
        (`CLAUDE.md` 9장). 무소속리그의 킬뎃 제한은 화면이 아니라 **서버가 순위로** 갈라
        `null` 을 주고, 정보줄이 그 사실을 문구로만 옮긴다.

        옛 `PlayerStatSidebar` 는 **지우지 않았다** — 컴포넌트도 계약도 그대로 살아 있고
        이 화면이 부르지 않을 뿐이다 (`CLAUDE.md` 10-4).
      */}
      {data.weekly === null ? null : (
        <section className="mt-[40px]">
          <EggVeilPanel state={egg} note={EGG_BREAK_GUIDE}>
            <WeeklyTrendCard
              weekly={data.weekly}
              rankNote="순위 변동은 주간 기록이 쌓이면 함께 그려집니다."
            />
          </EggVeilPanel>
        </section>
      )}

      <section className="mt-4">
        <PlayerHeadCard
          playerName={data.player.name}
          rating={data.rating}
          placement={data.placement}
          win={data.win}
          lose={data.lose}
          winRate={data.win_rate}
          /* 포지션 (D-199) — 본인이 넣은 값이면 `라플(숏포지)`, 아니면 주무기 한 단어 */
          mainWeapon={mainWeaponFromStats(data.weapon_stats)}
          positionLabel={data.position_label}
          positionSource={data.position_source}
          sniper={{
            games: data.sniper_games,
            knownGames: data.sniper_known_games,
            kill: data.sniper_kill,
            kdRate: data.sniper_kd_rate,
          }}
          rifle={{
            games: data.rifle_games,
            knownGames: data.rifle_known_games,
            kill: data.rifle_kill,
            kdRate: data.rifle_kd_rate,
          }}
          rank={data.rank}
          rankCount={data.rank_count}
          clan={data.clan}
          restrictsKd={data.league.hides_cumulative_kd}
        />
      </section>

      {/* ── 4. 최근 경기 — 요약(오늘 기록 포함) 다음에 그 근거인 경기가 이어진다.
             `today` 를 넘기면 승률 도넛 자리에 **오늘 기록**이 들어간다 (D-186) */}
      <section className="mt-[40px]">
        <SectionTitle title="최근 경기" />
        <div className="mobile-scroll-x mt-4">
          <EggVeilPanel state={egg}>
            <RecentMatchSummary
              summary={data.match_summary}
              leagueSlug={leagueSlug}
              today={data.today}
              days={data.recent_days}
            />
          </EggVeilPanel>
        </div>
        <div className="mt-3">
          {matches.loading ? (
            <ProfileSkeleton rows={3} height={104} />
          ) : matches.items.length === 0 ? (
            /* O-040 ⑤ — 옛 글자 「기록된 경기가 없습니다」 */
            <ProfileEmpty message="아직 경기가 없습니다." />
          ) : (
            matches.items.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                leagueSlug={leagueSlug}
                detail={expanded[match.id]}
                onExpand={loadDetail}
              />
            ))
          )}
          {/* 랭킹·게시판과 같은 커서 방식이다. 다음 커서가 없으면 렌더하지 않는다 */}
          {matches.hasMore ? (
            <ProfileLoadMore onClick={matches.loadMore} loading={matches.loadingMore} />
          ) : null}
        </div>
      </section>

      {/*
        ── 5. 더 보기 — 접어 둔다.
        티어별 게임빈도와 최근 같이한 플레이어는 **읽는 순서의 끝**이다.
        지우지 않는다. 누르면 그대로 나온다.

        `무기별 기록`(`WeaponStatPanel`) 은 예전에 뺀 그대로다 — 컴포넌트와 계약 필드
        (`weapon_stats` · `sniper_*` · `rifle_*`)는 살아 있고 화면만 부르지 않는다.
      */}
      <section className="mt-[40px]">
        <SectionTitle
          title="더 보기"
          note={moreOpen ? undefined : '티어별 게임빈도 · 최근 같이한 플레이어'}
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
          <div className="mt-4 grid grid-cols-2 gap-3 max-md:grid-cols-1">
            {/* 부리그/티어 표기는 리그 구분이 정한다 (D-165) — 화면이 임의로 고르지 않는다 */}
            <EggVeilPanel state={egg}>
              <TierBreakdown
                rows={data.tier_breakdown}
                leagueSlug={leagueSlug}
                leagueCategory={data.league.category}
              />
            </EggVeilPanel>
            <TeammateTable title="최근 같이한 플레이어" teammates={data.teammates} />
          </div>
        ) : null}
      </section>
    </div>
  )
}
