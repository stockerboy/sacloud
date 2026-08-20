/**
 * 결정적(deterministic) 난수.
 * 같은 seed면 항상 같은 픽스처가 나와야 테스트·스냅샷이 안정적이다.
 * mulberry32 — 짧고 분포가 충분히 고르며 외부 의존성이 없다.
 */
export class Rng {
  private state: number

  constructor(seed: number) {
    this.state = seed >>> 0
  }

  /** [0, 1) */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0
    let t = this.state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /** [min, max] 정수 */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1))
  }

  /** 소수 자리수를 지정한 실수 */
  float(min: number, max: number, digits = 2): number {
    const value = min + this.next() * (max - min)
    const factor = 10 ** digits
    return Math.round(value * factor) / factor
  }

  /** 확률 p로 true */
  chance(p: number): boolean {
    return this.next() < p
  }

  /** 배열에서 하나 고른다 (빈 배열이면 예외) */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('빈 배열에서 값을 고를 수 없습니다')
    const item = items[Math.floor(this.next() * items.length)]
    if (item === undefined) throw new Error('난수 인덱스가 배열 범위를 벗어났습니다')
    return item
  }

  /** 배열에서 n개를 중복 없이 고른다 (원본 배열은 변경하지 않는다) */
  sample<T>(items: readonly T[], count: number): T[] {
    const pool = [...items]
    const picked: T[] = []
    const size = Math.min(count, pool.length)
    for (let i = 0; i < size; i += 1) {
      const index = Math.floor(this.next() * pool.length)
      const [item] = pool.splice(index, 1)
      if (item !== undefined) picked.push(item)
    }
    return picked
  }

  /** 셔플 (새 배열 반환) */
  shuffle<T>(items: readonly T[]): T[] {
    const result = [...items]
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.next() * (i + 1))
      const a = result[i]
      const b = result[j]
      if (a !== undefined && b !== undefined) {
        result[i] = b
        result[j] = a
      }
    }
    return result
  }
}

/** 픽스처 전역 시드. 바꾸면 모든 Mock 데이터가 바뀐다. */
export const FIXTURE_SEED = 20260820
