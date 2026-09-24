import { prisma } from '@sacloud/db'

/**
 * ★DB 관리★ (2026-09-24 사장님 「db관리 이런것도 다 할 수 있는 전지전능 대시보드」).
 *
 * ── 무엇을 하는가
 *   주요 표를 ★찾아보고 한 줄을 통째로 들여다보는★ 자리다. 표 이름·검색어·페이지만 받는다.
 *
 * ── ★왜 「고치기」는 없는가★ (일부러 뺐다)
 *   웹 화면에서 아무 칸이나 마음대로 고치거나 SQL 을 직접 실행하는 자리를 만들면,
 *   글자 하나 잘못 눌러도 운영 DB 가 바로 상한다 — 되돌릴 방법이 없다.
 *   ★이미 있는 안전한 관리 기능★(클랜/시즌/회원등급/신청서 승인 등)은 각자의 관리 화면에
 *   그대로 있고, 이 표에서 그 화면으로 바로 갈 수 있게 링크만 놓는다(`adminScreenPathOf`).
 *   더 고치고 싶은 표가 생기면 ★그 표 하나만★ 골라 안전판(검증 값만 허용 등)을 달아 추가한다.
 *
 * ── 표를 더 넣고 싶으면
 *   `TABLES` 에 한 줄 추가한다 — `count`·`list`·`get` 세 함수만 있으면 된다.
 *   목록 칸(`listColumns`)은 사람이 훑어보기 좋은 몇 개만 고른다. 「한 줄 통째로 보기」 는
 *   `get` 이 돌려주는 값 ★전부★(관계 없는 원래 칸만 — `select` 를 안 쓰면 Prisma 가 관계는
 *   안 준다) 를 그대로 보여 준다.
 */

export interface DbRow {
  [key: string]: unknown
}

export interface DbTableConfig {
  /** 화면에 적는 이름 */
  label: string
  /** 검색창 placeholder — 무엇으로 찾는지 사람 말로 적는다 */
  searchHint: string
  /** 목록에 보일 칸 (순서대로) */
  listColumns: readonly string[]
  count(q: string): Promise<number>
  list(q: string, cursor: number, size: number): Promise<DbRow[]>
  get(id: string): Promise<DbRow | null>
  /** 이 줄을 실제로 고치려면 어느 관리 화면으로 가야 하나 — 없으면 안 준다(지어내지 않는다) */
  adminScreenPathOf?(row: DbRow): string | null
}

const ci = (q: string) => ({ contains: q, mode: 'insensitive' as const })

const PAGE_SIZE_MAX = 100

function clampSize(size: number): number {
  return Math.max(1, Math.min(PAGE_SIZE_MAX, Math.trunc(size) || 20))
}

