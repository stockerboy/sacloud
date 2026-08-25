/**
 * 무기별 전적 집계 규칙 (D-149).
 *
 * 실제 잡이 쓰는 `accumulateWeaponBuckets` 를 그대로 부른다 — 규칙을 다시 옮겨 적지 않는다.
 *
 * 여기서 고정하는 것
 *   1. 스나이퍼 경기 + K/D 있음  → 스나이퍼 버킷만 늘어난다
 *   2. 라이플 경기 + K/D 있음    → 라이플 버킷만 늘어난다
 *   3. K/D 를 모르는 경기는 **분모에 들어가지 않는다** (0킬로 세지 않는다)
 *   4. 아는 경기 3 + 모르는 경기 1 → 아는 3판으로 정상 집계된다 (부분 집계)
 *   5. 두 무기가 서로 섞이지 않는다
 *   6. 같은 입력이면 같은 결과다 (결정적)
 */
import { describe, expect, it } from 'vitest'
import { accumulateWeaponBuckets, WEAPON_RIFLE, WEAPON_SNIPER } from '../jobs/weaponRebuild.js'

type Row = Parameters<typeof accumulateWeaponBuckets>[0][number]

/** K/D 를 아는 한 판 */
function known(weapon: number, kill: number, death: number, extra: Partial<Row> = {}): Row {
  return {
    playerId: 'P1',
    weapon,
    kill,
    death,
    assist: 1,
    headshot: 2,
    ratingUpdate: 10,
    won: true,
    ...extra,
  }
}

/** 라인업으로 명단만 복원된 한 판 — K/D 를 모른다 */
function unknown(weapon: number, extra: Partial<Row> = {}): Row {
  return {
    playerId: 'P1',
    weapon,
    kill: null,
    death: null,
    assist: null,
    headshot: null,
    ratingUpdate: 7,
    won: false,
    ...extra,
  }
}

const bucketOf = (rows: Row[], weapon: number) =>
  accumulateWeaponBuckets(rows).get('P1')?.get(weapon)

describe('무기별로 나눠 담는다', () => {
  it('스나이퍼 경기는 스나이퍼 버킷에만 들어간다', () => {
    const acc = accumulateWeaponBuckets([known(WEAPON_SNIPER, 12, 7)])
    expect(acc.get('P1')?.get(WEAPON_SNIPER)).toMatchObject({
      games: 1,
      knownStatGames: 1,
      kill: 12,
      death: 7,
    })
    expect(acc.get('P1')?.get(WEAPON_RIFLE)).toBeUndefined()
  })

  it('라이플 경기는 라이플 버킷에만 들어간다', () => {
    const acc = accumulateWeaponBuckets([known(WEAPON_RIFLE, 9, 11)])
    expect(acc.get('P1')?.get(WEAPON_RIFLE)).toMatchObject({
      games: 1,
      knownStatGames: 1,
      kill: 9,
      death: 11,
    })
    expect(acc.get('P1')?.get(WEAPON_SNIPER)).toBeUndefined()
  })

  it('두 무기를 섞어 써도 값이 넘어가지 않는다', () => {
    const acc = accumulateWeaponBuckets([
      known(WEAPON_SNIPER, 12, 7),
      known(WEAPON_RIFLE, 3, 9),
      known(WEAPON_SNIPER, 8, 4),
    ])
    expect(acc.get('P1')?.get(WEAPON_SNIPER)).toMatchObject({ games: 2, kill: 20, death: 11 })
    expect(acc.get('P1')?.get(WEAPON_RIFLE)).toMatchObject({ games: 1, kill: 3, death: 9 })
  })

  it('무기를 모르는 경기는 어느 버킷에도 넣지 않는다', () => {
    const acc = accumulateWeaponBuckets([known(null as unknown as number, 5, 5)])
    expect(acc.size).toBe(0)
  })
})

describe('K/D 를 모르는 경기 (D-148 라인업 복원 참가자)', () => {
  it('0킬로 세지 않는다 — knownStatGames 에 들어가지 않는다', () => {
    const bucket = bucketOf([unknown(WEAPON_SNIPER)], WEAPON_SNIPER)
    expect(bucket).toMatchObject({ games: 1, knownStatGames: 0, kill: 0, death: 0 })
  })

  it('그래도 뛴 경기이므로 games 와 승패에는 들어간다', () => {
    const bucket = bucketOf([unknown(WEAPON_SNIPER)], WEAPON_SNIPER)
    // 승패는 라인업이 알려 준다. 모르는 것은 K/D 뿐이다
    expect(bucket?.games).toBe(1)
    expect(bucket?.lose).toBe(1)
  })

  it('래더 증감도 들어간다 — 래더는 K/D 와 무관하게 이미 계산돼 있다', () => {
    const bucket = bucketOf([unknown(WEAPON_RIFLE)], WEAPON_RIFLE)
    expect(bucket?.ratingDelta).toBe(7)
  })

  it('모르는 경기 하나 때문에 아는 경기까지 버리지 않는다 (부분 집계)', () => {
    const bucket = bucketOf(
      [
        known(WEAPON_SNIPER, 10, 5),
        known(WEAPON_SNIPER, 12, 6),
        known(WEAPON_SNIPER, 8, 9),
        unknown(WEAPON_SNIPER),
      ],
      WEAPON_SNIPER,
    )
    expect(bucket).toMatchObject({
      games: 4,
      knownStatGames: 3,
      kill: 30,
      death: 20,
    })
  })

  it('K/D 의 분모는 knownStatGames 다 — games 로 나누면 평균이 내려간다', () => {
    const bucket = bucketOf(
      [known(WEAPON_RIFLE, 9, 3), unknown(WEAPON_RIFLE), unknown(WEAPON_RIFLE)],
      WEAPON_RIFLE,
    )
    expect(bucket?.games).toBe(3)
    expect(bucket?.knownStatGames).toBe(1)
    // 판당 9킬이지 3킬이 아니다
    expect((bucket?.kill ?? 0) / (bucket?.knownStatGames ?? 1)).toBe(9)
  })
})

describe('결정적이다', () => {
  it('같은 입력을 두 번 넣으면 같은 결과다', () => {
    const rows = [known(WEAPON_SNIPER, 12, 7), unknown(WEAPON_RIFLE), known(WEAPON_RIFLE, 4, 4)]
    const first = accumulateWeaponBuckets(rows)
    const second = accumulateWeaponBuckets(rows)
    expect(JSON.stringify([...first.get('P1')!])).toBe(JSON.stringify([...second.get('P1')!]))
  })

  it('누적 함수는 입력 배열을 건드리지 않는다', () => {
    const rows = [known(WEAPON_SNIPER, 12, 7)]
    const snapshot = JSON.stringify(rows)
    accumulateWeaponBuckets(rows)
    expect(JSON.stringify(rows)).toBe(snapshot)
  })
})

describe('선수별로 나뉜다', () => {
  it('다른 선수의 기록이 섞이지 않는다', () => {
    const acc = accumulateWeaponBuckets([
      known(WEAPON_SNIPER, 10, 2),
      known(WEAPON_SNIPER, 99, 99, { playerId: 'P2' }),
    ])
    expect(acc.get('P1')?.get(WEAPON_SNIPER)).toMatchObject({ kill: 10, death: 2 })
    expect(acc.get('P2')?.get(WEAPON_SNIPER)).toMatchObject({ kill: 99, death: 99 })
  })
})
