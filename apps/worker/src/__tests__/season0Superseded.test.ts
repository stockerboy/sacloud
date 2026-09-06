/**
 * ★★숨긴 사본은 집계가 세지 않는다★★ (2026-09-06 · Part 7 에서 찾은 결함).
 *
 * ── 무슨 일이 있었나
 *   O-056 에서 «한 실제 경기 = Match 정확히 1개» 를 지키려고 중복 39건에
 *   `supersededAt` 을 붙여 숨겼다. 스키마 주석은 이렇게 적어 뒀다 —
 *   > ★«화면·집계·DB 자물쇠가 표시 붙은 줄을 안 본다»★
 *
 *   ★그런데 집계(`season0Apply` → `rate`)만 그 조건을 안 걸고 있었다.★
 *   실측(2026-09-06 · 열산 · Cloud 0 창) —
 *   ```
 *   숨긴 사본까지 세면  선수 445명      숨긴 사본을 빼면  선수 389명
 *   창 안 숨긴 사본     39건 · 참가기록 390줄
 *   랭킹 승패·킬데스가 ★34명★ 에서 부풀려졌고 ★56명★ 이 랭킹에 잘못 올라와 있었다
 *   ```
 *
 * ── ★공식은 한 글자도 안 바꿨다★
 *   모집단에서 ★빠져야 할 줄★ 을 뺐을 뿐이다. 그래서 이 검사는 «공식» 이 아니라
 *   ★«어떤 줄을 세는가»★ 를 잠근다.
 *
 * ⚠ 과거 중복 34,862건은 `supersededAt` 이 ★null★ 이라 이 조건에 안 걸린다 —
 *   사장님이 «과거는 동결» 이라 하신 그대로다.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { season0MatchWhere } from '../lib/season0Window.js'

const here = dirname(fileURLToPath(import.meta.url))
const rateSrc = readFileSync(join(here, '..', 'jobs', 'rate.ts'), 'utf8')
const windowSrc = readFileSync(join(here, '..', 'lib', 'season0Window.ts'), 'utf8')

describe('집계 모집단 — 숨긴 사본을 뺀다', () => {
  it('★`season0MatchWhere()` 가 supersededAt: null 을 낸다★', () => {
    const where = season0MatchWhere()
    expect(where.supersededAt).toBeNull()
    expect('supersededAt' in where).toBe(true)
  })

  it('창·origin 조건은 그대로다 — ★같이 바뀌지 않았다★', () => {
    const where = season0MatchWhere()
    expect(where.origin.in).toContain('3rd.supply')
    expect(where.origin.in).toContain('nexon_barracks')
    expect(where.startAt.gte).toBeInstanceOf(Date)
  })

  it('★래더 재생 질의도 숨긴 사본을 뺀다★ (`rate.ts` 의 경기 선택)', () => {
    /* 그 질의는 `prisma.match.findMany` 하나뿐이고 거기에 조건이 있어야 한다 */
    const block = rateSrc.slice(
      rateSrc.indexOf('const stored = await prisma.match.findMany({'),
      rateSrc.indexOf('orderBy: [{ startAt: \'asc\' }, { id: \'asc\' }]'),
    )
    expect(block.length).toBeGreaterThan(0)
    expect(block).toContain('supersededAt: null')
  })

  it('★조건이 창 정의와 같은 곳에 적혀 있다★ — 두 곳에 날짜를 또 적지 않았다', () => {
    expect(windowSrc).toContain('supersededAt: null')
    /* 창의 날짜는 여전히 상수 하나에서만 온다 */
    expect(windowSrc).toContain('SEASON0_FROM')
  })

  it('★왜 뺐는지가 파일에 적혀 있다★ — 다음 사람이 되돌리지 않게', () => {
    expect(rateSrc).toContain('숨긴 사본은 세지 않는다')
    expect(windowSrc).toContain('숨긴 사본은 세지 않는다')
  })
})
