/**
 * ★★숨긴 사본은 화면 어디에서도 세지 않는다★★ (2026-09-06 · Part 8 에서 찾은 결함).
 *
 * ── 무슨 일이 있었나
 *   O-056 에서 중복 경기에 `supersededAt` 을 붙여 숨겼고, 스키마 주석은
 *   ★«화면·집계·DB 자물쇠가 표시 붙은 줄을 안 본다»★ 라고 적어 뒀다.
 *   Part 7 에서 ★집계★ 쪽을 고쳤는데 ★화면 쪽에는 그 조건이 세 곳 다 없었다.★
 *   ```
 *   season0Scope.seasonWindowWhere()   화면 질의 대부분이 쓰는 조건
 *   playerLadderRows.ts (raw SQL)      선수 상세·프로필의 참가기록
 *   rankings.ts (raw SQL)              폼 TOP3
 *   ```
 *   실측(2026-09-06 · 열산 Cloud 0 창): 숨긴 사본 ★39건 · 참가기록 390줄★ ·
 *   ★숫자가 달라지는 선수 34명★. 그래서 ★랭킹과 선수 상세가 서로 다른 숫자★ 를 보였다.
 *
 * ── ★왜 조건이 세 곳에 있나★
 *   두 곳은 raw SQL 이라 `seasonWindowWhere()` 를 못 쓴다.
 *   ★그래서 이 검사가 세 곳을 한꺼번에 묶는다.★ 한 곳만 고치면 여기가 빨개진다.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { seasonWindowWhere, withSeasonWindow } from '../lib/server/queries/season0Scope'

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')
const ladderRows = read('../lib/server/queries/playerLadderRows.ts')
const rankings = read('../lib/server/queries/rankings.ts')

describe('화면 질의 — 숨긴 사본을 뺀다', () => {
  it('★`seasonWindowWhere()` 가 supersededAt: null 을 낸다★', () => {
    const where = seasonWindowWhere()
    expect(where.supersededAt).toBeNull()
  })

  it('덧붙이는 쪽(`withSeasonWindow`)도 그 조건을 물고 간다', () => {
    const merged = withSeasonWindow({ leagueId: 'L' })
    const inner = (merged.AND as Array<Record<string, unknown>>)[1]
    expect(inner?.supersededAt).toBeNull()
  })

  it('★선수 상세의 raw SQL 에도 있다★ (그 함수를 못 쓰는 자리)', () => {
    expect(ladderRows).toContain('m."supersededAt" IS NULL')
  })

  it('★폼 TOP3 의 raw SQL 에도 있다★', () => {
    expect(rankings).toContain('m."supersededAt" IS NULL')
  })

  it('★왜 뺐는지가 세 파일에 다 적혀 있다★ — 다음 사람이 되돌리지 않게', () => {
    expect(read('../lib/server/queries/season0Scope.ts')).toContain('숨긴 사본은 세지 않는다')
    expect(ladderRows).toContain('숨긴 사본은 세지 않는다')
    expect(rankings).toContain('숨긴 사본은 세지 않는다')
  })

  it('★창의 날짜는 여전히 한 곳에서만 온다★ — 조건을 넣느라 날짜를 복제하지 않았다', () => {
    const scope = read('../lib/server/queries/season0Scope.ts')
    /* 이 파일은 worker 의 상수를 그대로 읽어 온다. 날짜 문자열을 새로 적지 않았다 */
    expect(scope).toContain('season0Window')
    expect(scope).not.toMatch(/new Date\('2026-/)
  })
})
