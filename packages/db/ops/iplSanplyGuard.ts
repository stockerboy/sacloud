/**
 * **IPL 클랜끼리의 경기는 열산(`sanply`) 기록이 아니다** (D-210).
 *
 * 2026-08-30 사용자 지시:
 *   "열산리그에서 발견한 IPL클랜끼리의 기록을 전부 지우고
 *    열산클랜으로 등록돼있는 IPL클랜들 전부 등록해제해버려"
 *
 * 지시는 **한 번 지우는 것**이었지만, 지우는 것만으로는 끝나지 않았다.
 * 5분마다 도는 증분 동기화(`supply-mirror` → `supply-import` → `supply-rollup`)가
 * 원본에서 새 경기를 계속 가져오고, 그중 IPL 클랜끼리 붙은 경기가 다시 열산으로 들어왔다
 * (운영에서 지운 지 하루도 안 돼 10건이 새로 쌓였다).
 *
 * 그래서 이 파일은 **들어오는 길목**과 **이미 들어온 것을 치우는 일**을 한곳에 둔다.
 *
 * ```
 *   막기   loadIplOnlyMatchGuard()   → supplyMirrorImport 가 Match 를 만들기 전에 부른다
 *   치우기 purgeIplOnlyMatches()     → nexon ipl-sanply-purge
 *   대조   countIplOnlyMatches()     → nexon ipl-sanply-check   (0 이어야 한다)
 * ```
 *
 * ── 규칙은 하나뿐이다
 *   **양 팀이 모두 IPL(`nolink`) 등록 클랜이면 열산 `Match` 를 만들지 않는다.**
 *   · 한쪽만 IPL 이면 **막지 않는다.** 그건 열산 경기가 맞다
 *   · `expelledAt` 이 붙은 등록행은 "그 리그 소속이 아니다" 로 읽는다
 *   · **열산에만 건다.** DPL(`supply`)·대룰(`daerule`)은 그대로다
 *
 * ── 원문(mirror JSONL)은 버리지 않는다 (`CLAUDE.md` 3-A 1번)
 *   안 만드는 것은 `Match` **행**이지 원문이 아니다. 수집 파일은 그대로 남으므로
 *   나중에 규칙이 바뀌면 `supply-import` 를 다시 돌려 그 자리에서 되살릴 수 있다.
 *
 * ── 조용히 버리지 않는다 (3-A 6번)
 *   건너뛴 경기는 `skipped['ipl_only_not_sanply']` 로 **사유별 건수**에 남는다.
 *   `supply-import` 의 "넣지 않은 경기 (사유별)" 표에 그대로 찍힌다.
 */
import { prisma } from '../src/index'
import type { Prisma } from '../src/index'

/** IPL = 무소속리그. `independentLeague.ts` 의 `INDEPENDENT_LEAGUE_SLUG` 와 같은 값이다 */
export const IPL_LEAGUE_SLUG = 'nolink'
/** 열산리그 */
export const SANPLY_LEAGUE_SLUG = 'sanply'

/**
 * 이 규칙이 걸리는 리그.
 *
 * **열산 하나뿐이다.** 사용자가 정한 범위가 그렇다 — DPL·대룰은 건드리지 않는다.
 * 다른 리그로 넓히려면 사용자에게 먼저 확인한다 (`CLAUDE.md` 3장 3번).
 */
export const IPL_ONLY_GUARDED_LEAGUE_SLUGS: readonly string[] = [SANPLY_LEAGUE_SLUG]

/** 건너뛴 사유 키. 로그·요약에 그대로 찍힌다 */
export const IPL_ONLY_SKIP_REASON = 'ipl_only_not_sanply'

/** 판정에 필요한 최소한만 본다 — 판독 결과와 DB 행 어느 쪽이든 이 모양이면 된다 */
export interface IplClanKey {
  sourceClanId?: string | null
  slug?: string | null
}