export const TABLES: Readonly<Record<string, DbTableConfig>> = {
  player: {
    label: '선수',
    searchHint: '닉네임으로 찾기',
    listColumns: ['id', 'name', 'origin', 'clanId', 'renewedAt', 'createdAt'],
    count: (q) => prisma.player.count({ where: q ? { name: ci(q) } : {} }),
    list: (q, cursor, size) =>
      prisma.player.findMany({
        where: q ? { name: ci(q) } : {},
        orderBy: { createdAt: 'desc' },
        skip: cursor,
        take: clampSize(size),
      }),
    get: (id) => prisma.player.findUnique({ where: { id } }),
    adminScreenPathOf: () => null,
  },
  clan: {
    label: '클랜',
    searchHint: '클랜명·주소(slug)로 찾기',
    listColumns: ['id', 'slug', 'name', 'category', 'active', 'createdAt'],
    count: (q) => prisma.clan.count({ where: q ? { OR: [{ name: ci(q) }, { slug: ci(q) }] } : {} }),
    list: (q, cursor, size) =>
      prisma.clan.findMany({
        where: q ? { OR: [{ name: ci(q) }, { slug: ci(q) }] } : {},
        orderBy: { createdAt: 'desc' },
        skip: cursor,
        take: clampSize(size),
      }),
    get: (id) => prisma.clan.findUnique({ where: { id } }),
    adminScreenPathOf: (row) => (typeof row.slug === 'string' ? `/admin/clans/${row.slug}` : null),
  },
  league: {
    label: '리그',
    searchHint: '리그명·주소(slug)로 찾기',
    listColumns: ['id', 'slug', 'name', 'status', 'official', 'divisionCount'],
    count: (q) => prisma.league.count({ where: q ? { OR: [{ name: ci(q) }, { slug: ci(q) }] } : {} }),
    list: (q, cursor, size) =>
      prisma.league.findMany({
        where: q ? { OR: [{ name: ci(q) }, { slug: ci(q) }] } : {},
        orderBy: { createdAt: 'desc' },
        skip: cursor,
        take: clampSize(size),
      }),
    get: (id) => prisma.league.findUnique({ where: { id } }),
  },
  leagueClan: {
    label: '리그 등록',
    searchHint: '리그ID·클랜ID로 찾기(정확히)',
    listColumns: ['id', 'leagueId', 'clanId', 'division', 'win', 'lose', 'rating', 'expelledAt'],
    count: (q) => prisma.leagueClan.count({ where: q ? { OR: [{ leagueId: q }, { clanId: q }] } : {} }),
    list: (q, cursor, size) =>
      prisma.leagueClan.findMany({
        where: q ? { OR: [{ leagueId: q }, { clanId: q }] } : {},
        orderBy: { joinedAt: 'desc' },
        skip: cursor,
        take: clampSize(size),
      }),
    get: (id) => prisma.leagueClan.findUnique({ where: { id } }),
  },
  match: {
    label: '경기',
    searchHint: '경기ID(원본번호 18자리)로 찾기',
    listColumns: ['id', 'leagueId', 'startAt', 'winnerSide', 'sourceMatchId', 'origin'],
    count: (q) => prisma.match.count({ where: q ? { OR: [{ id: q }, { sourceMatchId: q }] } : {} }),
    list: (q, cursor, size) =>
      prisma.match.findMany({
        where: q ? { OR: [{ id: q }, { sourceMatchId: q }] } : {},
        orderBy: { startAt: 'desc' },
        skip: cursor,
        take: clampSize(size),
      }),
    get: (id) => prisma.match.findUnique({ where: { id } }),
    adminScreenPathOf: (row) => (typeof row.id === 'string' ? `/admin/matches?matchId=${row.id}` : null),
  },
  user: {
    label: '회원',
    searchHint: '이메일·닉네임으로 찾기',
    listColumns: ['id', 'email', 'nickname', 'role', 'createdAt'],
    count: (q) => prisma.user.count({ where: q ? { OR: [{ email: ci(q) }, { nickname: ci(q) }] } : {} }),
    list: (q, cursor, size) =>
      prisma.user.findMany({
        where: q ? { OR: [{ email: ci(q) }, { nickname: ci(q) }] } : {},
        orderBy: { createdAt: 'desc' },
        skip: cursor,
        take: clampSize(size),
        omit: { passwordHash: true },
      }),
    get: (id) => prisma.user.findUnique({ where: { id }, omit: { passwordHash: true } }),
    adminScreenPathOf: () => '/admin/users',
  },
  board: {
    label: '게시글',
    searchHint: '제목으로 찾기',
    listColumns: ['id', 'categorySlug', 'title', 'notice', 'deletedAt', 'createdAt'],
    count: (q) => prisma.board.count({ where: q ? { title: ci(q) } : {} }),
    list: (q, cursor, size) =>
      prisma.board.findMany({
        where: q ? { title: ci(q) } : {},
        orderBy: { createdAt: 'desc' },
        skip: cursor,
        take: clampSize(size),
      }),
    get: (id) => prisma.board.findUnique({ where: { id } }),
    adminScreenPathOf: (row) =>
      typeof row.id === 'string' && typeof row.categorySlug === 'string'
        ? `/board/${row.categorySlug}/${row.id}`
        : null,
  },
  leagueApplication: {
    label: '참가 신청서',
    searchHint: '클랜명으로 찾기',
    listColumns: ['id', 'leagueSlug', 'clanName', 'kind', 'status', 'createdAt'],
    count: (q) => prisma.leagueApplication.count({ where: q ? { clanName: ci(q) } : {} }),
    list: (q, cursor, size) =>
      prisma.leagueApplication.findMany({
        where: q ? { clanName: ci(q) } : {},
        orderBy: { createdAt: 'desc' },
        skip: cursor,
        take: clampSize(size),
      }),
    get: (id) => prisma.leagueApplication.findUnique({ where: { id } }),
    adminScreenPathOf: () => '/admin/applications',
  },
  clanMasterClaim: {
    label: '마스터 인증',
    searchHint: '클랜ID·회원ID로 찾기(정확히)',
    listColumns: ['id', 'clanId', 'userId', 'status', 'createdAt'],
    count: (q) => prisma.clanMasterClaim.count({ where: q ? { OR: [{ clanId: q }, { userId: q }] } : {} }),
    list: (q, cursor, size) =>
      prisma.clanMasterClaim.findMany({
        where: q ? { OR: [{ clanId: q }, { userId: q }] } : {},
        orderBy: { createdAt: 'desc' },
        skip: cursor,
        take: clampSize(size),
      }),
    get: (id) => prisma.clanMasterClaim.findUnique({ where: { id } }),
    adminScreenPathOf: () => '/admin/clan-master-claims',
  },
  importJob: {
    label: '수집 작업 큐',
    searchHint: '작업키(jobKey)로 찾기',
    listColumns: ['id', 'source', 'jobKey', 'status', 'attempts', 'lastError', 'updatedAt'],
    count: (q) => prisma.importJob.count({ where: q ? { jobKey: ci(q) } : {} }),
    list: (q, cursor, size) =>
      prisma.importJob.findMany({
        where: q ? { jobKey: ci(q) } : {},
        orderBy: { updatedAt: 'desc' },
        skip: cursor,
        take: clampSize(size),
      }),
    get: (id) => prisma.importJob.findUnique({ where: { id } }),
  },
}

