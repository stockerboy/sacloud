import Link from 'next/link'
import type { ClanRankRow, PlayerRankRow, RankWeapon } from '@sacloud/contract'
import { ClanMark } from '../common/ClanMark'
/* 승률·킬뎃 두 칸만 서플라이 등급색을 쓴다 (2026-08-30 사용자 지시) */
import { rateClass } from '../common/rate'
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
import { leaguePlayerPath } from '../common/paths'
import {
  COL_HIDDEN,
  COL_NAME,
  COL_RANK,
  COL_RATING,
  COL_STAT,
  HEAD,
  MARK,
  NUM,
  RANK_TOP,
  ROW,
  SUB,
} from './rankStyles'

/**
 * 클랜랭킹 / 개인랭킹 표.
 *
 * ── 칸을 줄였다 (2026-08-30, 사용자 지시)
 *   예전에는 원본 3rd.supply 의 칸 구성을 그대로 옮겨 개인랭킹이 여덟 칸이었다.
 *   한눈에 안 읽혀서 **핵심만 칸으로 세운다.**
 *
 *   | 표 | 지금 칸 | 접은 것 (없앤 것이 아니다) |
 *   |---|---|---|
 *   | 클랜랭킹 | 순위 · 클랜 · 승률 · 래더 | 승리/패배 → 승률 아래 `40승 25패` |
 *   | 개인랭킹 | 순위 · 닉네임 · 승률 · 킬뎃 · 래더 | 승리/패배 → 승률 아래, 평균킬 → 킬뎃 아래 |
 *
 *   데이터는 한 줄도 사라지지 않았다. 화면 위계만 바뀌었다.
 *   **모든 리그에 똑같이 적용한다.** 리그별로 칸을 감추는 분기는 두지 않는다.
 *
 * ── 색
 *   표 전체에서 빨강(`--color-accent`)은 **1위 숫자 하나**에만 쓴다.
 *   **승률과 킬뎃 두 칸만은 예외로 서플라이 등급색을 그대로 쓴다** (2026-08-30 사용자 지시:
 *   *"승률과 킬뎃은 서플라이의 색깔체계를 똑같이 따라해 나머지는 서플을 아무것도 따라하지마"*).
 *   50%↑ 초록 · 55%↑ 주황 · 60%↑ 파랑 · 65%↑ 노랑. 65 이상만 원본의 밝은배경용 빨강 대신
 *   어두운배경용 노랑을 쓴다 — 빨강은 강조색과 겹친다. 그 밖의 칸은 무채색이다.
 *
 * ── 모바일 (2026-08-28 실측 유지)
 *   좁은 화면에서는 `순위 · 이름 · 래더` 세 칸으로 줄인다.
 *   행 간격 36px · 클랜마크 1.4rem 리듬은 `rankStyles.ts` 가 들고 있다.
 */

function Unit({ children }: { children: React.ReactNode }) {
  return <span className="ml-0.5 text-xs text-faint">{children}</span>
}

/** 지표 한 칸 — 큰 숫자 + 그 아래 접어 둔 보조 수치 */
function Stat({
  value,
  unit,
  sub,
  className = '',
  /**
   * 승률·킬뎃 등급색 (2026-08-30 사용자 지시).
   *
   * *"승률과 킬뎃은 서플라이의 색깔체계를 똑같이 따라해"* — 그래서 이 두 칸만
   * `rateClass` 를 다시 붙인다. 나머지 칸(래더·순위·이름)은 무채색 그대로다.
   * 색 정의는 `packages/ui/src/common/rate.ts` 와 `styles.css` 의 `--color-rate-*` 다.
   */
  tone = '',
}: {
  value: string
  unit?: string
  sub?: React.ReactNode
  className?: string
  tone?: string
}) {
  return (
    <div className={className}>
      <span className={`${NUM} ${tone === '' ? 'text-text-strong' : tone}`}>{value}</span>
      {unit ? <Unit>{unit}</Unit> : null}
      {sub ? <span className={SUB}>{sub}</span> : null}
    </div>
  )
}

/**
 * 제목 + 안내문구 줄.
 * 화면 순서: 제목줄 → (클랜랭킹만) 부리그 탭 → 표. 그래서 제목과 표를 분리해 둔다.
 */
export function RankHeader({ title, notice }: { title: string; notice: string }) {
  return (
    /* 좁은 화면에서는 한 줄에 나란히 두지 않는다 — 안내문구가 제목을 밀어 두 줄로 쪼갠다 */
    <div className="mb-6 flex items-baseline max-md:flex-col max-md:items-start">
      <h1 className="font-display text-3xl tracking-wide text-text-strong max-md:whitespace-nowrap max-md:text-2xl">
        {title}
      </h1>
      <div className="ml-4 text-sm text-faint max-md:ml-0 max-md:mt-1.5">{notice}</div>
    </div>
  )
}

