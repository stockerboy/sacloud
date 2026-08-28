import { describe, expect, it } from 'vitest'
import {
  accumulateClanRollups,
  accumulatePlayerRollups,
  emptyPlayerRollup,
  mergePlayerClanPicks,
  parseClanRegistry,
  toClanRollupRows,
  toClanWriteData,
  toPlayerWriteData,
  UNRANKED_CLAN_WRITE,
  type ClanRollupRow,
  type PlayerClanPick,
  type PlayerRollupRow,
  type RollupMatch,
  type SupplyClanRegistryRow,
} from '../supplyRollup'

/**
 * 리그 집계 규칙을 DB 없이 고정한다.
 *
 * 여기서 지키는 것은 세 가지다 —
 *   1. 점수는 **원본값 하나**를 그대로 옮긴다 (평균·누적 금지)
 *   2. `null` 은 0이 아니다 (더하지도, 분모에 넣지도 않는다)
 *   3. 같은 입력이면 같은 결과다 (두 번 돌려도 두 배가 되지 않는다)
 */

const at = (iso: string) => new Date(iso)

function stat(over: Partial<PlayerRollupRow> = {}): PlayerRollupRow {
  return {
    playerId: 'P1',
    won: true,
    kill: 10,
    death: 5,
    assist: 3,
    headshot: 2,
    sourceRating: 3200,
    clanSlug: null,
    matchId: 'M1',
    startAt: at('2026-01-01T00:00:00Z'),
    ...over,
  }
}

function match(over: Partial<RollupMatch> = {}): RollupMatch {
  return {
    id: 'M1',
    startAt: at('2026-01-01T00:00:00Z'),
    winnerSide: 'red',
    redLeagueClanId: 'RED',
    blueLeagueClanId: 'BLUE',
    redSourceRating: 3400,
    blueSourceRating: null,
    ...over,
  }
}

describe('점수는 가장 최근 경기의 원본값 하나다', () => {
  it('평균을 내지도, 증감을 누적하지도 않는다', () => {
    const rows = [
      stat({ matchId: 'A', startAt: at('2026-01-01T00:00:00Z'), sourceRating: 3000 }),
      stat({ matchId: 'B', startAt: at('2026-03-01T00:00:00Z'), sourceRating: 3600 }),
      stat({ matchId: 'C', startAt: at('2026-02-01T00:00:00Z'), sourceRating: 3300 }),
    ]
    const acc = accumulatePlayerRollups(rows)
    // 평균이면 3300, 합이면 9900. 우리가 원하는 것은 **가장 최근 값** 3600 하나다
    expect(acc.get('P1')?.rating).toBe(3600)
    expect(acc.get('P1')?.games).toBe(3)
  })

  it('입력 순서가 뒤죽박죽이어도 결과가 같다', () => {
    const rows = [
      stat({ matchId: 'B', startAt: at('2026-03-01T00:00:00Z'), sourceRating: 3600 }),
      stat({ matchId: 'A', startAt: at('2026-01-01T00:00:00Z'), sourceRating: 3000 }),
    ]
    expect(accumulatePlayerRollups(rows).get('P1')?.rating).toBe(3600)
    expect(accumulatePlayerRollups([...rows].reverse()).get('P1')?.rating).toBe(3600)
  })

  it('시각이 같으면 matchId 로 순서를 고정한다 — 결과가 흔들리지 않는다', () => {
    const same = at('2026-05-05T12:00:00Z')
    const rows = [
      stat({ matchId: '111', startAt: same, sourceRating: 3100 }),
      stat({ matchId: '222', startAt: same, sourceRating: 3900 }),
    ]
    expect(accumulatePlayerRollups(rows).get('P1')?.rating).toBe(3900)
    expect(accumulatePlayerRollups([...rows].reverse()).get('P1')?.rating).toBe(3900)
  })
})

