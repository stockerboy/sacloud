'use client'

import { leagueScreen, type RankColumns } from '@sacloud/contract'
import { PlayerRankTable, RankBox } from '@sacloud/ui'
import { HomeLeagueHead, HomeLoadFailed, HomeSectionHead } from './homeKit'
import type { HomeRankPreviewLeague } from './homeTypes'

/**
 * ① 리그별 개인랭킹 미리보기 (2026-09-02 사장님 지시).
 *
 * ```
 * SPL              IPL              10mountain
 * 순위 닉네임 래더   순위 닉네임 래더   닉네임 승률 킬뎃
 * 1  …             1  …             …
 * ⋮ (5명)          ⋮                ⋮
 * 전체 랭킹 →       전체 랭킹 →       전체 랭킹 →
 * ```
 *
 * ── 표는 랭킹 화면 것 그대로다
 *   `PlayerRankTable` · `RankBox` 를 재사용한다. 행 링크(닉네임 → 기록실) · 1위 진홍 ·
 *   빈 상태 문구 전부 랭킹 화면과 같다. 리그 이름과 `전체 랭킹 →` 을 누르면 그 리그의
 *   개인랭킹(`/league/{slug}/rank/player`)으로 간다.
 *
 * ── 칸을 줄였다 — 값을 없앤 것이 아니다
 *   세 리그를 나란히 두면 한 칸이 350px 남짓이다. 랭킹 표의 다섯 칸(순위·닉네임·승률·킬뎃·래더)
 *   은 고정폭만 416px 이라 들어가지 않는다. 그래서 **래더가 있는 리그는 래더 하나로**,
 *   래더가 없는 리그는 그 리그가 원래 보여 주는 칸 그대로 둔다 (`leagueScreen` 이 정한다 —
 *   화면에 slug 분기를 두지 않는다). 승률·킬뎃은 한 번 누르면 나오는 전체 랭킹에 있다.
 *
 * ── 좁은 화면
 *   1024px 아래에서는 세 칸을 위아래로 쌓는다. 표 자체는 랭킹 화면과 같이
 *   `.mobile-bleed` 로 화면 끝까지 찬다 — 홈 컨테이너의 좌우 여백(0.75rem)과 값이 같다.
 */

/** 홈 미리보기에서 보여 줄 칸 — 위 주석의 규칙 */
function previewColumns(slug: string): RankColumns {
  const columns = leagueScreen(slug).playerColumns
  return columns.rating ? { ...columns, winRate: false, kd: false } : columns
}

export function HomeRankPreview({ leagues }: { leagues: HomeRankPreviewLeague[] | null }) {
  return (
    <section aria-labelledby="home-rank-title">
      <HomeSectionHead id="home-rank-title" title="리그별 개인랭킹" note="리그마다 상위 5명" />
      {leagues === null ? (
        <HomeLoadFailed />
      ) : (
        <div className="grid grid-cols-3 gap-6 max-lg:grid-cols-1 max-lg:gap-9">
          {leagues.map((league) => {
            const href = `/league/${league.slug}/rank/player`
            return (
              /* `min-w-0` 이 없으면 고정폭 숫자 칸이 칸을 벌려 그리드가 화면 밖으로 나간다 */
              <div key={league.slug} className="min-w-0">
                <HomeLeagueHead name={league.name} href={href} action="전체 랭킹 →" />
                <RankBox>
                  <PlayerRankTable
                    leagueSlug={league.slug}
                    rows={league.rows}
                    columns={previewColumns(league.slug)}
                  />
                </RankBox>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
