'use client'

/**
 * ★리그 홈★ — 깃발 산 + 최근 경기 (2026-09-15 사장님).
 *
 * > «그 깃발꼽는게 귀엽게 각 리그 페이지에
 * >  홈(여기에 최근경기랑 깃발 그래프 다 나옴) 그리고 이제 클랜랭킹 개인랭킹 이런식으로»
 *
 * ── ⚠ ★한 번 없앴던 자리다★
 *   2026-09-01 사장님: «리그홈같은 쓸데없는건 없애버리고 누르면 바로 랭킹 보여줘».
 *   그때 리그홈은 ★보여 줄 것이 없어서★ 없앴다 (리그 소개글 한 장이었다).
 *   지금 되살리는 홈은 ★내용이 있는 홈★ 이다 — 오늘의 깃발과 최근 경기.
 *   옛 리그정보 화면(`/home/info`)은 지우지 않았다 (`CLAUDE.md` 1-4).
 *
 * ── 무엇을 보여 주나
 *   ```
 *   ★오늘의 깃발★   17:00~03:00 의 1·2·3등. 마감되면 1등이 정상에 깃발을 꽂는다
 *   최근 경기        여덟 줄. 더 보려면 「경기」 탭으로
 *   ```
 */
import { use, useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { MatchDetail, MatchListItem } from '@sacloud/contract'
import { leagueScreen } from '@sacloud/contract'
import { FlagMountain, FormTopCard, LeagueTabsInline, SectionTitle, TodayMatchupCard, type FormTopEntry } from '@sacloud/ui'
import { ClanScoreboardV3, MatchCardListV3, MatchListV3 } from '@sacloud/ui'
import Link from 'next/link'
import { apiGet } from '@/lib/api'
import { useCursorQuery } from '@/lib/useCursorQuery'
import { useApiReady } from '@/app/providers'
import { HEX_TOP_ON, HexTopScreen } from '../rank/top5/HexTopScreen'

/** 홈에 보여 주는 최근 경기 줄 수 — 더 보려면 「경기」 탭으로 간다 */
const HOME_MATCHES = 8

/** 깃발판을 얼마나 자주 다시 묻나 — 경쟁 중에는 순위가 계속 바뀐다 */
const FLAG_REFRESH_MS = 60_000

/**
 * ★「최근 폼 1위」 카드를 그릴 것인가★
 *
 * ⚠ ★2026-09-22 — 껐다★ (사장님: 「이거 실시간 상대전적 카드 그냥 최근경기에
 *   ★최근폼 1위 클랜 대신★ 이걸 넣어줘」). 그 자리에 「오늘의 상대전적」이 선다.
 *
 * ★`FormTopCard` 를 지우지 않았다★ (`CLAUDE.md` 1-4) — 컴포넌트도 `formEntries` 계산도
 * 그대로 살아 있다. 이 값을 `true` 로 두면 한 글자로 옛 화면이 돌아온다.
 */
const FORM_TOP_CARD = false as boolean

/**
 * ★맨 위 카드★ (2026-09-24 사장님 「이거(상대전적) 없애고 경기분석에서 라운드별 분석 그거를
 * 여기 펼쳐놔줘(그 날 하루 가장 치열하게 경기한 게임 - 라운드가 많을수록 치열)」).
 *
 * `'heated'` — 오늘 라운드가 가장 많았던 경기를 ★처음부터 펼쳐서★ (경기분석 화면 그대로).
 * `'matchup'` — 옛 「상대전적」(오늘 가장 많이 맞붙은 클랜 한 쌍). 지우지 않았다 — 되돌릴 때 이 값.
 */
const TOP_CARD: 'heated' | 'matchup' = 'heated'

export default function LeagueHomeScreen({
  params,
}: {
  params: Promise<{ leagueSlug: string }>
}) {
  const { leagueSlug } = use(params)
  const ready = useApiReady()
  const queryClient = useQueryClient()

  const league = useQuery({
    queryKey: ['league', leagueSlug],
    queryFn: () => apiGet('leagueShow', { params: { leagueSlug } }),
    enabled: ready,
  })

  const flags = useQuery({
    queryKey: ['league', leagueSlug, 'flags'],
    queryFn: () => apiGet('leagueFlags', { params: { leagueId: leagueSlug } }),
    enabled: ready,
    /* 경쟁 중에는 스스로 다시 묻는다 — «라이브» 가 거짓말이 되면 안 된다 */
    refetchInterval: FLAG_REFRESH_MS,
  })

  /*
   * ★홈 첫 칸★ — 리그마다 다르다 (2026-09-16 사장님: «IPL LLM 두개만 열산은 또
   *   따로 다르게할거야»). 화면에서 slug 를 비교하지 않고 계약이 정한다 (D-204).
   */
  const hero = leagueScreen(leagueSlug).homeHero

  /*
   * ★★오늘의 상대전적 — 여기로 옮겨 왔다★★ (2026-09-22 사장님:
   *   「이거 실시간 상대전적 카드 그냥 ★최근경기에 최근폼 1위 클랜 대신★ 이걸 넣어줘」).
   *
   *   원래 자리는 클랜랭킹 맨 위였다. 그 자리는 ★오늘의 연승·연패★ 가 이어받았다.
   *   ★`FormTopCard` 를 지우지 않았다★ (`CLAUDE.md` 1-4) — `FORM_TOP_CARD` 를
   *   `true` 로 두면 「최근 폼 1위」 가 그대로 돌아온다.
   *
   *   ★60초마다 다시 묻는다★ (사장님: 「새로고침 없이 가능하면 실시간으로」).
   *   열산은 여기 해당이 없다 — 이 리그는 `hero` 가 `form` 이 아니라 깃발이다.
   */
  const todayMatchup = useQuery({
    queryKey: ['league', leagueSlug, 'today-matchup'],
    queryFn: () => apiGet('leagueTodayMatchup', { params: { leagueId: leagueSlug } }),
    enabled: ready && hero === 'form' && TOP_CARD === 'matchup',
    refetchInterval: 60_000,
  })

  /**
   * ★오늘 가장 치열했던 경기★ (2026-09-24 사장님) — 「상대전적」 자리를 대신한다.
   * 라운드 집계(5분 주기)가 갱신될 때마다 순위가 바뀔 수 있어 같은 주기로 다시 묻는다.
   */
  const todayHeated = useQuery({
    queryKey: ['league', leagueSlug, 'today-heated-match'],
    queryFn: () => apiGet('leagueTodayHeatedMatch', { params: { leagueId: leagueSlug } }),
    enabled: ready && hero === 'form' && TOP_CARD === 'heated',
    refetchInterval: 5 * 60_000,
  })

  const daily = useQuery({
    queryKey: ['league', leagueSlug, 'daily-podium'],
    queryFn: () => apiGet('leagueDailyPodium', { params: { leagueId: leagueSlug } }),
    /* 폼 카드를 안 쓰는 리그에서는 아예 묻지 않는다 */
    enabled: ready && hero === 'form',
  })

  const matches = useCursorQuery<MatchListItem>('leagueMatches', ['league', leagueSlug, 'matches'], {
    params: { leagueId: leagueSlug },
  })

  const [expanded, setExpanded] = useState<Record<string, MatchDetail>>({})

  /* 경기 목록 화면과 ★같은 함수 모양★ 이다. 규칙을 새로 만들지 않는다 */
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
   * ★펼치는 손가락을 대신 눌러 준다★ — 치열했던 경기가 오면 클릭 없이 바로 상세를 받아 온다.
   * ⚠ 이 저장소 next build 는 eslint-disable 주석이 「등록 안 된 규칙」 이면 그 자체로 빌드를 깬다
   *   (2026-09-24 실측 — `react-hooks/exhaustive-deps` 를 껐다가 45분간 운영 배포가 멎었다).
   *   그래서 dep 배열에 `loadDetail` 을 안 넣는 대신 ★안에서 매번 새로 안 만든다★ —
   *   `loadDetail` 은 `expanded[matchId]` 가 있으면 그대로 반환하는 멱등 함수라 매 렌더 다시 불러도 안전하다.
   */
  const heatedMatch = todayHeated.data?.data.match ?? null
  useEffect(() => {
    if (heatedMatch) loadDetail(heatedMatch)
  }, [heatedMatch])

  const board = flags.data?.data ?? null

  /*
   * 하루가 몇 % 지났나 — 능선이 그만큼 자란다.
   * ★서버가 준 시각으로 잰다★ — 브라우저 시계가 틀어져 있어도 산은 맞게 그려진다.
   */
  const progress = (() => {
    if (board === null) return 1
    const open = new Date(board.opens_at).getTime()
    const close = new Date(board.closes_at).getTime()
    if (!board.live) return 1
    const now = Date.now()
    if (now <= open) return 0
    if (now >= close) return 1
    return (now - open) / (close - open)
  })()

  /*
   * ★폼 1위 줄 셋★ — 스나 → 클랜 → 라플 (사장님이 «폼1위스나부터» 라고 첫 자리를 못 박음).
   * 없는 줄은 자리를 안 만든다 — 그날 그 무기로 뛴 사람이 없으면 그 줄이 없다 (D-106).
   */
  const formEntries: FormTopEntry[] = (() => {
    const d = daily.data?.data
    if (d === undefined) return []
    const out: FormTopEntry[] = []
    if (d.form_sniper !== null) out.push({ key: 'sniper', label: '스나', row: d.form_sniper })
    const clan = d.clans[0]
    if (clan !== undefined) out.push({ key: 'clan', label: '클랜', row: clan })
    if (d.form_rifle !== null) out.push({ key: 'rifle', label: '라플', row: d.form_rifle })
    return out
  })()

  return (
    <div className="sac-player-page"><div className="pc-container pb-[40px] pt-[16px]">
      {/* ★리그 탭★ — 상단 고정 띠에서 내려왔다 (2026-09-16 사장님) */}
      <LeagueTabsInline leagueSlug={leagueSlug} />
      {/*
        ★열산고용 등록하기★ (2026-09-25 사장님 「열산고용 등록하기 버튼도 만들어줘」).
        열산리그는 「고용 클랜」 리그다(`FEATURED_LEAGUES` 주석) — 신청 종류는 이미 있었다(`ysl-new`)는데
        들어갈 단추가 없었다. cpl 페이지의 「참가 신청서 쓰기」 단추와 같은 자리·같은 뜻이다.
        ★신청 종류 목록(APPLICATION_KINDS_OFFERED)에는 안 넣는다★ — 그건 사장님이 감추기로
        하신 종류들이고(2026-09-24), 이 단추는 그 목록을 거치지 않고 `kind` 를 미리 골라 보낸다.
      */}
      {leagueSlug === 'sanply' ? (
        <div className="mb-[18px]">
          <Link
            prefetch={false}
            href="/apply?kind=ysl-new"
            className="inline-flex items-center rounded-[var(--radius)] border border-[#9fd3b4] bg-[#9fd3b4] px-5 py-2.5 text-[15px] font-bold text-[#0b1f14] transition-opacity hover:opacity-90"
          >
            열산고용 등록하기
          </Link>
        </div>
      ) : null}
      {/*
        ⚠ ★2026-09-16 — 첫 칸이 리그마다 다르다★ (사장님: «최근경기 페이지에서 기존꺼
          지우고 최근 폼1위 파트를 만들어서 (…) IPL LLM 두개만 열산은 또 따로 다르게할거야»).
          열산리그는 ★지금 그대로 깃발★ 이다 — 사장님이 따로 정하신다고 하셨다.
      */}
      {hero === 'form' ? (
        <div className="mb-[22px]">
          {FORM_TOP_CARD ? (
            <FormTopCard
              leagueSlug={leagueSlug}
              day={daily.data?.data.day ?? null}
              entries={formEntries}
            />
          ) : TOP_CARD === 'heated' ? (
            heatedMatch ? (
              <>
                <SectionTitle
                  title="오늘 가장 치열했던 경기"
                  note="라운드가 많이 간 경기일수록 치열합니다."
                />
                <MatchCardListV3
                  style={{ marginTop: 12 }}
                  matches={[heatedMatch]}
                  league={{ category: league.data?.data.category ?? 'independent', slug: leagueSlug }}
                  neutral
                  expanded={expanded}
                  onExpand={loadDetail}
                  initialOpenId={heatedMatch.id}
                  renderDetail={(d) => (
                    <ClanScoreboardV3
                      detail={d}
                      leagueCategory={league.data?.data.category ?? 'independent'}
                      leagueSlug={leagueSlug}
                      winnerFirst
                      /* ★누르지 않아도 라운드 분석이 보인다★ — 폰도 (사장님 「여기 펼쳐놔줘」) */
                      defaultAnalysis="red"
                    />
                  )}
                />
              </>
            ) : todayHeated.data ? (
              <div className="rounded-[var(--radius)] border border-line-soft px-4 py-8 text-center text-[13px] text-meta">
                오늘 아직 라운드 분석이 끝난 경기가 없습니다.
              </div>
            ) : null
          ) : todayMatchup.data ? (
            <TodayMatchupCard matchup={todayMatchup.data.data.matchup} />
          ) : null}
        </div>
      ) : hero === 'none' || board === null ? null : (
        <div className="mb-[22px]">
          <FlagMountain
            leagueSlug={leagueSlug}
            dayKey={board.day_key}
            live={board.live}
            progress={progress}
            slotMinutes={board.slot_minutes}
            timeline={board.timeline}
            rows={board.rows}
            /* 오늘 아직 아무도 없을 때 «어제 꽂은 사람» (2026-09-15 · 무한 QA) */
            previous={board.previous}
          />
        </div>
      )}

      <SectionTitle title="최근 경기" note="줄을 누르면 스코어보드가 펼쳐집니다." />
      <MatchListV3
        leagueSlug={leagueSlug}
        leagueCategory={league.data?.data.category ?? 'independent'}
        matches={matches.items.slice(0, HOME_MATCHES)}
        matchesLoading={matches.loading}
        /* 홈에서는 ★더 불러오지 않는다★ — 더 보려면 「경기」 탭으로 간다 */
        hasMore={false}
        loadingMore={false}
        onLoadMore={() => undefined}
        expanded={expanded}
        onExpand={loadDetail}
      />
      {/* ⚠ ★「경기 전부 보기」를 뺐다★ (2026-09-15 사장님이 경기 탭을 없애라 하셨다).
             링크만 남으면 탭에서 지운 화면으로 다시 들어가게 된다 */}

      {/*
        * ★분야별 TOP5 를 홈으로 들였다★ (2026-09-15 사장님:
        * «각리그 홈에다가 top5를 합쳐줘 / top5랑 경기페이지는 없애버려»).
        *
        * ⚠ ★순서를 바꿨다★ (2026-09-15 · 무한 QA) — 옛 순서는 «깃발 → TOP5 → 최근» 이라
        *   홈에서 제일 자주 볼 «최근 경기» 가 스크롤 끝(6,834px)에 있었다.
        *   지금은 ★깃발 → 최근 경기 → TOP5★ 다.
        *   깃발은 «지금 벌어지는 일», 최근 경기는 «방금 있었던 일»,
        *   TOP5 는 «더 파고들 사람» 용이라 뒤에 둔다.
        */}
      {/* 2026-09-25 사장님 「분야별 탑5도 없애」 — `HEX_TOP_ON`(HexTopScreen.tsx) 하나로 끈다. 코드는 그대로 */}
      {HEX_TOP_ON ? (
        <div className="mt-[26px]">
          <SectionTitle title="분야별 TOP 5" note="축마다 가장 잘하는 다섯입니다." />
          <HexTopScreen leagueSlug={leagueSlug} embedded />
        </div>
      ) : null}

    </div></div>
  )
}