describe('sourceRating 이 없으면 rating 을 만들어 내지 않는다', () => {
  it('모든 행이 null 이면 rating 은 null 이다 (3000 을 지어내지 않는다)', () => {
    const acc = accumulatePlayerRollups([
      stat({ matchId: 'A', sourceRating: null }),
      stat({ matchId: 'B', sourceRating: null }),
    ])
    expect(acc.get('P1')?.rating).toBeNull()
  })

  it('rating 이 null 이면 쓰기 데이터에 rating 칸 자체가 없다 — 기존 값을 건드리지 않는다', () => {
    const rollup = emptyPlayerRollup()
    rollup.win = 2
    const data = toPlayerWriteData(rollup)
    expect('rating' in data).toBe(false)
  })

  it('아는 행이 하나라도 있으면 그 값을 쓴다 — 최신 행이 결측이라고 버리지 않는다', () => {
    const acc = accumulatePlayerRollups([
      stat({ matchId: 'A', startAt: at('2026-01-01T00:00:00Z'), sourceRating: 3300 }),
      stat({ matchId: 'B', startAt: at('2026-06-01T00:00:00Z'), sourceRating: null }),
    ])
    expect(acc.get('P1')?.rating).toBe(3300)
  })
})

describe('null 을 0으로 채우지 않는다', () => {
  it('kill 이 null 인 경기는 합에도 분모에도 들어가지 않는다', () => {
    const acc = accumulatePlayerRollups([
      stat({ matchId: 'A', kill: 10, death: 4, assist: 1 }),
      stat({ matchId: 'B', kill: null, death: null, assist: null, headshot: null }),
    ])
    const rollup = acc.get('P1')!
    expect(rollup.kill).toBe(10)
    expect(rollup.games, '승패는 KDA 를 몰라도 안다').toBe(2)
    expect(rollup.knownStatGames, 'KDA 분모는 아는 경기만').toBe(1)
    expect(rollup.knownHeadshotGames).toBe(1)
  })

  it('KDA 를 아는 경기가 하나도 없으면 킬뎃 칸을 아예 쓰지 않는다', () => {
    const acc = accumulatePlayerRollups([
      stat({ matchId: 'A', kill: null, death: null, assist: null, headshot: null }),
    ])
    const data = toPlayerWriteData(acc.get('P1')!)
    expect('kill' in data).toBe(false)
    expect('death' in data).toBe(false)
    expect('assist' in data).toBe(false)
    expect('headshot' in data).toBe(false)
    // 승패는 안다. 그건 쓴다
    expect(data.win + data.lose).toBe(1)
  })

  it('헤드샷만 결측이면 킬뎃은 그대로 쓰고 헤드샷 칸만 비운다', () => {
    const acc = accumulatePlayerRollups([stat({ kill: 7, death: 2, assist: 0, headshot: null })])
    const data = toPlayerWriteData(acc.get('P1')!)
    expect(data.kill).toBe(7)
    expect(data.assist, '0킬은 결측이 아니다 — 실제 값 0은 그대로 센다').toBe(0)
    expect('headshot' in data).toBe(false)
  })
})

describe('승패는 진영으로 센다', () => {
  it('이긴 경기와 진 경기를 나눠 센다', () => {
    const acc = accumulatePlayerRollups([
      stat({ matchId: 'A', won: true }),
      stat({ matchId: 'B', won: false }),
      stat({ matchId: 'C', won: false }),
    ])
    expect(acc.get('P1')).toMatchObject({ win: 1, lose: 2, games: 3 })
  })

  it('선수를 섞지 않는다', () => {
    const acc = accumulatePlayerRollups([
      stat({ playerId: 'P1', won: true }),
      stat({ playerId: 'P2', won: false, sourceRating: 2900 }),
    ])
    expect(acc.get('P1')).toMatchObject({ win: 1, lose: 0 })
    expect(acc.get('P2')).toMatchObject({ win: 0, lose: 1, rating: 2900 })
  })
})

describe('두 번 돌려도 같은 결과다 (누적하지 않는다)', () => {
  const rows = [
    stat({ matchId: 'A', kill: 10, sourceRating: 3000, startAt: at('2026-01-01T00:00:00Z') }),
    stat({ matchId: 'B', kill: 4, sourceRating: 3200, startAt: at('2026-02-01T00:00:00Z'), won: false }),
  ]

  it('같은 입력으로 두 번 집계하면 값이 같다', () => {
    const first = accumulatePlayerRollups(rows).get('P1')
    const second = accumulatePlayerRollups(rows).get('P1')
    expect(second).toEqual(first)
  })

  it('두 배가 되지 않는다 — 새 누적기에서 다시 센다', () => {
    const once = accumulatePlayerRollups(rows).get('P1')!
    expect(once.kill).toBe(14)
    expect(once.games).toBe(2)
    // 같은 행을 두 번 넣으면(=잘못된 사용) 두 배가 된다. 그래서 잡은 항상 새 누적기를 쓴다
    const twice = accumulatePlayerRollups([...rows, ...rows]).get('P1')!
    expect(twice.kill).toBe(28)
    expect(once.kill, '앞 결과가 뒤 호출에 오염되지 않았다').toBe(14)
  })
})

