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
 */
export function SeasonTable({
  seasons,
  kind,
}: {
  seasons?: readonly (LeaguePlayerSeason | LeagueClanSeason)[]
  kind: 'player' | 'clan'
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
        {kind === 'player' ? <div className="w-32 text-center">킬뎃</div> : null}
        <div className="flex-grow text-center">래더</div>
      </div>
      {seasons.map((season) => {
        const isPlayer = 'kd_rate' in season
        return (
          <div
            key={season.season}
            className="flex items-center border-b border-b-line bg-row py-3 text-lg text-meta last:border-b-0"
          >
            <div className="w-32 text-center">시즌 {season.season}</div>
            <div className="w-32 text-center">
              {season.rank === null ? '배치고사' : `${formatCount(season.rank)}위`}
            </div>
            <div className="w-32 text-center">{formatCount(season.win)}승</div>
            <div className="w-32 text-center">{formatCount(season.lose)}패</div>
            <div className={`w-32 text-center ${rateClass(season.win_rate)}`}>
              {formatRate(season.win_rate)}%
            </div>
            {isPlayer ? (
              <div className={`w-32 text-center ${rateClass(season.kd_rate)}`}>
                {formatRate(season.kd_rate)}%
              </div>
            ) : null}
            <div className="flex-grow text-center">{formatCount(season.rating)}점</div>
          </div>
        )
      })}
    </div>
  )
}
