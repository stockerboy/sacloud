/**
 * 발견 스냅샷 판독 회귀 (D-127).
 *
 * DB 를 건드리지 않는 순수 함수만 검사한다 — 스테이징 쓰기는 `--confirm` 경로에서
 * 실제 데이터로 확인한다.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  selectDiscoveryCandidates,
  startAtFromMatchId,
  type SupplyMatchSnapshot,
} from '../supplyMatches'

const SNAPSHOT_PATH = join(__dirname, '..', '..', 'data', 'supply-official-matches.json')

function loadSnapshot(): SupplyMatchSnapshot {
  return JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8')) as SupplyMatchSnapshot
}

describe('match_id → 시작 시각', () => {
  it('앞 12자리를 KST 로 읽어 UTC 로 돌려준다', () => {
    // 원본 화면 표기: 2026-08-18 14:03:12 (KST) → UTC 05:03:12
    expect(startAtFromMatchId('260818140312124001')?.toISOString()).toBe('2026-08-18T05:03:12.000Z')
  })

  it('18자리가 아니면 읽지 않는다 — 추측해서 만들지 않는다', () => {
    expect(startAtFromMatchId('26081814031212400')).toBeNull()
    expect(startAtFromMatchId('')).toBeNull()
    expect(startAtFromMatchId('abcdefghijklmnopqr')).toBeNull()
  })

  it('스냅샷의 start_at 표기와 어긋나지 않는다', () => {
    const snapshot = loadSnapshot()
    let checked = 0
    for (const match of snapshot.matches) {
      if (!match.start_at) continue
      const derived = startAtFromMatchId(match.id)
      expect(derived).not.toBeNull()
      // 원본은 KST 문자열이다. 같은 시각인지 초 단위로 비교한다
      const kst = new Date(`${match.start_at.replace(' ', 'T')}+09:00`)
      expect(derived!.getTime()).toBe(kst.getTime())
      checked += 1
    }
    expect(checked).toBeGreaterThan(700)
  })
})

describe('발견 후보 선별', () => {
  it('스냅샷 전량이 제3보급창고다 (실측 750건)', () => {
    const snapshot = loadSnapshot()
    const all = selectDiscoveryCandidates(snapshot)
    expect(all).toHaveLength(snapshot.matches.length)
    expect(all.every((row) => row.hintMap === '제3보급창고')).toBe(true)
  })

  it('오래된 것부터 정렬한다 — 중단 후 재개해도 순서가 같다', () => {
    const rows = selectDiscoveryCandidates(loadSnapshot())
    const sorted = [...rows].sort((a, b) => a.sourceMatchId.localeCompare(b.sourceMatchId))
    expect(rows.map((r) => r.sourceMatchId)).toEqual(sorted.map((r) => r.sourceMatchId))
  })

  it('since 로 Beta 구간만 고를 수 있다', () => {
    const snapshot = loadSnapshot()
    // Beta 시작 2026-08-20 00:00 KST 이전인 8/19 경기도 있으므로 경계를 명시해 검사한다
    const since = new Date('2026-08-19T00:00:00+09:00')
    const rows = selectDiscoveryCandidates(snapshot, { since })
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((row) => row.startAt! >= since)).toBe(true)
    expect(rows.length).toBeLessThan(snapshot.matches.length)
  })

  it('player-count 로 5v5(10명)만 고를 수 있다 — 6v6 은 D-122 범위 밖이다', () => {
    const snapshot = loadSnapshot()
    const rows = selectDiscoveryCandidates(snapshot, { playerCount: 10 })
    expect(rows.every((row) => row.hintPlayerCount === 10)).toBe(true)
    expect(rows.length).toBeLessThan(snapshot.matches.length)
  })

  it('limit 은 정렬 뒤에 자른다', () => {
    const snapshot = loadSnapshot()
    const all = selectDiscoveryCandidates(snapshot)
    const cut = selectDiscoveryCandidates(snapshot, { limit: 5 })
    expect(cut.map((r) => r.sourceMatchId)).toEqual(all.slice(0, 5).map((r) => r.sourceMatchId))
  })

  it('중복 id 를 두 번 내보내지 않는다 (같은 경기가 양 클랜 페이지에 있다)', () => {
    const rows = selectDiscoveryCandidates(loadSnapshot())
    expect(new Set(rows.map((r) => r.sourceMatchId)).size).toBe(rows.length)
  })
})
