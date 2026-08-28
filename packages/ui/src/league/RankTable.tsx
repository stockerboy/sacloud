import Link from 'next/link'
import type { ClanRankRow, PlayerRankRow } from '@sacloud/contract'
import { ClanMark } from '../common/ClanMark'
import { EmptyState } from '../common/EmptyState'
import { ErrorState } from '../common/ErrorState'
import { Skeleton } from '../common/Skeleton'
import { formatCount, formatAverage, formatRate, formatRating } from '../common/format'
import { rateClass } from '../common/rate'
import { leaguePlayerPath } from '../common/paths'

/**
 * 클랜랭킹 / 개인랭킹 표.
 *
 * 원본 실측 구조 (2026-08-20)
 * ```
 * <div class="flex items-center mb-5">
 *   <div class="text-2xl">클랜랭킹</div>
 *   <div class="ml-3 text-gray-700 text-sm">{안내 문구}</div>
 * <div class="mt-10 border border-gray-300">
 *   <div class="flex items-center py-2 text-gray-700 border-b border-gray-300">   ← 머리글 36px
 *   <div class="flex items-center py-3 bg-gray-light2 text-lg text-gray-700
 *               border-b border-gray-300 last:border-b-0">                        ← 행 50px
 * ```
 * - 행 배경은 전부 `#ECECEC` (교대 배경 아님 — 20행 전부 동일 확인)
 * - 한 페이지 20행, 마지막 행은 아래 테두리 없음
 * - 숫자 뒤 단위는 `<span class="ml-0.5">`로 분리된다 (`1,302` + `승`)
 * - 승률·킬뎃은 값에 따라 색이 바뀐다 (`common/rate.ts`)
 *
 * 컬럼 폭 실측
 * - 클랜랭킹: 순위 `w-40` / 클랜 `w-96` / 승·패·승률 `w-44` / 래더 `flex-grow`
 * - 개인랭킹: 순위 `w-40` / 닉네임 `w-72` / 승·패·승률·킬뎃·평균킬 `w-36` / 래더 `flex-grow`
 */

const HEAD = 'flex items-center border-b border-b-line py-2 text-meta'
const ROW =
  'flex items-center border-b border-b-line bg-row py-3 text-lg text-meta last:border-b-0 max-md:py-4'

/**
 * 모바일 컬럼 규칙 (2026-08-28 원본 관측).
 *
 * 원본 모바일은 랭킹 표를 **세 칸으로 줄인다** —
 * 클랜랭킹 `순위 · 클랜 · 래더`, 개인랭킹 `순위 · 닉네임 · 점수`.
 * 승리·패배·승률·킬뎃·평균킬은 **감춘다.** 가로로 밀어 보게 하지 않는다.
 *
 * 값을 지우는 게 아니라 보이지 않게만 한다. 넓은 화면은 그대로다.
 */
/** 순위 칸 — 좁은 화면에서는 폭을 줄인다 */
const COL_RANK = 'w-40 text-center max-md:w-12'
/** 이름 칸 — 좁은 화면에서는 남는 폭을 다 쓴다 */
const COL_NAME = 'flex items-center max-md:min-w-0 max-md:flex-1'
/** 점수 칸 — 좁은 화면에서는 오른쪽에 붙인다 */
const COL_RATING = 'flex-grow text-center max-md:w-24 max-md:flex-none max-md:pr-1 max-md:text-right'
/** 좁은 화면에서 감추는 칸 */
const COL_HIDDEN = 'max-md:hidden'

function Unit({ children }: { children: React.ReactNode }) {
  return <span className="ml-0.5">{children}</span>
}

/**
 * 제목 + 안내문구 줄.
 * 원본 순서: 제목줄 → (클랜랭킹만) 부리그 탭 → 표. 그래서 제목과 표를 분리해 둔다.
 */
export function RankHeader({ title, notice }: { title: string; notice: string }) {
  return (
    <div className="mb-5 flex items-center">
      <div className="text-2xl">{title}</div>
      <div className="ml-3 text-sm text-meta">{notice}</div>
    </div>
  )
}

/** 표 테두리 박스 (원본 `mt-10 border border-gray-300`) */
export function RankBox({ children }: { children: React.ReactNode }) {
  return <div className="mt-10 border border-line">{children}</div>
}

interface TableStateProps {
  loading?: boolean
  error?: boolean
  onRetry?: () => void
  /** 배치고사가 끝난 대상이 하나도 없을 때 */
  emptyMessage: string
  columns: number
}

function TableBody({
  loading,
  error,
  onRetry,
  emptyMessage,
  columns,
  isEmpty,
  children,
}: TableStateProps & { isEmpty: boolean; children: React.ReactNode }) {
  if (error) return <ErrorState message="랭킹을 불러오지 못했습니다." onRetry={onRetry} />
  if (loading) return <RankSkeleton columns={columns} />
  if (isEmpty) return <EmptyState message={emptyMessage} />
  return <>{children}</>
}

function RankSkeleton({ columns }: { columns: number }) {
  return (
    <>
      {Array.from({ length: 20 }, (_, row) => (
        <div key={row} className={ROW}>
          {Array.from({ length: columns }, (_, col) => (
            <div key={col} className="flex-1 px-4">
              <Skeleton className="h-[25px] w-full" />
            </div>
          ))}
        </div>
      ))}
    </>
  )
}

/* ------------------------------------------------------------------ 클랜 --- */

export interface ClanRankTableProps extends Omit<TableStateProps, 'columns' | 'emptyMessage'> {
  leagueSlug: string
  rows?: readonly ClanRankRow[]
}

