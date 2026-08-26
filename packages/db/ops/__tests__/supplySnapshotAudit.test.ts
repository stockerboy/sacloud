/**
 * 스냅샷 감사·투영 규칙 (D-150).
 *
 * 여기서 고정하는 것은 **넣어도 되는 경기와 안 되는 경기를 가르는 선**이다.
 * 이 선이 흐려지면 잘못된 경기가 래더에 들어가고, 그건 되돌리기 어렵다.
 *
 * DB 를 띄우지 않고 검증할 수 있도록 순수 함수(`auditFieldCoverage`)와
 * 투영이 쓰는 것과 **같은 판정 규칙**을 검증한다.
 */
import { describe, expect, it } from 'vitest'
import { auditFieldCoverage } from '../supplySnapshotAudit'
import type { SupplyMatchRecord } from '../supplyMatches'

/** 라인업 한 줄 — [playerId, nickname, clanId, weapon] */
const row = (
  id: number,
  name: string,
  clan: number | null = null,
  weapon: number | null = 0,
): [number, string, number | null, number | null] => [id, name, clan, weapon]

function match(over: Partial<SupplyMatchRecord> = {}): SupplyMatchRecord {
  return {
    id: '260818140312124001',
    map: '제3보급창고',
    player_count: 10,
    start_at: '2026-08-18T14:03:12',
    end_at: '2026-08-18T14:20:00',
    play_time: '16:48',
    mvp_player_id: 1,
    red: [
      row(1, 'a', 100),
      row(2, 'b', 100),
      row(3, 'c', 100),
      row(4, 'd', null),
      row(5, 'e', null),
    ],
    blue: [
      row(6, 'f', 200, 1),
      row(7, 'g', 200, 1),
      row(8, 'h', 200),
      row(9, 'i', null),
      row(10, 'j', null),
    ],
    perspectives: [
      {
        clan_id: 100,
        opponent_clan_id: 200,
        opponent_rating: 3000,
        opponent_division: 1,
        win: true,
        blue_team: false,
        placement: false,
        rating_update: 15,
      },
    ],
    ...over,
  } as SupplyMatchRecord
}

describe('인원 판정', () => {
  it('정확히 10명이고 5대5면 정상으로 센다', () => {
    const out = auditFieldCoverage([match()])
    expect(out.roster).toEqual({ exactly10: 1, under10: 0, over10: 0 })
    expect(out.teams).toEqual({ balanced5v5: 1, unbalanced: 0 })
  })

  it('9명이면 under10 이고 5대5가 아니다', () => {
    const nine = match({ blue: [row(6, 'f'), row(7, 'g'), row(8, 'h'), row(9, 'i')] })
    const out = auditFieldCoverage([nine])
    expect(out.roster.under10).toBe(1)
    expect(out.teams.unbalanced).toBe(1)
  })

  it('11명 이상이면 over10 이다 — 잘라내지 않는다', () => {
    const eleven = match({
      blue: [row(6, 'f'), row(7, 'g'), row(8, 'h'), row(9, 'i'), row(10, 'j'), row(11, 'k')],
    })
    const out = auditFieldCoverage([eleven])
    expect(out.roster.over10).toBe(1)
    expect(out.teams.unbalanced).toBe(1)
  })
})

describe('중복 감지', () => {
  it('같은 경기에 같은 닉네임이 둘이면 잡아낸다', () => {
    const dup = match({
      blue: [row(6, 'a'), row(7, 'g'), row(8, 'h'), row(9, 'i'), row(10, 'j')],
    })
    expect(auditFieldCoverage([dup]).duplicateNicknameInMatch).toBe(1)
  })

  it('같은 참가자가 두 번 들어 있으면 잡아낸다', () => {
    const dup = match({
      blue: [row(1, 'a2'), row(7, 'g'), row(8, 'h'), row(9, 'i'), row(10, 'j')],
    })
    expect(auditFieldCoverage([dup]).duplicatePlayerIdInMatch).toBe(1)
  })

  it('정상 경기는 중복으로 세지 않는다', () => {
    const out = auditFieldCoverage([match()])
    expect(out.duplicateNicknameInMatch).toBe(0)
    expect(out.duplicatePlayerIdInMatch).toBe(0)
  })
})

describe('무기 분류 — 추측하지 않는다', () => {
  it('실측값 0/1 만 각각 라이플·스나이퍼로 센다', () => {
    const out = auditFieldCoverage([match()])
    expect(out.weapon.rifle).toBe(8)
    expect(out.weapon.sniper).toBe(2)
    expect(out.weapon.unknown).toBe(0)
  })

  it('무기가 null 이면 unknown 이다 — 라이플로 밀어 넣지 않는다', () => {
    const noWeapon = match({
      red: [
        row(1, 'a', 100, null),
        row(2, 'b', 100, null),
        row(3, 'c', 100, null),
        row(4, 'd', null, null),
        row(5, 'e', null, null),
      ],
    })
    const out = auditFieldCoverage([noWeapon])
    expect(out.weapon.unknown).toBe(5)
    expect(out.weapon.rifle).toBe(3)
  })

  it('0/1 이 아닌 값은 따로 남긴다 — 조용히 삼키지 않는다', () => {
    const odd = match({ red: [row(1, 'a', 100, 7)] })
    const out = auditFieldCoverage([odd])
    expect(out.weapon.other).toEqual({ '7': 1 })
  })
})

describe('필드 커버리지', () => {
  it('승패가 없으면 세지 않는다', () => {
    const noResult = match({ perspectives: [] })
    const out = auditFieldCoverage([noResult])
    expect(out.withResult).toBe(0)
    expect(out.withPerspective).toBe(0)
  })

  it('경기 당시 클랜이 있는 행과 없는 행을 나눠 센다', () => {
    const out = auditFieldCoverage([match()])
    expect(out.rowsWithClan).toBe(6)
    expect(out.rowsWithoutClan).toBe(4)
  })

  it('참가 행 수는 라인업 전체와 같다', () => {
    expect(auditFieldCoverage([match(), match()]).participantRows).toBe(20)
  })
})