export type TableKey = keyof typeof TABLES

export function isTableKey(value: string): value is TableKey {
  return Object.prototype.hasOwnProperty.call(TABLES, value)
}

export interface DbTableList {
  key: string
  label: string
  count: number
}

/** 표 목록 + 각 표의 전체 줄 수 — 첫 화면에서 「무엇을 볼 수 있나」를 한눈에 준다 */
export async function listDbTables(): Promise<DbTableList[]> {
  const entries = Object.entries(TABLES)
  const counts = await Promise.all(entries.map(([, cfg]) => cfg.count('')))
  return entries.map(([key, cfg], i) => ({ key, label: cfg.label, count: counts[i] ?? 0 }))
}

export interface DbTablePage {
  columns: readonly string[]
  rows: DbRow[]
  total: number
  cursor: number
  size: number
}

export async function dbTablePage(
  table: TableKey,
  q: string,
  cursor: number,
  size: number,
): Promise<DbTablePage> {
  const cfg = TABLES[table]!
  const clampedSize = clampSize(size)
  const clampedCursor = Math.max(0, Math.trunc(cursor) || 0)
  const [rows, total] = await Promise.all([
    cfg.list(q.trim(), clampedCursor, clampedSize),
    cfg.count(q.trim()),
  ])
  return { columns: cfg.listColumns, rows, total, cursor: clampedCursor, size: clampedSize }
}

export interface DbRowDetail {
  row: DbRow | null
  adminScreenPath: string | null
}

export async function dbRow(table: TableKey, id: string): Promise<DbRowDetail> {
  const cfg = TABLES[table]!
  const row = await cfg.get(id)
  const adminScreenPath = row ? (cfg.adminScreenPathOf?.(row) ?? null) : null
  return { row, adminScreenPath }
}