export interface IplOnlyMatchGuard {
  /** 이 리그에 규칙이 걸리는가. 꺼져 있으면 `blocks()` 는 언제나 false 다 */
  enabled: boolean
  targetLeagueSlug: string
  iplLeagueSlug: string
  /** IPL 등록 클랜 수 (추방된 곳은 빼고 센다) */
  iplClanCount: number
  /** 양쪽 다 IPL 등록 클랜인가 */
  blocks(red: IplClanKey, blue: IplClanKey): boolean
  /** 한쪽만 봤을 때 IPL 등록 클랜인가 (진단용) */
  isIplClan(clan: IplClanKey): boolean
}

export interface LoadIplOnlyMatchGuardOptions {
  /** 넣으려는 리그 */
  targetLeagueSlug: string
  /** 기본 `nolink` */
  iplLeagueSlug?: string
  /** 기본 `['sanply']`. 테스트가 임시 리그로 바꿔 끼운다 */
  guardedLeagueSlugs?: readonly string[]
  /** 읽기에 쓸 클라이언트. 기본은 전역 `prisma` (트랜잭션 테스트용) */
  client?: Prisma.TransactionClient
}

/** 아무것도 막지 않는 가드 */
function disabledGuard(targetLeagueSlug: string, iplLeagueSlug: string): IplOnlyMatchGuard {
  return {
    enabled: false,
    targetLeagueSlug,
    iplLeagueSlug,
    iplClanCount: 0,
    blocks: () => false,
    isIplClan: () => false,
  }
}

/**
 * IPL 등록 클랜 명단을 한 번만 읽어 판정기를 만든다.
 *
 * 경기마다 DB 를 되묻지 않는다 — 증분 동기화는 5분마다 돌고 경기는 한 건씩 흘러온다.
 * 명단은 수백 건이라 통째로 들고 있어도 가볍다.
 *
 * 규칙이 안 걸리는 리그면 **DB 를 아예 읽지 않는다.**
 */
export async function loadIplOnlyMatchGuard(
  options: LoadIplOnlyMatchGuardOptions,
): Promise<IplOnlyMatchGuard> {
  const db = options.client ?? prisma
  const iplLeagueSlug = options.iplLeagueSlug ?? IPL_LEAGUE_SLUG
  const guarded = options.guardedLeagueSlugs ?? IPL_ONLY_GUARDED_LEAGUE_SLUGS

  if (!guarded.includes(options.targetLeagueSlug)) {
    return disabledGuard(options.targetLeagueSlug, iplLeagueSlug)
  }

  const league = await db.league.findUnique({
    where: { slug: iplLeagueSlug },
    select: { id: true },
  })
  /* IPL 리그가 없으면 막을 근거가 없다. 없는 것을 있는 척하지 않는다 (3-A 8번) */
  if (!league) return disabledGuard(options.targetLeagueSlug, iplLeagueSlug)

  const rows = await db.leagueClan.findMany({
    /* 추방된 등록행은 **그 리그 소속이 아니다.** IPL 쪽도 같은 규칙으로 읽는다 */
    where: { leagueId: league.id, expelledAt: null },
    select: { clan: { select: { slug: true, sourceClanId: true } } },
  })

  const sourceClanIds = new Set<string>()
  const slugs = new Set<string>()
  for (const row of rows) {
    if (row.clan.sourceClanId) sourceClanIds.add(row.clan.sourceClanId)
    slugs.add(row.clan.slug)
  }

  /* 원본 id 가 slug 보다 강한 근거다 — 클랜이 slug 를 바꿔도 같은 클랜이다.
     둘 다 보는 것은 `supplyMirrorImport.resolveClan` 의 해석 순서와 같게 맞춘 것이다 */
  const isIplClan = (clan: IplClanKey): boolean => {
    if (clan.sourceClanId && sourceClanIds.has(clan.sourceClanId)) return true
    return Boolean(clan.slug && slugs.has(clan.slug))
  }

  return {
    enabled: true,
    targetLeagueSlug: options.targetLeagueSlug,
    iplLeagueSlug,
    iplClanCount: rows.length,
    isIplClan,
    /* **양쪽 다** 일 때만 막는다. 한쪽만 IPL 인 경기는 열산 경기가 맞다 */
    blocks: (red, blue) => isIplClan(red) && isIplClan(blue),
  }
}