describe('클랜 집계', () => {
  it('경기 하나가 red·blue 두 줄이 된다', () => {
    const [red, blue] = toClanRollupRows(match())
    expect(red).toMatchObject({ leagueClanId: 'RED', won: true, sourceRating: 3400 })
    expect(blue).toMatchObject({ leagueClanId: 'BLUE', won: false, sourceRating: null })
  })

  it('blue 가 이기면 blue 쪽이 승리다', () => {
    const [red, blue] = toClanRollupRows(match({ winnerSide: 'blue' }))
    expect(red.won).toBe(false)
    expect(blue.won).toBe(true)
  })

  it('자기 진영의 원본 점수만 쓴다 — 반대편 점수를 끌어오지 않는다', () => {
    const rows: ClanRollupRow[] = [
      ...toClanRollupRows(
        match({ id: 'A', startAt: at('2026-01-01T00:00:00Z'), redSourceRating: 3400, blueSourceRating: null }),
      ),
      ...toClanRollupRows(
        match({
          id: 'B',
          startAt: at('2026-02-01T00:00:00Z'),
          winnerSide: 'blue',
          redSourceRating: null,
          blueSourceRating: 2800,
        }),
      ),
    ]
    const acc = accumulateClanRollups(rows)
    expect(acc.get('RED')).toMatchObject({ rating: 3400, win: 1, lose: 1, games: 2 })
    expect(acc.get('BLUE')).toMatchObject({ rating: 2800, win: 1, lose: 1, games: 2 })
  })

  it('점수 근거가 없는 클랜은 되짚기 결과가 null 이다', () => {
    const acc = accumulateClanRollups(
      toClanRollupRows(match({ redSourceRating: null, blueSourceRating: null })),
    )
    expect(acc.get('RED')?.rating).toBeNull()
  })
})

/**
 * 클랜 점수·승패·부리그는 **경기에서 되짚지 않는다** (D-157).
 * 수집 파일 클랜 목록이 원본 클랜랭킹 화면이 쓰는 값이고, 랭킹 모집단도 그 목록이 정한다.
 */
describe('클랜은 수집 파일 값을 그대로 쓴다 (D-157)', () => {
  const registered = (over: Partial<SupplyClanRegistryRow> = {}): SupplyClanRegistryRow => ({
    slug: 'lpcrew',
    name: 'MiraGe.',
    division: 1,
    rating: 1840,
    win: 4229,
    lose: 4523,
    rank: 1,
    sourceClanId: '1290',
    sourceLeagueClanId: '1',
    ...over,
  })

  it('점수·승패·부리그를 목록 값 그대로 옮긴다', () => {
    expect(toClanWriteData(registered())).toEqual({
      rating: 1840,
      win: 4229,
      lose: 4523,
      division: 1,
      placement: false,
    })
  })

  it('경기에서 되짚은 값을 쓰지 않는다 — smite 3000(기본값) 이 아니라 1718 이다', () => {
    /* 되짚기는 자기 진영 점수가 담긴 경기가 하나도 없어 null 이었다. 목록에는 1718 이 있다 */
    const derived = accumulateClanRollups(
      toClanRollupRows(match({ redSourceRating: null, blueSourceRating: null })),
    ).get('RED')!
    expect(derived.rating).toBeNull()
    expect(toClanWriteData(registered({ slug: '5882832', name: 'smite', rating: 1718 })).rating).toBe(
      1718,
    )
  })

  it('rating 이 null 이면 그 칸을 쓰지 않는다 — 기존 값을 건드리지 않는다', () => {
    expect('rating' in toClanWriteData(registered({ rating: null }))).toBe(false)
  })

  it('win/lose 가 null 이면 0으로 채우지 않는다', () => {
    const data = toClanWriteData(registered({ win: null, lose: null }))
    expect('win' in data).toBe(false)
    expect('lose' in data).toBe(false)
    expect(data.division, '부리그는 목록이 항상 준다').toBe(1)
  })

  it('부리그를 목록 값으로 바로잡는다 — 기본값 1로 남지 않는다', () => {
    expect(toClanWriteData(registered({ division: 2 })).division).toBe(2)
  })

  it('우리 공식값(D-145)은 건드리지 않는다', () => {
    const keys = Object.keys(toClanWriteData(registered()))
    for (const forbidden of ['internalRating', 'compositionScore', 'activityPenalty', 'lastRatedAt']) {
      expect(keys, `${forbidden} 를 건드리면 안 된다`).not.toContain(forbidden)
    }
  })
})

