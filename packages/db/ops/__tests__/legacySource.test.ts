import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CSV_MAPPING,
  extractStatePayload,
  fromCsv,
  fromJsonRows,
  fromSupplyHtml,
  fromSupplyState,
  mergeRows,
  type LegacySeasonRow,
} from '../legacySource'

/**
 * 과거 시즌 파서 (Phase 11-F).
 *
 * 표본은 **실제로 관측한 응답**이다 (2026-08-22, 정상 브라우저로 페이지 2개 열람).
 *   GET /leagueplayers/77269/seasons
 *   GET /leagues/supply/players/587873689
 *
 * 이 파일이 지키는 것 하나: **없는 값을 만들지 않는다.**
 */

/** 실제 관측된 지난시즌 응답 */
const REAL_SEASONS = {
  message: 'success',
  data: [
    {
      id: 96273,
      season: 6,
      rank: 0,
      rank_count: 6934,
      win: 0,
      lose: 1,
      win_rate: 0,
      kill: 5,
      death: 8,
      kd_rate: 38.5,
    },
  ],
}

/** 실제 관측된 현재시즌 응답 (경기 배열은 길어서 생략) */
const REAL_CURRENT = {
  message: 'success',
  data: {
    id: 77269,
    rating: 0,
    win: 2,
    lose: 4,
    win_rate: 33.3,
    kill: 54,
    death: 49,
    assist: 13,
    headshot: 2,
    kd_rate: 52.4,
    kill_per_match: 9,
    mvp_count: 1,
    placement: true,
    rank: null,
    rank_count: null,
    player: { id: 587873689, name: '0330최자RT', clan: null },
  },
}

const REAL_STATE = {
  'https://api-v2.3rd.supply/infos': { message: 'success', data: {} },
  'https://api-v2.3rd.supply/leagues/supply': { message: 'success', data: { id: 1 } },
  'https://api-v2.3rd.supply/leagues/supply/players/587873689': REAL_CURRENT,
  'https://api-v2.3rd.supply/leagueplayers/77269/seasons': REAL_SEASONS,
}

describe('저장된 HTML에서 payload 꺼내기', () => {
  it('supplyPc-state 스크립트를 찾아 JSON으로 읽는다', () => {
    const html = `<html><body><app></app><script id="supplyPc-state" type="application/json">${JSON.stringify(REAL_STATE)}</script></body></html>`
    const payload = extractStatePayload(html)
    expect(payload).not.toBeNull()
    expect(Object.keys(payload as object)).toContain('https://api-v2.3rd.supply/leagueplayers/77269/seasons')
  })

  it('스크립트가 없으면 조용히 성공하지 않고 이유를 남긴다', () => {
    const result = fromSupplyHtml('<html><body>로그인이 필요합니다</body></html>')
    expect(result.rows).toHaveLength(0)
    expect(result.warnings[0]).toContain('supplyPc-state')
  })
})

describe('종료된 시즌 카드', () => {
  const result = fromSupplyState(REAL_STATE)

  it('실제 응답에서 시즌 6 카드를 뽑는다', () => {
    expect(result.rows).toHaveLength(1)
    const row = result.rows[0] as LegacySeasonRow
    expect(row.season).toBe(6)
    expect(row.legacyPlayerId).toBe('587873689')
    expect(row.legacyLeaguePlayerId).toBe('96273')
    expect(row.nickname).toBe('0330최자RT')
    expect(row.rank).toBe(0)
    expect(row.rankCount).toBe(6934)
    expect(row.win).toBe(0)
    expect(row.lose).toBe(1)
    expect(row.kill).toBe(5)
    expect(row.death).toBe(8)
    expect(row.kdRate).toBe(38.5)
  })

  it('지난시즌 응답에 없는 값은 null이다 — 승패로 역산하지 않는다', () => {
    const row = result.rows[0] as LegacySeasonRow
    expect(row.rating).toBeNull()
    expect(row.assist).toBeNull()
    expect(row.headshot).toBeNull()
    expect(row.killPerMatch).toBeNull()
    expect(row.mvpCount).toBeNull()
    expect(row.clanName).toBeNull()
    expect(row.division).toBeNull()
  })
})

