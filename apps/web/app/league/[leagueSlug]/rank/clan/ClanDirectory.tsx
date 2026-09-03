'use client'

import { useEffect, useMemo, useState } from 'react'
import type { LeagueClan } from '@sacloud/contract'
import { leagueScreen } from '@sacloud/contract'
import type { ClanRankTableRow } from '@sacloud/ui'
import { ClanRankTable, ClanSearchBox, EmptyState, RankBox, RankHeader } from '@sacloud/ui'
import { useCursorQuery } from '@/lib/useCursorQuery'

/**
 * 「고용가능 클랜」 — `/league/{slug}/rank/clan` (2026-09-02 사용자 지시 · D-260).
 *
 * > "SPL 리그 누르면 두가지 메뉴 첫번째가 클랜 -1부2부 분류 체계 아예 없애기 1,2부라는 개념x"
 * > "클랜순위는 없애고 고용가능 클랜 이라는 항목으로 소속된 클랜 전부 보여주기
 * >  검색기능 만들기(얘만 , 클랜수가 많기 때문에 검색기능 만들어주기)"
 *
 * ── 무엇이 바뀌었나
 *   ```
 *   전     클랜랭킹 — SPL(왼쪽)·IPL(오른쪽) 두 칸 · 순위 1,2,3… · 부리그/티어 구분선
 *   지금   고용가능 클랜 — **그 리그 하나** · 순위 없음 · 이름순 · 검색창
 *   ```
 *
 * ── **값을 없애지 않았다** (`CLAUDE.md` 3장 8번)
 *   승률 · N승N패 · 래더 · 클랜마크는 예전 표 그대로다. 표도 같은 `ClanRankTable` 이다.
 *   빠진 것은 **순위 숫자 한 칸**뿐이고, 그건 사용자가 없애라고 한 「클랜순위」다.
 *
 * ── 왜 랭킹 API(`leagueRankClans`)가 아니라 참가 클랜 API(`leagueClans`) 인가
 *   랭킹 질의는 `placement: false` 로 거른다. 실측(2026-09-02)으로 SPL 63곳 중 19곳,
 *   IPL 43곳 중 4곳이 그 조건에 걸려 **랭킹에 아예 나오지 않는다.**
 *   사용자가 요구한 것은 「소속된 클랜 **전부**」라서 그 필터가 있으면 안 된다.
 *   `leagueClans` 는 추방·비활성만 빼고(`ACTIVE_CLAN`) 전부 준다 — 그래서 이쪽을 쓴다.
 *   **랭킹 질의는 한 줄도 건드리지 않았다.**
 *
 * ── 검색은 브라우저가 한다
 *   목록을 한 번에 다 받아 두고(`size`) 거기서 거른다. 서버에 검색을 새로 만들지 않았다 —
 *   리그당 수십~수백 곳이라 그럴 필요가 없고, 계약(`packages/contract`)도 안 건드린다.
 *   상한(400)에 걸려 남은 쪽이 있으면 **자동으로 이어 받는다.** 다 받기 전에 검색하면
 *   덜 받은 클랜이 안 걸리므로, 다 받을 때까지 개수를 「불러오는 중」으로 둔다.
 *
 * ── 정렬은 **이름 가나다순**이다
 *   래더순으로 두면 순위 숫자만 지운 랭킹표가 된다 — 사용자가 없애라고 한 그것이다.
 *   찾으러 오는 화면이니 이름순이 맞다. 래더 값은 칸에 그대로 있다.
 */
