import type { LeagueClanSeason, LeaguePlayerSeason } from '@sacloud/contract'
import { EmptyState } from '../common/EmptyState'
import { formatCount, formatRate } from '../common/format'
import { rateClass } from '../common/rate'

/**
 * 지난시즌 표 — `/league/{slug}/player/{id}/season`, `/league/{slug}/clan/{slug}/season`.
 *
 * 원본 실측(플레이어 상세 사이드 패널에서 확인한 것과 같은 구성):
 * `시즌 N | {n}명중 {rank}위 | {승}승 {패}패 | 승률 {%} | {킬}킬 {데스}데스 | 킬뎃 {%} | 래더 {점}`
 * 전용 페이지 레이아웃은 아직 확인하지 못했다 `[미확인]` — 랭킹 표와 같은 뼈대를 재사용했다.
 *
 * 두 가지를 서버가 준 대로만 그린다.
 *  - 시즌 이름은 `season_label`이다. 베타의 내부 번호 0을 화면에 쓰지 않는다 (D-098)
 *  - 과거 카드에 없는 값은 `null`로 온다. **0으로 그리지 않고 `알수없음`** 이다 (D-106)
 */

/** 원본이 주지 않은 값. 0과 구분해서 표기한다 */
const UNKNOWN = '알수없음'
export function SeasonTable({
  seasons,
  kind,
  hidesCumulativeKd = false,
}: {
  seasons?: readonly (LeaguePlayerSeason | LeagueClanSeason)[]
  kind: 'player' | 'clan'
  /**
   * 무소속리그인가 (D-107). `true`면 **킬뎃 칸 자체를 없앤다.**
   *
   * `알수없음`으로 두지 않는 이유: 그건 "원본이 값을 안 줬다"는 뜻이고(D-106),
   * 여기는 "공개하지 않는다"는 뜻이라 서로 다른 상태다.
   */
  hidesCumulativeKd?: boolean
}) {
  if (!seasons || seasons.length === 0) {
    return <EmptyState message="지난시즌 기록이 없습니다." />
  }

  return (
    <div className="mt-10 border border-line">
      <div className="flex items-center border-b border-b-line py-2 text-meta">
        <div className="w-32 text-center">시즌</div>
        <div className="w-32 text-center">순위</div>
        <div className="w-32 text-center">승리</div>
        <div className="w-32 text-center">패배</div>
        <div className="w-32 text-center">승률</div>
        {kind === 'player' && !hidesCumulativeKd ? (
          <div className="w-32 text-center">킬뎃</div>
        ) : null}
        <div className="flex-grow text-center">래더</div>
      </div>
      {seasons.map((season) => {
        const isPlayer = 'kd_rate' in season
        return (
          <div
            key={season.season}
            className="flex items-center border-b border-b-line bg-row py-3 text-lg text-meta last:border-b-0"
          >
            <div className="w-32 text-center">{season.season_label}</div>
            <div className="w-32 text-center">
              {season.rank === null ? '배치고사' : `${formatCount(season.rank)}위`}
            </div>
            <div className="w-32 text-center">
              {season.win === null ? UNKNOWN : `${formatCount(season.win)}승`}
            </div>
            <div className="w-32 text-center">
              {season.lose === null ? UNKNOWN : `${formatCount(season.lose)}패`}
            </div>
            <div className={`w-32 text-center ${season.win_rate === null ? '' : rateClass(season.win_rate)}`}>
              {season.win_rate === null ? UNKNOWN : `${formatRate(season.win_rate)}%`}
            </div>
            {isPlayer && !hidesCumulativeKd ? (
              <div className={`w-32 text-center ${season.kd_rate === null ? '' : rateClass(season.kd_rate)}`}>
                {season.kd_rate === null ? UNKNOWN : `${formatRate(season.kd_rate)}%`}
              </div>
            ) : null}
            <div className="flex-grow text-center">
              {season.rating === null ? UNKNOWN : `${formatCount(season.rating)}점`}
            </div>
          </div>
        )
      })}
    </div>
  )
}
