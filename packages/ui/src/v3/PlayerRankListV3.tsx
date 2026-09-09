'use client'

/**
 * ★★개인랭킹 — Sleeper 톤 카드 목록★★ (2026-09-09 · 사장님 «한 장만 해봐»)
 *
 * ── ★왜 표가 아니라 카드인가★
 *   > "왤케 재미가 없지 순위가 모바일에서 한눈에 안보여서 그런가" — 사장님, 2026-09-09
 *
 *   표는 폰에서 칸을 접는다. 접으면 값이 사라지고, 값이 사라지면 재미가 없다.
 *   Sleeper 는 표를 안 쓴다 — ★줄 하나가 카드 하나★ 이고, 카드 안에서 위아래로 쌓는다.
 *   폭이 좁아져도 접을 것이 없다.
 *
 *   ```
 *   ┌────────────────────────────────────────────┐
 *   │  1  [마크]  닉네임                   3184  │
 *   │             클랜명 · 24승 8패        래더  │
 *   │             ▬▬▬▬▬▬▬▬░░░ 75%   킬 58%      │
 *   └────────────────────────────────────────────┘
 *   ```
 *
 * ── ★무엇을 안 바꿨나★
 *   ★데이터는 한 줄도 안 건드렸다.★ 같은 `PlayerRankRow` 를 같은 API 에서 받는다.
 *   순위 공식도 그대로다 (새 공식은 사장님이 «아직은 하지말고» 라고 하셨다).
 *   무기 축 · 커서 페이지네이션 · 알 · 링크 · 로딩/오류/재시도 전부 살아 있다.
 *   ★`PlayerRankTable` 은 한 줄도 안 고쳤다★ — 옛 표는 그대로 있고, 화면이 어느 쪽을
 *   그릴지만 고른다 (`CLAUDE.md` 1-4).
 *
 * ── ★리그별 분기가 없다★
 *   보여 줄 칸은 `leagueScreen()` 이 준 `columns` 만 본다. 리그 이름을 안 본다.
 */

import Link from 'next/link'
import type { PlayerRankRow, RankColumns, RankWeapon } from '@sacloud/contract'
import { ClanMark } from '../common/ClanMark'
import { Egg } from '../egg/Egg'
import { useEggKnowledge } from '../egg/EggContext'
import type { EggState } from '../egg/eggState'
import { EmptyState } from '../common/EmptyState'
import { ErrorState } from '../common/ErrorState'
import { Skeleton } from '../common/Skeleton'
import { leagueClanPath, leaguePlayerPath } from '../common/paths'

export interface PlayerRankListV3Props {
  leagueSlug: string
  rows?: readonly PlayerRankRow[]
  weapon?: RankWeapon
  columns: RankColumns
  loading?: boolean
  error?: boolean
  onRetry?: () => void
}

/**
 * 1·2·3위 레일 색. 4위부터는 없다 —
 * ★모든 줄에 색을 칠하면 아무 줄도 안 튄다★ (v2 의 `rankTone` 과 다른 판단이다).
 */
const MEDAL: Readonly<Record<number, string>> = {
  1: 'var(--v3-gold)',
  2: 'var(--v3-silver)',
  3: 'var(--v3-bronze)',
}

/** 승률 막대 색 — `rateTone` 과 같은 경계(40/50/60)를 쓴다. 새 경계를 지어내지 않는다 */
function rateFill(rate: number | null | undefined): string {
  if (rate === null || rate === undefined) return 'var(--v3-text-ghost)'
  if (rate >= 60) return 'var(--v3-good)'
  if (rate >= 40) return 'var(--v3-accent)'
  return 'var(--v3-bad)'
}

/** `73.4%` 처럼 소수 한 자리. 표(`formatRate`)와 같은 자릿수다 */
function pct(value: number): string {
  return `${value.toFixed(1)}%`
}

