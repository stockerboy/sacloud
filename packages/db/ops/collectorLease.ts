/**
 * ★★수집기 단일 실행 보장 — 임대(lease)★★ (2026-09-04 · Pre-Part 0 · 사장님 지시).
 *
 * > «현재 프로세스 이름을 세는 방식의 lock은 신뢰하지 않는다.
 * >  DB lock 또는 이에 준하는 명시적인 단일 실행 보장 방식을 검토해서 구현한다.»
 *
 * ══ ★왜 프로세스를 세면 안 되는가★ ══
 *
 * 옛 자물쇠(`scripts/collect-lock.sh`)는 이렇게 물었다 —
 * **「지금 `barracks-collect` 라는 프로세스가 돌고 있나?」**
 *
 * 그 질문은 ★한 판이 도는 내내 참이 아니다.★
 * ```
 * 목록 받는 중   node 가 있다   → 참
 * 배틀로그 받는 중 node 가 있다   → 참
 * ★투영 중★      node 는 있지만 이름이 다르다  → ★거짓★
 * ★쉬는 중★      node 가 아예 없다            → ★거짓★
 * ```
 * 15분 주기 중 ★몇 분은 거짓★ 이다. 예약 작업이 하필 그때 뜨면 통과한다.
 * ★2026-09-04 14:56 에 실제로 그렇게 두 판이 돌고 있었다★ (10:13 · 12:23 시작).
 *
 * ══ ★그래서 질문을 바꾼다★ ══
 *
 * ```
 * ★전★  「도는 프로세스가 있나」  ← 상태를 ★관찰★. 관찰에는 틈이 있다
 * ★후★  「내가 임대를 쥐었나」    ← 상태를 ★선언★. 틈이 없다
 * ```
 *
 * 임대는 ★DB 한 문장★ 으로 잡는다. 두 판이 같은 밀리초에 달려들어도
 * Postgres 의 ★행 잠금★ 이 순서를 세우고 ★정확히 하나만★ 성공한다.
 * 프로세스가 몇 겹이든 · 무슨 이름이든 · 쉬고 있든 ★상관이 없다.★
 *
 * ══ ★죽은 임대는 스스로 풀린다★ ══
 *
 * 프로세스가 죽으면서 임대만 남으면 ★영영 못 돌게 된다 — 그게 더 나쁘다.★
 * 그래서 `expiresAt` 을 두고 도는 동안 계속 갱신한다.
 *
 * ⚠ ★만료를 짧게 잡지 마라.★ 살아 있는 판의 임대를 남이 뺏으면 그게 곧 두 판이다.
 *   기본 ★20분★ 은 한 사이클(15분)보다 넉넉하다.
 *
 * ══ ★반납이 없어도 안전하다★ ══
 *
 * `Ctrl+C` · 정전 · 강제 종료 — 어떻게 죽든 임대는 만료로 풀린다.
 * ★반납은 「빨리 풀리게 하는 것」이지 안전의 근거가 아니다.★
 */
import { prisma as defaultPrisma } from '../src/index'
import { randomUUID } from 'node:crypto'
import { hostname } from 'node:os'

/** 우리가 쓰는 임대 이름. ★수집기 전체가 이것 하나를 다툰다★ */
export const COLLECTOR_LEASE_NAME = 'barracks-collect'

/**
 * 기본 임대 기간 — ★20분★.
 *
 * 한 사이클이 15분이므로 그보다 넉넉해야 한다. 이보다 짧으면 ★살아 있는 판이
 * 갱신하기 전에 만료★ 되어 남이 가져간다 — 그것이 곧 두 판이다.
 */
export const DEFAULT_LEASE_MS = 20 * 60 * 1000

/** 갱신 간격 기본값 — 임대 기간의 1/4. 한 번 놓쳐도 만료 전에 세 번 더 기회가 있다 */
export const DEFAULT_RENEW_MS = DEFAULT_LEASE_MS / 4

type Client = Pick<typeof defaultPrisma, '$queryRaw' | '$executeRaw' | '$queryRawUnsafe'>

export interface LeaseHolder {
  name: string
  ownerId: string
  host: string
  pid: number
  command: string | null
  acquiredAt: Date
  heartbeatAt: Date
  expiresAt: Date
  releasedAt: Date | null
  renewCount: number
  blockedCount: number
}

export type AcquireResult =
  | { ok: true; ownerId: string; expiresAt: Date; tookOverFrom: LeaseHolder | null }
  | { ok: false; heldBy: LeaseHolder }

