import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  HEADER_MAP,
  LEGACY_CSV_HEADER,
  mapSeasonRow,
  parseSeasonCard,
  seasonCardToRow,
  toCsvLine,
  toNumberText,
  toRankCount,
} from '../extract'

/**
 * 아래 문자열은 **실제로 렌더된 지난시즌 화면에서 읽어온 값**이다 (2026-08-21).
 *
 *   열   : 시즌 | 순위 | 승리 | 패배 | 승률 | 킬뎃 | 래더
 *   1행 : 시즌 7 | 배치고사 | 47승 | 40패 | 54% | 73% | 938점
 *   2행 : 시즌 6 | 8위 | 53승 | 56패 | 48.6% | 70.7% | 1,372점
 *
 * 원본(3rd.supply)의 열 이름이 다르면 이 테스트가 아니라 `HEADER_MAP`을 고쳐야 한다.
 * 실제 페이지에서 한 번 확인한 뒤 매핑을 확정한다.
 */
const HEADER = ['시즌', '순위', '승리', '패배', '승률', '킬뎃', '래더']

const CONTEXT = {
  sourcePlayerId: '500030007',
  nickname: '밝은수달89',
  leagueSlug: 'officialmain',
  sourceUrl: 'https://3rd.supply/league/officialmain/player/500030007/season',
}

describe('숫자 텍스트 정리', () => {
  it('단위와 천 단위 쉼표를 떼어낸다', () => {
    expect(toNumberText('1,372점')).toBe('1372')
    expect(toNumberText('48.6%')).toBe('48.6')
    expect(toNumberText('시즌 7')).toBe('7')
    expect(toNumberText('53승')).toBe('53')
    expect(toNumberText('8위')).toBe('8')
  })

  /** 숫자가 아닌 값을 0이나 아무 숫자로 바꾸면 없는 기록을 지어내는 것이 된다 */
  it('숫자가 아니면 빈 값이다 (0으로 만들지 않는다)', () => {
    expect(toNumberText('배치고사')).toBe('')
    expect(toNumberText('')).toBe('')
    expect(toNumberText('-')).toBe('')
    expect(toNumberText('알수없음')).toBe('')
  })

  it('"360명중 8위"에서 모집단을 뽑는다', () => {
    expect(toRankCount('360명중 8위')).toBe('360')
    expect(toRankCount('1,204명중 12위')).toBe('1204')
    expect(toRankCount('8위')).toBe('')
  })
})

