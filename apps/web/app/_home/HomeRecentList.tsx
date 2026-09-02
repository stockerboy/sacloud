'use client'

import Link from 'next/link'
import type { ClanSummary } from '@sacloud/contract'
import { ClanMark, RelativeTime } from '@sacloud/ui'
import type { HomeRecentRow } from './homeTypes'

/**
 * 홈 최근 경기 — **한 경기 한 줄** (2026-09-02 사장님 지시 #11).
 *
 * > "최근 경기는 승리 카드로 하지말고 그냥 간략하게 왼쪽(이긴팀)vs오른쪽(진팀) 이런 정보만 줘라
 * >  몇분전에 한 경기인지는 꼭 알려줘라 그리고 가장최신경기 6건씩을 붙이면 된다"
 *
 * ```
 * [마크] 이긴 클랜        vs        [마크] 진 클랜          12분 전
 * [마크] A               vs        [마크] B     결과 알수없음 · 3시간 전
 * ```
 *
 * ── 왼쪽이 항상 이긴 팀이다
 *   서버(`homeRecent.ts`)가 승자를 왼쪽에 놓아 준다. 승자를 모르는 경기(`decided === false`)는
 *   레드 슬롯이 왼쪽인데 그건 **자리이지 승자가 아니다** — 그래서 `결과 알수없음` 을 적는다.
 *   빈칸으로 두지 않는다. 지어내지도 않는다 (`CLAUDE.md` 3장 7번).
 *
 * ── 시각은 반드시 상대시간이다
 *   기록실 카드와 같은 `RelativeTime`(`n분 전` · `n시간 전` · `어제`)을 그대로 쓴다.
 *   서버 렌더와 클라이언트 시각이 달라 첫 그림은 비어 있다가 마운트 뒤 채워진다 — 그 컴포넌트의 규칙이다.
 *
 * ── 누르면 어디로 가나
 *   경기 하나짜리 페이지는 **없다** (D-004 — 원본에도 개별 경기 URL 이 없다). 그래서 줄 자체는
 *   링크가 아니고, 클랜 이름을 누르면 그 리그의 **클랜 기록실**로 간다. 거기서 이 경기를 펼쳐 볼 수 있다.
 *
 * ── 넣지 않은 것
 *   지도명 · 래더 증감 · 인원 — 사장님이 «이런 정보만» 이라고 했다. 값은 서버 응답에 그대로 있고
 *   옛 카드 방식(`HomeRecentMatches` 의 `'card'`)이 지금도 그린다.
 */

function ClanCell({
  clan,
  leagueSlug,
  align,
}: {
  clan: ClanSummary
  leagueSlug: string
  align: 'left' | 'right'
}) {
  return (
    <Link
      href={`/league/${leagueSlug}/clan/${clan.slug}`}
      className={`group flex min-w-0 flex-1 items-center gap-1.5 ${
        align === 'right' ? 'flex-row-reverse text-right' : ''
      }`}
      title={clan.name}
    >
      <ClanMark clan={clan} size="xs" className="shrink-0" alt={clan.name} />
      {/* 색은 안쪽 `span` 에 준다 — `a { color: inherit }` (`CLAUDE.md` 9장) */}
      <span className="truncate text-sm text-text transition-colors duration-100 group-hover:text-text-strong">
        {clan.name}
      </span>
    </Link>
  )
}

export function HomeRecentList({ rows, leagueSlug }: { rows: HomeRecentRow[]; leagueSlug: string }) {
  return (
    <ul className="mt-4 border-t border-line">
      {rows.map((row) => (
        <li
          key={row.id}
          className="flex items-center gap-2 border-b border-line-soft py-2.5 max-md:gap-1.5"
        >
          <ClanCell clan={row.winner} leagueSlug={leagueSlug} align="right" />
          <span className="shrink-0 px-1 text-xs text-faint">vs</span>
          <ClanCell clan={row.loser} leagueSlug={leagueSlug} align="left" />
          {/* 시각 — 반드시 상대시간. 결과를 모르면 그 사실을 앞에 적는다 */}
          <span className="num ml-2 shrink-0 whitespace-nowrap text-right text-xs text-meta max-md:ml-1">
            {row.decided ? null : <span className="mr-1.5 text-faint">결과 알수없음 ·</span>}
            <RelativeTime value={row.start_at} />
          </span>
        </li>
      ))}
    </ul>
  )
}
