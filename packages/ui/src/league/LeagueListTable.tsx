import Link from 'next/link'
import type { LeagueListItem } from '@sacloud/contract'
import { ClanMark } from '../common/ClanMark'
import { Label } from '../common/Label'
import { EmptyState } from '../common/EmptyState'
import { ErrorState } from '../common/ErrorState'
import { Skeleton } from '../common/Skeleton'
import { formatCount, formatDate } from '../common/format'

/**
 * 리그 목록 표 (`/leagues`).
 *
 * 원본 실측 구조
 * ```
 * <div class="border border-gray-200 mt-10 text-textBlack">
 *   <div class="flex items-center text-lg bg-gray-light py-2 border-b-2 border-gray-200">  ← 머리글 40px
 *     <div class="w-5/12 text-center">리그명</div><div class="w-1/6"></div>
 *     <div class="w-1/4"></div><div class="w-1/6"></div>
 *   <a class="flex items-center text-xl py-5 bg-gray-light2 border-b border-gray-300
 *             text-gray-700 last:border-b-0">                                              ← 행 64px
 *     <div class="flex items-center w-5/12 px-4">
 *       <div class="mr-3 font-semibold">{리그명}</div>
 *       <배지>  <클랜마크 ×3>
 *     <div class="w-1/6">{n}개의 클랜참여중</div>
 *     <div class="w-1/4">관리자: {이름}</div>
 *     <div class="w-1/6">{개설일}</div>
 * ```
 * 머리글은 첫 칸에만 `리그명`이 있고 나머지 3칸은 비어 있다 (원본 그대로).
 */
export function LeagueListTable({
  items,
  loading,
  error,
  onRetry,
}: {
  items?: readonly LeagueListItem[]
  loading?: boolean
  error?: boolean
  onRetry?: () => void
}) {
  return (
    <div className="mt-10 border border-divider text-text-strong">
      <div className="flex items-center border-b-2 border-b-divider bg-page py-2 text-lg">
        <div className="w-5/12 text-center">리그명</div>
        <div className="w-1/6" />
        <div className="w-1/4" />
        <div className="w-1/6" />
      </div>

      {error ? (
        <ErrorState message="리그 목록을 불러오지 못했습니다." onRetry={onRetry} />
      ) : loading ? (
        <>
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="flex items-center bg-row py-5">
              <div className="w-5/12 px-4">
                <Skeleton className="h-[28px] w-64" />
              </div>
              <div className="w-1/6" />
              <div className="w-1/4" />
              <div className="w-1/6" />
            </div>
          ))}
        </>
      ) : !items || items.length === 0 ? (
        <EmptyState message="리그가 없습니다." />
      ) : (
        items.map((league) => (
          <Link
            key={league.id}
            href={`/league/${league.slug}/home/info`}
            className="flex items-center border-b border-b-line bg-row py-5 text-xl text-meta last:border-b-0"
          >
            <div className="flex w-5/12 items-center px-4">
              <div className="mr-3 font-semibold">{league.name}</div>
              {league.official ? <Label name="공식" className="mr-2" /> : null}
              {league.clans.map((clan) => (
                <ClanMark key={clan.id} mark={clan.mark} className="mr-2" alt={clan.name} />
              ))}
            </div>
            <div className="w-1/6">{formatCount(league.clan_count)}개의 클랜참여중</div>
            <div className="w-1/4">관리자: {league.user?.nickname ?? "-"}</div>
            <div className="w-1/6">{formatDate(league.created_at)}</div>
          </Link>
        ))
      )}
    </div>
  )
}