describe('진행 중 시즌 — 마감 직전 현재값', () => {
  it('currentSeason을 주면 그 번호의 카드를 만든다', () => {
    const result = fromSupplyState(REAL_STATE, { currentSeason: 7 })
    const seven = result.rows.find((row) => row.season === 7)
    expect(seven).toBeDefined()
    expect(seven?.rating).toBe(0)
    expect(seven?.assist).toBe(13)
    expect(seven?.headshot).toBe(2)
    expect(seven?.killPerMatch).toBe(9)
    expect(seven?.mvpCount).toBe(1)
    expect(seven?.win).toBe(2)
    expect(seven?.lose).toBe(4)
  })

  it('currentSeason을 주지 않으면 진행 중 시즌 카드를 만들지 않는다', () => {
    expect(fromSupplyState(REAL_STATE).rows.some((row) => row.season === 7)).toBe(false)
  })

  it('선수 식별자가 없으면 그 파일은 건너뛴다 (닉네임으로 추정하지 않는다)', () => {
    const broken = { ...REAL_STATE, 'https://api-v2.3rd.supply/leagues/supply/players/1': { data: { id: 1, player: { name: '이름만' } } } }
    delete (broken as Record<string, unknown>)['https://api-v2.3rd.supply/leagues/supply/players/587873689']
    const result = fromSupplyState(broken)
    expect(result.rows).toHaveLength(0)
    expect(result.warnings[0]).toContain('선수 식별자')
  })
})

describe('마감 직전 + 마감 직후 병합 (Season 7 최종 카드)', () => {
  it('null이 기존 값을 지우지 않는다 — 채우기만 한다', () => {
    const before = fromSupplyState(REAL_STATE, { currentSeason: 7 }).rows.filter((r) => r.season === 7)
    const after: LegacySeasonRow[] = [
      {
        ...(before[0] as LegacySeasonRow),
        rank: 302,
        rankCount: 5582,
        rating: null,
        assist: null,
        mvpCount: null,
      },
    ]
    const merged = mergeRows([...before, ...after])
    const card = merged.find((row) => row.season === 7)
    expect(card?.rank, '마감 후 확정 순위가 들어와야 한다').toBe(302)
    expect(card?.rankCount).toBe(5582)
    expect(card?.assist, '마감 전 값이 null로 덮이면 안 된다').toBe(13)
    expect(card?.mvpCount).toBe(1)
    expect(card?.killPerMatch).toBe(9)
  })

  it('선수·시즌이 같아야 합친다. 다른 선수는 따로 남는다', () => {
    const rows = mergeRows([
      { ...(fromSupplyState(REAL_STATE).rows[0] as LegacySeasonRow) },
      { ...(fromSupplyState(REAL_STATE).rows[0] as LegacySeasonRow), legacyPlayerId: '999' },
    ])
    expect(rows).toHaveLength(2)
  })
})

describe('CSV / JSON 어댑터 (운영자 export 대비)', () => {
  it('기본 열 이름으로 읽는다', () => {
    const csv = [
      'season,player_id,name,rank,rank_count,win,lose,kill,death,rating',
      '7,587873689,0330최자RT,302,5582,63,41,900,700,1836',
    ].join('\n')
    const result = fromCsv(csv)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]?.rank).toBe(302)
    expect(result.rows[0]?.rating).toBe(1836)
    // 열이 아예 없으면 null. 0으로 채우지 않는다
    expect(result.rows[0]?.mvpCount).toBeNull()
  })

  it('열 이름이 다르면 매핑으로 맞춘다 (특정 export 형식에 강결합하지 않는다)', () => {
    const csv = ['시즌,아이디,닉네임\n7,587873689,홍길동'].join('\n')
    const result = fromCsv(csv, { season: '시즌', legacyPlayerId: '아이디', nickname: '닉네임' })
    expect(result.rows[0]?.season).toBe(7)
    expect(result.rows[0]?.nickname).toBe('홍길동')
  })

  it('season이나 player_id가 없는 줄은 버리고 이유를 남긴다', () => {
    const result = fromCsv('season,player_id\n,\n7,123')
    expect(result.rows).toHaveLength(1)
    expect(result.warnings).toHaveLength(1)
  })

  it('정규화된 JSON 배열도 읽는다', () => {
    const result = fromJsonRows([{ season: 7, legacyPlayerId: '1', win: 3 }])
    expect(result.rows[0]?.win).toBe(3)
    expect(result.rows[0]?.death).toBeNull()
  })

  it('기본 매핑은 3rd.supply 필드명을 그대로 쓴다', () => {
    expect(DEFAULT_CSV_MAPPING.killPerMatch).toBe('kill_per_match')
    expect(DEFAULT_CSV_MAPPING.legacyPlayerId).toBe('player_id')
  })
})