/** 표 테두리 박스 */
export function RankBox({ children }: { children: React.ReactNode }) {
  /* 좁은 화면에서는 표가 화면 끝까지 찬다 (`.mobile-bleed` — 컨테이너 좌우 여백을 음수 마진으로 되뺀다) */
  return (
    <div className="mobile-bleed mt-6 rounded-[var(--radius)] border border-line max-md:mt-4">
      {children}
    </div>
  )
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
            <div key={col} className="flex-1 px-2">
              {/* 모바일 행 높이(36px)에 맞춘 막대 */}
              <Skeleton className="h-[22px] w-full max-md:h-[1.25rem]" />
            </div>
          ))}
        </div>
      ))}
    </>
  )
}

/** 1위만 강조한다 — 표에서 빨강을 쓰는 자리는 여기 하나다 */
function rankClass(rank: number): string {
  return `${COL_RANK} ${NUM} ${rank === 1 ? RANK_TOP : 'text-meta'}`
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
        <div className={COL_NAME}>클랜</div>
        <div className={`${COL_STAT} ${COL_HIDDEN}`}>승률</div>
        <div className={COL_RATING}>래더</div>
      </div>
      <TableBody
        loading={loading}
        error={error}
        onRetry={onRetry}
        columns={4}
        isEmpty={!rows || rows.length === 0}
        emptyMessage="배치고사가 종료된 클랜이 없습니다."
      >
        {rows?.map((row) => (
          <div key={row.clan.id} className={ROW}>
            <div className={rankClass(row.rank)}>{row.rank}</div>
            <div className={COL_NAME}>
              <Link
                className="flex min-w-0 items-center hover:text-text-strong"
                href={`/league/${leagueSlug}/clan/${row.clan.slug}`}
              >
                <ClanMark mark={row.clan.mark} className={MARK} alt={row.clan.name} />
                <span className="truncate">{row.clan.name}</span>
              </Link>
            </div>
            {/* 승/패는 없앤 것이 아니라 승률 아래로 접었다 */}
            <Stat
              className={`${COL_STAT} ${COL_HIDDEN}`}
              value={formatRate(row.win_rate)}
              tone={rateClass(row.win_rate)}
              unit="%"
              sub={
                <>
                  {formatCount(row.win)}승 {formatCount(row.lose)}패
                </>
              }
            />
            <div className={`${COL_RATING} ${NUM} text-text-strong`}>
              {formatRating(row.rating)}
            </div>
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
        <div className={COL_NAME}>닉네임</div>
        <div className={`${COL_STAT} ${COL_HIDDEN}`}>승률</div>
        <div className={`${COL_STAT} ${COL_HIDDEN}`}>킬뎃</div>
        {/* 무기 탭에서는 통합 래더가 아니라 **그 무기로 얻은 래더 증감의 합**이다 (D-169).
            머리글을 그대로 `래더` 로 두면 같은 자리에 다른 뜻의 숫자가 들어가 거짓말이 된다. */}
        <div className={COL_RATING}>{byWeapon ? '래더증감' : '래더'}</div>
      </div>
      <TableBody
        loading={loading}
        error={error}
        onRetry={onRetry}
        columns={5}
        isEmpty={!rows || rows.length === 0}
        emptyMessage="배치고사가 종료된 플레이어가 없습니다."
      >
        {rows?.map((row) => (
          <div key={row.player.id} className={ROW}>
            <div className={rankClass(row.rank)}>{row.rank}</div>
            <div className={COL_NAME}>
              <Link
                className="flex min-w-0 items-center hover:text-text-strong"
                href={leaguePlayerPath(leagueSlug, row.player.id)}
              >
                {/* 무소속이어도 **자리를 비우지 않는다** — fallback 마크를 그린다 (D-146).
                    `clan ? ... : null` 로 감싸면 소속 없는 선수 옆이 통째로 빈다. */}
                <ClanMark clan={row.clan} className={MARK} alt={row.clan?.name ?? ''} />
                <span className="truncate">{row.player.name}</span>
              </Link>
            </div>
            <Stat
              className={`${COL_STAT} ${COL_HIDDEN}`}
              value={formatRate(row.win_rate)}
              tone={rateClass(row.win_rate)}
              unit="%"
              sub={
                <>
                  {formatCount(row.win)}승 {formatCount(row.lose)}패
                </>
              }
            />
            {/* 무소속리그는 누적 킬뎃을 공개하지 않는다. 값이 없으면 칸을 비운다 (D-107) */}
            {row.kd_rate === null ? (
              <div className={`${COL_STAT} ${COL_HIDDEN} text-faint`}>-</div>
            ) : (
              /* 평균킬은 킬뎃 아래로 접었다 */
              <Stat
                className={`${COL_STAT} ${COL_HIDDEN}`}
                value={formatRate(row.kd_rate)}
                tone={rateClass(row.kd_rate)}
                unit="%"
                sub={<>{formatAverage(row.kill_per_match)}킬</>}
              />
            )}
            <div className={`${COL_RATING} ${NUM} text-text-strong`}>
              {byWeapon ? formatRatingDelta(row.rating_delta ?? 0) : formatRating(row.rating)}
            </div>
          </div>
        ))}
      </TableBody>
    </>
  )
}
