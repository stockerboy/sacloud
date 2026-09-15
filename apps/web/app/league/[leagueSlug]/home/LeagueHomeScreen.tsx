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
import { use, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { MatchDetail, MatchListItem } from '@sacloud/contract'
import { FlagMountain, SectionTitle } from '@sacloud/ui'
import { MatchListV3 } from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { useCursorQuery } from '@/lib/useCursorQuery'
import { useApiReady } from '@/app/providers'

/** 홈에 보여 주는 최근 경기 줄 수 — 더 보려면 「경기」 탭으로 간다 */
const HOME_MATCHES = 8

/** 깃발판을 얼마나 자주 다시 묻나 — 경쟁 중에는 순위가 계속 바뀐다 */
const FLAG_REFRESH_MS = 60_000

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

  return (
    <div className="pc-container pb-[40px] pt-[24px]">
      {board === null ? null : (
        <div className="mb-[22px]">
          <FlagMountain
            leagueSlug={leagueSlug}
            dayKey={board.day_key}
            live={board.live}
            progress={progress}
            slotMinutes={board.slot_minutes}
            timeline={board.timeline}
            rows={board.rows}
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
      <div className="mt-[14px] text-center">
        <a
          href={`/league/${leagueSlug}/match`}
          className="text-[12.5px] text-[var(--v2-text-muted,#8fa0bd)] underline decoration-[rgba(255,255,255,.18)]"
        >
          경기 전부 보기
        </a>
      </div>
    </div>
  )
}