describe('지난시즌 행 → CSV', () => {
  it('배치고사 시즌은 순위를 비운다', () => {
    const row = mapSeasonRow(HEADER, ['시즌 7', '배치고사', '47승', '40패', '54%', '73%', '938점'], CONTEXT)
    expect(row['season']).toBe('7')
    expect(row['final_rank']).toBe('')
    expect(row['rank_count']).toBe('')
    expect(row['wins']).toBe('47')
    expect(row['losses']).toBe('40')
    expect(row['win_rate']).toBe('54')
    expect(row['kd']).toBe('73')
    expect(row['final_rating']).toBe('938')
  })

  it('순위가 있는 시즌을 그대로 담는다', () => {
    const row = mapSeasonRow(HEADER, ['시즌 6', '8위', '53승', '56패', '48.6%', '70.7%', '1,372점'], CONTEXT)
    expect(row['season']).toBe('6')
    expect(row['final_rank']).toBe('8')
    expect(row['final_rating']).toBe('1372')
    expect(row['win_rate']).toBe('48.6')
    expect(row['kd']).toBe('70.7')
  })

  /** 화면에 없는 열은 비어 있어야 한다. 다른 값에서 역산하지 않는다. */
  it('화면에 없는 열은 비운다 (킬·데스는 지난시즌 표에 없다)', () => {
    const row = mapSeasonRow(HEADER, ['시즌 6', '8위', '53승', '56패', '48.6%', '70.7%', '1,372점'], CONTEXT)
    expect(row['kills']).toBe('')
    expect(row['deaths']).toBe('')
    expect(row['division']).toBe('')
    expect(row['clan_name']).toBe('')
  })

  it('승률만 있는 표에서도 승/패를 만들어내지 않는다', () => {
    const row = mapSeasonRow(['시즌', '승률', '킬뎃'], ['시즌 3', '58%', '49%'], CONTEXT)
    expect(row['win_rate']).toBe('58')
    expect(row['kd']).toBe('49')
    expect(row['wins']).toBe('')
    expect(row['losses']).toBe('')
  })

  it('페이지에서 얻은 식별자를 채운다', () => {
    const row = mapSeasonRow(HEADER, ['시즌 6', '8위', '53승', '56패', '48.6%', '70.7%', '1,372점'], CONTEXT)
    expect(row['source_player_id']).toBe('500030007')
    expect(row['nickname']).toBe('밝은수달89')
    expect(row['league_slug']).toBe('officialmain')
    expect(row['source_url']).toContain('/season')
  })

  it('CSV 한 줄로 만든다 (열 순서 고정)', () => {
    const row = mapSeasonRow(HEADER, ['시즌 6', '8위', '53승', '56패', '48.6%', '70.7%', '1,372점'], CONTEXT)
    expect(toCsvLine(row)).toBe(
      '500030007,밝은수달89,officialmain,6,,,53,56,48.6,,,70.7,1372,8,,https://3rd.supply/league/officialmain/player/500030007/season',
    )
  })

  it('쉼표가 든 값은 따옴표로 감싼다', () => {
    const row = mapSeasonRow(['시즌', '클랜'], ['시즌 1', '심연, 방위대'], CONTEXT)
    expect(toCsvLine(row)).toContain('"심연, 방위대"')
  })
})

/**
 * 아래는 **원본(3rd.supply)에서 실제로 본 카드**다 (2026-08-21).
 * `https://3rd.supply/league/supply/player/1074574325/season`
 *
 * ```
 * 서플라이공식리그      시즌 6
 *              6,934명중 140위
 * 218승 173패    승률  55.8%
 * 3,468킬 3,197데스  킬뎃  52%
 * ```
 *
 * 원본은 **표가 아니라 카드**다. 우리 재현 화면(표)과 구조가 다르다.
 */
