/**
 * 커서 페이지네이션 규격 (전 API 공통)
 *
 *   metadata.cursor = { prev: string | null, next: string | null }
 *   cursor = base64url("next__<마지막 id>") 또는 base64url("prev__<첫 id>")
 *
 * 관측 예) "bmV4dF9fMjQ" = "next__24", "cHJldl9fNDU3MzIz" = "prev__457323"
 * 페이지 번호 없이 무한스크롤(`더 불러오기`) 전용.
 */

export type CursorDirection = 'next' | 'prev'

export interface DecodedCursor {
  direction: CursorDirection
  id: string
}

const SEPARATOR = '__'

function toBase64Url(raw: string): string {
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(encoded: string): string {
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
  return atob(padded)
}

/** `direction`과 마지막(또는 첫) 아이템 id로 커서 문자열을 만든다. */
export function encodeCursor(direction: CursorDirection, id: string | number): string {
  return toBase64Url(`${direction}${SEPARATOR}${id}`)
}

/** 커서 문자열을 해석한다. 형식이 어긋나면 `null`을 반환한다(예외를 던지지 않는다). */
export function decodeCursor(cursor: string): DecodedCursor | null {
  if (!cursor) return null

  let raw: string
  try {
    raw = fromBase64Url(cursor)
  } catch {
    return null
  }

  const separatorIndex = raw.indexOf(SEPARATOR)
  if (separatorIndex <= 0) return null

  const direction = raw.slice(0, separatorIndex)
  const id = raw.slice(separatorIndex + SEPARATOR.length)

  if (direction !== 'next' && direction !== 'prev') return null
  if (!id) return null

  return { direction, id }
}

/** 페이지 크기 (원본 관측값) */
export const PAGE_SIZE = {
  /** 랭킹 20건 단위 */
  RANK: 20,
  /** 게시판 15건 단위 */
  BOARD: 15,
  /** 목록 기본값 (클랜원·매치 등) */
  DEFAULT: 20,
} as const
