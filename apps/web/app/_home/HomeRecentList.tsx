'use client'

import Link from 'next/link'
import type { ClanSummary } from '@sacloud/contract'
import { ClanMark, RelativeTime } from '@sacloud/ui'
import type { HomeRecentRow } from './homeTypes'

/**
 * 홈 최근 경기 — **한 경기 한 줄** (2026-09-02 사장님 지시 #11 · #13-g).
 *
 * > "최근 경기는 승리 카드로 하지말고 그냥 간략하게 왼쪽(이긴팀)vs오른쪽(진팀) 이런 정보만 줘라
 * >  몇분전에 한 경기인지는 꼭 알려줘라 그리고 가장최신경기 6건씩을 붙이면 된다"
 * > (#13-g 그림) 맨 왼쪽에 MVP 열 · 왼쪽 클랜 위 「승리」 · 오른쪽 클랜 위 「패배」
 *
 * ```
 * MVP                  승리                    패배                        시각
 * [마크] 닉네임         [마크] 이긴 클랜   vs   [마크] 진 클랜              12분 전
 * 알수없음             [마크] A          vs   [마크] B       결과 알수없음 · 3시간 전
 * ```
 *
 * ── MVP 열 (#13-g)
 *   `Match.mvpPlayerId`(D-159 ★)를 라인업에서 찾은 값이다 — 마크는 **경기 당시 소속**(D-131),
 *   닉네임을 누르면 그 리그의 선수 기록실. 없으면 **`알수없음`** — 0 도 빈칸도 아니다.
 *   IPL 병영수첩 출처는 대부분 없다 (D-034). SPL · IPL 둘 다 같은 구조다.
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
 *   경기 하나짜리 페이지는 **없다** (D-004 — 원본에도 개별 경기 URL 이 없다). 줄 자체는 링크가 아니고,
 *   클랜 이름은 그 리그의 **클랜 기록실**, MVP 닉네임은 **선수 기록실**로 간다.
 *
 * ── 폰 (390px)
 *   MVP · 승리 · 패배 · 시각 네 덩어리가 한 줄에 안 들어간다. **MVP 를 둘째 줄로 내린다**(접지 않는다 —
 *   사장님 지시). 머리 줄의 「MVP」 라벨은 폰에서 숨기고 대신 둘째 줄 앞에 작은 「MVP」 를 붙인다.
 *
 * ── 넣지 않은 것
 *   지도명 · 래더 증감 · 인원 — 사장님이 «이런 정보만» 이라고 했다. 값은 서버 응답에 그대로 있고
 *   옛 카드 방식(`HomeRecentMatches` 의 `'card'`)이 지금도 그린다.
 */

/** MVP 열 폭 — 머리 줄과 본문 줄이 같은 값을 써야 라벨이 열 위에 선다 */
const COL_MVP = 'w-40 shrink-0 max-md:mt-1 max-md:w-full max-md:basis-full max-md:order-last'
/** 시각 열 폭 */
const COL_TIME = 'w-24 shrink-0 text-right max-md:w-auto'

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

/** MVP 칸 — 경기 당시 소속 마크 + 닉네임(선수 기록실 링크). 없으면 `알수없음` */
function MvpCell({ mvp, leagueSlug }: { mvp: HomeRecentRow['mvp']; leagueSlug: string }) {
  return (
    <div className={`${COL_MVP} flex min-w-0 items-center gap-1.5`}>
      {/* 폰에서는 둘째 줄이라 무엇인지 앞에 적는다. PC 는 머리 줄의 「MVP」 가 이 열 위에 있다 */}
      <span className="hidden shrink-0 text-[10px] tracking-[0.14em] text-faint max-md:inline">MVP</span>
      {mvp ? (
        <Link
          href={`/league/${leagueSlug}/player/${mvp.player_id}`}
          className="group flex min-w-0 items-center gap-1.5"
          title={mvp.name}
        >
          <ClanMark
            clan={mvp.clan}
            size="xs"
            className="shrink-0"
            alt={mvp.clan?.name ?? ''}
          />
          <span className="truncate text-sm text-text transition-colors duration-100 group-hover:text-text-strong">
            {mvp.name}
          </span>
        </Link>
      ) : (
        <span className="text-sm text-faint" title="이 경기의 MVP 가 기록돼 있지 않습니다">
          알수없음
        </span>
      )}
    </div>
  )
}

export function HomeRecentList({ rows, leagueSlug }: { rows: HomeRecentRow[]; leagueSlug: string }) {
  return (
    <div className="mt-4">
      {/* 머리 줄 — 열 위에 라벨. 폭 클래스는 본문 줄과 같은 상수를 쓴다 (#13-g) */}
      <div className="flex items-center gap-2 border-b border-line pb-1.5 text-[11px] tracking-[0.14em] text-faint max-md:gap-1.5">
        <div className={`${COL_MVP} max-md:hidden`}>MVP</div>
        <div className="min-w-0 flex-1 text-right">승리</div>
        <span className="shrink-0 px-1 opacity-0" aria-hidden="true">
          vs
        </span>
        <div className="min-w-0 flex-1">패배</div>
        <div className={`${COL_TIME} ml-2 max-md:ml-1`}>시각</div>
      </div>

      <ul>
        {rows.map((row) => (
          <li
            key={row.id}
            className="flex items-center gap-2 border-b border-line-soft py-2.5 max-md:flex-wrap max-md:gap-1.5"
          >
            <MvpCell mvp={row.mvp} leagueSlug={leagueSlug} />
            <ClanCell clan={row.winner} leagueSlug={leagueSlug} align="right" />
            <span className="shrink-0 px-1 text-xs text-faint">vs</span>
            <ClanCell clan={row.loser} leagueSlug={leagueSlug} align="left" />
            {/* 시각 — 반드시 상대시간. 결과를 모르면 그 사실을 앞에 적는다 */}
            <span className={`${COL_TIME} num ml-2 whitespace-nowrap text-xs text-meta max-md:ml-1`}>
              {row.decided ? null : <span className="mr-1.5 text-faint">결과 알수없음 ·</span>}
              <RelativeTime value={row.start_at} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