export function ClanDirectory({ leagueSlug }: { leagueSlug: string }) {
  const [query, setQuery] = useState('')

  /* 한 번에 다 받는다. 400 은 라우트의 상한과 같은 값이다 —
     넘치면 아래 `useEffect` 가 커서를 따라 이어 받는다 */
  const clans = useCursorQuery<LeagueClan>(
    'leagueClans',
    ['league', leagueSlug, 'clans', 'directory'],
    { params: { leagueSlug }, search: { size: 400 } },
  )

  /* 남은 쪽을 자동으로 이어 받는다. **검색이 전체를 보려면 전체가 손에 있어야 한다** */
  const { hasMore, loadingMore, loadMore } = clans
  useEffect(() => {
    if (hasMore && !loadingMore) loadMore()
  }, [hasMore, loadingMore, loadMore])

  const complete = !clans.loading && !hasMore

  /* 이름 가나다순. 한글·영문·기호가 섞여 있어 `localeCompare('ko')` 로 맞춘다 */
  const sorted = useMemo(
    () => [...clans.items].sort((a, b) => a.clan.name.localeCompare(b.clan.name, 'ko')),
    [clans.items],
  )

  const filtered = useMemo(() => sorted.filter(matches(query)), [sorted, query])

  /**
   * 표는 랭킹표를 그대로 쓴다. 모양만 맞춘다.
   * `rank` 는 화면에서 감추지만(`rank: false`) 타입이 요구하는 값이라 자리(1부터)를 넣는다 —
   * **지어낸 순위가 화면에 나가지 않는다.**
   */
  const rows: ClanRankTableRow[] = useMemo(
    () =>
      filtered.map((row, index) => ({
        rank: index + 1,
        league_clan_id: row.id,
        clan: row.clan,
        division: row.division,
        win: row.win,
        lose: row.lose,
        win_rate: row.win_rate,
        rating: row.rating,
      })),
    [filtered],
  )

  /* 칸 구성은 `leagueScreen()` 이 정한다. 여기서 **순위 칸만** 내린다 (D-204 —
     리그별 분기를 화면에 뿌리지 않는다. 이건 리그 분기가 아니라 이 화면의 성격이다) */
  const columns = { ...leagueScreen(leagueSlug).clanColumns, rank: false }

  const searching = query.trim().length > 0

  return (
    <div className="pc-container">
      {/* 좁은 화면에서는 좌우 안쪽 여백을 없앤다 — `.mobile-bleed`(표)가 화면 끝까지 가도록 */}
      <div className="py-[var(--section-gap)] max-md:py-8">
        <RankHeader
          title="클랜랭킹"
          notice="이 리그에 소속된 클랜입니다. 순위가 아니라 이름순입니다."
        />
        <ClanSearchBox
          value={query}
          onChange={setQuery}
          shown={rows.length}
          /* 다 받기 전에는 개수를 말하지 않는다 — 받다 만 수를 「전부」라고 쓰면 거짓말이다 */
          total={complete ? sorted.length : undefined}
        />
        {searching && complete && rows.length === 0 ? (
          <RankBox>
            <EmptyState message={`'${query.trim()}' 와(과) 맞는 클랜이 없습니다.`} />
          </RankBox>
        ) : (
          <RankBox>
            <ClanRankTable
              leagueSlug={leagueSlug}
              rows={rows}
              /* 다 받을 때까지 뼈대를 보여 준다 — 반쯤 받은 목록을 검색하면 «없다» 가 거짓이 된다 */
              loading={clans.loading || hasMore || loadingMore}
              error={clans.error}
              onRetry={clans.retry}
              /* 부리그/티어 구분선을 긋지 않는다. **1,2부라는 개념이 없다** (사용자 지시) */
              groupByDivision={false}
              columns={columns}
            />
          </RankBox>
        )}
      </div>
    </div>
  )
}

/**
 * 검색 규칙 — **이름에 들어 있으면 걸린다.**
 *
 * 대소문자와 공백을 무시한다. `블랙 펄` 로 쳐도 `Βlackpearl` 이 아니라 `블랙펄` 이 걸리게
 * 하려는 것이고, 영문 클랜명은 대소문자가 제각각이라 낮춰서 본다.
 * 슬러그도 같이 본다 — 주소에 쓰이는 이름으로 찾는 사람이 있다.
 *
 * 초성 검색은 **넣지 않았다.** 원본에도 없고, 규칙을 지어내는 일이 된다.
 */
function matches(query: string): (row: LeagueClan) => boolean {
  const needle = normalize(query)
  if (needle === '') return () => true
  return (row) => normalize(row.clan.name).includes(needle) || normalize(row.clan.slug).includes(needle)
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '')
}
