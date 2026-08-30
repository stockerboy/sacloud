/**
 * 반익명 번호 매기기 회귀 테스트 (SITE_SPEC_V2 2절).
 *
 * 여기가 틀리면 **익명이 깨진다.** 같은 사람이 글 안에서 번호 둘을 갖거나,
 * 다른 사람이 한 번호로 합쳐지거나, 글쓴이가 익명 번호를 받는다.
 */
import { describe, expect, it } from 'vitest'
import {
  ANONYMOUS_LIST_LABEL,
  POST_WRITER_LABEL,
  anonymousLabel,
  assignAnonymousLabels,
  isAnonymousDisclose,
} from '../anonymity'

describe('assignAnonymousLabels — 글 안에서 등장 순서로 번호를 준다', () => {
  it('글쓴이 본인은 번호 대신 `글쓴이` 다', () => {
    const labels = assignAnonymousLabels({
      postAuthorKey: 'u1',
      subjects: [
        { id: 'c1', authorKey: 'u2' },
        { id: 'c2', authorKey: 'u1' },
        { id: 'c3', authorKey: 'u3' },
      ],
    })
    expect(labels.get('c1')).toBe('익명1')
    expect(labels.get('c2')).toBe(POST_WRITER_LABEL)
    expect(labels.get('c3')).toBe('익명2')
  })

  it('같은 사람이 여러 번 쓰면 같은 번호다', () => {
    const labels = assignAnonymousLabels({
      postAuthorKey: null,
      subjects: [
        { id: 'c1', authorKey: 'u2' },
        { id: 'c2', authorKey: 'u3' },
        { id: 'c3', authorKey: 'u2' },
        { id: 'c4', authorKey: 'u3' },
      ],
    })
    expect(labels.get('c1')).toBe('익명1')
    expect(labels.get('c2')).toBe('익명2')
    expect(labels.get('c3')).toBe('익명1')
    expect(labels.get('c4')).toBe('익명2')
  })

  it('번호는 1부터 시작하고 건너뛰지 않는다', () => {
    const labels = assignAnonymousLabels({
      postAuthorKey: 'u1',
      subjects: [
        { id: 'c1', authorKey: 'u1' },
        { id: 'c2', authorKey: 'u1' },
        { id: 'c3', authorKey: 'u9' },
      ],
    })
    // 글쓴이가 앞에서 두 번 나와도 번호를 소비하지 않는다
    expect(labels.get('c3')).toBe('익명1')
  })

  it('묶을 키가 없는 작성자(null)는 각자 다른 번호를 받는다', () => {
    const labels = assignAnonymousLabels({
      postAuthorKey: null,
      subjects: [
        { id: 'c1', authorKey: null },
        { id: 'c2', authorKey: null },
      ],
    })
    expect(labels.get('c1')).toBe('익명1')
    expect(labels.get('c2')).toBe('익명2')
    // 서로 다른 사람일 수 있으므로 절대 합치지 않는다
    expect(labels.get('c1')).not.toBe(labels.get('c2'))
  })

  it('글 작성자를 특정할 수 없으면(null) 아무도 `글쓴이` 가 아니다', () => {
    const labels = assignAnonymousLabels({
      postAuthorKey: null,
      subjects: [{ id: 'c1', authorKey: null }],
    })
    expect(labels.get('c1')).toBe('익명1')
  })

  it('번호는 그 글 안에서만 유효하다 — 다른 글은 같은 사람이라도 다른 번호가 될 수 있다', () => {
    const post1 = assignAnonymousLabels({
      postAuthorKey: 'u1',
      subjects: [
        { id: 'a1', authorKey: 'u7' },
        { id: 'a2', authorKey: 'u8' },
      ],
    })
    const post2 = assignAnonymousLabels({
      postAuthorKey: 'u2',
      subjects: [
        { id: 'b1', authorKey: 'u8' },
        { id: 'b2', authorKey: 'u7' },
      ],
    })
    expect(post1.get('a1')).toBe('익명1')
    expect(post2.get('b2')).toBe('익명2')
  })

  it('결과에는 authorKey 가 들어 있지 않다 (id → 표시 이름 뿐)', () => {
    const labels = assignAnonymousLabels({
      postAuthorKey: 'secret-user',
      subjects: [{ id: 'c1', authorKey: 'secret-user' }],
    })
    expect([...labels.keys()]).toEqual(['c1'])
    expect([...labels.values()]).toEqual([POST_WRITER_LABEL])
    expect(JSON.stringify([...labels])).not.toContain('secret-user')
  })

  it('같은 id 가 두 번 들어와도 번호가 흔들리지 않는다', () => {
    const labels = assignAnonymousLabels({
      postAuthorKey: null,
      subjects: [
        { id: 'c1', authorKey: 'u2' },
        { id: 'c1', authorKey: 'u3' },
      ],
    })
    expect(labels.get('c1')).toBe('익명1')
    expect(labels.size).toBe(1)
  })

  it('빈 목록이면 빈 결과다', () => {
    expect(assignAnonymousLabels({ postAuthorKey: 'u1', subjects: [] }).size).toBe(0)
  })
})

describe('표시 상수 · 판정', () => {
  it('anonymousLabel 은 `익명N` 이다', () => {
    expect(anonymousLabel(1)).toBe('익명1')
    expect(anonymousLabel(12)).toBe('익명12')
  })

  it('목록에는 번호 없는 `익명` 을 쓴다', () => {
    expect(ANONYMOUS_LIST_LABEL).toBe('익명')
  })

  it('disclose_type 0 만 공개다', () => {
    expect(isAnonymousDisclose(0)).toBe(false)
    expect(isAnonymousDisclose(1)).toBe(true)
    expect(isAnonymousDisclose(2)).toBe(true)
  })
})
