import { randomInt } from 'node:crypto'
import { compareSync, hashSync } from 'bcryptjs'
import { prisma } from '@sacloud/db'
import { hidesSeedData, SEED_ORIGIN } from './publicScope'
import type { Prisma } from '@sacloud/db'
import {
  BoardWriteInput,
  CommentWriteInput,
  DeleteInput,
  VoteInput,
  decodeCursor,
  encodeCursor,
  type Board,
  type BoardListItem,
  type Comment,
  type CommentReply,
  type VoteType,
} from '@sacloud/contract'
import { sanitizePostContent } from '@sacloud/ui/sanitize'
import type { CursorPage } from '../cursorPage'
import { toKstIso, toKstIsoOrNull } from '../format'
import { USER_SUMMARY_SELECT, toWriter } from '../mappers'
import { BOARD_WRITE_INTERVAL } from '../configs'
import { currentUserId, voterKey } from '../session'

/**
 * 게시판 · 댓글 조회/명령.
 *
 * **읽기 응답은 Mock(`packages/mock/src/store.ts` 909~1040행)과 같은 형태여야 한다.**
 * 정렬·필터·파생값 규칙을 그대로 옮겼고, 아래 "Mock과 의도적으로 다른 점"만 다르다.
 *
 * Mock과 의도적으로 다른 점
 * 1. **정렬 기준.** Mock은 `Number(b.id) - Number(a.id)`(숫자 id 내림차순)로 최신순을 만든다.
 *    실제 DB의 id는 cuid라 숫자가 아니므로 `createdAt desc, id desc`로 정렬한다.
 *    같은 "최신순"이지만 픽스처를 그대로 시드한 DB에서는 두 순서가 완전히 일치하지 않는다
 *    (픽스처의 createdAt이 무작위라 id 순서와 어긋난다).
 *    댓글도 같은 이유로 `createdAt asc, id asc`로 정렬한다 (Mock은 숫자 id 오름차순).
 * 2. **`me` / `like_type`.** Mock은 `me: false`, `like_type: 0` 고정이지만
 *    실제 서버는 요청자 기준으로 계산한다.
 * 3. **정렬 타이브레이커.** `hot`(인기)은 Mock에 동점 처리 규칙이 없다. 커서 페이지네이션이
 *    흔들리지 않도록 `id desc`를 마지막 기준으로 붙였다.
 *
 * 쓰기(생성/수정/삭제/추천)는 Mock에 없던 동작이다. 아래 각 함수 주석 참고.
 */

/* -------------------------------------------------------------------------- */
/* 공통                                                                         */
/* -------------------------------------------------------------------------- */

const BOARD_LIST_SELECT = {
  id: true,
  categorySlug: true,
  title: true,
  userId: true,
  anonAlias: true,
  discloseType: true,
  writerApp: true,
  viewCount: true,
  likeCount: true,
  dislikeCount: true,
  commentCount: true,
  hasImage: true,
  notice: true,
  createdAt: true,
  lastEdited: true,
  user: { select: USER_SUMMARY_SELECT },
} as const

const BOARD_DETAIL_SELECT = {
  ...BOARD_LIST_SELECT,
  content: true,
  anonPasswordHash: true,
} as const

type BoardListRow = Prisma.BoardGetPayload<{ select: typeof BOARD_LIST_SELECT }>
type BoardDetailRow = Prisma.BoardGetPayload<{ select: typeof BOARD_DETAIL_SELECT }>

function toBoardListItem(row: BoardListRow): BoardListItem {
  return {
    id: row.id,
    category: row.categorySlug,
    title: row.title,
    writer: toWriter(row),
    writer_app: row.writerApp === 1 ? 1 : 0,
    disclose_type: row.discloseType,
    comment_count: row.commentCount,
    view_count: row.viewCount,
    like_count: row.likeCount,
    dislike_count: row.dislikeCount,
    has_image: row.hasImage,
    created_at: toKstIso(row.createdAt),
    last_edited: toKstIsoOrNull(row.lastEdited),
    notice: row.notice,
  }
}

function toBoard(row: BoardDetailRow, me: boolean, likeType: VoteType): Board {
  return {
    ...toBoardListItem(row),
    content: row.content,
    login: row.userId !== null,
    me,
    like_type: likeType,
  }
}