describe('랭킹 모집단은 수집 파일 클랜 목록이 정한다 (D-157)', () => {
  it('목록에 있는 클랜만 placement=false 다', () => {
    expect(
      toClanWriteData({
        slug: 'lpcrew',
        name: 'MiraGe.',
        division: 1,
        rating: 1840,
        win: 1,
        lose: 0,
        rank: 1,
        sourceClanId: '1290',
        sourceLeagueClanId: '1',
      }).placement,
    ).toBe(false)
  })

  it('경기가 하나도 없는 등록 클랜도 랭킹 값이 완전하다 — 경기에서 오는 값이 없다', () => {
    /* 경기가 0건이어도 목록만으로 rating·win·lose·division 이 전부 채워진다.
       그래서 행만 만들어 주면 원본과 같은 랭킹이 된다 */
    const data = toClanWriteData({
      slug: 'newclan',
      name: '신생',
      division: 2,
      rating: 1100,
      win: 0,
      lose: 0,
      rank: 30,
      sourceClanId: '99',
      sourceLeagueClanId: '77',
    })
    expect(data).toEqual({ rating: 1100, win: 0, lose: 0, division: 2, placement: false })
  })

  it('목록에 없는 클랜은 랭킹에서 빠진다 (placement=true)', () => {
    expect(UNRANKED_CLAN_WRITE.placement).toBe(true)
  })

  it('랭킹에서 뺄 때 점수·승패를 건드리지 않는다 — 경기는 그대로 남는다', () => {
    expect(Object.keys(UNRANKED_CLAN_WRITE)).toEqual(['placement'])
  })
})

describe('배치고사 (D-154)', () => {
  it('미러 경기가 있는 선수는 placement=false 다', () => {
    expect(toPlayerWriteData(accumulatePlayerRollups([stat()]).get('P1')!).placement).toBe(false)
  })
})

/**
 * 현재 소속 (D-160) — 개인랭킹의 클랜 마크가 여기서 나온다.
 *
 * 점수와 규칙이 하나만 다르다. 점수는 **값이 있는 행** 중 최신을 고르지만,
 * 소속은 **경기 자체의 최신**을 고른다 — `null` 이 "무소속" 이라는 실제 정보이기 때문이다.
 */
describe('소속 클랜은 가장 최근 경기의 값 하나다 (D-160)', () => {
  it('최신 경기의 클랜을 고른다 — 최빈값이나 첫 경기가 아니다', () => {
    const acc = accumulatePlayerRollups([
      stat({ matchId: 'A', startAt: at('2026-01-01T00:00:00Z'), clanSlug: 'old' }),
      stat({ matchId: 'B', startAt: at('2026-02-01T00:00:00Z'), clanSlug: 'old' }),
      stat({ matchId: 'C', startAt: at('2026-03-01T00:00:00Z'), clanSlug: 'new' }),
    ])
    expect(acc.get('P1')?.clanSlug).toBe('new')
  })

  it('입력 순서가 뒤죽박죽이어도 결과가 같다', () => {
    const rows = [
      stat({ matchId: 'C', startAt: at('2026-03-01T00:00:00Z'), clanSlug: 'new' }),
      stat({ matchId: 'A', startAt: at('2026-01-01T00:00:00Z'), clanSlug: 'old' }),
    ]
    expect(accumulatePlayerRollups(rows).get('P1')?.clanSlug).toBe('new')
    expect(accumulatePlayerRollups([...rows].reverse()).get('P1')?.clanSlug).toBe('new')
  })

  it('시각이 같으면 matchId 로 순서를 고정한다', () => {
    const same = at('2026-05-05T12:00:00Z')
    const rows = [
      stat({ matchId: '111', startAt: same, clanSlug: 'aaa' }),
      stat({ matchId: '222', startAt: same, clanSlug: 'bbb' }),
    ]
    expect(accumulatePlayerRollups(rows).get('P1')?.clanSlug).toBe('bbb')
    expect(accumulatePlayerRollups([...rows].reverse()).get('P1')?.clanSlug).toBe('bbb')
  })

  it('최신 경기가 무소속이면 무소속이다 — 예전 클랜을 되살리지 않는다', () => {
    const acc = accumulatePlayerRollups([
      stat({ matchId: 'A', startAt: at('2026-01-01T00:00:00Z'), clanSlug: 'old' }),
      stat({ matchId: 'B', startAt: at('2026-06-01T00:00:00Z'), clanSlug: null }),
    ])
    expect(acc.get('P1')?.clanSlug).toBeNull()
    // 점수는 규칙이 다르다 — 아는 행이 하나라도 있으면 버리지 않는다
    expect(acc.get('P1')?.rating).toBe(3200)
  })

  it('두 번 누적해도 값이 흔들리지 않는다', () => {
    const rows = [
      stat({ matchId: 'A', startAt: at('2026-01-01T00:00:00Z'), clanSlug: 'old' }),
      stat({ matchId: 'C', startAt: at('2026-03-01T00:00:00Z'), clanSlug: 'new' }),
    ]
    const once = accumulatePlayerRollups(rows)
    const twice = accumulatePlayerRollups(rows, accumulatePlayerRollups(rows))
    expect(twice.get('P1')?.clanSlug).toBe(once.get('P1')?.clanSlug)
  })
})

