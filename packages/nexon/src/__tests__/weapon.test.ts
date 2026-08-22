/**
 * 라플/스나 판정 회귀 테스트 (D-114).
 *
 * 이 파일이 지키는 약속은 하나다 — **모르면 찍지 않는다.**
 * 틀린 분류는 그 선수의 포지션 기록을 통째로 오염시키고,
 * 사용자는 그게 추정값이라는 것을 알 수 없다.
 */
import { describe, expect, it } from 'vitest'
import {
  aggregateKillsFromBattleLog,
  classifyWeapon,
  hitSignalsOf,
  killSignalsOf,
  WEAPON_CODE,
} from '../weapon.js'

describe('두 신호가 일치할 때', () => {
  it('킬·적중이 모두 라플이면 라플이다', () => {
    const verdict = classifyWeapon({ rifleKills: 12, sniperKills: 1, arHits: 80, srHits: 3 })
    expect(verdict.role).toBe('rifle')
    expect(verdict.weapon).toBe(WEAPON_CODE.rifle)
  })

  it('킬·적중이 모두 스나면 스나다', () => {
    const verdict = classifyWeapon({ rifleKills: 0, sniperKills: 14, arHits: 2, srHits: 40 })
    expect(verdict.role).toBe('sniper')
    expect(verdict.weapon).toBe(WEAPON_CODE.sniper)
  })
})

describe('신호가 어긋나거나 없을 때 — 찍지 않는다', () => {
  it('킬은 라플인데 적중은 스나면 unknown이다', () => {
    const verdict = classifyWeapon({ rifleKills: 10, sniperKills: 2, arHits: 3, srHits: 30 })
    expect(verdict.role).toBe('unknown')
    expect(verdict.weapon).toBeNull()
    expect(verdict.reason).toContain('어긋난다')
  })

  it('킬이 동률이면 킬 신호를 쓰지 않는다', () => {
    const verdict = classifyWeapon({ rifleKills: 5, sniperKills: 5, arHits: null, srHits: null })
    expect(verdict.killSignal).toBe('unknown')
    expect(verdict.role).toBe('unknown')
  })

  it('적중이 동률이어도 마찬가지다', () => {
    expect(classifyWeapon({ rifleKills: null, sniperKills: null, arHits: 9, srHits: 9 }).role).toBe(
      'unknown',
    )
  })

  it('0킬 선수는 unknown이다 (0킬은 무기 근거가 아니다)', () => {
    const verdict = classifyWeapon({ rifleKills: 0, sniperKills: 0, arHits: null, srHits: null })
    expect(verdict.role).toBe('unknown')
  })

  it('근거가 하나도 없으면 unknown이다', () => {
    const verdict = classifyWeapon({ rifleKills: null, sniperKills: null, arHits: null, srHits: null })
    expect(verdict.role).toBe('unknown')
    expect(verdict.weapon).toBeNull()
  })
})

describe('신호가 하나만 있을 때', () => {
  it('킬 신호만 있으면 그것으로 정한다', () => {
    const verdict = classifyWeapon({ rifleKills: 9, sniperKills: 0, arHits: null, srHits: null })
    expect(verdict.role).toBe('rifle')
    expect(verdict.reason).toContain('킬 신호만')
  })

  it('적중 신호만 있으면 그것으로 정한다', () => {
    const verdict = classifyWeapon({ rifleKills: null, sniperKills: null, arHits: 4, srHits: 33 })
    expect(verdict.role).toBe('sniper')
    expect(verdict.reason).toContain('적중 신호만')
  })
})

describe('응답 읽기', () => {
  it('BattleLog에서 라플·스나 킬만 뽑는다 (권총·근접·투척은 제외)', () => {
    const signals = killSignalsOf({
      riple: 11,
      sniper: 2,
      special: 5,
      close: 3,
      throw: 1,
      assist: 7,
    })
    expect(signals).toEqual({ rifleKills: 11, sniperKills: 2 })
  })

  it('키가 없으면 0이 아니라 null이다 (모름과 0킬을 구분한다)', () => {
    expect(killSignalsOf({ special: 3 })).toEqual({ rifleKills: null, sniperKills: null })
  })

  it('부위별로 쪼개진 AR/SR 적중을 합친다', () => {
    const signals = hitSignalsOf({
      M_PLAYER_hit_AR_head_cnt: 10,
      M_PLAYER_hit_AR_body_cnt: 30,
      M_PLAYER_hit_SR_head_cnt: 2,
      M_PLAYER_hit_SR_body_cnt: 1,
      M_PLAYER_kill_cnt: 12,
    })
    expect(signals).toEqual({ arHits: 40, srHits: 3 })
  })

  it('적중 키가 하나도 없으면 null이다', () => {
    expect(hitSignalsOf({ M_PLAYER_kill_cnt: 5 })).toEqual({ arHits: null, srHits: null })
  })

  it('실측 형태 — 라플 선수 한 명이 끝까지 라플로 판정된다', () => {
    const kills = killSignalsOf({ riple: 16, sniper: 0, special: 2, close: 1 })
    const hits = hitSignalsOf({ M_PLAYER_hit_AR_body_cnt: 62, M_PLAYER_hit_SR_body_cnt: 0 })
    expect(classifyWeapon({ ...kills, ...hits }).role).toBe('rifle')
  })
})

describe('BattleLog 이벤트 로그 집계 (2026-08-23 실측 구조)', () => {
  /** 같은 사건이 가해자/피해자 두 관점으로 들어온다 — 한쪽만 세야 한다 */
  const log = [
    { event_type: 'kill', user_nexon_sn: 1, user_nick: '째근호', weapon: 'riple' },
    { event_type: 'death', user_nexon_sn: 9, user_nick: '피해자', weapon: '' },
    { event_type: 'kill', user_nexon_sn: 1, user_nick: '째근호', weapon: 'riple' },
    { event_type: 'kill', user_nexon_sn: 2, user_nick: '채운2', weapon: 'sniper' },
    { event_type: 'kill', user_nexon_sn: 1, user_nick: '째근호', weapon: 'throw' },
    { event_type: 'bomb', user_nexon_sn: 3, user_nick: '설치', weapon: 'c4-install' },
  ]

  it('kill 이벤트만 세서 선수별 무기 킬을 만든다', () => {
    const byPlayer = aggregateKillsFromBattleLog(log)
    expect(byPlayer.get(1)).toEqual({ nickname: '째근호', rifleKills: 2, sniperKills: 0 })
    expect(byPlayer.get(2)).toEqual({ nickname: '채운2', rifleKills: 0, sniperKills: 1 })
  })

  it('death 이벤트를 같이 세지 않는다 (한 사건을 두 번 세면 안 된다)', () => {
    expect(aggregateKillsFromBattleLog(log).has(9)).toBe(false)
  })

  it('수류탄·설치는 무기 근거가 아니다', () => {
    const byPlayer = aggregateKillsFromBattleLog(log)
    expect(byPlayer.get(1)?.rifleKills).toBe(2)
    expect(byPlayer.has(3)).toBe(false)
  })

  it('집계 결과를 그대로 판정에 넣을 수 있다', () => {
    const byPlayer = aggregateKillsFromBattleLog(log)
    const entry = byPlayer.get(2)!
    const verdict = classifyWeapon({
      rifleKills: entry.rifleKills,
      sniperKills: entry.sniperKills,
      arHits: null,
      srHits: null,
    })
    expect(verdict.role).toBe('sniper')
  })
})
