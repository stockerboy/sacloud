/**
 * 호출 속도 제어.
 *
 * **넥슨이 공개한 한도 수치가 없다.** 스펙 파일에도, 문서 페이지에도 없다.
 * 그래서 숫자를 추측하지 않고 (1) 보수적인 기본값에서 시작해 (2) 429를 받으면 스스로 감속한다.
 * 한도를 알게 되면 `NEXON_RATE_LIMIT_PER_SEC` 만 바꾼다.
 */

export interface Clock {
  now(): number
  sleep(ms: number): Promise<void>
}

export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
}

export interface TokenBucketOptions {
  ratePerSecond: number
  /** 순간적으로 허용할 최대 토큰 수 (기본 1 — 몰아치지 않는다) */
  burst?: number
  clock?: Clock
  /** 감속의 하한. 이보다 느려지지는 않는다 */
  minRatePerSecond?: number
}

/**
 * 토큰 버킷. `take()`가 필요한 만큼 기다린다.
 *
 * 적응형: `slowDown()`이 호출되면 속도를 절반으로 떨어뜨리고, 성공이 이어지면
 * `speedUp()`으로 원래 속도까지만 서서히 되돌린다. 초기값을 넘지 않는다.
 */
export class TokenBucket {
  private readonly clock: Clock
  private readonly initialRate: number
  private readonly minRate: number
  private readonly burst: number
  private rate: number
  private tokens: number
  private lastRefill: number

  constructor(options: TokenBucketOptions) {
    this.clock = options.clock ?? systemClock
    this.initialRate = options.ratePerSecond
    this.minRate = options.minRatePerSecond ?? 0.1
    this.burst = options.burst ?? 1
    this.rate = options.ratePerSecond
    this.tokens = this.burst
    this.lastRefill = this.clock.now()
  }

  get ratePerSecond(): number {
    return this.rate
  }

  private refill(): void {
    const now = this.clock.now()
    const elapsedMs = Math.max(0, now - this.lastRefill)
    this.lastRefill = now
    this.tokens = Math.min(this.burst, this.tokens + (elapsedMs / 1000) * this.rate)
  }

  /** 토큰 하나를 얻을 때까지 기다린다. */
  async take(): Promise<void> {
    this.refill()
    if (this.tokens >= 1) {
      this.tokens -= 1
      return
    }
    const missing = 1 - this.tokens
    const waitMs = Math.ceil((missing / this.rate) * 1000)
    await this.clock.sleep(waitMs)
    this.refill()
    this.tokens = Math.max(0, this.tokens - 1)
  }

  /** 429를 받았을 때 — 속도를 절반으로 떨어뜨린다. */
  slowDown(factor = 0.5): number {
    this.rate = Math.max(this.minRate, this.rate * factor)
    return this.rate
  }

  /** 연속 성공 시 — 초기 속도까지만 되돌린다. */
  speedUp(factor = 1.2): number {
    this.rate = Math.min(this.initialRate, this.rate * factor)
    return this.rate
  }
}

export interface BackoffOptions {
  baseMs?: number
  maxMs?: number
  /** 0~1. 테스트에서 고정값을 주입한다 */
  random?: () => number
}

/**
 * 지수 백오프 + 지터.
 *
 * `attempt`는 0부터. 지터를 넣는 이유는 여러 대상이 같은 순간에 동시에 재시도하면
 * 서버 입장에서는 그것도 부하이기 때문이다.
 */
export function backoffDelayMs(attempt: number, options: BackoffOptions = {}): number {
  const base = options.baseMs ?? 1000
  const max = options.maxMs ?? 60_000
  const random = options.random ?? Math.random
  const exponential = Math.min(max, base * 2 ** Math.max(0, attempt))
  const jitter = exponential * 0.25 * random()
  return Math.round(Math.min(max, exponential + jitter))
}