/**
 * 익명 별칭.
 *
 * 픽스처(`packages/mock/src/dataset.ts`)가 쓰는 `<말머리>-<3자리 숫자>` 형태를 따랐다.
 * **원본의 생성 규칙은 [미확인]이며 이 형태가 원본과 동일함은 검증되지 않았다.**
 * (원본의 검색 옵션 이름이 `ipname`인 것으로 보아 IP 기반 별칭일 가능성이 있으나 확인 못 했다.)
 */
const ANON_ALIAS_STEM = [
  '무명',
  '나그네',
  '지나가던',
  '구경꾼',
  '초보',
  '고인물',
  '눈팅',
  '떠돌이',
] as const

function generateAnonAlias(): string {
  const stem = ANON_ALIAS_STEM[randomInt(0, ANON_ALIAS_STEM.length)] ?? '무명'
  return `${stem}-${randomInt(100, 1000)}`
}

/** 본문에 이미지가 들어 있는지. 원본이 어떻게 판정하는지는 [미확인] — 새니타이즈 결과로 판정한다. */
function detectImage(html: string): boolean {
  return /<img[\s/>]/i.test(html)
}

/** LIKE 패턴에 쓸 키워드 이스케이프 (Postgres 기본 이스케이프 문자는 `\`) */
function escapeLike(keyword: string): string {
  return keyword.replace(/[\\%_]/g, (char) => `\\${char}`)
}

function nextCursorOf(ids: string[]): string | null {
  const last = ids[ids.length - 1]
  return last ? encodeCursor('next', last) : null
}

function prevCursorOf(ids: string[]): string | null {
  const first = ids[0]
  return first ? encodeCursor('prev', first) : null
}

/* -------------------------------------------------------------------------- */
/* 추천/비추천 조회                                                              */
/* -------------------------------------------------------------------------- */

type VoteTarget = 'board' | 'comment'

function toVoteType(value: number | undefined | null): VoteType {
  return value === 1 ? 1 : value === -1 ? -1 : 0
}

/** 요청자의 추천 상태 (`like_type`). Mock은 0 고정이지만 여기서는 실제로 계산한다. */
async function voteTypeOf(
  targetType: VoteTarget,
  targetId: string,
  key: string,
): Promise<VoteType> {
  const vote = await prisma.vote.findUnique({
    where: { targetType_targetId_voterKey: { targetType, targetId, voterKey: key } },
    select: { type: true },
  })
  return toVoteType(vote?.type)
}

/** 여러 대상의 추천 상태를 한 번에 읽는다 (댓글 목록용) */
async function voteTypesOf(
  targetType: VoteTarget,
  targetIds: string[],
  key: string,
): Promise<Map<string, VoteType>> {
  if (targetIds.length === 0) return new Map()
  const votes = await prisma.vote.findMany({
    where: { targetType, targetId: { in: targetIds }, voterKey: key },
    select: { targetId: true, type: true },
  })
  return new Map(votes.map((vote) => [vote.targetId, toVoteType(vote.type)]))
}

/* -------------------------------------------------------------------------- */
/* 게시글 목록                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * `hot`(인기) 점수.
 *
 * Mock의 `hotScore`(`likeCount*3 + commentCount*2 + viewCount/100`)를 그대로 옮겼다.
 * **원본의 인기글 선정 알고리즘은 [미확인]이며, 이 가중치는 우리가 정한 임시 규칙이다.**
 * 정수 나눗셈이 되지 않도록 `100.0`으로 나누고 `double precision`으로 캐스팅한다.
 */
const HOT_SORT =
  '(("Board"."likeCount" * 3 + "Board"."commentCount" * 2 + "Board"."viewCount" / 100.0))::double precision'

/** 최신순 정렬키. Mock의 숫자 id 내림차순 대신 작성시각을 쓴다 (상단 주석 1번). */
const RECENT_SORT = '(extract(epoch from "Board"."createdAt"))::double precision'

/**
 * 파라미터를 모아 두는 SQL 조립기.
 *
 * **`Prisma.sql` 태그드 템플릿을 쓰지 않는 이유**
 *   Next의 서버 번들에서는 `Prisma.Sql` 인스턴스 검사가 통과하지 못해, 조각으로 넣은 SQL이
 *   그대로 바인드 파라미터(jsonb)로 직렬화된다 (`argument of WHERE must be type boolean,
 *   not type jsonb`). `$queryRawUnsafe` + 번호 플레이스홀더로 직접 조립한다.
 *
 * **주의: 사용자 입력은 반드시 `bind()`를 거쳐 `$n`으로만 넣는다.**
 * 문자열 결합으로 값을 끼워 넣으면 SQL 인젝션이 된다.
 * 테이블·컬럼명과 정렬식은 이 파일 안의 리터럴만 쓴다.
 */
