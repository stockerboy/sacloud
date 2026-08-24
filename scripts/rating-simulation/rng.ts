/**
 * 시드 고정 난수 — 같은 시드면 **항상 같은 시즌**이 나온다.
 *
 * `Math.random()` 을 쓰지 않는다. 시뮬레이션 결과를 남에게 보여 주고 다시 돌려서
 * 같은 숫자가 나오지 않으면 그건 근거가 아니라 인상이다.
 *
 * mulberry32 — 32비트 상태 하나짜리 PRNG. 통계 검정을 통과할 만큼 균일하고,
 * 구현이 짧아서 결과를 재현하려는 사람이 직접 확인할 수 있다.
 */
export class Rng {
  private state: number

  constructor(seed: number) {
    // 0을 피한다 — mulberry32는 상태가 0이면 주기가 망가진다
    this.state = (seed >>> 0) || 0x9e3779b9
  }

  /** [0, 1) */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0
    let t = this.state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /** [min, max) 실수 */
  float(min: number, max: number): number {
    return min + this.next() * (max - min)
  }

  /** [min, max] 정수 */
  int(min: number, max: number): number {
    return Math.floor(this.float(min, max + 1))
  }

  /** 표준정규 근사 (Box–Muller). 실력·퍼포먼스 분포에 쓴다 */
  normal(mean = 0, stdDev = 1): number {
    const u1 = Math.max(this.next(), 1e-12)
    const u2 = this.next()
    return mean + stdDev * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
  }

  /** 확률 p로 참 */
  chance(p: number): boolean {
    return this.next() < p
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(0, items.length - 1)]!
  }

  /** 제자리 셔플 대신 새 배열을 준다 (입력을 건드리지 않는다) */
  shuffled<T>(items: readonly T[]): T[] {
    const out = [...items]
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = this.int(0, i)
      ;[out[i], out[j]] = [out[j]!, out[i]!]
    }
    return out
  }
}
