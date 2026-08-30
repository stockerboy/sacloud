/**
 * 경기 상세 **포지션 줄** (D-199 · SITE_SPEC_V2).
 *
 * ```
 * 차값 B리베 / 누검 숏포지 (S) / 쨔잉나 2F / yuhwan 숏포지 / huwho 스나수
 * ```
 *
 * ── 왜 테스트가 있나
 *   여기 분기는 **틀려도 화면이 멀쩡해 보인다.** `(S)` 가 잘못 붙어도 그냥 글자로 보이고,
 *   포지션이 빠져도 이름만 나와서 정상처럼 읽힌다. 그런데 둘 다 **거짓 정보**다 —
 *   사용자가 못 박았다: **"스나수가 무조건 스나를 드는것만은 아니야"**.
 *   `lineupCopy` 의 다른 분기와 같은 이유로 테스트로 고정한다.
 */
import { describe, expect, it } from 'vitest'
import { WEAPON } from '@sacloud/contract'
import { hasAnyPosition, lineupPositionText } from '../record/lineupCopy'

describe('lineupPositionText — 포지션 + 그 판의 무기', () => {
  it('사용자 원문 그대로 만든다', () => {
    const entries = [
      { name: '차값', position_label: 'B리베', weapon: WEAPON.RIFLE },
      { name: '누검', position_label: '숏포지', weapon: WEAPON.SNIPER },
      { name: '쨔잉나', position_label: '2F', weapon: null },
      { name: 'yuhwan', position_label: '숏포지', weapon: WEAPON.RIFLE },
      { name: 'huwho', position_label: '스나수', weapon: null },
    ]
    expect(entries.map(lineupPositionText).join(' / ')).toBe(
      '차값 B리베 / 누검 숏포지 (S) / 쨔잉나 2F / yuhwan 숏포지 / huwho 스나수',
    )
  })

  it('스나수라도 그 판에 스나를 안 들었으면 `(S)` 가 붙지 않는다', () => {
    expect(lineupPositionText({ name: 'huwho', position_label: '스나수', weapon: WEAPON.RIFLE })).toBe(
      'huwho 스나수',
    )
  })

  it('스나수가 아니어도 그 판에 스나를 들었으면 `(S)` 가 붙는다', () => {
    expect(lineupPositionText({ name: '누검', position_label: '숏포지', weapon: WEAPON.SNIPER })).toBe(
      '누검 숏포지 (S)',
    )
  })

  it('무기를 모르면 아무것도 붙이지 않는다 — 안 붙은 것이 "라플이었다" 는 뜻은 아니다 (D-034)', () => {
    expect(lineupPositionText({ name: '아렴', position_label: '2F', weapon: null })).toBe('아렴 2F')
  })

  it('포지션을 모르면 **이름만** 적는다. `-` 나 `알수없음` 으로 채우지 않는다 (D-106)', () => {
    expect(lineupPositionText({ name: 'Jamez', position_label: null, weapon: null })).toBe('Jamez')
    expect(lineupPositionText({ name: 'Jamez', position_label: '  ', weapon: null })).toBe('Jamez')
  })

  it('포지션은 몰라도 그 판에 스나를 들었으면 그 사실은 적는다', () => {
    expect(lineupPositionText({ name: 'Jamez', position_label: null, weapon: WEAPON.SNIPER })).toBe(
      'Jamez (S)',
    )
  })
})

describe('hasAnyPosition — 줄을 그릴지 말지', () => {
  it('아무도 포지션을 모르면 줄을 그리지 않는다', () => {
    expect(hasAnyPosition([{ position_label: null }, { position_label: '  ' }])).toBe(false)
  })

  it('한 명이라도 알면 그린다', () => {
    expect(hasAnyPosition([{ position_label: null }, { position_label: '2F' }])).toBe(true)
  })

  it('참가자가 없으면 그리지 않는다', () => {
    expect(hasAnyPosition([])).toBe(false)
  })
})