class SqlParams {
  readonly values: unknown[] = []

  bind(value: unknown): string {
    this.values.push(value)
    return `$${this.values.length}`
  }
}

export interface BoardListQuery {
  category: string
  cursor: string | null
  size: number
  type?: string | null
  q?: string | null
}

/**
 * 목록 필터.
 *
 * - `hot`은 저장된 카테고리가 아니라 **집계 결과**다. 공지를 뺀 전체가 대상이다.
 * - `notice`는 `notice: true`인 글만, 나머지 카테고리는 `notice: false`인 글만 본다
 *   (공지는 목록 상단에 따로 호출해 고정하므로 일반 목록에서 제외한다).
 * - 검색 3종은 Mock의 `listBoards`와 같다. Mock은 `String.includes`(대소문자 구분)이므로
 *   `ILIKE`가 아니라 `LIKE`를 쓴다.
 */
function boardFilter(query: BoardListQuery, params: SqlParams): string {
  const parts: string[] = ['"Board"."deletedAt" IS NULL']

  // 개발용 시드 글은 공개 목록·인기글·검색에 넣지 않는다 (D-116)
  if (hidesSeedData()) parts.push(`"Board"."origin" <> ${params.bind(SEED_ORIGIN)}`)

  if (query.category === 'hot') {
    parts.push('"Board"."notice" = false')
  } else if (query.category === 'notice') {
    parts.push('"Board"."notice" = true')
  } else {
    parts.push(`"Board"."categorySlug" = ${params.bind(query.category)} AND "Board"."notice" = false`)
  }

  const keyword = query.q?.trim()
  if (keyword) {
    const like = `%${escapeLike(keyword)}%`
    const type = query.type ?? 'board'
    if (type === 'ipname') {
      parts.push(`"Board"."anonAlias" LIKE ${params.bind(like)}`)
    } else if (type === 'nickname') {
      parts.push(
        `EXISTS (SELECT 1 FROM "User" u WHERE u."id" = "Board"."userId" AND u."nickname" LIKE ${params.bind(like)})`,
      )
    } else {
      const pattern = params.bind(like)
      parts.push(`("Board"."title" LIKE ${pattern} OR "Board"."content" LIKE ${pattern})`)
    }
  }

  return parts.join(' AND ')
}

/** 커서 앵커 글의 정렬키 값. 글이 사라졌으면 null(첫 페이지로 취급). */
async function anchorSortValue(sort: string, id: string): Promise<number | null> {
  const rows = await prisma.$queryRawUnsafe<{ sort: number }[]>(
    `SELECT ${sort} AS sort FROM "Board" WHERE "Board"."id" = $1`,
    id,
  )
  return rows[0]?.sort ?? null
}

/**
 * 목록 한 페이지의 id를 정렬 순서대로 구한다.
 *
 * `hot`은 저장 컬럼이 아니라 계산식으로 정렬해야 해서 Prisma의 `cursor` 옵션을 쓸 수 없다.
 * 두 정렬(`hot` / 최신순) 모두 같은 방식으로 처리하려고 keyset 페이지네이션을 SQL로 직접 썼다.
 * (`lib/server/cursorPage.ts`의 `cursorPage`는 Prisma 컬럼 정렬 전용이고,
 *  `paginateArray`는 게시글처럼 큰 목록에 쓰지 말라고 되어 있다.)
 */
