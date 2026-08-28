import Link from 'next/link'
import type { ClanRankRow, PlayerRankRow, RankWeapon } from '@sacloud/contract'
import { ClanMark } from '../common/ClanMark'
import { EmptyState } from '../common/EmptyState'
import { ErrorState } from '../common/ErrorState'
import { Skeleton } from '../common/Skeleton'
import {
  formatCount,
  formatAverage,
  formatRate,
  formatRating,
  formatRatingDelta,
} from '../common/format'
import { rateClass } from '../common/rate'
import { leaguePlayerPath } from '../common/paths'
import { COL_HIDDEN, COL_NAME, COL_RANK, COL_RATING, HEAD, MARK, ROW } from './rankStyles'

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

/**
 * 모바일 치수 근거 (2026-08-28, 원본/우리 스크린샷 픽셀 실측 · 기기 배율 3x · 1125×2436).
 *
 * | 항목            | 우리(전) | 원본 | CSS px (÷3) |
 * |-----------------|---------|------|-------------|
 * | 표 행 간격      | 170     | 108  | **36**      |
 * | 행 숫자 글자높이 | 33      | 26   | 8.7         |
 * | 클랜마크 지름   | 77      | 58   | **19.3**    |
 * | 제목 세로 범위  | 121(2줄) | 78   | **26**      |
 *
 * 루트 폰트는 PC·모바일 모두 14px 이다 (`styles.css`). 그래서 `1rem = 14px`.
 *
 * 행 간격 36px 을 만드는 계산 (아래 `ROW` 의 모바일 값)
 * ```
 * 클랜마크 1.4rem(19.6px)   ← 행에서 가장 높은 요소. 글자 줄높이보다 크다
 * + 상하 padding 0.55rem×2 = 15.4px
 * + 아래 테두리 1px
 * = 36.0px                  ← 실측 목표 36
 * ```
 * 글자는 `text-lg`(15.75px) → `text-sm`(12.25px). 실측 비율 33/26 = 1.27 이고
 * `text-lg / text-sm` = 1.125/0.875 = 1.29 로 가장 가깝다
 * (`text-base` 는 1.125 배라 실측 비율에 못 미친다).
 * `text-sm` 줄높이는 1.25rem(17.5px)이라 마크(19.6px)보다 낮아 행 높이를 바꾸지 않는다.
 */
/* 위 실측값의 실제 클래스 문자열은 `rankStyles.ts` 에 모아 두었다 (파일 위 import 참조) —
   폼 TOP3(D-169) 처럼 랭킹 화면에 덧붙는 것들이 **같은 치수 체계**를 쓰게 하려는 것이다. */

function Unit({ children }: { children: React.ReactNode }) {
  return <span className="ml-0.5">{children}</span>
}

/**
 * 제목 + 안내문구 줄.
 * 원본 순서: 제목줄 → (클랜랭킹만) 부리그 탭 → 표. 그래서 제목과 표를 분리해 둔다.
 */
export function RankHeader({ title, notice }: { title: string; notice: string }) {
  return (
    /* 좁은 화면에서는 한 줄에 나란히 두지 않는다 —
       안내문구가 제목을 밀어 `클랜랭` / `킹` 으로 쪼개졌다 (실측 121 device px = 두 줄).
       제목 한 줄 → 그 아래 작은 회색 안내문구 한 줄로 쌓는다. */
    <div className="mb-5 flex items-center max-md:flex-col max-md:items-start">
      {/* 원본 제목 세로 범위 78 device px ÷ 3 = 26 CSS px.
          한글 글자 높이는 폰트 크기의 약 0.85 배이므로 폰트 ≈ 30.6px ≈ 2rem(28px).
          우리 한 줄 기준 실측 60 device px 에서 역산해도 21px × (78/60) ≈ 27.3px 로 같은 자리다. */}
      {/* `leading-tight` 는 줄높이만 따로 준다 — `text-2xl` 이 물고 있는 줄높이 28px 이
          폰트 28px 과 같아져 글자가 눌리지 않게 하려는 것이다 */}
      <div className="text-2xl max-md:whitespace-nowrap max-md:text-[2rem] max-md:leading-tight">
        {title}
      </div>
      <div className="ml-3 text-sm text-meta max-md:ml-0 max-md:mt-1">{notice}</div>
    </div>
  )
}

/** 표 테두리 박스 (원본 `mt-10 border border-gray-300`) */
export function RankBox({ children }: { children: React.ReactNode }) {
  /* 좁은 화면에서는 표가 화면 끝까지 찬다 (`.mobile-bleed` — 컨테이너 좌우 여백을 음수 마진으로 되뺀다).
     원본 표는 좌우 여백이 0이다.
     위 여백 `mt-10`(2.5rem = 35px)은 원본이 더 붙어 있어 모바일만 `mt-4`(14px)로 줄인다.
     [미확인] 원본 스크린샷에서 이 간격은 재지 못했다 — 아래 표 행 간격 36px 리듬에 맞춘 값이다. */
  return <div className="mobile-bleed mt-10 border border-line max-md:mt-4">{children}</div>
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
              {/* 모바일 행 높이(36px)에 맞춘 막대. PC 25px : 57px 비율을 그대로 옮겼다 */}
              <Skeleton className="h-[25px] w-full max-md:h-[1.25rem]" />
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
                <ClanMark mark={row.clan.mark} className={MARK} alt={row.clan.name} />
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
  /**
   * 무기 축 (D-169). 기본값 `all` — **넘기지 않으면 기존 개인랭킹 그대로다.**
   *
   * `sniper` / `rifle` 이면 마지막 칸이 통합 래더가 아니라
   * **그 무기로 얻은 래더 증감의 합**(`rating_delta`)이 된다.
   * 무기별 절대 점수를 지어내지 않는다 — 무기 분리는 기록만 나눈다 (`CLAUDE.md` 3-B).
   */
  weapon?: RankWeapon
}

export function PlayerRankTable({
  leagueSlug,
  rows,
  loading,
  error,
  onRetry,
  weapon = 'all',
}: PlayerRankTableProps) {
  const byWeapon = weapon !== 'all'
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
        {/* 무기 탭에서는 통합 래더가 아니라 **그 무기로 얻은 래더 증감의 합**이다 (D-169).
            머리글을 그대로 `래더` 로 두면 같은 자리에 다른 뜻의 숫자가 들어가 거짓말이 된다. */}
        <div className={COL_RATING}>{byWeapon ? '래더증감' : '래더'}</div>
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
                <ClanMark clan={row.clan} className={MARK} alt={row.clan?.name ?? ''} />
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
            <div className={COL_RATING}>
              {byWeapon ? formatRatingDelta(row.rating_delta ?? 0) : formatRating(row.rating)}
            </div>
          </div>
        ))}
      </TableBody>
    </>
  )
}
