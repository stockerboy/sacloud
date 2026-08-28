/**
 * 무소속리그 — 리그 생성과 **티어 등록** (D-165).
 *
 * 사용자 지시(2026-08-28): "무소속리그 페이지를 만든다. 1티어부터 5티어까지의 칸을 만들고
 * 관리자 권한으로 각 티어에 클랜을 등록할 수 있게 만들어라."
 *
 * ── 티어는 **새 축이 아니다.** `LeagueClan.division` 그대로다 (D-165).
 *   `League.divisionCount = 5` 인 리그의 division 1~5 를 `1티어 … 5티어` 로 **표기만** 바꾼다.
 *   그래서 클랜랭킹·개인랭킹·부리그 탭·커서 페이지네이션이 새 코드 없이 그대로 돈다.
 *   `1부/2부` 표기는 공식리그 쪽에서 바뀌지 않는다 — 표기 변환은 리그 `category` 로 갈린다.
 *
 * ── 승강은 **자동이 아니다** (D-104 · schema `Clan.tier` 주석).
 *   rating 이 아무리 높아도 티어는 운영자가 옮길 때만 움직인다. 여기서 계산하지 않는다.
 *
 * ── 값이 **두 곳**에 있다. 어긋나면 안 된다.
 *   `LeagueClan.division` (이 리그 안에서의 티어) 과 `Clan.tier` (D-104 무소속 래더 질의가 읽는 값).
 *   등록·이동은 항상 둘을 같이 쓴다. 한쪽만 고치는 경로를 만들지 않는다.
 *
 * ── 이 파일은 **CLI와 관리자 화면이 같이 쓴다.** 로그를 찍지 않고 결과만 돌려준다.
 */
import { prisma } from '../src/index'

/** 무소속리그 slug. GNB·모바일 서랍이 이미 `/league/nolink` 를 가리킨다 */
export const INDEPENDENT_LEAGUE_SLUG = 'nolink'

/** 무소속리그 이름 */
export const INDEPENDENT_LEAGUE_NAME = '무소속리그'

/** 티어 수 = `League.divisionCount`. `Clan.tier` 의 허용 범위(1~5)와 같아야 한다 */
export const INDEPENDENT_TIER_COUNT = 5

/** `League.category` / `Clan.category` 의 무소속 값 */
export const INDEPENDENT_CATEGORY = 'independent'

export interface EnsureIndependentLeagueResult {
  created: boolean
  /** 이미 있던 리그에서 우리가 고친 항목 (없으면 빈 배열) */
  fixed: string[]
  league: {
    id: string
    slug: string
    name: string
    category: string
    divisionCount: number
    origin: string
    official: boolean
  }
}

/**
 * 무소속리그 행을 만든다. **재실행해도 중복이 생기지 않는다** (slug 가 `@unique`).
 *
 * 이미 있으면 만들지 않고, **구조값만** 맞춘다 — `category` · `divisionCount` · `origin`.
 * 이름·소개·소유자는 운영자가 화면에서 고칠 수 있는 값이라 덮어쓰지 않는다.
 *
 * `origin` 은 `sacloud` 다. `mock` 은 공개 화면에서 통째로 걸러진다 (D-116).
 */
export async function ensureIndependentLeague(options?: {
  dryRun?: boolean
}): Promise<EnsureIndependentLeagueResult> {
  const dryRun = options?.dryRun ?? false
  const existing = await prisma.league.findUnique({
    where: { slug: INDEPENDENT_LEAGUE_SLUG },
    select: {
      id: true,
      slug: true,
      name: true,
      category: true,
      divisionCount: true,
      origin: true,
      official: true,
    },
  })

  if (!existing) {
    const data = {
      slug: INDEPENDENT_LEAGUE_SLUG,
      name: INDEPENDENT_LEAGUE_NAME,
      category: INDEPENDENT_CATEGORY,
      divisionCount: INDEPENDENT_TIER_COUNT,
      origin: 'sacloud',
      // 공식 배지는 공식리그의 것이다. 무소속리그는 별개 리그이지 공식리그가 아니다
      official: false,
      status: 1,
    }
    if (dryRun) {
      return { created: false, fixed: ['(dry-run) 새로 만들 예정'], league: { id: '(미생성)', ...data } }
    }
    const created = await prisma.league.create({
      data,
      select: {
        id: true,
        slug: true,
        name: true,
        category: true,
        divisionCount: true,
        origin: true,
        official: true,
      },
    })
    return { created: true, fixed: [], league: created }
  }

  const patch: Record<string, string | number> = {}
  const fixed: string[] = []
  if (existing.category !== INDEPENDENT_CATEGORY) {
    patch.category = INDEPENDENT_CATEGORY
    fixed.push(`category ${existing.category} → ${INDEPENDENT_CATEGORY}`)
  }
  if (existing.divisionCount !== INDEPENDENT_TIER_COUNT) {
    patch.divisionCount = INDEPENDENT_TIER_COUNT
    fixed.push(`divisionCount ${existing.divisionCount} → ${INDEPENDENT_TIER_COUNT}`)
  }
  if (existing.origin === 'mock') {
    patch.origin = 'sacloud'
    fixed.push('origin mock → sacloud (D-116)')
  }

  if (Object.keys(patch).length === 0 || dryRun) {
    return { created: false, fixed, league: existing }
  }

  const updated = await prisma.league.update({
    where: { id: existing.id },
    data: patch,
    select: {
      id: true,
      slug: true,
      name: true,
      category: true,
      divisionCount: true,
      origin: true,
      official: true,
    },
  })
  return { created: false, fixed, league: updated }
}

export type TierRegisterFailure =
  | 'leagueNotFound'
  | 'notIndependentLeague'
  | 'clanNotFound'
  | 'tierOutOfRange'
  | 'expelled'

