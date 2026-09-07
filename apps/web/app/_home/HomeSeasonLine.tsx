'use client'

import { useEffect, useState } from 'react'
import { SEASON_WINDOWS, cloudSeasonLabel, type SeasonWindow } from '@sacloud/contract'

/**
 * ★★홈 맨 위 시즌 한 줄★★ (2026-09-07 · Part 10 ④ · 시안)
 *
 * ```
 *   ▬▬ ▬   Cloud 0 준비기간(9/3~10/1)
 *           SPL · IPL · 10/1 Cloud 1 정식 오픈
 * ```
 * 빨간 리본 26×2 + 하늘색 리본 9×2 · 11px · letter-spacing .14em (시안 실측).
 *
 * ── ★시안의 「Season 0」 을 안 쓴다★
 *   사장님 확정: *「현재 시즌은 반드시 ★Cloud 0★ 으로 표기한다」*.
 *   이름은 `cloudSeasonLabel()` 한 곳에서 온다 — 여기에 글자를 적지 않는다.
 *
 * ── ★날짜를 손으로 적지 않는다★
 *   `SEASON_WINDOWS` 가 진실이다 (`packages/contract/src/seasonWindow.ts`).
 *   시즌 경계가 바뀌면 이 줄이 따라 바뀐다. 두 곳에 적으면 조용히 갈라진다.
 *
 * ── ★홈은 굳어 있다★ (`force-static`)
 *   그래서 서버가 그리는 값은 **빌드 시각** 기준이다. 10/1 이 지나도 재배포 전에는
 *   「Cloud 0 준비기간」이 남는다. 그 거짓말을 막으려고 ★붙은 뒤 한 번 다시 센다★ —
 *   `useEffect` 는 hydration 다음에 돌아서 서버/브라우저가 어긋나지 않는다.
 */

/** 진행 중인 창과 그 다음 창. 어디에도 안 들면 둘 다 `null` */
function pick(at: Date): { now: SeasonWindow | null; next: SeasonWindow | null } {
  const index = SEASON_WINDOWS.findIndex(
    (w) => at >= w.startedAt && (w.endedAt === null || at < w.endedAt),
  )
  if (index < 0) return { now: null, next: null }
  return { now: SEASON_WINDOWS[index] ?? null, next: SEASON_WINDOWS[index + 1] ?? null }
}

/** `2026-10-01T00:00+09:00` → `10/1` */
function shortDate(at: Date): string {
  const kst = new Date(at.getTime() + 9 * 60 * 60 * 1000)
  return `${kst.getUTCMonth() + 1}/${kst.getUTCDate()}`
}

/** 정식 시즌만 `Cloud N` 이다. 그 앞(legacy·beta)은 자기 이름을 쓴다 */
function label(window: SeasonWindow): string {
  return window.seasonType === 'official' ? cloudSeasonLabel(window.number) : window.label
}

export function HomeSeasonLine() {
  /* 빌드 시각으로 먼저 그리고, 붙은 뒤 브라우저 시계로 다시 센다 */
  const [at, setAt] = useState<Date>(() => new Date())
  useEffect(() => {
    setAt(new Date())
  }, [])

  const { now, next } = pick(at)
  /* ★어느 시즌인지 모르면 아무 말도 하지 않는다★ — 지어내지 않는다 */
  if (!now) return null

  const running = now.endedAt === null
  const period = now.endedAt ? `(${shortDate(now.startedAt)}~${shortDate(now.endedAt)})` : null

  return (
    <div className="mb-[26px] flex flex-col items-center gap-[7px]">
      <div className="flex items-center gap-[9px]">
        <span className="h-[2px] w-[26px] bg-[var(--v2-red)]" aria-hidden />
        <span className="h-[2px] w-[9px] bg-[var(--v2-sky)]" aria-hidden />
        <span className="text-[11px] tracking-[.14em] text-[var(--v2-text-muted)]">
          {label(now)}
          {running ? ' 진행중' : ' 준비기간'}
          {period ? <span className="text-[var(--v2-text-ghost)]">{period}</span> : null}
        </span>
      </div>

      {/* 다음 시즌이 없으면 ★이 줄 자체를 안 그린다★ */}
      {next ? (
        <span className="text-[11px] tracking-[.14em] text-[var(--v2-text-faint)]">
          SPL <span className="text-[var(--v2-text-ghost2)]">·</span> IPL{' '}
          <span className="text-[var(--v2-text-ghost2)]">·</span> {shortDate(next.startedAt)}{' '}
          {label(next)} 정식 오픈
        </span>
      ) : null}
    </div>
  )
}