/* ── 이미 들어온 것 — 대조 · 치우기 ────────────────────────────────────────── */

export interface IplOnlyMatchScope {
  targetLeagueSlug: string
  iplLeagueSlug: string
  targetLeagueExists: boolean
  iplLeagueExists: boolean
  /** IPL 등록 클랜 수 (추방 제외) */
  iplClanCount: number
  /** 그중 대상 리그에도 등록행이 있는 클랜 수 (추방행 포함 — 경기가 그 행을 가리킨다) */
  registeredInTarget: number
  /** 양쪽 다 IPL 클랜인 경기 id. **0건이 목표다** */
  matchIds: string[]
}

interface ScopeInternals extends IplOnlyMatchScope {
  targetLeagueId: string | null
  /** 대상 리그에서 IPL 클랜이 쓰는 `LeagueClan.id` */
  targetLeagueClanIds: string[]
}

export interface IplOnlyScopeOptions {
  targetLeagueSlug?: string
  iplLeagueSlug?: string
}

/**
 * 열산에 남은 "IPL끼리의 경기" 를 센다. **읽기만 한다.**
 *
 * ── `select` 를 최소로 쓴다
 *   운영 DB 에 아직 없는 열(`Match.firstHalfAttackSide` 등)이 있을 수 있다.
 *   Prisma 는 `select` 를 안 주면 스키마의 모든 열을 SELECT 해서 그 자리에서 죽는다.
 *   그래서 여기서는 **id 하나만** 읽는다.
 */
async function loadScope(options: IplOnlyScopeOptions = {}): Promise<ScopeInternals> {
  const targetLeagueSlug = options.targetLeagueSlug ?? SANPLY_LEAGUE_SLUG
  const iplLeagueSlug = options.iplLeagueSlug ?? IPL_LEAGUE_SLUG

  const [target, ipl] = await Promise.all([
    prisma.league.findUnique({ where: { slug: targetLeagueSlug }, select: { id: true } }),
    prisma.league.findUnique({ where: { slug: iplLeagueSlug }, select: { id: true } }),
  ])

  const out: ScopeInternals = {
    targetLeagueSlug,
    iplLeagueSlug,
    targetLeagueExists: target !== null,
    iplLeagueExists: ipl !== null,
    iplClanCount: 0,
    registeredInTarget: 0,
    matchIds: [],
    targetLeagueId: target?.id ?? null,
    targetLeagueClanIds: [],
  }
  if (!target || !ipl) return out

  const iplClanIds = (
    await prisma.leagueClan.findMany({
      where: { leagueId: ipl.id, expelledAt: null },
      select: { clanId: true },
    })
  ).map((row) => row.clanId)
  out.iplClanCount = iplClanIds.length
  if (iplClanIds.length === 0) return out

  /* 대상 리그 쪽은 **추방행도 센다.** 추방해도 행은 남고, 경기는 그 행을 가리킨다 */
  const targetRows = await prisma.leagueClan.findMany({
    where: { leagueId: target.id, clanId: { in: iplClanIds } },
    select: { id: true },
  })
  out.registeredInTarget = targetRows.length
  out.targetLeagueClanIds = targetRows.map((row) => row.id)
  if (targetRows.length === 0) return out

  out.matchIds = (
    await prisma.match.findMany({
      where: {
        leagueId: target.id,
        redLeagueClanId: { in: out.targetLeagueClanIds },
        blueLeagueClanId: { in: out.targetLeagueClanIds },
      },
      /* 최소 select — 운영에 없는 열을 건드리지 않기 위해서다 */
      select: { id: true },
    })
  ).map((row) => row.id)

  return out
}

/** 대조용 — 열산에 남은 IPL끼리의 경기 건수. **0 이어야 한다** */
export async function countIplOnlyMatches(
  options: IplOnlyScopeOptions = {},
): Promise<IplOnlyMatchScope> {
  const { targetLeagueId: _id, targetLeagueClanIds: _ids, ...scope } = await loadScope(options)
  return scope
}