describe('원본 지난시즌 카드 파싱', () => {
  const REAL_CARD = '서플라이공식리그 시즌 6 6,934명중 140위 218승 173패 승률 55.8% 3,468킬 3,197데스 킬뎃 52%'

  it('실제 카드에서 전 항목을 읽는다', () => {
    const card = parseSeasonCard(REAL_CARD)
    expect(card.leagueName).toBe('서플라이공식리그')
    expect(card.season).toBe(6)
    expect(card.finalRank).toBe(140)
    expect(card.rankCount).toBe(6934)
    expect(card.wins).toBe(218)
    expect(card.losses).toBe(173)
    expect(card.winRate).toBe(55.8)
    expect(card.kills).toBe(3468)
    expect(card.deaths).toBe(3197)
    expect(card.kd).toBe(52)
  })

  /** 원본 카드에 래더가 없다. 다른 값에서 만들어내지 않는다. */
  it('카드에 래더가 없으면 null이다', () => {
    expect(parseSeasonCard(REAL_CARD).finalRating).toBeNull()
  })

  /**
   * 원본 값으로 우리 파생 공식을 검산한다.
   *   승률 = 승/(승+패)      → 218/391 = 55.75% → 55.8 ✓
   *   킬뎃 = 킬/(킬+데스)    → 3468/6665 = 52.03% → 52 ✓
   * 우리 `derive.ts` 규칙이 원본과 같다는 증거다.
   */
  it('원본 숫자가 우리 파생 공식과 맞는다', () => {
    const card = parseSeasonCard(REAL_CARD)
    const winRate = (card.wins! / (card.wins! + card.losses!)) * 100
    const kdRate = (card.kills! / (card.kills! + card.deaths!)) * 100
    expect(Math.round(winRate * 10) / 10).toBe(card.winRate)
    expect(Math.round(kdRate)).toBe(card.kd)
  })

  /**
   * **오래된 시즌은 승/패와 킬/데스가 없다.** 비율만 남아 있다.
   * (2026-08-21 원본 실측 — `/league/supply/player/285626135/season`)
   *
   *   시즌 6: 6,934명중 1위 · 967승 578패 · 62.6% · 16,875킬 10,605데스 · 61.4%
   *   시즌 4: 29,991명중 122위 · 승률 56.9% · 킬뎃 56.9%      ← 승/패·킬/데스 없음
   *
   * 이 경우 **비율만 담고 원시 수치는 null로 둔다.** 역산하지 않는다.
   */
  it('시즌마다 있는 항목이 다르다 — 최근 시즌은 원시 수치까지 있다', () => {
    const card = parseSeasonCard(
      '서플라이공식리그 시즌 6 6,934명중 1위 967승 578패 승률 62.6% 16,875킬 10,605데스 킬뎃 61.4%',
    )
    expect(card.season).toBe(6)
    expect(card.finalRank).toBe(1)
    expect(card.rankCount).toBe(6934)
    expect(card.wins).toBe(967)
    expect(card.losses).toBe(578)
    expect(card.kills).toBe(16875)
    expect(card.deaths).toBe(10605)
    expect(card.winRate).toBe(62.6)
    expect(card.kd).toBe(61.4)
  })

  it('오래된 시즌은 비율만 있다 — 승/패·킬/데스를 만들어내지 않는다', () => {
    const card = parseSeasonCard('서플라이공식리그 시즌 4 29,991명중 122위 승률 56.9% 킬뎃 56.9%')
    expect(card.season).toBe(4)
    expect(card.finalRank).toBe(122)
    expect(card.rankCount).toBe(29991)
    expect(card.winRate).toBe(56.9)
    expect(card.kd).toBe(56.9)
    // 여기가 핵심 — 비어 있어야 한다
    expect(card.wins).toBeNull()
    expect(card.losses).toBeNull()
    expect(card.kills).toBeNull()
    expect(card.deaths).toBeNull()
  })

  /** `승률` 의 `승` 이 `N승 M패` 로 잘못 잡히면 안 된다 */
  it('"승률"을 승/패로 오인하지 않는다', () => {
    const card = parseSeasonCard('서플라이공식리그 시즌 3 22,018명중 31위 승률 55.8% 킬뎃 58.1%')
    expect(card.wins).toBeNull()
    expect(card.losses).toBeNull()
    expect(card.winRate).toBe(55.8)
  })

  it('모집단 없이 순위만 있어도 읽는다', () => {
    const card = parseSeasonCard('서플라이공식리그 시즌 3 12위 10승 5패 승률 66.7% 킬뎃 58%')
    expect(card.finalRank).toBe(12)
    expect(card.rankCount).toBeNull()
    expect(card.kills).toBeNull()
    expect(card.deaths).toBeNull()
  })

  it('CSV 행으로 바꾼다', () => {
    const row = seasonCardToRow(parseSeasonCard(REAL_CARD), {
      sourcePlayerId: '1074574325',
      nickname: '테스트',
      leagueSlug: 'supply',
      sourceUrl: 'https://3rd.supply/league/supply/player/1074574325/season',
    })
    expect(row['season']).toBe('6')
    expect(row['wins']).toBe('218')
    expect(row['kills']).toBe('3468')
    expect(row['rank_count']).toBe('6934')
    expect(row['final_rating']).toBe('')
    expect(row['division']).toBe('')
  })
})

