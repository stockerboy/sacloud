/**
 * 클랜랭킹 모집단 회귀 테스트.
 *
 * 고정하려는 약속은 두 가지다.
 *
 *   1. **배치고사가 끝난 클랜만** 랭킹에 나온다 (CLAUDE.md 6장 · 원본 안내 문구).
 *      배치고사 중인 클랜은 목록에도 분모에도 들어가지 않는다.
 *   2. **세는 집합과 보여 주는 집합이 같다** (D-147 과 같은 이유).
 *      목록은 `clan.active` 로 비활성 클랜을 빼는데 순위·분모를 세는 쪽이 빼지 않으면,
 *      목록에 없는 클랜이 순위 번호와 `rankCount` 에만 더해져 "1위인데 rank=2",
 *      "3 / 7 위인데 목록은 6개" 같은 어긋남이 생긴다.
 *
 * 실제 DB에 임시 리그를 만들고 **실제 조회 함수**를 돌린다.
 * where 절을 눈으로 읽는 것으로는 두 집합이 같은지 증명되지 않기 때문이다.
 *
 * 만든 데이터는 전부 `T151-` 접두사이고 끝나면 지운다.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@sacloud/db'
import { getClanRanks, clanRankOf, getPlayerRanks } from '../lib/server/queries/leagues'

const P = 'T151-'
const LEAGUE_SLUG = 't151rank'

/** DB 가용 여부는 **수집 시점에** 정해야 한다. beforeAll 뒤에 정하면 runIf가 이미 지나간다 */
async function dbUp(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`
    return true
  } catch {
    return false
  }
}

const up = await dbUp()

let ids: {
  leagueId: string
  /** 1부 · 배치완료 · 활성 — 래더 높은 순 */
  top: string
  middle: string
  bottom: string
  /** 1부 · 배치완료 · **비활성** — 래더가 top 보다 높다 */
  inactiveHigh: string
  /** 1부 · 배치고사 중 — 래더가 top 보다 높다 */
  placing: string
} | null = null

async function cleanup() {
  await prisma.leaguePlayer.deleteMany({ where: { player: { id: { startsWith: P } } } })
  await prisma.leagueClan.deleteMany({ where: { league: { slug: LEAGUE_SLUG } } })
  await prisma.league.deleteMany({ where: { slug: LEAGUE_SLUG } })
  await prisma.player.deleteMany({ where: { id: { startsWith: P } } })
  await prisma.clan.deleteMany({ where: { slug: { startsWith: P.toLowerCase() } } })
}

beforeAll(async () => {
  if (!up) return
  await cleanup()

  /* `origin: 'mock'` 으로 만든다. 이 테스트는 실제 개발 DB 를 쓰고 vitest 는 파일을
     병렬로 돌리므로, 공개 목록(`listLeagues`)을 보는 다른 테스트 파일이 이 임시 리그를
     만드는 중·지우는 중에 볼 수 있다. `mock` 은 공개 경로에서 통째로 빠진다 (D-116).
     랭킹 조회 함수는 origin 을 보지 않으므로 이 테스트에는 영향이 없다. */
  const league = await prisma.league.create({
    data: {
      slug: LEAGUE_SLUG,
      name: '랭킹모집단테스트',
      category: 'official',
      official: true,
      divisionCount: 2,
      origin: 'mock',
    },
  })

  /** 래더만 다르고 나머지는 같은 참가 클랜을 만든다 */
  async function join(key: string, rating: number, opts: { active?: boolean; placement?: boolean } = {}) {
    const clan = await prisma.clan.create({
      data: { slug: `${P.toLowerCase()}${key}`, name: `${P}${key}`, active: opts.active ?? true },
    })
    return prisma.leagueClan.create({
      data: {
        leagueId: league.id,
        clanId: clan.id,
        division: 1,
        rating,
        placement: opts.placement ?? false,
        win: 1,
        lose: 0,
      },
    })
  }

  // 비활성·배치중 클랜을 **가장 높은 래더**로 둔다. 잘못 세면 반드시 앞자리를 밀어낸다
  const inactiveHigh = await join('inactive', 3300, { active: false })
  const placing = await join('placing', 3200, { placement: true })
  const top = await join('top', 3100)
  const middle = await join('middle', 3050)
  const bottom = await join('bottom', 3000)

  /* 개인 랭킹 모집단도 같이 고정한다.
     가장 래더가 높은 선수를 **무소속(clanId = null)** 으로, 그다음을 비활성 클랜 소속으로 둔다.
     순위를 세는 쪽에 클랜 조건이 끼어들면 이 둘이 빠져 순위가 1부터 시작하지 않는다. */
  async function joinPlayer(key: string, rating: number, clanId: string | null) {
    const player = await prisma.player.create({ data: { id: `${P}${key}`, name: `${P}${key}` } })
    await prisma.leaguePlayer.create({
      data: {
        leagueId: league.id,
        playerId: player.id,
        clanId,
        rating,
        baseRating: rating,
        placement: false,
      },
    })
  }
  await joinPlayer('무소속에이스', 3300, null)
  await joinPlayer('비활성소속', 3200, inactiveHigh.clanId)
  await joinPlayer('활성소속', 3100, top.clanId)

  ids = {
    leagueId: league.id,
    top: top.id,
    middle: middle.id,
    bottom: bottom.id,
    inactiveHigh: inactiveHigh.id,
    placing: placing.id,
  }
})

afterAll(async () => {
  if (!up) return
  await cleanup()
})

describe.runIf(up)('클랜랭킹 모집단', () => {
  it('배치고사 중인 클랜과 비활성 클랜은 목록에 나오지 않는다', async () => {
    const page = await getClanRanks(ids!.leagueId, 1, null, 20)
    expect(page).not.toBeNull()
    expect(page!.items.map((row) => row.league_clan_id)).toEqual([ids!.top, ids!.middle, ids!.bottom])
  })

  it('순위 번호는 목록과 같은 집합으로 센다 — 1위는 1이다', async () => {
    const page = await getClanRanks(ids!.leagueId, 1, null, 20)
    // 래더가 더 높은 비활성·배치중 클랜이 앞자리를 밀어내면 여기서 2, 3 이 된다
    expect(page!.items.map((row) => row.rank)).toEqual([1, 2, 3])
  })

  it('커서로 이어 받아도 순위가 이어진다', async () => {
    const first = await getClanRanks(ids!.leagueId, 1, null, 1)
    expect(first!.items.map((row) => row.rank)).toEqual([1])
    const next = await getClanRanks(ids!.leagueId, 1, first!.cursor.next, 1)
    expect(next!.items.map((row) => row.rank)).toEqual([2])
    expect(next!.items[0]!.league_clan_id).toBe(ids!.middle)
  })

  it('rankCount 분모는 목록 길이와 같다', async () => {
    const page = await getClanRanks(ids!.leagueId, 1, null, 20)
    const middle = await clanRankOf({
      id: ids!.middle,
      leagueId: ids!.leagueId,
      division: 1,
      rating: 3050,
      placement: false,
    })
    expect(middle.rankCount).toBe(page!.items.length)
    expect(middle.rank).toBe(2)
  })

  /* 클랜 조건을 개인 랭킹까지 끌고 가면 안 된다 (D-107).
     리그 안의 선수는 무소속이든 비활성 클랜 소속이든 **전원** 랭킹에 들어간다. */
  it('개인 랭킹은 클랜으로 거르지 않는다 — 무소속 선수가 1위로 나온다', async () => {
    const page = await getPlayerRanks(ids!.leagueId, null, 20)
    expect(page!.items.map((row) => row.player.name)).toEqual([
      `${P}무소속에이스`,
      `${P}비활성소속`,
      `${P}활성소속`,
    ])
    // 세는 쪽에 클랜 조건이 끼면 앞의 둘이 빠져 여기가 1부터 시작하지 않는다
    expect(page!.items.map((row) => row.rank)).toEqual([1, 2, 3])
  })

  it('배치고사 중인 클랜은 순위가 없다 (null)', async () => {
    const placing = await clanRankOf({
      id: ids!.placing,
      leagueId: ids!.leagueId,
      division: 1,
      rating: 3200,
      placement: true,
    })
    expect(placing.rank).toBeNull()
    expect(placing.rankCount).toBeNull()
  })
})
