/**
 * ★★라인업을 세 리그로 넓힐 때 지켜야 하는 것★★ (2026-09-05 · Part 4).
 *
 * 사장님 원칙에서 ★코드로 굳힐 수 있는 것★ 만 여기 담는다.
 * ```
 * 1 리그별 수집기를 세 개 만들지 마라        → 진입점이 하나인지
 * 3 확정된 leagueId 를 믿어라                → 클랜번호 표를 리그마다 따로 드는지
 * 4 MatchPlayerStat 중복 생성 금지           → upsert 로만 쓰는지
 * 5 한 경기 20명 사고를 다시 만들지 마라      → 10명 아니면 통째로 버리는지
 * 7 기준시각 이전 과거는 건드리지 마라        → 그 문이 기본으로 닫혀 있는지
 * ```
 *
 * ── ★왜 「표를 합치지 마라」가 검사할 값인가★
 *   같은 병영수첩 클랜이 우리 DB 에 두 행인 경우가 있다 (`EVOA` → 열산 `melody` · IPL `idylic`).
 *   클랜번호는 ★한 번호에 한 클랜★ 만 담을 수 있어서, 세 리그 표를 하나로 합치면
 *   ★IPL 경기의 팀번호가 열산 클랜으로 풀리고 그 경기가 통째로 버려진다.★
 *   ★이건 조용히 일어난다★ — 그래서 사람이 아니라 검사가 지킨다.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LINEUP_TEAM_SIZE, planLineup, type LineupEvent } from '../lib/battlelogLineup.js'
import { ALL_LEAGUE_SLUGS } from '../jobs/battlelogLineup.js'
import { LIVE_LEAGUE_SLUGS } from '../lib/leagueVerdict.js'

const here = dirname(fileURLToPath(import.meta.url))
const jobSource = readFileSync(join(here, '..', 'jobs', 'battlelogLineup.ts'), 'utf8')

describe('① 라인업 수집기는 하나다', () => {
  it('★세 리그가 같은 목록을 쓴다★ — 리그별 잡을 따로 만들지 않았다', () => {
    expect([...ALL_LEAGUE_SLUGS]).toEqual([...LIVE_LEAGUE_SLUGS])
    expect([...ALL_LEAGUE_SLUGS]).toEqual(['nolink', 'supply', 'sanply'])
  })

  it('★대룰은 없다★', () => {
    expect(ALL_LEAGUE_SLUGS).not.toContain('daerule')
  })

  it('세 리그를 도는 잡 파일이 ★하나뿐★ 이다', () => {
    /* `runBattlelogLineup` 을 내보내는 곳이 여럿이면 그게 곧 「세 개 따로」다 */
    const exported = jobSource.match(/export async function runBattlelogLineup/g) ?? []
    expect(exported).toHaveLength(1)
  })
})

describe('③ 확정된 리그를 믿는다 — 표를 합치지 않는다', () => {
  it('★클랜번호 표를 리그마다 따로 든다★', () => {
    /* 리그 → (클랜번호 → 클랜) 두 겹이어야 한다. 한 겹이면 합친 것이다 */
    expect(jobSource).toContain('const numberOfLeague = new Map<string, Map<string, string>>()')
    expect(jobSource).toContain('numberOfLeague.set(league.id, clanOfNumber)')
  })

  it('★경기의 leagueId 로 표를 고른다★ — 이름으로 다시 추측하지 않는다', () => {
    expect(jobSource).toContain('numberOfLeague.get(info.leagueId)')
    /* 리그를 다시 판정하는 코드가 들어오면 안 된다 */
    expect(jobSource).not.toContain('decideLeague(')
    expect(jobSource).not.toContain('resolveSides(')
  })

  it('Match 를 고를 때 ★리그를 목록으로★ 받는다', () => {
    expect(jobSource).toContain('leagueId: { in: leagueIds }')
  })
})

