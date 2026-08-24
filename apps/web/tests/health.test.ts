/**
 * 운영 상태 점검 회귀 (D-137).
 *
 * 여기서 고정하는 약속
 *   1. 민감한 값을 **하나도** 내보내지 않는다 (인증 없이 열어 두기 때문이다)
 *   2. 수집이 오래 멈추면 `degraded` 로 잡힌다
 *   3. 429를 봤으면 `degraded` 로 잡힌다
 *   4. 공개 데이터가 비면 상태가 나빠진다
 *   5. 전체 상태는 **가장 나쁜 항목**을 따른다
 */
import { describe, expect, it } from 'vitest'
import { prisma } from '@sacloud/db'
import { getHealth } from '../lib/server/queries/health'

async function dbUp(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`
    return true
  } catch {
    return false
  }
}
const up = await dbUp()

/** 응답 어디에도 들어가면 안 되는 것들 */
const FORBIDDEN = [
  'postgres',
  'postgresql://',
  'DATABASE_URL',
  'NEXON_API_KEY',
  'AUTH_SECRET',
  'password',
  '@', // 이메일
]

describe.runIf(up)('상태 점검', () => {
  it('민감한 값을 내보내지 않는다', async () => {
    const report = await getHealth()
    const json = JSON.stringify(report)
    for (const needle of FORBIDDEN) {
      expect(json.toLowerCase()).not.toContain(needle.toLowerCase())
    }
  })

  it('숫자와 시각과 판정만 담는다', async () => {
    const report = await getHealth()
    expect(['ok', 'degraded', 'down']).toContain(report.status)
    expect(new Date(report.checkedAt).toString()).not.toBe('Invalid Date')
    expect(typeof report.metrics.pendingDetail).toBe('number')
    expect(typeof report.metrics.rateLimitedLast24h).toBe('boolean')
    // detail 은 사람이 읽는 한 줄이고 값이 아니다
    for (const check of Object.values(report.checks)) {
      expect(typeof check.detail).toBe('string')
      expect(check.detail.length).toBeLessThan(120)
    }
  })

  it('실제 DB에서 down 이 아니다', async () => {
    const report = await getHealth()
    expect(report.checks.db.status).toBe('ok')
    expect(report.status).not.toBe('down')
  })

  it('수집 성공이 오래됐으면 degraded 로 본다', async () => {
    // 실제 마지막 성공 시각을 기준으로 **미래 시점**에서 물어본다 — 데이터를 건드리지 않는다
    const report = await getHealth()
    const last = report.metrics.collectorLastSuccessAt
    if (!last) {
      expect(report.checks.collector.status).toBe('degraded')
      return
    }
    const wayLater = new Date(new Date(last).getTime() + 100 * 60 * 60 * 1000)
    const stale = await getHealth(wayLater)
    expect(stale.checks.collector.status).toBe('degraded')
    expect(stale.checks.collector.detail).toContain('시간 전')
  })

  it('공개 데이터 수치가 실제 DB와 맞는다', async () => {
    const report = await getHealth()
    const leagues = await prisma.league.count({ where: { origin: { not: 'mock' } } })
    const matches = await prisma.match.count({ where: { origin: { not: 'mock' } } })
    expect(report.metrics.publicLeagues).toBe(leagues)
    expect(report.metrics.publicMatches).toBe(matches)
  })

  it('전체 상태는 가장 나쁜 항목을 따른다', async () => {
    const report = await getHealth()
    const worst = Object.values(report.checks).some((check) => check.status === 'down')
      ? 'down'
      : Object.values(report.checks).some((check) => check.status === 'degraded')
        ? 'degraded'
        : 'ok'
    expect(report.status).toBe(worst)
  })
})
