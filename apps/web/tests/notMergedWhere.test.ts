import { describe, expect, it } from 'vitest'
import { notMergedWhere } from '../lib/server/queries/search'

/**
 * ★2026-09-24 사장님 「현물 검색창에 치면 안 나와」★
 *
 * `NOT: { note: { startsWith: 'merged-into:' } }` 단독으로는 SQL 세값논리 때문에
 * `note IS NULL` 인 줄(26,738명 중 26,729명)을 WHERE 에서 뺐다. `note IS NULL` 을
 * 먼저 받아 주는 형태인지를 잠가 둔다 — 이 모양이 다시 `NOT: { note: {...} } }` 단독으로
 * 되돌아가면 검색이 다시 거의 다 죽는다.
 */
describe('notMergedWhere', () => {
  it('note 가 NULL 인 줄도 통과시킨다 (SQL 세값논리 함정)', () => {
    const where = notMergedWhere()
    expect(where).toEqual({
      OR: [{ note: null }, { NOT: { note: { startsWith: 'merged-into:' } } }],
    })
  })
})
