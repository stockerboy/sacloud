/**
 * ★★집계 임대★★ — 통계·랭킹 집계가 한 판만 돌게 하고, ★옛 판이 새 결과를 못 덮게★ 한다.
 * (2026-09-06 · Part 9 · 사장님 승인)
 *
 * ── 왜 있나
 *   수집기에는 임대가 있는데 ★집계에는 없었다.★ 그래서 두 가지가 실제로 일어났다 —
 *   ```
 *   ① 로컬에서 손으로 돌린 집계와 GitHub Actions 집계가 ★서로를 모른다★
 *   ② Part 8 에서 ★내 커밋보다 먼저 시작한 Actions 회차가 나중에 끝나며★
 *      옛 코드의 결과로 새 결과를 덮었다 (열산 389 → 445)
 *   ```
 *
 * ── ★새 시스템을 만들지 않았다★ (사장님 지시)
 *   수집기에서 이미 검증된 `CollectorLease` 표와 그 함수들을 ★이름만 달리해서★ 쓴다.
 *   더한 것은 ★칸 하나★ 뿐이다 — `lastAppliedStartedAt`.
 *
 * ── 막는 방법 두 겹
 *   ```
 *   ① 임대        시작할 때 잡는다. 남이 쥐고 있으면 ★이번 판은 시작하지 않는다★
 *   ② 세대 확인    쓰기 직전에 본다 — ★나보다 새 판이 이미 썼으면 안 쓴다★
 *   ```
 *   ①만으로는 부족하다. 임대는 «지금 둘이 도나» 를 막지 «누가 더 새 판인가» 를 모른다.
 *   ★완료 순서가 뒤집혀도 옛 결과가 새 결과를 못 덮는다★ — 그게 ②다.
 */
import { prisma as defaultPrisma } from '../src/index'
import {
  acquireCollectorLease,
  releaseCollectorLease,
  renewCollectorLease,
  type AcquireResult,
  type RenewResult,
} from './collectorLease'

type Client = typeof defaultPrisma

/** 집계 임대의 이름. ★수집기(`barracks-collect`)와 확실히 다르다★ */
export const SEASON0_LEASE_NAME = 'season0-apply'

/**
 * 집계 임대 기간.
 *
 * 실측 한 판이 ★11~12분★ 이다 (세 리그). 넉넉히 두되 무한정 잡고 있지는 않는다 —
 * 죽은 판이 임대만 남기면 ★그다음이 영영 못 돈다.★ 그게 더 나쁘다.
 */
export const SEASON0_LEASE_MS = 40 * 60 * 1000

/** 집계 임대를 잡는다 — 수집기와 같은 함수를 이름만 달리해 부른다 */
export async function acquireSeason0Lease(input: {
  ownerId?: string
  client?: Client
  now?: Date
  command?: string | null
} = {}): Promise<AcquireResult> {
  return acquireCollectorLease({
    ...input,
    name: SEASON0_LEASE_NAME,
    leaseMs: SEASON0_LEASE_MS,
  })
}

/** 아직 내가 쥐고 있나 — 긴 계산 중간에 부른다 */
export async function renewSeason0Lease(input: {
  ownerId: string
  client?: Client
  now?: Date
}): Promise<RenewResult> {
  return renewCollectorLease({ ...input, name: SEASON0_LEASE_NAME, leaseMs: SEASON0_LEASE_MS })
}

/** 반납한다 */
export async function releaseSeason0Lease(input: {
  ownerId: string
  client?: Client
  now?: Date
}): Promise<{ ok: boolean }> {
  return releaseCollectorLease({ ...input, name: SEASON0_LEASE_NAME })
}

/** ★써도 되는가★ 를 판정한 결과 */
export type WriteVerdict =
  /** 써도 된다 */
  | { ok: true }
  /** ★임대를 잃었다★ — 남이 돌고 있다. 한 줄도 쓰지 않는다 */
  | { ok: false; reason: 'lease_lost'; detail: string }
  /** ★나보다 새 판이 이미 썼다★ — 옛 결과로 덮지 않는다 */
  | { ok: false; reason: 'stale_run'; detail: string }
  /** ★DB 에 못 닿았다★ — 모르면 쓰지 않는다 */
  | { ok: false; reason: 'unreachable'; detail: string }

