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
    /*
     * ⚠ 2026-09-10 — 리그 몫이 생기면서 예약이 ★두 층★ 이 됐다.
     *   리그 몫 안에서는 리그별 순번(`leagueStarveRn`)으로, 남은 자리에서는
     *   예전처럼 전역 순번(`starveRn`)으로 예약한다. ★어느 쪽도 「빼기」가 아니다.★
     */
    expect(j).toContain(`CASE WHEN r.starving AND r.leagueStarveRn <=`)
    expect(c).toContain(`CASE WHEN r.starving AND r.leagueStarveRn <=`)
    expect(j).toContain(`CASE WHEN s.starving AND s.starveRn <=`)
    expect(c).toContain(`CASE WHEN s.starving AND s.starveRn <=`)
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

  /*
   * ── ★리그별 최소 자리★ (2026-09-10)
   *
   * 옛 판은 409곳을 한 줄로 세워 ★클랜이 311곳인 10mountain 이 순번을 다 먹었다.★
   * 실측 — 30분에 물어본 곳 IPL 13 · 10mountain 6 · ★SPL 1★ (그 시간 SPL 경기 0건).
   * 관측 도구가 이 규칙을 안 갖고 있으면 ★리그가 다시 굶어도 100% 라고 말한다.★
   */
  it('★리그마다 앞자리를 예약한다 — 두 곳 다★', () => {
    for (const [name, src] of [['잡', j], ['관측 도구', c]] as const) {
      expect(src, `${name} 에 리그별 예약이 없다`).toContain('PARTITION BY r.lg')
      expect(src, `${name} 에 리그 몫 예약석이 없다`).toContain(
        'CASE WHEN s.leagueRn <= ${LEAGUE_MIN_SLOTS} THEN 0 ELSE 1 END',
      )
    }
  })

  it('★예약석은 라운드로빈이다 — 뭉쳐 두면 뒤 리그가 굶는다★', () => {
    /* 몫만 주고 섞지 않으면 한 바퀴의 앞부분(30분에 20곳)에 뒤 리그가 안 들어온다 */
    const rr = 'CASE WHEN s.leagueRn <= ${LEAGUE_MIN_SLOTS} THEN s.leagueRn ELSE NULL END'
    expect(j).toContain(rr)
    expect(c).toContain(rr)
  })

  it.each(['LEAGUE_MIN_SLOTS', 'LEAGUE_STALE_CAP'])('★리그 몫 값이 같다★ (%s)', (name) => {
    const re = new RegExp(`export const ${name} = (\\d+)`)
    const fromJob = re.exec(job)?.[1]
    const fromCopy = re.exec(copy)?.[1]
    expect(fromJob).toBeDefined()
    expect(fromCopy).toBe(fromJob)
  })
})
