/*
 * ★관측 도구가 잡과 다른 규칙으로 재고 있지 않은가★
 *
 * 2026-09-08 22:20 에 실제로 어긋나 있었다.
 * `scripts/pipeline/{lap,health}.mjs` 가 아직 ★버그 있던 옛 판★ 으로 포함률을 재고 있었다 —
 * 방치 등급을 `band = 0` 으로 두고 상한 밖을 꼴찌로 미는 판. 그 판은 그날
 * ★활동 중인 클랜을 55% 까지 굶겼던★ 바로 그 규칙이다.
 *
 * 도구가 옛 규칙으로 재면 ★진짜 큐가 퇴행해도 100% 라고 말한다.★
 * 자물쇠가 두 번 뚫린 뒤라 이번엔 ★어긋남 자체를 테스트로 막는다.★
 *
 * 규칙을 고칠 때는 ★두 파일을 같이★ 고쳐라 —
 *   apps/worker/src/jobs/barracksCollect.ts  (진짜 규칙)
 *   scripts/pipeline/queueRule.mjs           (관측 도구의 사본)
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(__dirname, '..', '..', '..', '..')
const job = readFileSync(join(ROOT, 'apps/worker/src/jobs/barracksCollect.ts'), 'utf8')
const copy = readFileSync(join(ROOT, 'scripts/pipeline/queueRule.mjs'), 'utf8')

/** 공백·주석을 걷어내고 SQL 만 남긴다 — 서식 차이로 깨지지 않게 */
function sqlOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/\s+/g, ' ')
}

describe('큐 규칙 — 잡과 관측 도구가 같은가', () => {
  const j = sqlOnly(job)
  const c = sqlOnly(copy)

  it('★굶주림은 「물어본 시각」으로 판단한다★ — 두 곳 다', () => {
    const rule = `(p."requestedAt" IS NULL OR p."requestedAt" < NOW() - INTERVAL '6 hours') AS starving`
    expect(j).toContain(rule)
    expect(c).toContain(rule)
  })

  it('★상한은 앞자리 예약이다 — 넘친 곳을 꼴찌로 밀지 않는다★', () => {
    const order = `CASE WHEN r.starving AND r.starveRn <=`
    expect(j).toContain(order)
    expect(c).toContain(order)
  })

  it('★옛 판(band=0 에 상한)이 어느 쪽에도 남아 있지 않다★', () => {
    for (const [name, src] of [['잡', j], ['관측 도구', c]] as const) {
      expect(src, `${name} 에 옛 규칙이 남아 있다`).not.toMatch(/band\s*=\s*0\s+AND\s+r?\.?rn\s*>/i)
    }
  })

  it('★활동 등급 경계가 같다★ (1시간 / 6시간 / 24시간)', () => {
    for (const band of ["INTERVAL '1 hour' THEN 1", "INTERVAL '6 hours' THEN 2", "INTERVAL '24 hours' THEN 3"]) {
      expect(j).toContain(band)
      expect(c).toContain(band)
    }
  })

  it('★상한 값이 같다★ (STALE_BAND_CAP)', () => {
    const fromJob = /export const STALE_BAND_CAP = (\d+)/.exec(job)?.[1]
    const fromCopy = /export const STALE_BAND_CAP = (\d+)/.exec(copy)?.[1]
    expect(fromJob).toBeDefined()
    expect(fromCopy).toBe(fromJob)
  })

  it('★같은 리그를 본다★', () => {
    expect(copy).toContain(`['nolink', 'supply', 'sanply']`)
  })
})
