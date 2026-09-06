/**
 * ★★라인업이 불완전하면 「없다」고 적고, 지어내지 않는다★★ (2026-09-06 · Part 4 · 사장님 지시).
 *
 * > «원본에 선수 12명 전체 명단이 없으므로 ★추측해서 MatchPlayerStat 을 만들지 않는다★»
 * > «Match 자체는 ★정상 경기로 보존★»
 * > «라인업이 완전하지 않으면 lineup_status = incomplete ★로 남김★»
 * > «★보이는 일부 인원만 가지고 4대4/5대5/6대6으로 임의 판단 금지★»
 *
 * ── ★왜 완전한 명단을 만들 수 없나★ (2026-09-06 · 원문 표본 3건으로 확인)
 *   ```
 *   매치목록 원문   칸 44개 · ★배열 칸이 하나도 없다★ — 명단을 담을 자리가 없다
 *                   plimit 은 ★방 인원 상한★ 이다. 5대5 경기에도 plimit 6·8 이 온다
 *   배틀로그 원문   칸 셋뿐 — teamList · battleLog · isMatchEmpty
 *   teamList       ★2줄★ — 클랜 둘의 (clan_no · team_no · clan_name · team_name)
 *                   ★사람이 한 명도 안 적혀 있다★
 *   battleLog      ★죽이거나 죽은 사람만★ 나온다
 *   ```
 *   ★그래서 「보인 사람 = 참가자」가 아니다.★ 6명씩 보였다고 6대6이라 단정할 수 없다.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LINEUP_TEAM_SIZE, planLineup, type LineupEvent } from '../lib/battlelogLineup.js'

const here = dirname(fileURLToPath(import.meta.url))
const jobSource = readFileSync(join(here, '..', 'jobs', 'battlelogLineup.ts'), 'utf8')
const schema = readFileSync(
  join(here, '..', '..', '..', '..', 'packages', 'db', 'prisma', 'schema.prisma'),
  'utf8',
)

const kill = (killer: string, killerTeam: string, victim: string, victimTeam: string): LineupEvent =>
  ({
    round: '1', event_time: '00:10', event_key: null,
    event_type: 'kill', target_event_type: 'death',
    str_usn: killer, team_no: killerTeam, user_nick: killer, user_nexon_sn: null,
    target_str_usn: victim, target_team_no: victimTeam, target_user_nick: victim,
    target_user_nexon_sn: null, weapon: 'riple', target_weapon: '', kill_x: 0, kill_y: 0,
  }) as unknown as LineupEvent

const base = {
  teamList: [
    { team_no: '0', clan_no: '111' },
    { team_no: '1', clan_no: '222' },
  ],
  resolveClanNo: (no: string) => (no === '111' ? 'c-red' : no === '222' ? 'c-blue' : null),
  redClanId: 'c-red',
  blueClanId: 'c-blue',
}

describe('★6대6 을 5대5 로 우겨 넣지 않는다★', () => {
  it('6명씩 보이는 경기는 5대5 규칙에서 ★통째로 빠진다★ — 10명만 골라 담지 않는다', () => {
    const events: LineupEvent[] = []
    for (let i = 1; i <= 6; i += 1) events.push(kill(`A${i}`, '0', `B${i}`, '1'))
    for (let i = 1; i <= 6; i += 1) events.push(kill(`B${i}`, '1', `A${i}`, '0'))
    const planned = planLineup({ ...base, events, teamSize: LINEUP_TEAM_SIZE })
    expect(planned.ok).toBe(false)
    if (!planned.ok) expect(planned.reason).toBe('roster_incomplete')
  })

  it('★반쪽만 담지 않는다★ — 실패하면 players 자체가 없다', () => {
    const planned = planLineup({
      ...base,
      teamSize: LINEUP_TEAM_SIZE,
      events: [kill('A1', '0', 'B1', '1'), kill('A2', '0', 'B2', '1')],
    })
    expect(planned.ok).toBe(false)
    expect('players' in planned).toBe(false)
  })
})

describe('★못 만들었으면 「못 만들었다」고 적는다★', () => {
  it('Match 에 상태 칸이 있다 — 경기 자체는 ★지우거나 숨기지 않는다★', () => {
    expect(schema).toContain('lineupStatus     String?')
    expect(schema).toContain('lineupSkipReason String?')
    expect(schema).toContain('lineupSeen       Int?')
    /* ★숨김(supersededAt)과 헷갈리면 안 된다★ — 라인업이 없는 것이지 경기가 없는 게 아니다 */
    expect(schema).toContain('supersededAt     DateTime?')
  })

  it('실패한 경기에 ★incomplete 를 적는다★', () => {
    expect(jobSource).toContain("status: 'incomplete'")
    expect(jobSource).toContain('lineupSkipReason: mark.reason')
  })

  it('★보인 사람 수는 증거로만 남긴다★ — 그 수로 인원을 정하지 않는다', () => {
    expect(jobSource).toContain('lineupSeen: mark.seen')
    /* 보인 수를 teamSize 로 되먹이면 그게 곧 「임의 판단」이다 */
    expect(jobSource).not.toContain('teamSize: roster')
    expect(jobSource).not.toMatch(/teamSize:\s*\w*[Ss]een/)
    expect(jobSource).not.toMatch(/teamSize:\s*.*sizeOf/)
  })

  it('★plimit 으로 인원을 정하지 않는다★ — 그건 방 인원 상한이다', () => {
    expect(jobSource).not.toContain('plimit')
  })

  it('★plans 가 비어도 상태는 적는다★ — 「라인업이 없다」가 곧 기록할 값이다', () => {
    const at = jobSource.indexOf('if (plans.length === 0) continue')
    const mark = jobSource.indexOf('lineupStatus: mark.status')
    expect(mark).toBeGreaterThan(-1)
    expect(mark).toBeLessThan(at)
  })
})

describe('★과거 경기에는 새 칸을 안 쓴다★ (사장님 원칙 7)', () => {
  it('기준시각 이전이면 상태를 적지 않고 넘어간다', () => {
    expect(jobSource).toContain(
      'if (mark.startAt.getTime() < MIRROR_FREEZE_FROM.getTime()) continue',
    )
  })

  it('기준은 ★미러 동결과 같은 값 하나★ 다 — 날짜를 새로 적지 않는다', () => {
    expect(jobSource).toContain('MIRROR_FREEZE_FROM')
    expect(jobSource).not.toMatch(/2026-09-0[23]T?\d/)
  })
})

describe('불완전한 라인업이 개인 통계로 새지 않는다', () => {
  it('★애초에 한 줄도 안 넣는다★ — 실패한 경기는 plans 에 안 들어간다', () => {
    /* 실패 분기가 반드시 `continue` 로 끝나야 한다. 그 아래로 흘러가면 안 된다 */
    const block = jobSource.slice(
      jobSource.indexOf('if (!planned.ok) {'),
      jobSource.indexOf('plans.push({ info, players: planned.players })'),
    )
    expect(block).toContain('continue')
    expect(block).not.toContain('prisma.matchPlayerStat')
  })
})