/**
 * ★쓰기 직전에 묻는다 — 써도 되나.★
 *
 * ```
 * 임대를 잃었다              → 안 쓴다 (lease_lost)
 * 나보다 새 판이 이미 썼다     → 안 쓴다 (stale_run)
 * DB 에 못 닿았다            → 안 쓴다 (unreachable) — ★모르면 안 쓴다★
 * ```
 *
 * ⚠ ★「모르면 쓴다」로 만들면 안 된다.★ 그건 O-055 에서 배운 것이다 —
 *   상태를 모를 때 밀어붙이면 조용히 덮어쓴다.
 */
export async function canWriteSeason0(input: {
  ownerId: string
  /** ★이 판이 언제 시작했나★ — 세대 비교의 기준 */
  startedAt: Date
  client?: Client
  now?: Date
}): Promise<WriteVerdict> {
  const client = input.client ?? defaultPrisma
  const now = input.now ?? new Date()

  let rows: Array<{ ownerId: string; expiresAt: Date; lastAppliedStartedAt: Date | null }>
  try {
    rows = await client.$queryRaw`
      SELECT "ownerId", "expiresAt", "lastAppliedStartedAt"
        FROM "CollectorLease"
       WHERE "name" = ${SEASON0_LEASE_NAME}
    `
  } catch (e) {
    return { ok: false, reason: 'unreachable', detail: (e as Error).message }
  }

  const row = rows[0]
  if (!row) return { ok: false, reason: 'lease_lost', detail: '임대 행이 없다' }
  if (row.ownerId !== input.ownerId) {
    return { ok: false, reason: 'lease_lost', detail: `주인이 ${row.ownerId} 로 바뀌었다` }
  }
  if (row.expiresAt.getTime() <= now.getTime()) {
    return { ok: false, reason: 'lease_lost', detail: `임대가 ${row.expiresAt.toISOString()} 에 만료됐다` }
  }
  const last = row.lastAppliedStartedAt
  if (last && last.getTime() > input.startedAt.getTime()) {
    return {
      ok: false,
      reason: 'stale_run',
      detail:
        `나는 ${input.startedAt.toISOString()} 에 시작했는데 ` +
        `${last.toISOString()} 에 시작한 판이 이미 썼다`,
    }
  }
  return { ok: true }
}

/**
 * ★썼다고 적는다.★ 다음 판이 이 값을 보고 「나보다 새 판인가」를 판정한다.
 *
 * ★쓰기가 끝난 뒤에 부른다.★ 시작할 때 적으면, 계산하다 죽은 판이
 * ★쓰지도 않고 다음 판을 막는다.★
 */
export async function markSeason0Applied(input: {
  ownerId: string
  startedAt: Date
  client?: Client
}): Promise<boolean> {
  const client = input.client ?? defaultPrisma
  const rows = await client.$queryRaw<Array<{ name: string }>>`
    UPDATE "CollectorLease"
       SET "lastAppliedStartedAt" = ${input.startedAt}
     WHERE "name" = ${SEASON0_LEASE_NAME}
       AND "ownerId" = ${input.ownerId}
       AND ("lastAppliedStartedAt" IS NULL OR "lastAppliedStartedAt" < ${input.startedAt})
   RETURNING "name"
  `
  return rows.length > 0
}

/** 사람이 읽는 한 줄 */
export function describeVerdict(verdict: WriteVerdict): string {
  if (verdict.ok) return '★써도 된다★'
  const label: Record<Exclude<WriteVerdict, { ok: true }>['reason'], string> = {
    lease_lost: '★임대를 잃었다 — 한 줄도 안 쓴다★',
    stale_run: '★나보다 새 판이 이미 썼다 — 옛 결과로 안 덮는다★',
    unreachable: '★DB 에 못 닿았다 — 모르면 안 쓴다★',
  }
  return `${label[verdict.reason]} (${verdict.detail})`
}