/**
 * 스니펫은 콘솔에 붙여넣어야 해서 자체 완결형이다.
 * 그래서 **매핑이 조용히 어긋날 수 있다.** 여기서 잡는다.
 */
describe('브라우저 스니펫과 규칙이 어긋나지 않는다', () => {
  const snippet = readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'extract-snippet.js'),
    'utf8',
  )

  it('스니펫이 같은 CSV 열 목록을 쓴다', () => {
    for (const column of LEGACY_CSV_HEADER) {
      expect(snippet, `스니펫에 ${column} 이 없다`).toContain(`'${column}'`)
    }
  })

  /** 카드에서 값을 뽑는 정규식이 `parseSeasonCard` 와 같아야 한다 */
  it('스니펫이 같은 카드 패턴을 쓴다', () => {
    for (const pattern of [
      '시즌\\\\s*(\\\\d+)',
      '명\\\\s*중',
      '승\\\\s*([\\\\d,]+)\\\\s*패',
      '승률\\\\s*([\\\\d.]+)',
      '킬\\\\s*([\\\\d,]+)\\\\s*데스',
      '킬뎃\\\\s*([\\\\d.]+)',
    ]) {
      expect(snippet, `스니펫에 ${pattern} 패턴이 없다`).toContain(pattern.replace(/\\\\/g, '\\'))
    }
  })

  /** 표 기반이던 옛 스니펫이 남아 있으면 카드 화면에서 아무것도 못 읽는다 */
  it('표(HEADER_MAP) 방식이 남아 있지 않다', () => {
    expect(snippet).not.toContain('HEADER_MAP')
    // 매핑 상수는 CSV import 쪽에서만 쓴다
    expect(Object.keys(HEADER_MAP).length).toBeGreaterThan(0)
  })
})

/**
 * 수집기(`collect-snippet.js`)는 5,000페이지를 사람이 도는 도구다.
 * 파서와 어긋나면 **전부 다시 모아야 한다.** 여기서 막는다.
 */
describe('수집기와 규칙이 어긋나지 않는다', () => {
  const collector = readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'collect-snippet.js'),
    'utf8',
  )

  it('같은 CSV 열 목록을 쓴다', () => {
    for (const column of LEGACY_CSV_HEADER) {
      expect(collector, `수집기에 ${column} 이 없다`).toContain(`'${column}'`)
    }
  })

  it('같은 카드 패턴을 쓴다', () => {
    for (const pattern of [
      '시즌\\s*(\\d+)',
      '명\\s*중',
      '승\\s*([\\d,]+)\\s*패',
      '승률\\s*([\\d.]+)',
      '킬\\s*([\\d,]+)\\s*데스',
      '킬뎃\\s*([\\d.]+)',
    ]) {
      expect(collector, `수집기에 ${pattern} 패턴이 없다`).toContain(pattern)
    }
  })

  /** 범위가 서플라이공식리그로 좁혀졌다. 다른 리그를 긁으면 안 된다. */
  it('서플라이공식리그(supply)만 대상으로 한다', () => {
    expect(collector).toContain("LEAGUE_SLUG = 'supply'")
    for (const otherLeague of ['sanply', 'daerule', 'champs']) {
      expect(collector, `${otherLeague} 가 들어 있다`).not.toContain(otherLeague)
    }
  })

  /**
   * 요청을 새로 보내거나 스스로 페이지를 넘기면 그 순간 **자동 크롤러**가 된다.
   * 이 도구는 "사람이 연 페이지를 읽기만" 해야 한다 (CLAUDE.md 3-A 5번).
   */
  it('네트워크 요청을 보내거나 스스로 이동하지 않는다', () => {
    expect(collector).not.toMatch(/\bfetch\s*\(/)
    expect(collector).not.toContain('XMLHttpRequest')
    expect(collector).not.toContain('sendBeacon')
    expect(collector).not.toMatch(/location\.(href|assign|replace)\s*=/)
  })
})