export interface PurgeIplOnlyMatchesInput extends IplOnlyScopeOptions {
  /** 없으면 한 줄도 지우지 않는다 */
  confirm?: boolean
  /** 백업 JSON 을 쓸 폴더. 없으면 백업을 만들지 않는다 (미리보기) */
  backupDir?: string | null
  /** 백업 파일을 실제로 쓰는 함수. 테스트가 갈아 끼운다 */
  writeBackup?: (fileName: string, json: string) => string
}

export interface PurgeIplOnlyMatchesResult {
  scope: IplOnlyMatchScope
  /** 지울(지운) 경기 수 */
  matches: number
  /** 함께 사라지는(사라진) 참가 기록 수 */
  stats: number
  /** 지운 뒤에도 대상 리그 경기가 남는 IPL 클랜 등록행 (= 추방 표시만 한다) */
  stillReferenced: number
  /** 참조가 사라져 행 자체를 지울 수 있는 등록행 */
  removable: number
  written: {
    matchesDeleted: number
    leagueClansDeleted: number
    leagueClansExpelled: number
    backupPath: string | null
  }
  notes: string[]
}

/**
 * 열산에서 IPL끼리의 경기를 지우고, IPL 클랜을 열산에서 뺀다.
 *
 * ── 지우기 전에 원본을 파일로 남긴다 (`CLAUDE.md` 3-A 1번 · 7번)
 *   `Match` 를 지우는 것은 3-A 에 정면으로 걸리는 작업이다. 사용자가 명시적으로
 *   지시했으므로 실행하되, **지우는 행 전부를 JSON 으로 먼저 떠 둔다.**
 *   되돌릴 수 있어야 한다.
 *
 *   백업은 **`row_to_json` 원시 질의**로 뜬다. Prisma 로 뜨면 스키마에는 있는데
 *   그 DB 에는 아직 없는 열을 SELECT 해서 죽고, 반대로 스키마에 없는 열은 놓친다.
 *   `select *` 는 **그 DB 에 실제로 있는 것을 그대로** 담는다.
 *
 * ── 등록 해제는 두 갈래다
 *   IPL 클랜에는 **IPL 상대가 아닌 열산 경기가 수만 건** 남아 있고 그 경기들이
 *   등록행을 가리킨다. 행을 지우면 그 경기가 통째로 깨진다(`onDelete: Cascade`).
 *   사용자 지시는 **IPL끼리의 기록만** 지우라는 것이었으므로 남의 경기까지 지우지 않는다.
 *     · 참조가 남으면 → `expelledAt` (랭킹 질의가 이 값을 본다)
 *     · 참조가 없으면 → 행 삭제
 */
