/**
 * **서비스 준비중** 안내 (D-178).
 *
 * 접은 리그(`PREPARING_LEAGUE_SLUGS`)의 리그 화면 전체를 대신한다.
 * 랭킹·집계를 한 줄도 그리지 않고, 빈 화면도 남기지 않는다.
 *
 * 원본 3rd.supply 에 이 화면은 없다 — 사용자 지시로 만든 우리 화면이다.
 * 그래서 문구도 우리 것이고 새 색·새 컴포넌트를 만들지 않았다.
 * `적진` 팔레트 토큰과 `pc-container` 를 그대로 쓴다 — 강조색은 한 점도 쓰지 않는다.
 */

import { PREPARING_HEADLINE, PREPARING_MESSAGE } from './preparingText'

export function LeaguePreparing({ leagueName }: { leagueName?: string }) {
  return (
    <div className="pc-container px-4 py-16">
      <div className="rounded-[var(--radius)] border border-line px-6 py-16 text-center">
        {leagueName ? <p className="mb-3 text-sm tracking-[0.14em] text-faint">{leagueName}</p> : null}
        <p className="font-display text-3xl tracking-wide text-text-strong">{PREPARING_HEADLINE}</p>
        <p className="mt-4 text-sm leading-relaxed text-meta">{PREPARING_MESSAGE}</p>
      </div>
    </div>
  )
}
