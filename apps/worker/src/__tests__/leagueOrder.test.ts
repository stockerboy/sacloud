import { describe, expect, it } from 'vitest'

import {
  DAY_FROM_HOUR,
  DAY_TO_HOUR,
  LEAGUE_ORDER_DAY,
  LEAGUE_ORDER_NIGHT,
  leagueOrderAt,
} from '../jobs/barracksCollect.js'

/**
 * ★시간대마다 먼저 볼 리그★ (2026-09-22 사장님)
 *
 * > 「오전 5시-오후5시까지 ★열산>PL>IPL★ · 오후 5시부터 ★IPL>PL>열산★」
 *
 * ⚠ ★한국 시간으로 본다★ — 서버가 UTC 로 돌아도 같은 답이 나와야 한다.
 *   그래서 시험도 ★UTC 로 적고 KST 로 읽히는지★ 본다.
 */
const utc = (iso: string): Date => new Date(iso)

describe('시간대별 리그 순서', () => {
  it('낮(KST 05:00)에는 열산이 맨 앞이다', () => {
    /* KST 05:00 = UTC 20:00 (전날) */
    expect(leagueOrderAt(utc('2026-09-21T20:00:00Z'))).toEqual(LEAGUE_ORDER_DAY)
    expect(LEAGUE_ORDER_DAY[0]).toBe('sanply')
  })

  it('낮 한복판(KST 12:00)도 열산이 맨 앞이다', () => {
    expect(leagueOrderAt(utc('2026-09-22T03:00:00Z'))).toEqual(LEAGUE_ORDER_DAY)
  })

  it('KST 16:59 까지는 낮이다', () => {
    expect(leagueOrderAt(utc('2026-09-22T07:59:00Z'))).toEqual(LEAGUE_ORDER_DAY)
  })

  it('KST 17:00 부터는 IPL 이 맨 앞이다', () => {
    expect(leagueOrderAt(utc('2026-09-22T08:00:00Z'))).toEqual(LEAGUE_ORDER_NIGHT)
    expect(LEAGUE_ORDER_NIGHT[0]).toBe('nolink')
  })

  it('한밤(KST 02:00)도 IPL 이 맨 앞이다', () => {
    expect(leagueOrderAt(utc('2026-09-21T17:00:00Z'))).toEqual(LEAGUE_ORDER_NIGHT)
  })

  it('KST 04:59 까지는 밤이다', () => {
    expect(leagueOrderAt(utc('2026-09-21T19:59:00Z'))).toEqual(LEAGUE_ORDER_NIGHT)
  })

  it('★어느 리그도 빠지지 않는다★ — 순서만 바뀐다', () => {
    expect([...LEAGUE_ORDER_DAY].sort()).toEqual([...LEAGUE_ORDER_NIGHT].sort())
    expect(LEAGUE_ORDER_DAY).toHaveLength(3)
  })

  it('경계 시각이 사장님이 주신 값과 같다', () => {
    expect(DAY_FROM_HOUR).toBe(5)
    expect(DAY_TO_HOUR).toBe(17)
  })
})