describe('소속은 지어내지 않는다 (D-160 · 3-A 8번)', () => {
  it('무소속이면 clanId 칸 자체가 없다 — 기존 값을 건드리지 않는다', () => {
    const acc = accumulatePlayerRollups([stat({ clanSlug: null })])
    const data = toPlayerWriteData(acc.get('P1')!, null)
    expect('clanId' in data).toBe(false)
  })

  it('Clan 표에 없는 클랜이면 clanId 칸이 없다 — 클랜을 만들지 않는다', () => {
    const acc = accumulatePlayerRollups([stat({ clanSlug: 'not-in-db' })])
    // 호출부가 slug 를 찾지 못하면 null 을 넘긴다
    expect('clanId' in toPlayerWriteData(acc.get('P1')!, null)).toBe(false)
  })

  it('빈 문자열은 값이 아니다 — 0 이나 "" 로 채우지 않는다 (D-034)', () => {
    const acc = accumulatePlayerRollups([stat({ clanSlug: 'x' })])
    expect('clanId' in toPlayerWriteData(acc.get('P1')!, '')).toBe(false)
  })

  it('찾았으면 그 id 를 쓴다', () => {
    const acc = accumulatePlayerRollups([stat({ clanSlug: 'saint' })])
    expect(toPlayerWriteData(acc.get('P1')!, 'clan-1').clanId).toBe('clan-1')
  })
})

describe('전역 현재 소속은 리그를 넘어 가장 최근 것 하나다 (D-160)', () => {
  const pick = (over: Partial<PlayerClanPick> = {}): PlayerClanPick => ({
    clanSlug: 'a',
    startAt: at('2026-01-01T00:00:00Z'),
    matchId: 'M1',
    ...over,
  })

  it('나중 리그가 더 오래된 경기를 들고 오면 지지 않는다', () => {
    const merged = mergePlayerClanPicks(
      new Map([['P1', pick({ clanSlug: 'new', startAt: at('2026-06-01T00:00:00Z'), matchId: 'B' })]]),
      new Map([['P1', pick({ clanSlug: 'old', startAt: at('2026-01-01T00:00:00Z'), matchId: 'A' })]]),
    )
    expect(merged.get('P1')?.clanSlug).toBe('new')
  })

  it('리그 순서를 바꿔도 결과가 같다 — --league 를 무엇으로 주든 값이 흔들리지 않는다', () => {
    const supply = new Map([
      ['P1', pick({ clanSlug: 'old', startAt: at('2026-01-01T00:00:00Z'), matchId: 'A' })],
    ])
    const sanply = new Map([
      ['P1', pick({ clanSlug: 'new', startAt: at('2026-06-01T00:00:00Z'), matchId: 'B' })],
    ])
    const forward = mergePlayerClanPicks(mergePlayerClanPicks(new Map(), supply), sanply)
    const backward = mergePlayerClanPicks(mergePlayerClanPicks(new Map(), sanply), supply)
    expect(forward.get('P1')).toEqual(backward.get('P1'))
    expect(forward.get('P1')?.clanSlug).toBe('new')
  })

  it('무소속(null)도 값이다 — 더 최신이면 이긴다', () => {
    const merged = mergePlayerClanPicks(
      new Map([['P1', pick({ clanSlug: 'old', startAt: at('2026-01-01T00:00:00Z'), matchId: 'A' })]]),
      new Map([['P1', pick({ clanSlug: null, startAt: at('2026-06-01T00:00:00Z'), matchId: 'B' })]]),
    )
    expect(merged.get('P1')?.clanSlug).toBeNull()
  })

  it('시각이 같으면 matchId 로 순서를 고정한다', () => {
    const same = at('2026-05-05T12:00:00Z')
    const left = new Map([['P1', pick({ clanSlug: 'aaa', startAt: same, matchId: '111' })]])
    const right = new Map([['P1', pick({ clanSlug: 'bbb', startAt: same, matchId: '222' })]])
    expect(mergePlayerClanPicks(new Map(left), right).get('P1')?.clanSlug).toBe('bbb')
    expect(mergePlayerClanPicks(new Map(right), left).get('P1')?.clanSlug).toBe('bbb')
  })
})

