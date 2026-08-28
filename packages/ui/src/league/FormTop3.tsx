import Link from 'next/link'
import type { FormTop } from '@sacloud/contract'
import { ClanMark } from '../common/ClanMark'
import { formatCount, formatRatingDelta } from '../common/format'
import { leaguePlayerPath } from '../common/paths'
import { COL_NAME, COL_RANK, COL_RATING, HEAD, MARK, ROW } from './rankStyles'

/**
 * 폼 TOP3 — 각 랭킹 탭(통합/스나/라플) 위에 붙는다 (D-169).
 *
 * **원본 3rd.supply 에는 없는 우리 신규 기능**이다 (사용자 지시).
 * 규칙은 사용자와 확정했다 —
 *   · 그날 하루 동안 얻은 래더 증감의 합이 큰 순서로 3명
 *   · 최소 3경기 이상 한 선수만 후보
 *   · 동점이면 경기 수가 많은 쪽이 위
 *   · 표시 형식 `+48점 (5경기)`
 *
 * 모양은 새로 만들지 않는다. 바로 아래 랭킹 표와 **같은 치수 토큰**(`rankStyles.ts`)을 쓴다 —
 * 그래야 모바일 행 간격 36px 리듬이 어긋나지 않는다. 새 크기를 추측하지 않았다.
 *
 * 날짜는 항상 보여 준다. 오늘 경기가 없어 최근 경기일로 물러섰을 때
 * 어느 날의 기록인지 감추면 "오늘 폼"이라는 거짓말이 되기 때문이다.
 */
export function FormTop3({
  leagueSlug,
  form,
  loading,
  error,
}: {
  leagueSlug: string
  form?: FormTop
  loading?: boolean
  error?: boolean
}) {
  /* 못 불러왔으면 **아무것도 그리지 않는다.** 랭킹 표가 본체이고 이건 덧붙는 칸이라,
     빈 상자나 오류 문구로 본체를 밀어내지 않는다. */
  if (error) return null
  if (loading) return null
  if (!form || form.rows.length === 0) return null

  return (
    <div className="mb-5">
      <div className="mb-2 flex items-baseline max-md:flex-col max-md:items-start">
        <div className="text-lg">폼 TOP3</div>
        <div className="ml-3 text-sm text-meta max-md:ml-0 max-md:mt-1">
          {form.date}
          {form.is_today ? ' (오늘)' : ''} 하루 동안 얻은 래더 증감 합계 · 3경기 이상
        </div>
      </div>
      <div className="mobile-bleed border border-line">
        <div className={HEAD}>
          <div className={COL_RANK}>순위</div>
          <div className={`w-72 ${COL_NAME}`}>닉네임</div>
          <div className={COL_RATING}>래더증감</div>
        </div>
        {form.rows.map((row) => (
          <div key={row.league_player_id} className={ROW}>
            <div className={COL_RANK}>{row.rank}</div>
            <div className={`w-72 ${COL_NAME}`}>
              <Link
                className="flex min-w-0 items-center"
                href={leaguePlayerPath(leagueSlug, row.player.id)}
              >
                {/* 무소속이어도 자리를 비우지 않는다 — fallback 마크를 그린다 (D-146) */}
                <ClanMark clan={row.clan} className={MARK} alt={row.clan?.name ?? ''} />
                <span className="truncate">{row.player.name}</span>
              </Link>
            </div>
            <div className={COL_RATING}>
              {formatRatingDelta(row.rating_delta)}
              <span className="ml-1 text-sm text-meta">({formatCount(row.games)}경기)</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
