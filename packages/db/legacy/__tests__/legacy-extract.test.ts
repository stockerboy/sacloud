import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  HEADER_MAP,
  LEGACY_CSV_HEADER,
  mapSeasonRow,
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

  it('스니펫이 같은 열 이름 매핑을 쓴다', () => {
    for (const [label, column] of Object.entries(HEADER_MAP)) {
      expect(snippet, `스니펫에 ${label} → ${column} 매핑이 없다`).toMatch(
        new RegExp(`${label}\\s*:\\s*'${column}'`),
      )
    }
  })
})