async function boardIdPage(query: BoardListQuery): Promise<CursorPage<string>> {
  const sort = query.category === 'hot' ? HOT_SORT : RECENT_SORT
  const params = new SqlParams()
  const where = boardFilter(query, params)
  const take = query.size + 1
  const decoded = query.cursor ? decodeCursor(query.cursor) : null
  const anchor = decoded ? await anchorSortValue(sort, decoded.id) : null

  if (!decoded || anchor === null) {
    const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT "Board"."id" FROM "Board"
       WHERE ${where}
       ORDER BY ${sort} DESC, "Board"."id" DESC
       LIMIT ${params.bind(take)}`,
      ...params.values,
    )
    const items = rows.slice(0, query.size).map((row) => row.id)
    return {
      items,
      cursor: { prev: null, next: rows.length > query.size ? nextCursorOf(items) : null },
    }
  }

  const at = `${params.bind(anchor)}::double precision`
  const anchorId = params.bind(decoded.id)

  if (decoded.direction === 'next') {
    const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT "Board"."id" FROM "Board"
       WHERE ${where}
         AND (${sort} < ${at} OR (${sort} = ${at} AND "Board"."id" < ${anchorId}))
       ORDER BY ${sort} DESC, "Board"."id" DESC
       LIMIT ${params.bind(take)}`,
      ...params.values,
    )
    const items = rows.slice(0, query.size).map((row) => row.id)
    return {
      items,
      cursor: {
        prev: prevCursorOf(items),
        next: rows.length > query.size ? nextCursorOf(items) : null,
      },
    }
  }

  // prev: 정렬을 뒤집어 거꾸로 읽고, 표시 순서로 되돌린다
  const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT "Board"."id" FROM "Board"
     WHERE ${where}
       AND (${sort} > ${at} OR (${sort} = ${at} AND "Board"."id" > ${anchorId}))
     ORDER BY ${sort} ASC, "Board"."id" ASC
     LIMIT ${params.bind(take)}`,
    ...params.values,
  )
  const hasPrev = rows.length > query.size
  const items = rows
    .slice(0, query.size)
    .map((row) => row.id)
    .reverse()
  return {
    items,
    // 이전 페이지로 왔다는 것은 뒤에 페이지가 있다는 뜻이다
    cursor: { prev: hasPrev ? prevCursorOf(items) : null, next: nextCursorOf(items) },
  }
}

export async function listBoards(query: BoardListQuery): Promise<CursorPage<BoardListItem>> {
  const page = await boardIdPage(query)
  if (page.items.length === 0) return { items: [], cursor: page.cursor }

  const rows = await prisma.board.findMany({
    where: { id: { in: page.items } },
    select: BOARD_LIST_SELECT,
  })
  const byId = new Map(rows.map((row) => [row.id, row]))

  return {
    items: page.items
      .map((id) => byId.get(id))
      .filter((row): row is BoardListRow => row !== undefined)
      .map(toBoardListItem),
    cursor: page.cursor,
  }
}

/* -------------------------------------------------------------------------- */
/* 게시글 상세                                                                   */
/* -------------------------------------------------------------------------- */

async function findBoardRow(boardId: string): Promise<BoardDetailRow | null> {
  const row = await prisma.board.findFirst({
    where: { id: boardId, deletedAt: null },
    select: BOARD_DETAIL_SELECT,
  })
  return row
}

/**
 * 글 상세.
 *
 * 조회 시 `viewCount`를 올린다. **같은 요청자가 연속으로 올리는 것을 막는 규칙은 원본 [미확인]**
 * 이라 지금은 단순 증가로 둔다 (새로고침할 때마다 오른다).
 */
export async function getBoard(boardId: string, request: Request): Promise<Board | null> {
  const row = await findBoardRow(boardId)
  if (!row) return null

  await prisma.board.update({ where: { id: boardId }, data: { viewCount: { increment: 1 } } })

  const [userId, key] = await Promise.all([currentUserId(request), voterKey(request)])
  const likeType = await voteTypeOf('board', boardId, key)

  return toBoard(
    { ...row, viewCount: row.viewCount + 1 },
    isOwner(row, userId),
    likeType,
  )
}

/** 상세를 다시 읽어 응답에 쓴다 (쓰기 계열의 반환값). 조회수는 올리지 않는다. */
async function boardResponse(boardId: string, request: Request): Promise<Board | null> {
  const row = await findBoardRow(boardId)
  if (!row) return null
  const [userId, key] = await Promise.all([currentUserId(request), voterKey(request)])
  return toBoard(row, isOwner(row, userId), await voteTypeOf('board', boardId, key))
}

/**
 * 요청자가 작성자인지 (`me`).
 *
 * 비로그인 익명 글은 작성자를 식별할 수단을 저장하지 않으므로 항상 false다.
 * (원본이 익명 글에 `me: true`를 주는지는 [미확인].)
 */
function isOwner(row: { userId: string | null }, userId: string | null): boolean {
  return row.userId !== null && row.userId === userId
}

/* -------------------------------------------------------------------------- */
/* 권한 · rate limit                                                            */
/* -------------------------------------------------------------------------- */

/**
 * 수정/삭제 권한.
 * - 로그인 글: 작성자 본인만
 * - 비로그인 글: 작성 시 정한 비밀번호가 맞을 때만 (평문은 저장하지 않는다)
 */
function canModify(
  row: { userId: string | null; anonPasswordHash: string | null },
  userId: string | null,
  password: string | null,
): boolean {
  if (row.userId) return row.userId === userId
  if (!password || !row.anonPasswordHash) return false
  return compareSync(password, row.anonPasswordHash)
}

/**
 * 글쓰기 rate limit — **서버에서 강제한다.**
 *
 * 원본 관측값은 5분에 1글이다 (`/infos`의 `BOARD_WRITE_INTERVAL`).
 * 창(window)이 지났으면 새 창을 열고, 안 지났는데 이미 한도를 채웠으면 false를 돌려준다.
 * 댓글에도 같은 제한이 걸리는지는 [미확인]이라 글 작성에만 적용한다.
 */
async function consumeWriteQuota(key: string, seconds: number, limit = 1): Promise<boolean> {
  const now = new Date()
  const windowEnd = new Date(now.getTime() + seconds * 1000)

  return prisma.$transaction(async (tx) => {
    const current = await tx.rateLimit.findUnique({ where: { key } })
    if (!current || current.windowEnd <= now) {
      await tx.rateLimit.upsert({
        where: { key },
        create: { key, count: 1, windowEnd },
        update: { count: 1, windowEnd },
      })
      return true
    }
    if (current.count >= limit) return false
    await tx.rateLimit.update({ where: { key }, data: { count: { increment: 1 } } })
    return true
  })
}

/* -------------------------------------------------------------------------- */
/* 게시글 쓰기                                                                   */
/* -------------------------------------------------------------------------- */

export type WriteResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: 400 | 401 | 403 | 404 | 429; message: string }

const invalid = (message: string) => ({ ok: false as const, status: 400 as const, message })
const denied = (message: string) => ({ ok: false as const, status: 403 as const, message })
const missing = (message: string) => ({ ok: false as const, status: 404 as const, message })

/** 운영자 권한. `ROLE.ADMIN = 2` (관측값). */
async function isAdmin(userId: string | null): Promise<boolean> {
  if (!userId) return false
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } })
  return user?.role === 2
}

export async function createBoard(request: Request, body: unknown): Promise<WriteResult<Board>> {
  const parsed = BoardWriteInput.safeParse(body)
  if (!parsed.success) return invalid('입력값을 확인해주세요')
  const input = parsed.data

  // TODO(Phase 7 후반): `captcha_token` 실검증. 지금은 계약대로 받기만 한다.

  if (input.category === 'hot') return invalid('인기 카테고리에는 글을 쓸 수 없습니다')
  const category = await prisma.boardCategory.findUnique({ where: { slug: input.category } })
  if (!category) return invalid('없는 카테고리입니다')

  const userId = await currentUserId(request)

  // 공지 카테고리는 운영자만 쓸 수 있게 했다. 원본의 권한 규칙은 [미확인]이다.
  if (category.notice && !(await isAdmin(userId))) return denied('공지는 운영자만 작성할 수 있습니다')

  if (!userId && !input.password) return invalid('비로그인 글은 삭제용 비밀번호가 필요합니다')

  const key = await voterKey(request)
  if (!(await consumeWriteQuota(`board:write:${key}`, BOARD_WRITE_INTERVAL))) {
    return { ok: false, status: 429, message: '잠시 후 다시 시도해주세요' }
  }

  // 저장 전에 서버에서 새니타이즈한다. 클라이언트 검증만 믿으면 API를 직접 호출해 스크립트를 심을 수 있다.
  const content = sanitizePostContent(input.content)
  if (!content.trim()) return invalid('본문을 입력해주세요')

  const created = await prisma.board.create({
    data: {
      categorySlug: category.slug,
      title: input.title,
      content,
      userId,
      anonAlias: userId ? null : generateAnonAlias(),
      // 평문 비밀번호를 저장하지 않는다
      anonPasswordHash: userId || !input.password ? null : hashSync(input.password, 10),
      discloseType: input.disclose_type,
      // 앱 클라이언트가 없으므로 항상 웹(0)이다
      writerApp: 0,
      hasImage: detectImage(content),
      notice: category.notice,
    },
    select: { id: true },
  })

  const board = await boardResponse(created.id, request)
  return board ? { ok: true, value: board } : missing('글을 찾을 수 없습니다')
}

export async function updateBoard(
  boardId: string,
  request: Request,
  body: unknown,
): Promise<WriteResult<Board>> {
  const parsed = BoardWriteInput.safeParse(body)
  if (!parsed.success) return invalid('입력값을 확인해주세요')
  const input = parsed.data

  const row = await findBoardRow(boardId)
  if (!row) return missing('글을 찾을 수 없습니다')

  const userId = await currentUserId(request)
  if (!canModify(row, userId, input.password)) return denied('수정 권한이 없습니다')

  const content = sanitizePostContent(input.content)
  if (!content.trim()) return invalid('본문을 입력해주세요')

  // 카테고리 이동은 지원하지 않는다. 원본에 카테고리 변경 UI가 있는지 [미확인]이라
  // 입력의 `category`는 무시하고 원래 카테고리를 유지한다.
  await prisma.board.update({
    where: { id: boardId },
    data: {
      title: input.title,
      content,
      discloseType: input.disclose_type,
      hasImage: detectImage(content),
      lastEdited: new Date(),
    },
  })

  const board = await boardResponse(boardId, request)
  return board ? { ok: true, value: board } : missing('글을 찾을 수 없습니다')
}

/** 글 삭제는 soft delete다. 행을 지우지 않고 `deletedAt`만 채운다. */
export async function deleteBoard(
  boardId: string,
  request: Request,
  body: unknown,
): Promise<WriteResult<{ ok: true }>> {
  const parsed = DeleteInput.safeParse(body ?? { password: null })
  if (!parsed.success) return invalid('입력값을 확인해주세요')

  const row = await findBoardRow(boardId)
  if (!row) return missing('글을 찾을 수 없습니다')

  const userId = await currentUserId(request)
  if (!canModify(row, userId, parsed.data.password)) return denied('삭제 권한이 없습니다')

  await prisma.board.update({ where: { id: boardId }, data: { deletedAt: new Date() } })
  return { ok: true, value: { ok: true } }
}

/* -------------------------------------------------------------------------- */
/* 추천 / 비추천                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * 추천/비추천 적용.
 *
 * `(targetType, targetId, voterKey)` 유니크로 한 사람당 1행만 남긴다.
 * 같은 사람이 다시 누르면 갱신하고, `type: 0`이면 취소(행 삭제)한다.
 * 집계 컬럼(`likeCount`/`dislikeCount`)은 같은 트랜잭션에서 함께 옮긴다.
 */
async function applyVote(
  targetType: VoteTarget,
  targetId: string,
  key: string,
  type: VoteType,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const where = { targetType_targetId_voterKey: { targetType, targetId, voterKey: key } }
    const existing = await tx.vote.findUnique({ where, select: { type: true } })
    const previous = toVoteType(existing?.type)
    if (previous === type) return

    if (type === 0) {
      if (existing) await tx.vote.delete({ where })
    } else {
      await tx.vote.upsert({
        where,
        create: { targetType, targetId, voterKey: key, type },
        update: { type },
      })
    }

    const likeDelta = (type === 1 ? 1 : 0) - (previous === 1 ? 1 : 0)
    const dislikeDelta = (type === -1 ? 1 : 0) - (previous === -1 ? 1 : 0)
    const data = {
      likeCount: { increment: likeDelta },
      dislikeCount: { increment: dislikeDelta },
    }

    if (targetType === 'board') {
      await tx.board.update({ where: { id: targetId }, data })
    } else {
      await tx.comment.update({ where: { id: targetId }, data })
    }
  })
}

export async function voteBoard(
  boardId: string,
  request: Request,
  body: unknown,
): Promise<WriteResult<Board>> {
  const parsed = VoteInput.safeParse(body)
  if (!parsed.success) return invalid('입력값을 확인해주세요')

  const row = await findBoardRow(boardId)
  if (!row) return missing('글을 찾을 수 없습니다')

  const key = await voterKey(request)
  await applyVote('board', boardId, key, parsed.data.type)

  const board = await boardResponse(boardId, request)
  return board ? { ok: true, value: board } : missing('글을 찾을 수 없습니다')
}

/* -------------------------------------------------------------------------- */
/* 댓글                                                                          */
/* -------------------------------------------------------------------------- */

const COMMENT_SELECT = {
  id: true,
  boardId: true,
  parentId: true,
  content: true,
  userId: true,
  anonAlias: true,
  anonPasswordHash: true,
  discloseType: true,
  writerApp: true,
  likeCount: true,
  dislikeCount: true,
  deleted: true,
  createdAt: true,
  lastEdited: true,
  user: { select: USER_SUMMARY_SELECT },
} as const

type CommentRow = Prisma.CommentGetPayload<{ select: typeof COMMENT_SELECT }>

/**
 * 댓글 → 대댓글 응답.
 *
 * 지켜야 하는 규칙 (Mock `toCommentReply`와 동일)
 * - 삭제된 댓글은 **행은 남기고 `content`만 빈 문자열**로 내린다.
 * - `parent_id`는 최상위 댓글일 때 **자기 id**가 들어간다.
 *   (`Comment`(최상위) 응답에서는 `null`로 덮어쓴다. 원본이 그렇게 내려준다.)
 */
function toCommentReply(
  comment: CommentRow,
  boardUserId: string | null,
  userId: string | null,
  likeType: VoteType,
): CommentReply {
  return {
    id: comment.id,
    board_id: comment.boardId,
    parent_id: comment.parentId ?? comment.id,
    content: comment.deleted ? '' : comment.content,
    writer: toWriter(comment),
    writer_app: comment.writerApp === 1 ? 1 : 0,
    disclose_type: comment.discloseType,
    like_count: comment.likeCount,
    dislike_count: comment.dislikeCount,
    like_type: likeType,
    deleted: comment.deleted,
    board_writer: boardUserId !== null && comment.userId !== null && boardUserId === comment.userId,
    login: comment.userId !== null,
    me: isOwner(comment, userId),
    created_at: toKstIso(comment.createdAt),
    last_edited: toKstIsoOrNull(comment.lastEdited),
  }
}

/**
 * 글의 댓글 목록. 대댓글은 **1단계까지만** 중첩한다.
 * 없는 글이면 빈 배열이다 (Mock과 동일).
 */
export async function listComments(boardId: string, request: Request): Promise<Comment[]> {
  const all = await prisma.comment.findMany({
    where: { boardId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: COMMENT_SELECT,
  })
  if (all.length === 0) return []

  const board = await prisma.board.findFirst({
    where: { id: boardId, deletedAt: null },
    select: { userId: true },
  })
  if (!board) return []

  const [userId, key] = await Promise.all([currentUserId(request), voterKey(request)])
  const likeTypes = await voteTypesOf(
    'comment',
    all.map((comment) => comment.id),
    key,
  )
  const map = (comment: CommentRow) =>
    toCommentReply(comment, board.userId, userId, likeTypes.get(comment.id) ?? 0)

  return all
    .filter((comment) => comment.parentId === null)
    .map((root) => ({
      ...map(root),
      parent_id: null,
      comments: all.filter((child) => child.parentId === root.id).map(map),
    }))
}

async function commentResponse(commentId: string, request: Request): Promise<Comment | null> {
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: COMMENT_SELECT,
  })
  if (!comment) return null

  const board = await prisma.board.findUnique({
    where: { id: comment.boardId },
    select: { userId: true },
  })
  const [userId, key] = await Promise.all([currentUserId(request), voterKey(request)])

  // 대댓글은 자기 밑에 다시 댓글을 달 수 없으므로 `comments`는 항상 비어 있다.
  const children =
    comment.parentId === null
      ? await prisma.comment.findMany({
          where: { parentId: commentId },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: COMMENT_SELECT,
        })
      : []

  const votes = await voteTypesOf('comment', [comment.id, ...children.map((row) => row.id)], key)
  const map = (row: CommentRow) =>
    toCommentReply(row, board?.userId ?? null, userId, votes.get(row.id) ?? 0)

  return {
    ...map(comment),
    parent_id: comment.parentId,
    comments: children.map(map),
  }
}

export async function createComment(
  request: Request,
  body: unknown,
): Promise<WriteResult<Comment>> {
  const parsed = CommentWriteInput.safeParse(body)
  if (!parsed.success) return invalid('입력값을 확인해주세요')
  const input = parsed.data

  const board = await prisma.board.findFirst({
    where: { id: input.board_id, deletedAt: null },
    select: { id: true },
  })
  if (!board) return missing('글을 찾을 수 없습니다')

  // 대댓글은 1단계까지만 — 부모가 이미 대댓글이면 거절한다
  let parentId: string | null = null
  if (input.parent_id) {
    const parent = await prisma.comment.findUnique({
      where: { id: input.parent_id },
      select: { id: true, boardId: true, parentId: true },
    })
    if (!parent || parent.boardId !== board.id) return invalid('부모 댓글을 찾을 수 없습니다')
    if (parent.parentId !== null) return invalid('대댓글에는 다시 댓글을 달 수 없습니다')
    parentId = parent.id
  }

  const userId = await currentUserId(request)
  if (!userId && !input.password) return invalid('비로그인 댓글은 삭제용 비밀번호가 필요합니다')

  const content = sanitizePostContent(input.content)
  if (!content.trim()) return invalid('내용을 입력해주세요')

  const created = await prisma.$transaction(async (tx) => {
    const comment = await tx.comment.create({
      data: {
        boardId: board.id,
        parentId,
        content,
        userId,
        anonAlias: userId ? null : generateAnonAlias(),
        anonPasswordHash: userId || !input.password ? null : hashSync(input.password, 10),
        discloseType: input.disclose_type,
        writerApp: 0,
      },
      select: { id: true },
    })
    await tx.board.update({ where: { id: board.id }, data: { commentCount: { increment: 1 } } })
    return comment
  })

  const comment = await commentResponse(created.id, request)
  return comment ? { ok: true, value: comment } : missing('댓글을 찾을 수 없습니다')
}

export async function updateComment(
  commentId: string,
  request: Request,
  body: unknown,
): Promise<WriteResult<Comment>> {
  const parsed = CommentWriteInput.safeParse(body)
  if (!parsed.success) return invalid('입력값을 확인해주세요')

  const row = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { id: true, userId: true, anonPasswordHash: true, deleted: true },
  })
  if (!row || row.deleted) return missing('댓글을 찾을 수 없습니다')

  const userId = await currentUserId(request)
  if (!canModify(row, userId, parsed.data.password)) return denied('수정 권한이 없습니다')

  const content = sanitizePostContent(parsed.data.content)
  if (!content.trim()) return invalid('내용을 입력해주세요')

  await prisma.comment.update({
    where: { id: commentId },
    data: { content, lastEdited: new Date() },
  })

  const comment = await commentResponse(commentId, request)
  return comment ? { ok: true, value: comment } : missing('댓글을 찾을 수 없습니다')
}

/**
 * 댓글 삭제 — **물리 삭제하지 않는다.** `deleted: true`로 두고 응답에서 내용만 가린다.
 *
 * `Board.commentCount`는 줄이지 않는다. Mock의 `comment_count`는 삭제된 댓글까지 포함한
 * "댓글 행 수"이고(`store.ts`의 `commentCountOf`), 시드된 값도 그렇게 계산돼 있다.
 * 여기서 감소시키면 같은 데이터에 대해 Mock과 다른 숫자가 나온다.
 * **원본이 삭제된 댓글을 세는지는 [미확인]이다.**
 */
export async function deleteComment(
  commentId: string,
  request: Request,
  body: unknown,
): Promise<WriteResult<{ ok: true }>> {
  const parsed = DeleteInput.safeParse(body ?? { password: null })
  if (!parsed.success) return invalid('입력값을 확인해주세요')

  const row = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { id: true, userId: true, anonPasswordHash: true },
  })
  if (!row) return missing('댓글을 찾을 수 없습니다')

  const userId = await currentUserId(request)
  if (!canModify(row, userId, parsed.data.password)) return denied('삭제 권한이 없습니다')

  await prisma.comment.update({ where: { id: commentId }, data: { deleted: true } })
  return { ok: true, value: { ok: true } }
}

export async function voteComment(
  commentId: string,
  request: Request,
  body: unknown,
): Promise<WriteResult<Comment>> {
  const parsed = VoteInput.safeParse(body)
  if (!parsed.success) return invalid('입력값을 확인해주세요')

  const row = await prisma.comment.findUnique({ where: { id: commentId }, select: { id: true } })
  if (!row) return missing('댓글을 찾을 수 없습니다')

  const key = await voterKey(request)
  await applyVote('comment', commentId, key, parsed.data.type)

  const comment = await commentResponse(commentId, request)
  return comment ? { ok: true, value: comment } : missing('댓글을 찾을 수 없습니다')
}
