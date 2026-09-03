/**
 * **목록을 「날짜에 닿을 때까지」 넘긴다** (2026-09-04 · D-270 후속).
 *
 * ══ ★왜 검사로 두나★ ══
 *
 * 이 규칙은 ★낮에 돌 것★ 이다 (3~6월 목록 받기). 그런데 ★시험하려면 병영수첩을 두드려야 한다.★
 * ★밤에는 수집이 돌고 있어서 두 번 두드릴 수 없다★ (D-279 에서 한 번 당했다).
 *
 * ★그래서 판단만 순수 함수로 빼고 여기서 확인한다.★ ★요청을 한 건도 안 보낸다.★
 *
 * ══ ★왜 쪽 수가 아니라 날짜인가★ ══
 * ```
 * zzim1  68쪽에 ★3월 1일★    ← 한산한 클랜. 80쪽이면 남는다
 * lee2   81쪽에 ★7월 18일★   ← 바쁜 클랜. 같은 80쪽인데 ★넉 달이 차이 난다★
 * ```
 */
import { describe, expect, it } from 'vitest'
import { reachedListTarget } from '../jobs/barracksCollect.js'

/* 실제 경기키 모양 — `YYMMDD` + 시각 + 일련번호 */
const KEY_0301 = '260301120000119001'
const KEY_0305 = '260305093000124001'
const KEY_0718 = '260718215122124002'
const KEY_0904 = '260904013633125001'

describe('목록 넘기기 · 날짜에 닿으면 끝낸다', () => {
  it('★목표보다 오래된 경기가 나오면 끝낸다★', () => {
    expect(reachedListTarget(KEY_0301, '260305')).toBe(true)
  })

  it('★목표와 같은 날이면 끝낸다★ — 그 날까지 받는 것이 목표다', () => {
    expect(reachedListTarget(KEY_0305, '260305')).toBe(true)
  })

  it('아직 목표보다 최근이면 계속 넘긴다', () => {
    expect(reachedListTarget(KEY_0718, '260305')).toBe(false)
    expect(reachedListTarget(KEY_0904, '260305')).toBe(false)
  })

  it('★목표를 안 주면 끊지 않는다★ — 쪽 수 한도에 맡긴다', () => {
    expect(reachedListTarget(KEY_0301, undefined)).toBe(false)
    expect(reachedListTarget(KEY_0301, '')).toBe(false)
  })

  it('★커서가 없으면 끊지 않는다★ — 모르면 멈추지 않는다', () => {
    expect(reachedListTarget(null, '260305')).toBe(false)
  })

  /*
   * ⚠ ★해가 바뀌면 이 비교가 깨진다★ — `27…` 은 `26…` 보다 크므로
   *   2027년 경기를 「2026년 목표에 안 닿았다」로 본다. ★그건 맞다★ (더 최근이니까).
   *   반대로 ★2025년 이전을 목표로 주면★ (`259…`) 문자열 비교가 뜻대로 안 될 수 있다.
   *   ★지금 필요한 범위(26년)에서는 맞고, 그 밖은 쓰지 않는다.★
   */
  it('★해가 바뀌어도 「더 최근」은 맞게 본다★', () => {
    expect(reachedListTarget('270101000000000001', '260305')).toBe(false)
    expect(reachedListTarget('251231000000000001', '260305')).toBe(true)
  })
})
