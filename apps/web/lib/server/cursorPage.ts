import { decodeCursor, encodeCursor, type CursorMetadata } from '@sacloud/contract'

/**
 * 커서 페이지네이션 — Prisma용.
 *
 * Mock은 정렬 완료된 배열을 잘라 쓰지만(`mockStore.paginate`), 실제 DB는 전량을 메모리에
 * 올릴 수 없다. 대신 Prisma의 `cursor` + `skip: 1`로 같은 결과를 만든다.
 *
 * 규격은 계약과 동일하다 — 페이지 번호 없이 `prev` / `next`만 준다.
 *   cursor = base64url("next__<마지막 id>" | "prev__<첫 id>")
 *
 * 주의
 * - `orderBy`의 **마지막에 반드시 고유 키를 넣는다.** 동점이 있으면 정렬이 흔들려
 *   같은 행이 두 페이지에 나오거나 빠진다.
 * - `reversedOrderBy`는 `orderBy`를 정확히 뒤집은 것이어야 한다. `prev` 방향은
 *   거꾸로 읽은 뒤 다시 뒤집어서 반환한다.
 */

export interface CursorPage<Row> {
  items: Row[]
  cursor: CursorMetadata
}

type OrderBy = Record<string, unknown> | Record<string, unknown>[]

export interface CursorPageQuery<Row> {
  cursor: string | null
  size: number
  orderBy: OrderBy
  reversedOrderBy: OrderBy
  /** 커서 앵커로 쓸 고유 키를 꺼낸다 (보통 `row.id`) */
  idOf: (row: Row) => string
  fetch: (args: {
    take: number
    orderBy: OrderBy
    cursor?: { id: string }
    skip?: number
  }) => Promise<Row[]>
}

export async function cursorPage<Row>(query: CursorPageQuery<Row>): Promise<CursorPage<Row>> {
  const { cursor, size, orderBy, reversedOrderBy, idOf, fetch } = query
  const decoded = cursor ? decodeCursor(cursor) : null

  // 한 건 더 읽어서 다음(또는 이전) 페이지가 있는지 판단한다
  const take = size + 1

  if (!decoded) {
    const rows = await fetch({ take, orderBy })
    const items = rows.slice(0, size)
    return {
      items,
      cursor: {
        prev: null,
        next: rows.length > size ? nextCursorOf(items, idOf) : null,
      },
    }
  }

  if (decoded.direction === 'next') {
    const rows = await fetch({ take, orderBy, cursor: { id: decoded.id }, skip: 1 })
    const items = rows.slice(0, size)
    return {
      items,
      cursor: {
        prev: prevCursorOf(items, idOf),
        next: rows.length > size ? nextCursorOf(items, idOf) : null,
      },
    }
  }

  // prev: 정렬을 뒤집어 거꾸로 읽고, 표시 순서로 되돌린다
  const rows = await fetch({
    take,
    orderBy: reversedOrderBy,
    cursor: { id: decoded.id },
    skip: 1,
  })
  const hasPrev = rows.length > size
  const items = rows.slice(0, size).reverse()
  return {
    items,
    cursor: {
      prev: hasPrev ? prevCursorOf(items, idOf) : null,
      // 이전 페이지로 왔다는 것은 뒤에 페이지가 있다는 뜻이다
      next: nextCursorOf(items, idOf),
    },
  }
}

function nextCursorOf<Row>(items: Row[], idOf: (row: Row) => string): string | null {
  const last = items[items.length - 1]
  return last ? encodeCursor('next', idOf(last)) : null
}

function prevCursorOf<Row>(items: Row[], idOf: (row: Row) => string): string | null {
  const first = items[0]
  return first ? encodeCursor('prev', idOf(first)) : null
}

/**
 * 메모리에 이미 올라온 배열을 자를 때 쓴다.
 *
 * 전량이 작고(리그 4개, 클랜원 수십 명) DB 커서로 나누기 어려운 목록에만 제한적으로 쓴다.
 * 큰 목록(매치·게시글·랭킹)에는 쓰지 않는다.
 */
export function paginateArray<Row>(
  ordered: readonly Row[],
  cursor: string | null,
  size: number,
  idOf: (row: Row) => string,
): CursorPage<Row> {
  let start = 0
  const decoded = cursor ? decodeCursor(cursor) : null

  if (decoded) {
    const index = ordered.findIndex((item) => idOf(item) === decoded.id)
    if (index >= 0) {
      start = decoded.direction === 'next' ? index + 1 : Math.max(0, index - size)
    }
  }

  const items = ordered.slice(start, start + size)
  return {
    items,
    cursor: {
      prev: start > 0 ? prevCursorOf(items, idOf) : null,
      next: start + size < ordered.length ? nextCursorOf(items, idOf) : null,
    },
  }
}