export async function purgeIplOnlyMatches(
  input: PurgeIplOnlyMatchesInput = {},
): Promise<PurgeIplOnlyMatchesResult> {
  const scope = await loadScope(input)
  const confirm = Boolean(input.confirm)

  const result: PurgeIplOnlyMatchesResult = {
    scope: {
      targetLeagueSlug: scope.targetLeagueSlug,
      iplLeagueSlug: scope.iplLeagueSlug,
      targetLeagueExists: scope.targetLeagueExists,
      iplLeagueExists: scope.iplLeagueExists,
      iplClanCount: scope.iplClanCount,
      registeredInTarget: scope.registeredInTarget,
      matchIds: scope.matchIds,
    },
    matches: scope.matchIds.length,
    stats: 0,
    stillReferenced: 0,
    removable: 0,
    written: {
      matchesDeleted: 0,
      leagueClansDeleted: 0,
      leagueClansExpelled: 0,
      backupPath: null,
    },
    notes: [],
  }

  if (!scope.targetLeagueExists || !scope.iplLeagueExists) {
    result.notes.push(
      `리그를 찾지 못했다 (${scope.targetLeagueSlug}=${scope.targetLeagueExists} · ` +
        `${scope.iplLeagueSlug}=${scope.iplLeagueExists})`,
    )
    return result
  }
  if (scope.targetLeagueClanIds.length === 0) return result

  result.stats = await prisma.matchPlayerStat.count({
    where: { matchId: { in: scope.matchIds } },
  })

  /* 지운 뒤에도 이 등록행을 가리키는 경기가 남는가 */
  const remaining = await prisma.match.findMany({
    where: {
      leagueId: scope.targetLeagueId as string,
      OR: [
        { redLeagueClanId: { in: scope.targetLeagueClanIds } },
        { blueLeagueClanId: { in: scope.targetLeagueClanIds } },
      ],
      id: { notIn: scope.matchIds },
    },
    /* 최소 select — 운영에 없는 열을 건드리지 않는다 */
    select: { redLeagueClanId: true, blueLeagueClanId: true },
  })
  const targetIdSet = new Set(scope.targetLeagueClanIds)
  const stillUsed = new Set<string>()
  for (const row of remaining) {
    if (targetIdSet.has(row.redLeagueClanId)) stillUsed.add(row.redLeagueClanId)
    if (targetIdSet.has(row.blueLeagueClanId)) stillUsed.add(row.blueLeagueClanId)
  }
  result.stillReferenced = stillUsed.size
  result.removable = scope.targetLeagueClanIds.length - stillUsed.size

  if (!confirm) return result
  if (scope.matchIds.length === 0 && result.removable === 0 && stillUsed.size === 0) return result

  /* ── 백업 — 지우기 전에 반드시 ─────────────────────────────────────────── */
  if (scope.matchIds.length > 0) {
    if (!input.backupDir || !input.writeBackup) {
      /* 백업 없이 지우지 않는다. 되돌릴 수 없는 삭제를 근거 없이 하지 않는다 */
      result.notes.push('백업 폴더가 없어 한 건도 지우지 않았다 (--backup-dir 를 준다)')
      return result
    }
    const matches = await prisma.$queryRawUnsafe<{ row: unknown }[]>(
      'select row_to_json(m) as row from "Match" m where m.id = any($1::text[])',
      scope.matchIds,
    )
    const stats = await prisma.$queryRawUnsafe<{ row: unknown }[]>(
      'select row_to_json(s) as row from "MatchPlayerStat" s where s."matchId" = any($1::text[])',
      scope.matchIds,
    )
    const leagueClans = await prisma.$queryRawUnsafe<{ row: unknown }[]>(
      'select row_to_json(lc) as row from "LeagueClan" lc where lc.id = any($1::text[])',
      scope.targetLeagueClanIds,
    )
    const payload = {
      takenAt: new Date().toISOString(),
      targetLeagueSlug: scope.targetLeagueSlug,
      iplLeagueSlug: scope.iplLeagueSlug,
      reason: 'IPL 클랜끼리의 경기는 열산 기록이 아니다 (D-210)',
      matches: matches.map((row) => row.row),
      stats: stats.map((row) => row.row),
      leagueClans: leagueClans.map((row) => row.row),
    }
    result.written.backupPath = input.writeBackup(
      `ipl-${scope.targetLeagueSlug}-purge-${scope.matchIds.length}건-${Date.now()}.json`,
      JSON.stringify(payload, (_key, value) => (typeof value === 'bigint' ? String(value) : value), 1),
    )
  }

  /* ── 삭제 (`MatchPlayerStat` 은 onDelete: Cascade 로 함께 지워진다) ────── */
  if (scope.matchIds.length > 0) {
    const deleted = await prisma.match.deleteMany({ where: { id: { in: scope.matchIds } } })
    result.written.matchesDeleted = deleted.count
  }

  /* ── 등록 해제 ─────────────────────────────────────────────────────────── */
  for (const id of scope.targetLeagueClanIds) {
    if (stillUsed.has(id)) {
      const updated = await prisma.leagueClan.updateMany({
        where: { id, expelledAt: null },
        data: { expelledAt: new Date() },
      })
      result.written.leagueClansExpelled += updated.count
      continue
    }
    await prisma.leagueClan.delete({ where: { id } })
    result.written.leagueClansDeleted += 1
  }

  return result
}
