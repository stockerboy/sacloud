/**
 * **서비스 준비중** 안내 (D-178).
 *
 * 접은 리그(`PREPARING_LEAGUE_SLUGS`)의 리그 화면 전체를 대신한다.
 * 랭킹·집계를 한 줄도 그리지 않고, 빈 화면도 남기지 않는다.
 *
 * 원본 3rd.supply 에 이 화면은 없다 — 사용자 지시로 만든 우리 화면이다.
 * 그래서 문구도 우리 것이고 새 색·새 컴포넌트를 만들지 않았다.
 * 기존 토큰(`--color-side` 계열 · `text-meta`)과 `pc-container` 를 그대로 쓴다.
 */

import { PREPARING_HEADLINE, PREPARING_MESSAGE } from './preparingText'

export function LeaguePreparing({ leagueName }: { leagueName?: string }) {
  return (
    <div className="pc-container px-4 py-16">
      <div className="rounded border border-side-line bg-side px-6 py-14 text-center text-white">
        {leagueName ? <p className="mb-3 text-base tracking-wider">{leagueName}</p> : null}
        <p className="text-2xl font-bold">{PREPARING_HEADLINE}</p>
        <p className="mt-3 text-sm text-white/70">{PREPARING_MESSAGE}</p>
      </div>
    </div>
  )
}
