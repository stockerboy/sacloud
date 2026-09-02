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
 * ── 소속 클랜명 칸 (2026-09-02 사장님 지시 #10)
 *   > "순위닉네임, 래더 사이에 소속클랜명을 적어라"
 *   `PlayerRankTable` 의 `clanColumn` 을 켠다. 클랜명은 그 리그 클랜 기록실 링크이고,
 *   소속이 없으면 `무소속` 이다. 폰에서도 남는다 (길면 말줄임).
 *
 * ── 배치 — SPL | IPL 두 칸, 그 아래 10mountain 전체폭 (지시 #10 으로 바뀜)
 *   순서는 사장님 지시 그대로 **SPL → IPL → 10mountain** 이다.
 *   클랜명 칸이 들어오면서 세 칸 나란히는 불가능해졌다 — 한 칸 344px 에 고정폭
 *   (순위 64 + 클랜 144 + 래더 128 + 여백 32) 만 368px 이다. 두 칸이면 492px 이 남아
 *   닉네임에 150px 이 간다. 홀수 번째 마지막 칸은 빈자리를 남기지 않고 전체폭을 쓴다 —
 *   «몇 번째» 로 정하지 slug 로 정하지 않는다.
 *
 *   ⚠ 옛 배치 (같은 날 오전 · 지시 #3): 세 칸 나란히(`grid-cols-3`). 되돌리려면
 *     아래 grid 클래스와 `col-span` 판정 한 줄이다 (`CLAUDE.md` 10-4).
 *
 * ── 칸을 줄였다 — 값을 없앤 것이 아니다
 *   랭킹 표의 다섯 칸(순위·닉네임·승률·킬뎃·래더)에 클랜명까지 넣으면 반 폭에도 안 들어간다.
 *   그래서 **래더가 있는 리그는 순위·닉네임·클랜·래더**, 래더가 없는 리그는 그 리그가
 *   원래 보여 주는 칸(승률·킬뎃) + 클랜으로 둔다 (`leagueScreen` 이 정한다 — 화면에
 *   slug 분기를 두지 않는다). 승률·킬뎃은 한 번 누르면 나오는 전체 랭킹에 있다.
 *
 * ── 좁은 화면
 *   1024px 아래에서는 칸을 위아래로 쌓는다(SPL 부터). 표 자체는 랭킹 화면과 같이
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
        <div className="grid grid-cols-2 gap-8 max-lg:grid-cols-1 max-lg:gap-9">
          {leagues.map((league, index) => {
            const href = `/league/${league.slug}/rank/player`
            /* 홀수 개일 때 마지막 칸은 전체폭 — 빈 반 칸을 남기지 않는다 */
            const spansRow = leagues.length % 2 === 1 && index === leagues.length - 1
            return (
              /* `min-w-0` 이 없으면 고정폭 숫자 칸이 칸을 벌려 그리드가 화면 밖으로 나간다 */
              <div key={league.slug} className={`min-w-0 ${spansRow ? 'lg:col-span-2' : ''}`}>
                <HomeLeagueHead name={league.name} href={href} action="전체 랭킹 →" />
                <RankBox>
                  <PlayerRankTable
                    leagueSlug={league.slug}
                    rows={league.rows}
                    columns={previewColumns(league.slug)}
                    clanColumn
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
