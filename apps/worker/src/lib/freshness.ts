/**
 * 신선도(freshness) 정책.
 *
 * 넥슨 이용 조건에 "가져간 데이터는 **최소 30일마다 갱신**"이 명시돼 있다.
 * 다만 그 의무가 어느 데이터 범위까지 어떻게 적용되는지는 아직 검증되지 않았다 `[미확인]`.
 * 그래서 주기를 코드에 고정하지 않고 `NEXON_REFRESH_INTERVAL_DAYS`로 받는다
 * (`docs/NEXON_INGEST_SPEC.md` 6장).
 */

const DAY_MS = 24 * 60 * 60 * 1000

export function refreshDueAt(lastVerifiedAt: Date, intervalDays: number): Date {
  return new Date(lastVerifiedAt.getTime() + intervalDays * DAY_MS)
}

/** 기한이 지났는가. 기한을 모르면(`null`) 지나지 않은 것으로 본다 */
export function isRefreshDue(due: Date | null | undefined, now: Date): boolean {
  return due !== null && due !== undefined && due.getTime() <= now.getTime()
}

/**
 * 기한을 넘겼는데 갱신하지 못한 상태인지.
 * 넘긴 시점을 `staleAt`으로 남겨 두면 나중에 "언제부터 오래된 값인지" 알 수 있다.
 */
export function staleSince(due: Date | null | undefined, now: Date): Date | null {
  return isRefreshDue(due, now) ? now : null
}
