/**
 * 신원 감시의 **판정 로직** — 순수 함수만 둔다 (D-220).
 *
 * 왜 분리하나
 *   DB·API 를 섞으면 테스트가 5초 타임아웃(D-187)에 걸려 조용히 skip 된다.
 *   판정은 여기서 하고, 저장과 호출은 `jobs/identityWatch.ts` 가 한다.
 *
 * 무엇을 판정하나
 *   ① 이번 관측이 **직전과 달라졌는가** — 달라졌을 때만 이력에 한 줄 붙인다
 *   ② 다음에 **언제 다시 볼 것인가** — 최근에 바뀐 계정을 더 자주 본다
 */

/** `user/basic` 이 주는 값 중 우리가 감시하는 두 칸 */
export interface IdentitySnapshot {
  userName: string | null
  clanName: string | null
}

/** 무엇이 달라졌나. `null` 이면 그대로다 (이력에 남기지 않는다) */
export type IdentityChange = 'first' | 'nickname' | 'clan' | 'nickname+clan' | null

/**
 * 넥슨은 무소속을 빈 문자열로 줄 때가 있다. `null` 과 `''` 를 같은 것으로 본다 —
 * 그러지 않으면 **바뀌지 않았는데 바뀐 것으로 보이는** 줄이 계속 쌓인다.
 */
function norm(v: string | null | undefined): string | null {
  if (v === undefined || v === null) return null
  const t = v.trim()
  return t === '' ? null : t
}

/**
 * 직전 관측과 이번 관측을 견준다.
 *
 * `prev` 가 없으면 `'first'` — 처음 본 계정이다. 변경은 아니지만 기준점이 필요하므로 남긴다.
 */
export function diffIdentity(
  prev: IdentitySnapshot | null,
  next: IdentitySnapshot,
): IdentityChange {
  const nu = norm(next.userName)
  const nc = norm(next.clanName)
  if (!prev) return 'first'

  const pu = norm(prev.userName)
  const pc = norm(prev.clanName)

  const nickChanged = pu !== nu
  const clanChanged = pc !== nc

  if (nickChanged && clanChanged) return 'nickname+clan'
  if (nickChanged) return 'nickname'
  if (clanChanged) return 'clan'
  return null
}

/**
 * 감시 주기 (분).
 *
 * **속도가 최우선이라는 지시**에 맞춰 기본을 짧게 잡는다. 다만 무한정 짧게 두면
 * 호출량만 늘고 429 를 부른다. 최근에 바뀐 계정을 짧게, 오래 그대로인 계정을 길게 본다.
 */
export const WATCH_INTERVAL_MINUTES = {
  /** 방금 바뀐 계정 — 연달아 바뀌는 경우가 많다 (위장닉 만료 등) */
  hot: 2,
  /** 최근 하루 안에 바뀐 적 있음 */
  warm: 10,
  /** 한동안 그대로 */
  cold: 60,
} as const

export type WatchTier = keyof typeof WATCH_INTERVAL_MINUTES

/**
 * 다음 등급을 정한다.
 *
 * @param changed        이번 관측의 판정 결과
 * @param lastChangedAt  마지막으로 값이 바뀐 시각 (없으면 한 번도 안 바뀐 것)
 * @param now            지금
 */
export function nextWatchTier(
  changed: IdentityChange,
  lastChangedAt: Date | null,
  now: Date,
): WatchTier {
  // 이번에 바뀌었으면 무조건 hot 이다. 연쇄 변경을 놓치지 않는다
  if (changed === 'nickname' || changed === 'clan' || changed === 'nickname+clan') return 'hot'

  if (!lastChangedAt) return 'cold'
  const hours = (now.getTime() - lastChangedAt.getTime()) / 3_600_000
  if (hours < 1) return 'hot'
  if (hours < 24) return 'warm'
  return 'cold'
}

/** 다음 조회 시각 */
export function nextWatchAt(tier: WatchTier, now: Date): Date {
  return new Date(now.getTime() + WATCH_INTERVAL_MINUTES[tier] * 60_000)
}

/**
 * 한 바퀴 도는 데 걸리는 시간(초)을 낸다.
 *
 * 사용자에게 "우리가 얼마나 빠른가" 를 말할 때 쓰는 숫자다. 추정하지 말고 이걸로 답한다.
 */
export function sweepSeconds(targetCount: number, requestsPerSecond: number): number {
  if (requestsPerSecond <= 0) return Number.POSITIVE_INFINITY
  return targetCount / requestsPerSecond
}
