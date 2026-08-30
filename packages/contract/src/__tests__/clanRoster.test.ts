/**
 * 클랜원 정리 — 포지션별 · 1군/2군 (`docs/SITE_SPEC_V2.md` 5-2 · D-199).
 *
 * 여기서 잡으려는 것은 **틀려도 화면이 멀쩡해 보이는** 종류의 버그다.
 * 1군 명단은 다섯 줄이라 그럴듯하게 보이고, 잘못 뽑혀도 눈으로는 안 잡힌다.
 * 그래서 경계 규칙을 테스트로 못 박는다.
 */
import { describe, expect, it } from 'vitest'
import {
  CLAN_ROSTER_FIRST_SQUAD_MIN_GAMES,
  CLAN_ROSTER_FIRST_SQUAD_SIZE,
  CLAN_ROSTER_UNKNOWN_LABEL,
  buildClanRoster,
  type ClanRosterInput,
} from '../clanRoster'

function member(over: Partial<ClanRosterInput> & { leaguePlayerId: string }): ClanRosterInput {
  return {
    playerId: `p-${over.leaguePlayerId}`,
    playerName: over.leaguePlayerId,
    rating: 3000,
    placement: false,
    games: 50,
    position: null,
    positionLabel: null,
    positionSource: null,
    ...over,
  }
}

/** 1군 명단의 닉네임 */
function firstSquadNames(roster: ReturnType<typeof buildClanRoster>): string[] {
  const squad = roster?.squads.find((entry) => entry.squad === 'first')
  return (squad?.groups ?? []).flatMap((group) => group.members.map((row) => row.player.name))
}

describe('buildClanRoster — 1군/2군', () => {
  it('클랜원이 없으면 `null` 이다. 빈 카드를 그리지 않는다 (D-106)', () => {
    expect(buildClanRoster([])).toBeNull()
  })

  it(`래더 상위 ${CLAN_ROSTER_FIRST_SQUAD_SIZE}명이 1군이고 나머지는 2군이다`, () => {
    const rows = [1, 2, 3, 4, 5, 6, 7].map((n) =>
      member({ leaguePlayerId: `p${n}`, rating: 3100 - n }),
    )
    const roster = buildClanRoster(rows)
    expect(firstSquadNames(roster)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5'])
    expect(roster?.squads.find((s) => s.squad === 'second')?.count).toBe(2)
  })

  it('한 판 뛰고 래더가 높은 선수는 1군에 올라오지 않는다', () => {
    const rows = [
      member({ leaguePlayerId: 'lucky', rating: 9999, games: 1 }),
      ...[1, 2, 3, 4, 5].map((n) => member({ leaguePlayerId: `p${n}`, rating: 3100 - n })),
    ]
    const names = firstSquadNames(buildClanRoster(rows))
    expect(names).not.toContain('lucky')
    expect(names).toHaveLength(CLAN_ROSTER_FIRST_SQUAD_SIZE)
  })

  it('경계값 — 최소 판수를 정확히 채우면 후보다', () => {
    const rows = [
      member({ leaguePlayerId: 'edge', rating: 5000, games: CLAN_ROSTER_FIRST_SQUAD_MIN_GAMES }),
      member({ leaguePlayerId: 'below', rating: 5000, games: CLAN_ROSTER_FIRST_SQUAD_MIN_GAMES - 1 }),
    ]
    const names = firstSquadNames(buildClanRoster(rows))
    expect(names).toContain('edge')
    expect(names).not.toContain('below')
  })

  it('배치고사 중인 선수는 1군 후보가 아니다 — 래더가 아직 실력이 아니다 (3-B 7번)', () => {
    const rows = [
      member({ leaguePlayerId: 'placing', rating: 9999, placement: true }),
      member({ leaguePlayerId: 'p1', rating: 3000 }),
    ]
    const names = firstSquadNames(buildClanRoster(rows))
    expect(names).toEqual(['p1'])
  })

  it('후보에서 빠진 선수도 명단에서 사라지지 않는다 — 2군으로 간다', () => {
    const rows = [
      member({ leaguePlayerId: 'lucky', rating: 9999, games: 1 }),
      member({ leaguePlayerId: 'p1', rating: 3000 }),
    ]
    const roster = buildClanRoster(rows)
    expect(roster?.member_count).toBe(2)
    const second = roster?.squads.find((s) => s.squad === 'second')
    expect(second?.groups.flatMap((g) => g.members.map((m) => m.player.name))).toEqual(['lucky'])
  })
})

describe('buildClanRoster — 포지션 묶음', () => {
  it('네 포지션은 아무도 없어도 자리를 지킨다. 빈 자리를 남는 선수로 메우지 않는다', () => {
    const roster = buildClanRoster([member({ leaguePlayerId: 'p1', position: 'SHORT' })])
    const first = roster?.squads.find((s) => s.squad === 'first')
    expect(first?.groups.map((g) => g.label)).toEqual(['숏포지', '2F', '스나수', 'B리베'])
    expect(first?.groups.find((g) => g.position === 'SNIPER')?.members).toEqual([])
  })

  it('`B리베` 만 한 팀에 두 자리다 (D-199)', () => {
    const roster = buildClanRoster([member({ leaguePlayerId: 'p1', position: 'B' })])
    const groups = roster?.squads[0]?.groups ?? []
    expect(groups.find((g) => g.position === 'B')?.slots).toBe(2)
    expect(groups.find((g) => g.position === 'SHORT')?.slots).toBe(1)
  })

  it('포지션을 모르는 선수는 지어내지 않고 별도 묶음으로 간다 (D-106)', () => {
    const roster = buildClanRoster([
      member({ leaguePlayerId: 'p1', position: 'SHORT' }),
      member({ leaguePlayerId: 'p2' }),
    ])
    const unknown = roster?.squads[0]?.groups.find((g) => g.position === null)
    expect(unknown?.label).toBe(CLAN_ROSTER_UNKNOWN_LABEL)
    expect(unknown?.members.map((m) => m.player.name)).toEqual(['p2'])
    expect(roster?.unknown_position_count).toBe(1)
  })

  it('아무도 미정이 아니면 `포지션 미정` 묶음 자체를 만들지 않는다', () => {
    const roster = buildClanRoster([member({ leaguePlayerId: 'p1', position: '2F' })])
    expect(roster?.squads[0]?.groups.some((g) => g.position === null)).toBe(false)
  })

  it('사람이 우리 코드가 아닌 말로 적으면 그 글자를 남긴 채 미정 묶음으로 간다', () => {
    const roster = buildClanRoster([
      member({ leaguePlayerId: 'p1', positionLabel: '돌격', positionSource: 'user' }),
    ])
    const unknown = roster?.squads[0]?.groups.find((g) => g.position === null)
    expect(unknown?.members[0]?.position_label).toBe('돌격')
  })

  it('같은 데이터면 순서가 흔들리지 않는다 — 동점은 판수, 그다음 id 로 못 박는다', () => {
    const rows = [
      member({ leaguePlayerId: 'b', rating: 3000, games: 20 }),
      member({ leaguePlayerId: 'a', rating: 3000, games: 20 }),
      member({ leaguePlayerId: 'c', rating: 3000, games: 30 }),
    ]
    expect(firstSquadNames(buildClanRoster(rows))).toEqual(['c', 'a', 'b'])
    expect(firstSquadNames(buildClanRoster([...rows].reverse()))).toEqual(['c', 'a', 'b'])
  })
})
