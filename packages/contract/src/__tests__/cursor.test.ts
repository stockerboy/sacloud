import { describe, expect, it } from 'vitest'
import { decodeCursor, encodeCursor, PAGE_SIZE } from '../cursor'

describe('커서 인코딩/디코딩', () => {
  it('원본에서 관측된 커서 값과 동일하게 인코딩한다', () => {
    // 관측값: "bmV4dF9fMjQ" = "next__24", "cHJldl9fNDU3MzIz" = "prev__457323"
    expect(encodeCursor('next', 24)).toBe('bmV4dF9fMjQ')
    expect(encodeCursor('prev', '457323')).toBe('cHJldl9fNDU3MzIz')
  })

  it('관측된 커서 값을 되돌려 해석한다', () => {
    expect(decodeCursor('bmV4dF9fMjQ')).toEqual({ direction: 'next', id: '24' })
    expect(decodeCursor('cHJldl9fNDU3MzIz')).toEqual({ direction: 'prev', id: '457323' })
  })

  it('라운드트립이 보존된다', () => {
    const ids = ['1', '24', '457323', '260605000624124001']
    for (const id of ids) {
      expect(decodeCursor(encodeCursor('next', id))).toEqual({ direction: 'next', id })
      expect(decodeCursor(encodeCursor('prev', id))).toEqual({ direction: 'prev', id })
    }
  })

  it('패딩 없는 base64url을 사용한다', () => {
    for (const id of ['1', '12', '123', '1234', '12345']) {
      const cursor = encodeCursor('next', id)
      expect(cursor).not.toContain('=')
      expect(cursor).not.toContain('+')
      expect(cursor).not.toContain('/')
    }
  })

  it('잘못된 커서는 예외 대신 null을 반환한다', () => {
    expect(decodeCursor('')).toBeNull()
    // base64이지만 구분자가 없는 값
    expect(decodeCursor(encodeCursorRaw('nextcursor'))).toBeNull()
    // 방향 값이 규격 밖
    expect(decodeCursor(encodeCursorRaw('first__24'))).toBeNull()
    // id가 비어 있음
    expect(decodeCursor(encodeCursorRaw('next__'))).toBeNull()
    // base64가 아닌 문자열
    expect(decodeCursor('!!!not-base64!!!')).toBeNull()
  })

  it('페이지 크기는 관측값(랭킹 20 / 게시판 15)을 따른다', () => {
    expect(PAGE_SIZE.RANK).toBe(20)
    expect(PAGE_SIZE.BOARD).toBe(15)
  })
})

function encodeCursorRaw(raw: string): string {
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