export interface TierRegisterResult {
  ok: boolean
  reason?: TierRegisterFailure
  /** 정책으로 막지는 않지만 운영자가 알아야 하는 것 */
  warnings: string[]
  leagueClanId?: string
  /** 새로 등록했는가 (false 면 티어 이동) */
  created?: boolean
  fromTier?: number | null
  toTier?: number
}

/**
 * 클랜을 무소속리그의 한 티어에 등록하거나 다른 티어로 옮긴다.
 *
 * **`LeagueClan.division` 과 `Clan.tier` 를 항상 같이 쓴다.** 둘이 어긋나면
 * 부리그 탭(division 기준)과 무소속 래더(D-104 · `Clan.tier` 기준)가 서로 다른 답을 낸다.
 *
 * 추방된 클랜은 되돌릴 수 없다(관측) — 다시 넣지 않는다.
 *
 * `[미확인]` 같은 클랜이 공식리그와 무소속리그에 **동시에** 있을 수 있는지는 원본에서
 * 확인되지 않았다. 막지 않고 `warnings` 로 알린다 — 없는 규칙을 지어내지 않는다.
 */
export async function registerClanTier(input: {
  leagueSlug: string
  clanSlug: string
  tier: number
  dryRun?: boolean
}): Promise<TierRegisterResult> {
  const warnings: string[] = []

  const league = await prisma.league.findUnique({
    where: { slug: input.leagueSlug },
    select: { id: true, category: true, divisionCount: true },
  })
  if (!league) return { ok: false, reason: 'leagueNotFound', warnings }
  if (league.category !== INDEPENDENT_CATEGORY) {
    return { ok: false, reason: 'notIndependentLeague', warnings }
  }
  if (!Number.isInteger(input.tier) || input.tier < 1 || input.tier > league.divisionCount) {
    return { ok: false, reason: 'tierOutOfRange', warnings }
  }

  const clan = await prisma.clan.findUnique({
    where: { slug: input.clanSlug },
    select: {
      id: true,
      name: true,
      active: true,
      category: true,
      tier: true,
      leagueClans: {
        where: { league: { category: { not: INDEPENDENT_CATEGORY } } },
        select: { league: { select: { slug: true, name: true } } },
      },
    },
  })
  if (!clan) return { ok: false, reason: 'clanNotFound', warnings }
  if (!clan.active) warnings.push(`${clan.name} 은 비활성 클랜이다 — 랭킹에 나오지 않는다`)
  for (const entry of clan.leagueClans) {
    warnings.push(
      `${clan.name} 은 ${entry.league.name}(${entry.league.slug}) 에도 참여 중이다 — ` +
        `Clan.category 가 independent 로 바뀐다 [미확인]`,
    )
  }

  const existing = await prisma.leagueClan.findUnique({
    where: { leagueId_clanId: { leagueId: league.id, clanId: clan.id } },
    select: { id: true, division: true, expelledAt: true },
  })
  if (existing?.expelledAt) return { ok: false, reason: 'expelled', warnings }

  if (input.dryRun) {
    return {
      ok: true,
      warnings,
      leagueClanId: existing?.id,
      created: !existing,
      fromTier: existing?.division ?? null,
      toTier: input.tier,
    }
  }

  const leagueClan = await prisma.leagueClan.upsert({
    where: { leagueId_clanId: { leagueId: league.id, clanId: clan.id } },
    // 등록 시각(`joinedAt`)은 기본값 now 다. 클랜 기록은 **등록된 순간부터** 시작한다 (D-108)
    create: { leagueId: league.id, clanId: clan.id, division: input.tier },
    /* 티어 이동은 division 만 바꾼다. rating·승패·placement 는 건드리지 않는다 —
       티어는 표시 구획이지 성적이 아니다 (D-104 ①). */
    update: { division: input.tier },
    select: { id: true },
  })

  await prisma.clan.update({
    where: { id: clan.id },
    data: { category: INDEPENDENT_CATEGORY, tier: input.tier },
  })

  return {
    ok: true,
    warnings,
    leagueClanId: leagueClan.id,
    created: !existing,
    fromTier: existing?.division ?? null,
    toTier: input.tier,
  }
}

/**
 * 무소속리그 안에서 `Clan.tier` 를 `LeagueClan.division` 에 맞춘다.
 *
 * 두 값이 어긋난 행만 고친다. 재실행해도 결과가 같다.
 * `LeagueClan.division` 이 기준이다 — 부리그 탭·클랜랭킹·커서가 전부 그 값으로 돈다.
 */
export async function syncIndependentTiers(input?: {
  leagueSlug?: string
  dryRun?: boolean
}): Promise<{ checked: number; fixed: { clanSlug: string; from: number | null; to: number }[] }> {
  const leagueSlug = input?.leagueSlug ?? INDEPENDENT_LEAGUE_SLUG
  const rows = await prisma.leagueClan.findMany({
    where: { league: { slug: leagueSlug, category: INDEPENDENT_CATEGORY } },
    select: { division: true, clan: { select: { id: true, slug: true, tier: true, category: true } } },
  })

  const fixed: { clanSlug: string; from: number | null; to: number }[] = []
  for (const row of rows) {
    if (row.clan.tier === row.division && row.clan.category === INDEPENDENT_CATEGORY) continue
    fixed.push({ clanSlug: row.clan.slug, from: row.clan.tier, to: row.division })
    if (input?.dryRun) continue
    await prisma.clan.update({
      where: { id: row.clan.id },
      data: { category: INDEPENDENT_CATEGORY, tier: row.division },
    })
  }
  return { checked: rows.length, fixed }
}
