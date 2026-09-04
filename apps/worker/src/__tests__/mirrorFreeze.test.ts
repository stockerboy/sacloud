/**
 * ★기준시각이 두 곳에 있다 — 어긋나면 여기서 깨진다★ (2026-09-04 · Pre-Part 0).
 *
 * ```
 * apps/worker/src/lib/season0Window.ts   SEASON0_FROM        집계·화면의 기준
 * packages/db/ops/mirrorFreeze.ts        MIRROR_FREEZE_FROM  적재 동결의 기준
 * ```
 *
 * ★값을 복제한 것이 아니라 어쩔 수 없이 나뉘었다★ — `packages/db` 는 `apps/**` 를
 * 못 읽는다 (패키지 경계). 그래서 ★한쪽만 고치면 빨간 줄이 나게★ 이 테스트를 둔다.
 *
 * ⚠ ★이 저장소는 같은 함정에 이미 두 번 빠졌다.★
 *   · 시즌 경계가 두 곳에서 갈라져 있었다 (커밋 `12c27d3`)
 *   · 색이 주석·폴백·정의부 세 곳에 있었고 셋이 서로 달랐다 (`STATE.md` 「배운 것 셋」)
 *   ★값이 두 곳에 있으면 반드시 갈라진다. 갈라지는 순간을 잡는 것이 이 파일이다.★
 */
import { describe, expect, it } from 'vitest'
import { MIRROR_FREEZE_FROM } from '@sacloud/db/ops'
import { SEASON0_FROM } from '../lib/season0Window.js'

describe('동결 기준시각과 시즌0 시작이 같은 값인가', () => {
  it('★같아야 한다★ — 한쪽만 고치면 이 줄이 빨개진다', () => {
    expect(MIRROR_FREEZE_FROM.toISOString()).toBe(SEASON0_FROM.toISOString())
  })

  it('그 값은 2026-09-03 07:00 (KST) 다', () => {
    expect(MIRROR_FREEZE_FROM.toISOString()).toBe('2026-09-02T22:00:00.000Z')
  })
})
