/**
 * 무소속리그 티어 편성 회귀 테스트 (D-165).
 *
 * 실제 DB에 임시 무소속리그를 만들고 **운영 코드 그대로** 돌린다.
 * 순수 함수 테스트로는 "티어가 정말 클랜랭킹 탭으로 이어지는가"를 증명할 수 없다.
 *
 * 여기서 고정하는 약속
 *   1. 티어 1~5 는 **새 축이 아니다** — `LeagueClan.division` 1~5 그대로다
 *   2. 등록·이동은 `LeagueClan.division` 과 `Clan.tier` 를 **항상 같이** 쓴다
 *   3. 승강은 **자동이 아니다** — rating 이 높아도 티어는 그대로다
 *   4. 무소속리그 개인랭킹은 **누적 킬뎃을 내보내지 않는다** (D-107 그대로)
 *   5. 리그 만들기는 **재실행해도 중복이 생기지 않는다**
 *
 * 만든 데이터는 전부 `T161-` 접두사이고 끝나면 지운다.
 * `nolink`(운영 예정 리그)는 **만들기만 하고 지우지 않는다** — 그게 이 명령의 목적이다.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@sacloud/db'
import {
  ensureIndependentLeague,
  registerClanTier,
  syncIndependentTiers,
  INDEPENDENT_LEAGUE_SLUG,
  INDEPENDENT_TIER_COUNT,
} from '@sacloud/db/ops'
import { getClanRanks, getPlayerRanks } from '../lib/server/queries/leagues'
import { getIndependentLadder, getIndependentTiers, getTierLadder } from '../lib/server/queries/ladders'
import { toLeagueSummary } from '../lib/server/mappers'

const P = 'T161-'
const INDEP_SLUG = 't161indep'
const OFFICIAL_SLUG = 't161official'
const CLAN_PREFIX = 't161-'

async function dbUp(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`
    return true
  } catch {
    return false
  }
}

const up = await dbUp()

let indepLeagueId = ''

async function cleanup() {
  await prisma.leaguePlayer.deleteMany({ where: { player: { id: { startsWith: P } } } })
  await prisma.player.deleteMany({ where: { id: { startsWith: P } } })
  await prisma.leagueClan.deleteMany({
    where: { league: { slug: { in: [INDEP_SLUG, OFFICIAL_SLUG] } } },
  })
  await prisma.league.deleteMany({ where: { slug: { in: [INDEP_SLUG, OFFICIAL_SLUG] } } })
  await prisma.clan.deleteMany({ where: { slug: { startsWith: CLAN_PREFIX } } })
}

beforeAll(async () => {
  if (!up) return
  await cleanup()

  const indep = await prisma.league.create({
    data: { slug: INDEP_SLUG, name: '무소속리그(테스트)', category: 'independent', divisionCount: 5 },
  })
  await prisma.league.create({
    data: { slug: OFFICIAL_SLUG, name: '공식리그(테스트)', category: 'official', divisionCount: 2, official: true },
  })
  indepLeagueId = indep.id

  // 등록 대상 클랜은 **아직 어느 리그에도 넣지 않는다.** 등록이 하는 일을 그대로 보기 위해서다
  await prisma.clan.createMany({
    data: [
      { slug: `${CLAN_PREFIX}a`, name: `${P}가클랜` },
      { slug: `${CLAN_PREFIX}b`, name: `${P}나클랜` },
      { slug: `${CLAN_PREFIX}c`, name: `${P}다클랜` },
    ],
  })
})

afterAll(async () => {
  if (!up) return
  await cleanup()
})

describe.runIf(up)('무소속리그 만들기 (D-165)', () => {
  it('재실행해도 리그가 하나뿐이다', async () => {
    const first = await ensureIndependentLeague()
    const second = await ensureIndependentLeague()

    expect(second.created, '두 번째 실행은 만들지 않는다').toBe(false)
    expect(second.league.id).toBe(first.league.id)

    const count = await prisma.league.count({ where: { slug: INDEPENDENT_LEAGUE_SLUG } })
    expect(count).toBe(1)
  })

  it('구조값이 정해진 대로다 — 무소속 · 5티어 · 공개 origin', async () => {
    const { league } = await ensureIndependentLeague()
    expect(league.slug).toBe('nolink')
    expect(league.category).toBe('independent')
    expect(league.divisionCount).toBe(INDEPENDENT_TIER_COUNT)
    // mock 은 공개 화면에서 통째로 걸러진다 (D-116)
    expect(league.origin).not.toBe('mock')
  })

  it('dry-run 은 쓰지 않는다', async () => {
    const before = await prisma.league.findUnique({
      where: { slug: INDEPENDENT_LEAGUE_SLUG },
      select: { updatedAt: true, name: true },
    })
    await ensureIndependentLeague({ dryRun: true })
    const after = await prisma.league.findUnique({
      where: { slug: INDEPENDENT_LEAGUE_SLUG },
      select: { updatedAt: true, name: true },
    })
    expect(after?.name).toBe(before?.name)
  })
})

describe.runIf(up)('티어 등록 (D-165)', () => {
  it('등록하면 LeagueClan.division 과 Clan.tier 가 **둘 다** 그 티어다', async () => {
    const result = await registerClanTier({
      leagueSlug: INDEP_SLUG,
      clanSlug: `${CLAN_PREFIX}a`,
      tier: 3,
    })
    expect(result.ok).toBe(true)
    expect(result.created).toBe(true)

    const clan = await prisma.clan.findUniqueOrThrow({
      where: { slug: `${CLAN_PREFIX}a` },
      select: { id: true, category: true, tier: true },
    })
    expect(clan.category).toBe('independent')
    expect(clan.tier).toBe(3)

    const leagueClan = await prisma.leagueClan.findUniqueOrThrow({
      where: { leagueId_clanId: { leagueId: indepLeagueId, clanId: clan.id } },
      select: { division: true },
    })
    expect(leagueClan.division, '티어는 division 그대로다 — 새 축이 아니다').toBe(3)
  })

  it('티어를 옮기면 두 값이 같이 움직인다', async () => {
    const moved = await registerClanTier({
      leagueSlug: INDEP_SLUG,
      clanSlug: `${CLAN_PREFIX}a`,
      tier: 1,
    })
    expect(moved.ok).toBe(true)
    expect(moved.created, '이미 있던 클랜은 새로 등록하지 않는다').toBe(false)
    expect(moved.fromTier).toBe(3)

    const clan = await prisma.clan.findUniqueOrThrow({
      where: { slug: `${CLAN_PREFIX}a` },
      select: { id: true, tier: true },
    })
    expect(clan.tier).toBe(1)
    const leagueClan = await prisma.leagueClan.findUniqueOrThrow({
      where: { leagueId_clanId: { leagueId: indepLeagueId, clanId: clan.id } },
      select: { division: true },
    })
    expect(leagueClan.division).toBe(1)
  })

  it('티어 이동은 성적을 건드리지 않는다', async () => {
    const clan = await prisma.clan.findUniqueOrThrow({ where: { slug: `${CLAN_PREFIX}a` } })
    await prisma.leagueClan.update({
      where: { leagueId_clanId: { leagueId: indepLeagueId, clanId: clan.id } },
      data: { rating: 3210, win: 12, lose: 4, placement: false },
    })

    await registerClanTier({ leagueSlug: INDEP_SLUG, clanSlug: `${CLAN_PREFIX}a`, tier: 2 })

    const after = await prisma.leagueClan.findUniqueOrThrow({
      where: { leagueId_clanId: { leagueId: indepLeagueId, clanId: clan.id } },
      select: { rating: true, win: true, lose: true, placement: true, division: true },
    })
    expect(after).toMatchObject({ rating: 3210, win: 12, lose: 4, placement: false, division: 2 })
  })

  it('범위 밖 티어와 공식리그는 거절한다', async () => {
    const tooHigh = await registerClanTier({
      leagueSlug: INDEP_SLUG,
      clanSlug: `${CLAN_PREFIX}b`,
      tier: 6,
    })
    expect(tooHigh.ok).toBe(false)
    expect(tooHigh.reason).toBe('tierOutOfRange')

    const zero = await registerClanTier({
      leagueSlug: INDEP_SLUG,
      clanSlug: `${CLAN_PREFIX}b`,
      tier: 0,
    })
    expect(zero.reason).toBe('tierOutOfRange')

    // 공식리그에는 티어를 넣지 않는다. 여기서 Clan.tier 를 쓰면 공식리그가 오염된다
    const official = await registerClanTier({
      leagueSlug: OFFICIAL_SLUG,
      clanSlug: `${CLAN_PREFIX}b`,
      tier: 1,
    })
    expect(official.ok).toBe(false)
    expect(official.reason).toBe('notIndependentLeague')

    const missing = await registerClanTier({
      leagueSlug: INDEP_SLUG,
      clanSlug: 'no-such-clan-t161',
      tier: 1,
    })
    expect(missing.reason).toBe('clanNotFound')
  })

  it('추방된 클랜은 다시 넣지 않는다 (되돌릴 수 없다)', async () => {
    await registerClanTier({ leagueSlug: INDEP_SLUG, clanSlug: `${CLAN_PREFIX}c`, tier: 5 })
    const clan = await prisma.clan.findUniqueOrThrow({ where: { slug: `${CLAN_PREFIX}c` } })
    await prisma.leagueClan.update({
      where: { leagueId_clanId: { leagueId: indepLeagueId, clanId: clan.id } },
      data: { expelledAt: new Date() },
    })

    const again = await registerClanTier({
      leagueSlug: INDEP_SLUG,
      clanSlug: `${CLAN_PREFIX}c`,
      tier: 1,
    })
    expect(again.ok).toBe(false)
    expect(again.reason).toBe('expelled')

    await prisma.leagueClan.update({
      where: { leagueId_clanId: { leagueId: indepLeagueId, clanId: clan.id } },
      data: { expelledAt: null },
    })
  })

  it('dry-run 은 쓰지 않는다', async () => {
    const before = await prisma.clan.findUniqueOrThrow({
      where: { slug: `${CLAN_PREFIX}a` },
      select: { tier: true },
    })
    const preview = await registerClanTier({
      leagueSlug: INDEP_SLUG,
      clanSlug: `${CLAN_PREFIX}a`,
      tier: 5,
      dryRun: true,
    })
    expect(preview.ok).toBe(true)
    const after = await prisma.clan.findUniqueOrThrow({
      where: { slug: `${CLAN_PREFIX}a` },
      select: { tier: true },
    })
    expect(after.tier).toBe(before.tier)
  })

  it('어긋난 Clan.tier 를 division 기준으로 되맞춘다', async () => {
    const clan = await prisma.clan.findUniqueOrThrow({ where: { slug: `${CLAN_PREFIX}a` } })
    await prisma.clan.update({ where: { id: clan.id }, data: { tier: 4 } })

    const preview = await syncIndependentTiers({ leagueSlug: INDEP_SLUG, dryRun: true })
    expect(preview.fixed.some((row) => row.clanSlug === `${CLAN_PREFIX}a`)).toBe(true)
    expect(
      (await prisma.clan.findUniqueOrThrow({ where: { id: clan.id } })).tier,
      'dry-run 은 고치지 않는다',
    ).toBe(4)

    const applied = await syncIndependentTiers({ leagueSlug: INDEP_SLUG })
    expect(applied.fixed.length).toBeGreaterThan(0)
    expect((await prisma.clan.findUniqueOrThrow({ where: { id: clan.id } })).tier).toBe(2)

    const again = await syncIndependentTiers({ leagueSlug: INDEP_SLUG })
    expect(again.fixed.length, '두 번째 실행은 고칠 것이 없다').toBe(0)
  })
})

describe.runIf(up)('티어가 클랜랭킹으로 이어진다 (D-165)', () => {
  beforeAll(async () => {
    if (!up) return
    // 2티어 두 클랜 · 5티어 한 클랜. 배치고사는 끝난 것으로 둔다(랭킹 노출 조건)
    await registerClanTier({ leagueSlug: INDEP_SLUG, clanSlug: `${CLAN_PREFIX}a`, tier: 2 })
    await registerClanTier({ leagueSlug: INDEP_SLUG, clanSlug: `${CLAN_PREFIX}b`, tier: 2 })
    await registerClanTier({ leagueSlug: INDEP_SLUG, clanSlug: `${CLAN_PREFIX}c`, tier: 5 })

    const clans = await prisma.clan.findMany({ where: { slug: { startsWith: CLAN_PREFIX } } })
    const bySlug = new Map(clans.map((clan) => [clan.slug, clan.id]))
    const ratings: Record<string, number> = {
      [`${CLAN_PREFIX}a`]: 3100,
      [`${CLAN_PREFIX}b`]: 3300,
      // 5티어인데 점수는 가장 높다 — 그래도 티어는 안 올라간다
      [`${CLAN_PREFIX}c`]: 3900,
    }
    for (const [slug, rating] of Object.entries(ratings)) {
      await prisma.leagueClan.update({
        where: { leagueId_clanId: { leagueId: indepLeagueId, clanId: bySlug.get(slug) ?? '' } },
        data: { rating, placement: false },
      })
    }
  })

  it('클랜랭킹 탭은 division = 티어로 나뉜다', async () => {
    const tier2 = await getClanRanks(indepLeagueId, 2, null, 20)
    expect(tier2?.items.map((row) => row.clan.slug).sort()).toEqual([
      `${CLAN_PREFIX}a`,
      `${CLAN_PREFIX}b`,
    ])

    const tier5 = await getClanRanks(indepLeagueId, 5, null, 20)
    expect(tier5?.items.map((row) => row.clan.slug)).toEqual([`${CLAN_PREFIX}c`])

    // 등록하지 않은 티어는 비어 있다 (칸은 있고 내용이 없다)
    const tier4 = await getClanRanks(indepLeagueId, 4, null, 20)
    expect(tier4?.items).toEqual([])
  })

  it('티어 안 순위는 점수 순이고, 티어는 점수로 바뀌지 않는다 (D-104 ①)', async () => {
    const tier2 = await getClanRanks(indepLeagueId, 2, null, 20)
    expect(tier2?.items[0]?.clan.slug, '2티어 1위는 점수가 높은 쪽').toBe(`${CLAN_PREFIX}b`)

    // 전체 무소속 래더는 티어를 무시한다 — 5티어가 1위일 수 있다 (D-104 ②)
    const ladder = await getIndependentLadder(indepLeagueId)
    expect(ladder[0]?.clan.slug).toBe(`${CLAN_PREFIX}c`)
    expect(ladder[0]?.tier, '그래도 티어는 5 그대로다').toBe(5)
  })

  it('D-104 티어 질의와 division 질의가 같은 답을 낸다', async () => {
    const viaDivision = await getClanRanks(indepLeagueId, 2, null, 20)
    const viaTier = await getTierLadder(indepLeagueId, 2)
    expect(viaTier.map((row) => row.clan.slug).sort()).toEqual(
      (viaDivision?.items ?? []).map((row) => row.clan.slug).sort(),
    )
    expect(await getIndependentTiers(indepLeagueId)).toEqual([2, 5])
  })
})

describe.runIf(up)('무소속리그 표기·공개 범위 (D-107 · D-165)', () => {
  it('리그 요약이 구분을 알려 준다 — 화면이 티어 표기를 고를 수 있게', () => {
    const indep = toLeagueSummary({
      id: 'x',
      slug: INDEP_SLUG,
      name: '무소속리그',
      official: false,
      divisionCount: 5,
      category: 'independent',
    })
    expect(indep.category).toBe('independent')
    expect(indep.hides_cumulative_kd).toBe(true)

    const official = toLeagueSummary({
      id: 'y',
      slug: OFFICIAL_SLUG,
      name: '공식리그',
      official: true,
      divisionCount: 2,
      category: 'official',
    })
    expect(official.category).toBe('official')
    expect(official.hides_cumulative_kd).toBe(false)
  })

  it('개인랭킹은 정상으로 나오되 누적 킬뎃만 비어 있다 (D-107 그대로)', async () => {
    const clan = await prisma.clan.findUniqueOrThrow({ where: { slug: `${CLAN_PREFIX}a` } })
    const player = await prisma.player.create({
      data: { id: `${P}선수`, name: `${P}선수`, clanId: clan.id },
    })
    await prisma.leaguePlayer.create({
      data: {
        leagueId: indepLeagueId,
        playerId: player.id,
        clanId: clan.id,
        placement: false,
        rating: 3100,
        baseRating: 3100,
        win: 9,
        lose: 1,
        kill: 120,
        death: 80,
      },
    })

    const ranks = await getPlayerRanks(indepLeagueId, null, 20)
    const row = ranks?.items.find((entry) => entry.player.id === player.id)
    expect(row, '무소속리그에도 개인 랭킹이 있다').toBeDefined()
    expect(row?.win).toBe(9)
    expect(row?.rating).toBe(3100)
    expect(row?.kd_rate, '누적 킬뎃만 감춘다 — 0이 아니라 null 이다').toBeNull()
  })
})
