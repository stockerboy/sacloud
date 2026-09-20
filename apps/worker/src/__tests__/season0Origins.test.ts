import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { SEASON0_ORIGINS } from '../lib/season0Window'

/**
 * ★★우리가 만든 경기는 집계에서 빠지면 안 된다★★ (2026-09-20)
 *
 * ── 왜 이 시험이 있나
 *
 *   `season0Apply` 는 ★origin 이 목록에 있는 경기만★ 센다. 그 목록에
 *   빠진 origin 으로 경기를 담으면 ★조용히 0 이 나온다.★ 에러가 없다.
 *
 *   ★같은 병을 두 번 밟았다.★
 *     · 2026-09-01 — IPL(`nexon_barracks`) 이 «선수 0 · 클랜 0»
 *     · 2026-09-20 — C1(`sacloud`) 이 «선수 0 · 클랜 0 · 되돌린 선수 499»
 *       → 개인 승패·킬뎃이 전부 `0/0` 으로 화면에 나갔다
 *
 *   두 번 다 ★사장님이 화면에서 먼저 봤다.★ 시험이 없어서다.
 *
 * ── 무엇을 보나
 *
 *   `Match.origin` 의 ★스키마 기본값★ 하나다. 우리가 직접 만드는 경기
 *   (C1 처럼 파생으로 담는 것 포함) 는 값을 안 주면 그 기본값이 박힌다.
 *   그러니 ★기본값이 집계 목록에 없으면 그 경기는 영영 안 세어진다.★
 *
 * ⚠ ★소스 글자를 외우는 시험이 아니다.★ 기본값을 바꾸든 목록을 바꾸든
 *   ★둘이 맞기만 하면★ 통과한다.
 */

/** 저장소 뿌리 — 이 파일에서 네 칸 위다 */
const ROOT = join(import.meta.dirname, '..', '..', '..', '..')
const SCHEMA = join(ROOT, 'packages', 'db', 'prisma', 'schema.prisma')

/** `origin String @default("...")` 에서 따옴표 안을 꺼낸다 */
const DEFAULT_ORIGIN = /origin\s+String\s+@default\("([^"]+)"\)/

describe('우리가 만든 경기는 시즌0 집계에서 빠지지 않는다', () => {
  it('★Match.origin 의 스키마 기본값이 SEASON0_ORIGINS 안에 있다★', () => {
    const text = readFileSync(SCHEMA, 'utf8')

    /* 스키마에서 Match 모델만 잘라 낸다 — 다른 모델에도 origin 이 있다 */
    const start = text.indexOf('model Match {')
    expect(start, 'schema.prisma 에서 model Match 를 못 찾았다').toBeGreaterThan(-1)
    const body = text.slice(start, text.indexOf('\n}', start))

    const found = DEFAULT_ORIGIN.exec(body)
    expect(found, 'Match.origin 의 @default 를 못 읽었다').not.toBeNull()

    const fallback = found?.[1] ?? ''
    expect(
      SEASON0_ORIGINS as readonly string[],
      `\n★Match.origin 의 기본값 «${fallback}» 이 집계 목록에 없다★\n` +
        `이대로 두면 우리가 담은 경기가 «선수 0 · 클랜 0» 으로 조용히 사라진다.\n` +
        `apps/worker/src/lib/season0Window.ts 의 SEASON0_ORIGINS 에 더하라.\n`,
    ).toContain(fallback)
  })
})