export interface AcquireInput {
  name?: string
  /** 임대 기간(ms). 안 주면 20분 */
  leaseMs?: number
  /** 이 판의 셸 번호 */
  pid?: number
  host?: string
  command?: string | null
  /** 이 판을 가리키는 값. 안 주면 만든다 */
  ownerId?: string
  client?: Client
  /** 시각을 밖에서 넣는다 — 테스트가 시계를 흔들 수 있어야 한다 */
  now?: Date
}

/**
 * 임대를 잡는다.
 *
 * ── ★왜 한 문장인가★
 *   「읽고 → 판단하고 → 쓴다」로 나누면 그 사이에 남이 끼어든다.
 *   ★그 틈이 지금까지 세 번 다 뚫린 자리다.★
 *
 *   `INSERT … ON CONFLICT (name) DO UPDATE … WHERE <조건>` 은
 *   ★행을 잠근 채★ 조건을 보고 갱신한다. 조건이 거짓이면 ★아무 행도 안 돌려준다.★
 *   그래서 「돌려받은 행이 있나」 하나로 성패가 갈린다.
 *
 * ── ★언제 뺏을 수 있나★
 * ```
 * 임대가 없다             → 잡는다
 * 반납됐다 (releasedAt)    → 잡는다
 * 만료됐다 (expiresAt < now) → 잡는다
 * 그 외                   → ★못 잡는다★
 * 단, ownerId 가 나면      → 잡는다 (내가 다시 부른 것이다 · 멱등)
 * ```
 */
export async function acquireCollectorLease(input: AcquireInput = {}): Promise<AcquireResult> {
  const client = input.client ?? defaultPrisma
  const name = input.name ?? COLLECTOR_LEASE_NAME
  const ownerId = input.ownerId ?? randomUUID()
  const now = input.now ?? new Date()
  const leaseMs = input.leaseMs ?? DEFAULT_LEASE_MS
  const expiresAt = new Date(now.getTime() + leaseMs)
  const host = input.host ?? hostname()
  const pid = input.pid ?? process.pid
  const command = input.command ?? null

  /* ★뺏기 전에 누가 쥐고 있었는지 읽어 둔다★ — 보고에 쓴다.
     판정에는 쓰지 않는다. 판정은 아래 한 문장이 혼자 한다 */
  const before = await readLease(name, client)

  const rows = await client.$queryRaw<Array<{ ownerId: string; expiresAt: Date }>>`
    INSERT INTO "CollectorLease"
      ("name", "ownerId", "host", "pid", "command",
       "acquiredAt", "heartbeatAt", "expiresAt", "releasedAt",
       "renewCount", "blockedCount", "updatedAt")
    VALUES
      (${name}, ${ownerId}, ${host}, ${pid}, ${command},
       ${now}, ${now}, ${expiresAt}, NULL,
       0, 0, ${now})
    ON CONFLICT ("name") DO UPDATE SET
      "ownerId"     = EXCLUDED."ownerId",
      "host"        = EXCLUDED."host",
      "pid"         = EXCLUDED."pid",
      "command"     = EXCLUDED."command",
      "acquiredAt"  = EXCLUDED."acquiredAt",
      "heartbeatAt" = EXCLUDED."heartbeatAt",
      "expiresAt"   = EXCLUDED."expiresAt",
      "releasedAt"  = NULL,
      "renewCount"  = 0,
      "updatedAt"   = EXCLUDED."updatedAt"
    WHERE
      "CollectorLease"."releasedAt" IS NOT NULL
      OR "CollectorLease"."expiresAt" < ${now}
      OR "CollectorLease"."ownerId" = ${ownerId}
    RETURNING "ownerId", "expiresAt"`

  const won = rows[0]
  if (won) {
    /* 뺏은 것인지 빈자리를 채운 것인지 구별해서 돌려준다 —
       ★「낡은 임대를 치웠다」는 사람이 알아야 하는 사건이다★ */
    const tookOver =
      before && before.ownerId !== ownerId && before.releasedAt === null ? before : null
    return { ok: true, ownerId: won.ownerId, expiresAt: won.expiresAt, tookOverFrom: tookOver }
  }

  /* ★막힌 횟수를 센다★ — 이 숫자가 곧 이 장치가 일했다는 증거다.
     세다가 실패해도 판정을 바꾸지 않는다 (장부는 자물쇠가 아니다) */
  await client.$executeRaw`
    UPDATE "CollectorLease"
    SET "blockedCount" = "blockedCount" + 1
    WHERE "name" = ${name}`

  const holder = await readLease(name, client)
  /* 방금 읽었을 때 마침 만료·반납됐을 수 있다. 그래도 ★이번 판은 안 돈다★ —
     확실하지 않으면 안 도는 쪽이 맞다 (옛 자물쇠도 그 원칙만은 옳았다) */
  return { ok: false, heldBy: holder ?? (before as LeaseHolder) }
}