describe('④ 중복 생성 금지', () => {
  it('★참가 기록은 upsert 로만 쓴다★ — create 로 직접 넣지 않는다', () => {
    expect(jobSource).toContain('prisma.matchPlayerStat.upsert(')
    expect(jobSource).not.toMatch(/prisma\.matchPlayerStat\.(create|createMany)\(/)
  })

  it('★(경기, 선수) 로 찍어 누른다★ — 그게 DB 자물쇠와 같은 키다', () => {
    expect(jobSource).toContain('matchId_playerId:')
  })

  it('★숨긴 사본에는 넣지 않는다★ (O-056 의 39줄)', () => {
    expect(jobSource).toContain('supersededAt: null')
  })
})

describe('⑤ 한 경기 20명 사고를 다시 만들지 않는다', () => {
  /** 킬 한 줄. 실제 응답과 같은 모양이다 (한 줄이 죽인 쪽과 죽은 쪽을 같이 적는다) */
  const kill = (killer: string, killerTeam: string, victim: string, victimTeam: string): LineupEvent =>
    ({
      round: '1',
      event_time: '00:10',
      event_key: null,
      event_type: 'kill',
      target_event_type: 'death',
      str_usn: killer,
      team_no: killerTeam,
      user_nick: killer,
      user_nexon_sn: null,
      target_str_usn: victim,
      target_team_no: victimTeam,
      target_user_nick: victim,
      target_user_nexon_sn: null,
      weapon: 'riple',
      target_weapon: '',
      kill_x: 0,
      kill_y: 0,
    }) as unknown as LineupEvent

  const TEAM_LIST = [
    { team_no: '0', clan_no: '111' },
    { team_no: '1', clan_no: '222' },
  ]
  const base = {
    teamList: TEAM_LIST,
    resolveClanNo: (no: string) => (no === '111' ? 'c-red' : no === '222' ? 'c-blue' : null),
    redClanId: 'c-red',
    blueClanId: 'c-blue',
  }

  it('★한 팀이 인원 수를 못 채우면 통째로 버린다★ — 반쪽을 넣지 않는다', () => {
    /* 팀0 은 두 명이 보이는데 팀1 은 한 명뿐이다 */
    const planned = planLineup({
      ...base,
      teamSize: 2,
      events: [kill('A1', '0', 'B1', '1'), kill('A2', '0', 'B1', '1')],
    })
    expect(planned.ok).toBe(false)
    if (!planned.ok) expect(planned.reason).toBe('roster_incomplete')
  })

  it('★팀이 셋이면 버린다★', () => {
    const planned = planLineup({
      ...base,
      teamSize: 1,
      events: [kill('A1', '0', 'B1', '1'), kill('C1', '2', 'A1', '0')],
    })
    expect(planned.ok).toBe(false)
    if (!planned.ok) expect(planned.reason).toBe('team_count')
  })

  it('양 팀이 다 차면 ★들어간다★ — 그때만 넣는다', () => {
    const planned = planLineup({
      ...base,
      teamSize: 2,
      events: [
        kill('A1', '0', 'B1', '1'),
        kill('A2', '0', 'B2', '1'),
        kill('B1', '1', 'A1', '0'),
        kill('B2', '1', 'A2', '0'),
      ],
    })
    expect(planned.ok).toBe(true)
    if (planned.ok) {
      expect(planned.players).toHaveLength(4)
      /* ★같은 사람이 두 번 들어가지 않는다★ */
      expect(new Set(planned.players.map((p) => p.usn)).size).toBe(4)
      expect(planned.players.filter((p) => p.side === 'red')).toHaveLength(2)
      expect(planned.players.filter((p) => p.side === 'blue')).toHaveLength(2)
    }
  })

  it('★미러 라인업이 이미 있으면 비켜 준다★ — 덧대면 20명이 된다 (D-273)', () => {
    expect(jobSource).toContain('skippedMirrorLineup')
    expect(jobSource).toContain('p."origin" <> ')
  })

  it('한 팀은 ★5명★ 이다', () => {
    expect(LINEUP_TEAM_SIZE).toBe(5)
  })
})

describe('⑦ 과거를 건드리는 문은 기본으로 닫혀 있다', () => {
  it('`fromCutoff` 를 ★켤 때만★ 창이 좁아진다 — 기본값을 바꾸지 않았다', () => {
    expect(jobSource).toContain('options.fromCutoff === true')
    /* 기본값이 true 로 뒤집히면 IPL 과거 메꾸기가 말없이 멈춘다 */
    expect(jobSource).not.toContain('fromCutoff = true')
    expect(jobSource).not.toContain('fromCutoff ?? true')
  })

  it('창의 기준은 ★미러 동결과 같은 값 하나★ 다 — 따로 적지 않는다', () => {
    expect(jobSource).toContain('MIRROR_FREEZE_FROM')
    expect(jobSource).not.toMatch(/2026-09-0[23]T?\d/)
  })
})
