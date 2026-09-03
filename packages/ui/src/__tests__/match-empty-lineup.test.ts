/**
 * **참가 기록이 없는 경기는 왜 없는지 말한다** (2026-09-04).
 *
 * 폰(390px)으로 3~6월 IPL 경기를 열어 보니 이렇게 나왔다 —
 * ```
 * 제3보급창고   ★0 vs 0★         알수없음
 * ┌──────────────────────────┐
 * │ 플레이어    kda   무기   래더 │   ← ★머리글만 있고 아래가 텅 비었다★
 * └──────────────────────────┘
 * ┌──────────────────────────┐
 * │ 플레이어    kda   무기   래더 │
 * └──────────────────────────┘
 * ```
 * ★「0 vs 0」 말고는 아무 설명이 없다.★ ★「고장났나」로 읽힌다.★
 *
 * ★비어 있는 것은 사실이다. 그 사실을 말해 주는 것이 화면의 일이다★ —
 * 없는 값을 `0점` 으로 그리지 않는 것(D-106)과 ★같은 결★ 이다.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'record', 'MatchCard.tsx'),
  'utf8',
)

describe('경기 상세 · 참가 기록이 없을 때', () => {
  it('★왜 없는지 한 줄을 그린다★', () => {
    expect(SRC).toContain('stats.length === 0')
    expect(SRC).toContain('이 경기의 참가 기록을 아직 못 받았습니다.')
  })

  it('★기록이 있으면 그 줄은 안 나온다★ — 조건이 걸려 있다', () => {
    expect(SRC).toMatch(/stats\.length === 0 \? \(/)
  })

  it('★왜 이렇게 했는지가 파일에 적혀 있다★', () => {
    expect(SRC).toContain('고장났나')
  })

  /* 원래 있던 줄 그리기는 그대로여야 한다 */
  it('참가 기록이 있으면 줄을 그린다', () => {
    expect(SRC).toContain('stats.map((stat) => (')
  })
})