/**
 * 임대를 갱신한다 — ★도는 동안 계속 불러야 한다.★
 *
 * ★거짓을 돌려주면 임대를 잃은 것이다.★ 그때는 ★즉시 멈춰야 한다★ —
 * 임대 없이 계속 돌면 그게 바로 두 판이다.
 */
export async function renewCollectorLease(input: {
  ownerId: string
  name?: string
  leaseMs?: number
  client?: Client
  now?: Date
}): Promise<{ ok: boolean; expiresAt: Date | null }> {
  const client = input.client ?? defaultPrisma
  const name = input.name ?? COLLECTOR_LEASE_NAME
  const now = input.now ?? new Date()
  const expiresAt = new Date(now.getTime() + (input.leaseMs ?? DEFAULT_LEASE_MS))

  const rows = await client.$queryRaw<Array<{ expiresAt: Date }>>`
    UPDATE "CollectorLease"
    SET "heartbeatAt" = ${now},
        "expiresAt"   = ${expiresAt},
        "renewCount"  = "renewCount" + 1,
        "updatedAt"   = ${now}
    WHERE "name" = ${name}
      AND "ownerId" = ${input.ownerId}
      AND "releasedAt" IS NULL
    RETURNING "expiresAt"`

  const row = rows[0]
  return row ? { ok: true, expiresAt: row.expiresAt } : { ok: false, expiresAt: null }
}

/**
 * 임대를 반납한다.
 *
 * ★반납은 편의지 안전장치가 아니다.★ 반납을 못 하고 죽어도 만료가 받아 준다.
 * 다만 반납하면 다음 판이 ★20분을 기다리지 않는다.★
 */
export async function releaseCollectorLease(input: {
  ownerId: string
  name?: string
  client?: Client
  now?: Date
}): Promise<{ ok: boolean }> {
  const client = input.client ?? defaultPrisma
  const name = input.name ?? COLLECTOR_LEASE_NAME
  const now = input.now ?? new Date()

  const rows = await client.$queryRaw<Array<{ ownerId: string }>>`
    UPDATE "CollectorLease"
    SET "releasedAt" = ${now},
        "expiresAt"  = ${now},
        "updatedAt"  = ${now}
    WHERE "name" = ${name}
      AND "ownerId" = ${input.ownerId}
    RETURNING "ownerId"`

  return { ok: rows.length > 0 }
}

/** 지금 누가 쥐고 있나. ★없으면 null★ */
export async function readLease(
  name: string = COLLECTOR_LEASE_NAME,
  client: Client = defaultPrisma,
): Promise<LeaseHolder | null> {
  const rows = await client.$queryRaw<LeaseHolder[]>`
    SELECT "name", "ownerId", "host", "pid", "command",
           "acquiredAt", "heartbeatAt", "expiresAt", "releasedAt",
           "renewCount", "blockedCount"
    FROM "CollectorLease" WHERE "name" = ${name}`
  return rows[0] ?? null
}

/** 「지금 살아 있는 임대인가」 — 반납 안 됐고 아직 안 만료됐으면 참 */
export function leaseIsLive(holder: LeaseHolder | null, now: Date = new Date()): boolean {
  if (!holder) return false
  if (holder.releasedAt !== null) return false
  return holder.expiresAt.getTime() > now.getTime()
}

/** 사람이 읽는 한 줄 */
export function describeLease(holder: LeaseHolder | null, now: Date = new Date()): string {
  if (!holder) return '임대 없음 — 아무도 안 쥐고 있다'
  const live = leaseIsLive(holder, now)
  const left = Math.round((holder.expiresAt.getTime() - now.getTime()) / 1000)
  const held = Math.round((now.getTime() - holder.acquiredAt.getTime()) / 1000)
  const state = holder.releasedAt !== null ? '반납됨' : live ? `★살아있음★ (${left}초 남음)` : '만료됨'
  return (
    `${holder.name} · ${state} · ${holder.host}#${holder.pid}` +
    ` · ${held}초째 · 갱신 ${holder.renewCount}회 · 막은 횟수 ${holder.blockedCount}` +
    (holder.command ? ` · ${holder.command}` : '')
  )
}