export function PlayerRankListV3({
  leagueSlug,
  rows,
  weapon = 'all',
  columns,
  loading = false,
  error = false,
  onRetry,
}: PlayerRankListV3Props) {
  const { brokenPlayerIds } = useEggKnowledge()
  const byWeapon = weapon !== 'all'

  if (error) return <ErrorState message="기록을 불러오지 못했습니다." onRetry={onRetry} />
  if (loading && !rows) return <ListSkeleton />
  if (!rows || rows.length === 0) return <EmptyState message="아직 기록된 플레이어가 없습니다." />

  return (
    <ol className="flex list-none flex-col gap-[var(--v3-gap)] p-0">
      {rows.map((row) => {
        /* 개인 알 — 본인이 인증해 깬 선수만 기록이 열린다 (사양 3장) */
        const egg: EggState = brokenPlayerIds.includes(row.player.id) ? 'broken' : 'sealed'
        const medal = MEDAL[row.rank]
        /*
         * 오른쪽 큰 수가 무엇인가.
         *   무기 탭   그 무기로 얻은 ★래더 증감의 합★ (`rating_delta`) — 절대 점수가 아니다
         *   통합      통합 래더
         *   래더가 없는 리그(`10mountain`) 는 승률을 큰 수로 올린다 — 빈 자리를 안 만든다
         */
        const bigLabel = columns.rating ? (byWeapon ? '래더증감' : '래더') : '승률'
        const delta = row.rating_delta
        const bigValue = columns.rating
          ? byWeapon
            ? delta === null || delta === undefined
              ? '—'
              : `${delta > 0 ? '+' : ''}${delta.toLocaleString('ko-KR')}`
            : row.rating.toLocaleString('ko-KR')
          : pct(row.win_rate)

        return (
          <li
            key={row.player.id}
            className="relative overflow-hidden rounded-[var(--v3-radius)] bg-[var(--v3-row)]"
          >
            {/* 1~3위 레일 — 색은 왼쪽 3px 한 줄뿐이다. 넓은 면에 안 칠한다 */}
            {medal ? (
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 w-[3px]"
                style={{ background: medal }}
              />
            ) : null}

            <div className="flex items-center gap-3 py-[10px] pl-[15px] pr-[var(--v3-pad)]">
              {/* ── 순위 */}
              {columns.rank ? (
                <div
                  className="w-[30px] shrink-0 text-right text-[19px] font-extrabold leading-none tracking-[-0.03em] tabular-nums"
                  style={{ color: medal ?? 'var(--v3-text-dim)' }}
                >
                  {row.rank}
                </div>
              ) : null}

              {/* ── 마크 + 닉네임 + 클랜/전적 */}
              <Link
                className="flex shrink-0 items-center"
                href={leaguePlayerPath(leagueSlug, row.player.id)}
                tabIndex={-1}
                aria-hidden="true"
              >
                <Egg state={egg} size="xs" label={row.player.name} className="max-md:h-8! max-md:w-8!">
                  <ClanMark clan={row.clan} alt={row.clan?.name ?? ''} />
                </Egg>
              </Link>

              <div className="min-w-0 flex-1">
                <Link className="block truncate" href={leaguePlayerPath(leagueSlug, row.player.id)}>
                  {/* `a { color: inherit }` — 색은 안쪽 span 에 준다 (D-231) */}
                  <span className="text-[15px] font-bold leading-tight text-[var(--v3-text-strong)]">
                    {row.player.name}
                  </span>
                </Link>
                <div className="mt-[3px] flex items-center gap-1.5 text-[11px] leading-none text-[var(--v3-text-muted)]">
                  {/* 소속이 없으면 `무소속` 이라고 적는다. `-` 로 감추지 않는다 */}
                  {row.clan ? (
                    <Link className="truncate" href={leagueClanPath(leagueSlug, row.clan.slug)}>
                      <span className="truncate">{row.clan.name}</span>
                    </Link>
                  ) : (
                    <span className="truncate text-[var(--v3-text-ghost)]">무소속</span>
                  )}
                  <span aria-hidden="true" className="text-[var(--v3-text-ghost)]">
                    ·
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {row.win}승 {row.lose}패
                  </span>
                </div>
              </div>

              {/* ── 오른쪽 큰 수 */}
              <div className="shrink-0 text-right">
                <div className="text-[17px] font-extrabold leading-none tracking-[-0.02em] tabular-nums text-[var(--v3-text-strong)]">
                  {bigValue}
                </div>
                <div className="mt-[4px] text-[9.5px] font-bold uppercase leading-none tracking-[0.09em] text-[var(--v3-text-ghost)]">
                  {bigLabel}
                </div>
              </div>
            </div>

            {/* ── 아랫줄: 승률 막대 + 킬뎃.
                   ★폰에서 접지 않는다★ — 표였다면 여기서 두 칸이 사라졌다 */}
            {columns.winRate || columns.kd ? (
              <div className="flex items-center gap-2.5 pb-[10px] pl-[15px] pr-[var(--v3-pad)]">
                {columns.winRate ? (
                  <>
                    <div className="h-[4px] min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--v3-track)]">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.max(0, Math.min(100, row.win_rate))}%`,
                          background: rateFill(row.win_rate),
                        }}
                      />
                    </div>
                    <span
                      className="shrink-0 text-[11px] font-bold leading-none tabular-nums"
                      style={{ color: rateFill(row.win_rate) }}
                    >
                      {pct(row.win_rate)}
                    </span>
                  </>
                ) : (
                  <span className="flex-1" />
                )}
                {/* 킬뎃은 무소속리그에서 `null` 이다 (D-107). 값이 없으면 조각째 안 그린다 */}
                {columns.kd && row.kd_rate !== null ? (
                  <span className="shrink-0 text-[11px] leading-none tabular-nums text-[var(--v3-text-muted)]">
                    킬 <b className="font-bold text-[var(--v3-text)]">{pct(row.kd_rate)}</b>
                  </span>
                ) : null}
              </div>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}

/** 뼈대 — 카드 높이(62px)를 맞춰 목록이 튀지 않게 한다 */
function ListSkeleton() {
  return (
    <div className="flex flex-col gap-[var(--v3-gap)]">
      {Array.from({ length: 10 }, (_, i) => (
        <Skeleton key={i} className="h-[62px] w-full rounded-[var(--v3-radius)]" />
      ))}
    </div>
  )
}