describe('수집 파일 클랜 목록 읽기', () => {
  const checkpoint = {
    clans: {
      lpcrew: { leagueClanId: 1, clanId: 1290, name: 'MiraGe.', division: 1, rating: 1840, win: 4229, lose: 4523, rank: 1 },
      '5882832': { leagueClanId: 912, clanId: 1972, name: 'smite', division: 1, rating: 1718, win: 1233, lose: 924, rank: 2 },
    },
  }

  it('slug 를 키로 읽는다 — 숫자처럼 생긴 slug 도 문자열로 다룬다', () => {
    const { registry, dropped } = parseClanRegistry(checkpoint)
    expect(dropped).toBe(0)
    expect(registry.size).toBe(2)
    expect(registry.get('5882832')?.name).toBe('smite')
    expect(registry.get('lpcrew')?.rating).toBe(1840)
  })

  it('원본 id 를 문자열로 보존한다 — 나중에 원본과 대조해야 한다 (3-A 3번)', () => {
    const { registry } = parseClanRegistry(checkpoint)
    expect(registry.get('5882832')).toMatchObject({
      sourceClanId: '1972',
      sourceLeagueClanId: '912',
    })
  })

  it('원본 id 가 없으면 null 이다 — 지어내지 않는다', () => {
    const { registry } = parseClanRegistry({ clans: { x: { name: 'x', division: 1 } } })
    expect(registry.get('x')).toMatchObject({ sourceClanId: null, sourceLeagueClanId: null })
  })

  it('아직 안 받은 값은 null 로 남긴다 — 0으로 만들지 않는다', () => {
    const { registry } = parseClanRegistry({
      clans: { x: { name: 'x', division: 2, rating: null, win: null, lose: null, rank: null } },
    })
    expect(registry.get('x')).toMatchObject({ rating: null, win: null, lose: null, division: 2 })
  })

  it('모양이 다른 줄은 버리고 **버린 수를 알려 준다** (조용히 넘기지 않는다)', () => {
    const { registry, dropped } = parseClanRegistry({
      clans: { good: { name: 'g', division: 1, rating: 1 }, bad: { name: 'b' } },
    })
    expect(registry.size).toBe(1)
    expect(dropped).toBe(1)
  })

  it('clans 가 없으면 빈 목록이다 — 그 경우 호출부가 클랜을 건드리지 않는다', () => {
    expect(parseClanRegistry({}).registry.size).toBe(0)
    expect(parseClanRegistry(null).registry.size).toBe(0)
  })
})

describe('우리 공식값(D-145)은 집계 대상이 아니다', () => {
  it('쓰기 데이터에 ratingBefore·ratingUpdate·formulaVersion·baseRating 이 없다', () => {
    const data = toPlayerWriteData(accumulatePlayerRollups([stat()]).get('P1')!)
    for (const forbidden of [
      'ratingBefore',
      'ratingUpdate',
      'formulaVersion',
      'baseRating',
      'internalRating',
      'activityPenalty',
    ]) {
      expect(Object.keys(data), `${forbidden} 를 건드리면 안 된다`).not.toContain(forbidden)
    }
  })
})
