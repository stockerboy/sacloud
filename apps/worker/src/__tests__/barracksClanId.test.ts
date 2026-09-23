import { describe, expect, it } from 'vitest'
import { BARRACKS_CLAN_ID_OVERRIDE, barracksClanIdOf } from '../jobs/barracksCollect'

describe('병영 clan_id 바꿔 부르기 (2026-09-24 deluxe)', () => {
  it('deluxe 는 미러 slug 대신 병영 id 로 부른다', () => {
    expect(barracksClanIdOf('ferwfwfwfwf')).toBe('042222741')
  })
  it('표에 없는 slug 는 그대로', () => {
    expect(barracksClanIdOf('bluestream01')).toBe('bluestream01')
  })
  it('표는 근거가 있는 것만 — 지금은 한 줄', () => {
    expect(Object.keys(BARRACKS_CLAN_ID_OVERRIDE)).toEqual(['ferwfwfwfwf'])
  })
})