export function ClanRankTable({ leagueSlug, rows, loading, error, onRetry }: ClanRankTableProps) {
  return (
    <>
      <div className={HEAD}>
        <div className={COL_RANK}>순위</div>
        <div className={`w-96 ${COL_NAME}`}>클랜</div>
        <div className={`w-44 text-center ${COL_HIDDEN}`}>승리</div>
        <div className={`w-44 text-center ${COL_HIDDEN}`}>패배</div>
        <div className={`w-44 text-center ${COL_HIDDEN}`}>승률</div>
        <div className={COL_RATING}>래더</div>
      </div>
      <TableBody
        loading={loading}
        error={error}
        onRetry={onRetry}
        columns={6}
        isEmpty={!rows || rows.length === 0}
        emptyMessage="배치고사가 종료된 클랜이 없습니다."
      >
        {rows?.map((row) => (
          <div key={row.clan.id} className={ROW}>
            <div className={COL_RANK}>{row.rank}</div>
            <div className={`w-96 ${COL_NAME}`}>
              <Link
                className="flex min-w-0 items-center"
                href={`/league/${leagueSlug}/clan/${row.clan.slug}`}
              >
                <ClanMark mark={row.clan.mark} className="mr-2" alt={row.clan.name} />
                <span className="truncate">{row.clan.name}</span>
              </Link>
            </div>
            <div className={`w-44 text-center ${COL_HIDDEN}`}>
              {formatCount(row.win)}
              <Unit>승</Unit>
            </div>
            <div className={`w-44 text-center ${COL_HIDDEN}`}>
              {formatCount(row.lose)}
              <Unit>패</Unit>
            </div>
            <div className={`w-44 text-center ${rateClass(row.win_rate)} ${COL_HIDDEN}`}>
              {formatRate(row.win_rate)}
              <Unit>%</Unit>
            </div>
            <div className={COL_RATING}>{formatRating(row.rating)}</div>
          </div>
        ))}
      </TableBody>
    </>
  )
}

/* ---------------------------------------------------------------- 플레이어 --- */

export interface PlayerRankTableProps extends Omit<TableStateProps, 'columns' | 'emptyMessage'> {
  leagueSlug: string
  rows?: readonly PlayerRankRow[]
}

export function PlayerRankTable({
  leagueSlug,
  rows,
  loading,
  error,
  onRetry,
}: PlayerRankTableProps) {
  return (
    <>
      <div className={HEAD}>
        <div className={COL_RANK}>순위</div>
        <div className={`w-72 ${COL_NAME}`}>닉네임</div>
        <div className={`w-36 text-center ${COL_HIDDEN}`}>승리</div>
        <div className={`w-36 text-center ${COL_HIDDEN}`}>패배</div>
        <div className={`w-36 text-center ${COL_HIDDEN}`}>승률</div>
        <div className={`w-36 text-center ${COL_HIDDEN}`}>킬뎃</div>
        <div className={`w-36 text-center ${COL_HIDDEN}`}>평균킬</div>
        <div className={COL_RATING}>래더</div>
      </div>
      <TableBody
        loading={loading}
        error={error}
        onRetry={onRetry}
        columns={8}
        isEmpty={!rows || rows.length === 0}
        emptyMessage="배치고사가 종료된 플레이어가 없습니다."
      >
        {rows?.map((row) => (
          <div key={row.player.id} className={ROW}>
            <div className={COL_RANK}>{row.rank}</div>
            <div className={`w-72 ${COL_NAME}`}>
              <Link
                className="flex min-w-0 items-center"
                href={leaguePlayerPath(leagueSlug, row.player.id)}
              >
                {/* 무소속이어도 **자리를 비우지 않는다** — fallback 마크를 그린다 (D-146).
                    `clan ? ... : null` 로 감싸면 소속 없는 선수 옆이 통째로 빈다.
                    `clan` 을 그대로 넘기면 `clanMarkView` 가 fallback 으로 떨어뜨린다. */}
                <ClanMark clan={row.clan} className="mr-2" alt={row.clan?.name ?? ''} />
                <span className="truncate">{row.player.name}</span>
              </Link>
            </div>
            <div className={`w-36 text-center ${COL_HIDDEN}`}>
              {formatCount(row.win)}
              <Unit>승</Unit>
            </div>
            <div className={`w-36 text-center ${COL_HIDDEN}`}>
              {formatCount(row.lose)}
              <Unit>패</Unit>
            </div>
            <div className={`w-36 text-center ${rateClass(row.win_rate)} ${COL_HIDDEN}`}>
              {formatRate(row.win_rate)}
              <Unit>%</Unit>
            </div>
            {/* 무소속리그는 누적 킬뎃을 공개하지 않는다. 값이 없으면 칸을 비운다 (D-107) */}
            <div
              className={`w-36 text-center ${row.kd_rate === null ? '' : rateClass(row.kd_rate)} ${COL_HIDDEN}`}
            >
              {row.kd_rate === null ? (
                '-'
              ) : (
                <>
                  {formatRate(row.kd_rate)}
                  <Unit>%</Unit>
                </>
              )}
            </div>
            <div className={`w-36 text-center ${COL_HIDDEN}`}>
              {formatAverage(row.kill_per_match)}
              <Unit>킬</Unit>
            </div>
            <div className={COL_RATING}>{formatRating(row.rating)}</div>
          </div>
        ))}
      </TableBody>
    </>
  )
}
