/**
 * 무소속리그 개인 기록 회귀 테스트 (D-107 · 정책 18장).
 *
 * 실제 DB에 임시 리그 두 개(공식 · 무소속)를 만들고 **실제 조회 함수**를 돌린다.
 * 순수 함수 테스트로는 "두 리그가 정말 안 섞이는가"를 증명할 수 없기 때문이다.
 *
 * 여기서 고정하는 약속
 *   1. 무소속리그에도 개인 기록·개인 랭킹·시즌 카드·최근 경기가 **존재한다**
 *   2. 같은 선수라도 리그가 다르면 **다른 그릇**이다. 한쪽 결과가 다른 쪽에 닿지 않는다
 *   3. 감추는 것은 **누적** kill·death·킬뎃 하나뿐이다
 *   4. **경기 한 판의 K/D/A는 감추지 않는다**
 *
 * 만든 데이터는 전부 `T107-` 접두사이고 끝나면 지운다.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@sacloud/db'
import { getPlayerLeagues } from '../lib/server/queries/players'
import { getPlayerRanks } from '../lib/server/queries/leagues'
import { getLeaguePlayerDetail, getLeaguePlayerSeasons } from '../lib/server/queries/records'
import { getLeaguePlayerMatches, getMatch } from '../lib/server/queries/matches'
import {
  cumulativeKd,
  cumulativeKdRate,
  hidesCumulativeKd,
  hidesCumulativeKdAll,
} from '../lib/server/queries/visibility'

const P = 'T107-'
const OFFICIAL_SLUG = 't107official'
const INDEPENDENT_SLUG = 't107indep'
const MATCH_ID = '990823000000000001'
const MERC_MATCH_ID = '990823000000000002'

/** 정책 1장의 예시 숫자를 그대로 쓴다 — 길수: 무소속 100전(89승 11패) / 공식 238전(149승 89패) */
const INDEP = { win: 89, lose: 11, kill: 900, death: 400, rating: 1742 }
const OFFICIAL = { win: 149, lose: 89, kill: 1420, death: 1160, rating: 1625 }

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
  playerId: string
  mateId: string
  indepLeaguePlayerId: string
  officialLeaguePlayerId: string
  indepLeagueId: string
  officialLeagueId: string
} | null = null

async function cleanup() {
  await prisma.matchPlayerStat.deleteMany({ where: { matchId: { in: [MATCH_ID, MERC_MATCH_ID] } } })
  await prisma.match.deleteMany({ where: { id: { in: [MATCH_ID, MERC_MATCH_ID] } } })
  await prisma.leaguePlayerSeason.deleteMany({ where: { leaguePlayer: { player: { id: { startsWith: P } } } } })
  await prisma.leaguePlayer.deleteMany({ where: { player: { id: { startsWith: P } } } })
  await prisma.season.deleteMany({ where: { league: { slug: { in: [OFFICIAL_SLUG, INDEPENDENT_SLUG] } } } })
  await prisma.leagueClan.deleteMany({ where: { league: { slug: { in: [OFFICIAL_SLUG, INDEPENDENT_SLUG] } } } })
  await prisma.league.deleteMany({ where: { slug: { in: [OFFICIAL_SLUG, INDEPENDENT_SLUG] } } })
  await prisma.clan.deleteMany({ where: { slug: { startsWith: P.toLowerCase() } } })
  await prisma.player.deleteMany({ where: { id: { startsWith: P } } })
  await prisma.gameMap.deleteMany({ where: { name: `${P}맵` } })
}

beforeAll(async () => {
  if (!up) return
  await cleanup()

  const map = await prisma.gameMap.create({ data: { name: `${P}맵` } })
  const [indepClanA, indepClanB, officialClan] = await Promise.all([
    prisma.clan.create({ data: { slug: `${P.toLowerCase()}ia`, name: `${P}무소속A`, category: 'independent', tier: 1 } }),
    prisma.clan.create({ data: { slug: `${P.toLowerCase()}ib`, name: `${P}무소속B`, category: 'independent', tier: 2 } }),
    prisma.clan.create({ data: { slug: `${P.toLowerCase()}oa`, name: `${P}공식A`, category: 'official' } }),
  ])

  const indepLeague = await prisma.league.create({
    data: {
      slug: INDEPENDENT_SLUG,
      name: '무소속리그',
      category: 'independent',
      maps: { create: [{ mapId: map.id }] },
      playerLimits: { create: [{ playerCount: 5 }] },
    },
  })
  const officialLeague = await prisma.league.create({
    data: {
      slug: OFFICIAL_SLUG,
      name: '공식리그',
      category: 'official',
      official: true,
      maps: { create: [{ mapId: map.id }] },
      playerLimits: { create: [{ playerCount: 5 }] },
    },
  })

  const [lcIndepA, lcIndepB, lcOfficial] = await Promise.all([
    prisma.leagueClan.create({ data: { leagueId: indepLeague.id, clanId: indepClanA.id, division: 1, placement: false } }),
    prisma.leagueClan.create({ data: { leagueId: indepLeague.id, clanId: indepClanB.id, division: 1, placement: false } }),
    prisma.leagueClan.create({ data: { leagueId: officialLeague.id, clanId: officialClan.id, division: 1, placement: false } }),
  ])

  const player = await prisma.player.create({ data: { id: `${P}길수`, name: `${P}길수`, clanId: indepClanA.id } })
  const mate = await prisma.player.create({ data: { id: `${P}동료`, name: `${P}동료`, clanId: indepClanB.id } })

  const indepLp = await prisma.leaguePlayer.create({
    data: {
      leagueId: indepLeague.id,
      playerId: player.id,
      clanId: indepClanA.id,
      placement: false,
      rating: INDEP.rating,
      baseRating: INDEP.rating,
      win: INDEP.win,
      lose: INDEP.lose,
      kill: INDEP.kill,
      death: INDEP.death,
      mvpCount: 17,
    },
  })
  const officialLp = await prisma.leaguePlayer.create({
    data: {
      leagueId: officialLeague.id,
      playerId: player.id,
      clanId: officialClan.id,
      placement: false,
      rating: OFFICIAL.rating,
      baseRating: OFFICIAL.rating,
      win: OFFICIAL.win,
      lose: OFFICIAL.lose,
      kill: OFFICIAL.kill,
      death: OFFICIAL.death,
      mvpCount: 29,
    },
  })
  // 무소속리그 개인랭킹이 한 명짜리가 되지 않게 상대 클랜 선수도 넣는다
  await prisma.leaguePlayer.create({
    data: {
      leagueId: indepLeague.id,
      playerId: mate.id,
      clanId: indepClanB.id,
      placement: false,
      rating: 1500,
      baseRating: 1500,
      win: 10,
      lose: 20,
      kill: 100,
      death: 200,
    },
  })

  const [indepSeason, officialSeason] = await Promise.all([
    prisma.season.create({
      data: { leagueId: indepLeague.id, number: 1, startedAt: new Date('2026-01-01'), status: 'closed' },
    }),
    prisma.season.create({
      data: { leagueId: officialLeague.id, number: 1, startedAt: new Date('2026-01-01'), status: 'closed' },
    }),
  ])
  await prisma.leaguePlayerSeason.createMany({
    data: [
      {
        leaguePlayerId: indepLp.id,
        seasonId: indepSeason.id,
        season: 1,
        rating: INDEP.rating,
        win: INDEP.win,
        lose: INDEP.lose,
        kill: INDEP.kill,
        death: INDEP.death,
      },
      {
        leaguePlayerId: officialLp.id,
        seasonId: officialSeason.id,
        season: 1,
        rating: OFFICIAL.rating,
        win: OFFICIAL.win,
        lose: OFFICIAL.lose,
        kill: OFFICIAL.kill,
        death: OFFICIAL.death,
      },
    ],
  })

  // 무소속리그 실제 경기 한 판 — 경기별 K/D/A는 숨기지 않는다
  await prisma.match.create({
    data: {
      id: MATCH_ID,
      leagueId: indepLeague.id,
      seasonId: indepSeason.id,
      mapId: map.id,
      playerCount: 5,
      startAt: new Date('2026-08-20T12:00:00Z'),
      winnerSide: 'red',
      redLeagueClanId: lcIndepA.id,
      blueLeagueClanId: lcIndepB.id,
      redDivisionAtMatch: 1,
      blueDivisionAtMatch: 1,
      official: true,
      origin: 'sacloud',
      /* **래더에 반영된 경기**여야 개인 상세의 누적에 들어간다 (D-164 · D-176).
         예전에는 이 값이 비어 있어 경기가 있는데도 최근매치 요약이 `0전` 이었다 */
      redRatingUpdate: 12,
      blueRatingUpdate: -12,
      stats: {
        create: [
          {
            playerId: player.id,
            side: 'red',
            kill: 23,
            death: 7,
            assist: 3,
            mvp: true,
            ratingUpdate: 12,
            playerDivisionAtMatch: 1,
            opponentDivisionAtMatch: 1,
          },
          {
            playerId: mate.id,
            side: 'blue',
            kill: 15,
            death: 13,
            assist: 5,
            playerDivisionAtMatch: 1,
            opponentDivisionAtMatch: 1,
          },
        ],
      },
    },
  })

  /* 무소속 클랜 소속인 길수가 **공식리그에 용병으로** 뛴 경기.
     이 경기는 공식리그 기록이고, 무소속리그 기록에는 닿으면 안 된다 (D-107 11장) */
  const officialClanB = await prisma.clan.create({
    data: { slug: `${P.toLowerCase()}ob`, name: `${P}공식B`, category: 'official' },
  })
  const lcOfficialB = await prisma.leagueClan.create({
    data: { leagueId: officialLeague.id, clanId: officialClanB.id, division: 1, placement: false },
  })
  await prisma.match.create({
    data: {
      id: MERC_MATCH_ID,
      leagueId: officialLeague.id,
      seasonId: officialSeason.id,
      mapId: map.id,
      playerCount: 5,
      startAt: new Date('2026-08-21T12:00:00Z'),
      winnerSide: 'red',
      redLeagueClanId: lcOfficial.id,
      blueLeagueClanId: lcOfficialB.id,
      redDivisionAtMatch: 1,
      blueDivisionAtMatch: 1,
      official: true,
      origin: 'sacloud',
      // 래더 경기 (D-164 · D-176) — 위 무소속 경기와 같은 이유다
      redRatingUpdate: 9,
      blueRatingUpdate: -9,
      stats: {
        create: [
          {
            playerId: player.id,
            side: 'red',
            kill: 30,
            death: 5,
            assist: 2,
            ratingUpdate: 9,
            playerDivisionAtMatch: 1,
            opponentDivisionAtMatch: 1,
          },
        ],
      },
    },
  })

  ids = {
    playerId: player.id,
    mateId: mate.id,
    indepLeaguePlayerId: indepLp.id,
    officialLeaguePlayerId: officialLp.id,
    indepLeagueId: indepLeague.id,
    officialLeagueId: officialLeague.id,
  }
})

afterAll(async () => {
  if (up) await cleanup()
})

describe('공개 범위 규칙 (순수)', () => {
  /* 2026-09-02 — 규칙이 바뀌었다 (사용자 지시).
     옛 규칙(D-107): 무소속리그는 누적 킬뎃을 **전원** 감춘다.
     지금 규칙: **개인랭킹 top100 까지는 보인다.** 그 밖만 감춘다.
     옛 규칙 함수는 hidesCumulativeKdAll 로 남아 있고 아래에서 같이 고정한다 */

  it('무소속리그라도 top100 안이면 감추지 않는다', () => {
    expect(hidesCumulativeKd({ category: 'independent' }, 1)).toBe(false)
    expect(hidesCumulativeKd({ category: 'independent' }, 100)).toBe(false)
    expect(hidesCumulativeKd({ category: 'independent' }, 101)).toBe(true)
  })

  it('순위를 모르면 감춘다 — 없는 값을 보여 주지 않는다', () => {
    expect(hidesCumulativeKd({ category: 'independent' }, null)).toBe(true)
  })

  it('공식리그는 순위와 무관하게 안 감춘다', () => {
    expect(hidesCumulativeKd({ category: 'official' }, null)).toBe(false)
    expect(hidesCumulativeKd({ category: 'official' }, 9999)).toBe(false)
    expect(hidesCumulativeKd(null, null)).toBe(false)
  })

  it('옛 규칙(전원 감춤)은 지우지 않았다 — 되돌릴 길이다', () => {
    expect(hidesCumulativeKdAll({ category: 'independent' })).toBe(true)
    expect(hidesCumulativeKdAll({ category: 'official' })).toBe(false)
  })

  it('감출 때는 0이 아니라 null이다 (0킬은 사실이 아니다)', () => {
    const hidden = cumulativeKd(
      { category: 'independent' },
      { kill: 900, death: 400, kdRate: 69.2 },
      101,
    )
    expect(hidden).toEqual({ kill: null, death: null, kd_rate: null })
    expect(cumulativeKdRate({ category: 'independent' }, 69.2, 101)).toBeNull()
  })

  it('top100 안의 무소속 선수는 값이 그대로 나간다', () => {
    expect(
      cumulativeKd({ category: 'independent' }, { kill: 900, death: 400, kdRate: 69.2 }, 7),
    ).toEqual({ kill: 900, death: 400, kd_rate: 69.2 })
    expect(cumulativeKdRate({ category: 'independent' }, 69.2, 7)).toBe(69.2)
  })

  it('공식리그는 그대로 내보낸다', () => {
    expect(
      cumulativeKd({ category: 'official' }, { kill: 1420, death: 1160, kdRate: 55 }, null),
    ).toEqual({
      kill: 1420,
      death: 1160,
      kd_rate: 55,
    })
  })
})

describe.runIf(up)('리그별 개인 기록 분리', () => {
  it('같은 선수가 리그마다 독립된 승패를 가진다', async () => {
    const cards = await getPlayerLeagues(ids!.playerId)
    const indep = cards.find((card) => card.league.slug === INDEPENDENT_SLUG)
    const official = cards.find((card) => card.league.slug === OFFICIAL_SLUG)

    expect(indep?.win).toBe(INDEP.win)
    expect(indep?.lose).toBe(INDEP.lose)
    expect(official?.win).toBe(OFFICIAL.win)
    expect(official?.lose).toBe(OFFICIAL.lose)
  })

  it('참여중인 리그에 공식·무소속 카드가 동시에 나온다', async () => {
    const cards = await getPlayerLeagues(ids!.playerId)
    const slugs = cards.map((card) => card.league.slug)

    expect(slugs).toContain(INDEPENDENT_SLUG)
    expect(slugs).toContain(OFFICIAL_SLUG)
  })

  it('무소속 카드라도 top100 안이면 누적 킬뎃이 보인다 (2026-09-02 규칙)', async () => {
    /* 픽스처의 이 선수는 무소속리그에서 **1~2위**다. 옛 규칙이라면 감췄을 자리인데
       지금 규칙은 top100 까지 보여 준다. 100위 밖 동작은 순수 함수 쪽에서 고정한다 —
       DB 픽스처에 선수 101명을 만들 이유가 없다 */
    const cards = await getPlayerLeagues(ids!.playerId)
    const indep = cards.find((card) => card.league.slug === INDEPENDENT_SLUG)!

    expect(indep.rank).not.toBeNull()
    expect(indep.rank!).toBeLessThanOrEqual(100)
    expect(indep.kill).not.toBeNull()
    expect(indep.death).not.toBeNull()
    expect(indep.kd_rate).not.toBeNull()
    // 감추지 않는 것들은 그대로다
    expect(indep.rating).toBe(INDEP.rating)
    expect(indep.win_rate).toBeCloseTo(89, 0)
    /* 리그 깃발은 그대로 켜져 있다 — 「이 리그는 누적 킬뎃에 제한이 있다」는 뜻이고,
       화면은 이 값을 보고 「top100만 보인다」 문구를 적는다 */
    expect(indep.league.hides_cumulative_kd).toBe(true)
  })

  it('공식 카드에는 누적 킬·데스·킬뎃이 정상으로 나온다', async () => {
    const cards = await getPlayerLeagues(ids!.playerId)
    const official = cards.find((card) => card.league.slug === OFFICIAL_SLUG)!

    expect(official.kill).toBe(OFFICIAL.kill)
    expect(official.death).toBe(OFFICIAL.death)
    expect(official.kd_rate).not.toBeNull()
    expect(official.league.hides_cumulative_kd).toBe(false)
  })

  it('한 리그의 성적이 다른 리그 개인 기록에 섞이지 않는다', async () => {
    const cards = await getPlayerLeagues(ids!.playerId)
    const indep = cards.find((card) => card.league.slug === INDEPENDENT_SLUG)!
    const official = cards.find((card) => card.league.slug === OFFICIAL_SLUG)!

    expect(indep.rating).not.toBe(official.rating)
    expect(indep.win + indep.lose).toBe(100)
    expect(official.win + official.lose).toBe(238)
  })
})

/* 개인 상세의 누적은 **경기에서 그 자리에서 센다** (D-176).
   `LeaguePlayer` 의 누적 칸은 배치 집계가 시즌 창 안에서만 채우는 값이라,
   창 밖 경기를 뛴 선수가 `0승 0패 · 0킬 0데스 · MVP 0회` 로 보였다.
   그래서 아래 기대값은 픽스처의 누적 칸(`INDEP` · `OFFICIAL`)이 아니라
   **실제로 만들어 둔 래더 경기**에서 나온다. 래더 점수(`rating`)와 순위는 그대로 칸에서 온다. */
describe.runIf(up)('무소속 개인 기록 페이지', () => {
  it('개인 상세가 정상으로 만들어진다 (숨기는 리그가 아니다)', async () => {
    const detail = await getLeaguePlayerDetail(INDEPENDENT_SLUG, ids!.playerId)

    expect(detail).not.toBeNull()
    // 래더 점수와 순위는 레이팅 엔진이 채운 값이다
    expect(detail!.rating).toBe(INDEP.rating)
    expect(detail!.rank).not.toBeNull()
    // 승패·MVP 는 실제 경기에서 센다 — 무소속리그에 만들어 둔 래더 경기는 한 판(승)이다
    expect(detail!.win).toBe(1)
    expect(detail!.lose).toBe(0)
    expect(detail!.mvp_count).toBe(1)
  })

  it('상세정보 — top100 안이면 누적 킬뎃이 나온다 (2026-09-02 규칙)', async () => {
    const detail = await getLeaguePlayerDetail(INDEPENDENT_SLUG, ids!.playerId)

    expect(detail!.rank).not.toBeNull()
    expect(detail!.rank!).toBeLessThanOrEqual(100)
    expect(detail!.kill).not.toBeNull()
    expect(detail!.kd_rate).not.toBeNull()
    // 평균킬·MVP·어시스트는 예전부터 감추지 않았다
    expect(detail!.mvp_count).toBe(1)
    expect(detail!.assist).toBe(3)
    expect(detail!.kill_per_match).toBeGreaterThan(0)
  })

  it('공식리그 상세에는 누적 킬뎃이 그대로 있다', async () => {
    const detail = await getLeaguePlayerDetail(OFFICIAL_SLUG, ids!.playerId)

    // 용병으로 뛴 공식리그 경기 한 판 — 30킬 5데스
    expect(detail!.kill).toBe(30)
    expect(detail!.death).toBe(5)
    expect(detail!.kd_rate).toBe(85.7)
  })
})

describe.runIf(up)('무소속 개인랭킹', () => {
  it('무소속리그에도 개인랭킹이 만들어진다', async () => {
    const page = await getPlayerRanks(ids!.indepLeagueId, null, 20)

    expect(page).not.toBeNull()
    expect(page!.items.length).toBeGreaterThanOrEqual(2)
    expect(page!.items[0]?.rank).toBe(1)
  })

  it('무소속 개인랭킹 — top100 줄에는 누적 킬뎃이 나온다 (2026-09-02 규칙)', async () => {
    const page = await getPlayerRanks(ids!.indepLeagueId, null, 20)

    /* 이 픽스처의 목록은 전부 100위 안이다 */
    for (const row of page!.items) {
      expect(row.rank).toBeLessThanOrEqual(100)
      expect(row.kd_rate).not.toBeNull()
    }
    // 순위·승패·평균킬은 그대로 나온다
    expect(page!.items[0]?.win).toBeGreaterThan(0)
    expect(page!.items[0]?.kill_per_match).toBeGreaterThanOrEqual(0)
  })

  it('공식리그 개인랭킹에는 누적 킬뎃이 있다', async () => {
    const page = await getPlayerRanks(ids!.officialLeagueId, null, 20)

    expect(page!.items[0]?.kd_rate).not.toBeNull()
  })

  it('두 리그의 랭킹 모집단이 섞이지 않는다', async () => {
    const indep = await getPlayerRanks(ids!.indepLeagueId, null, 50)
    const official = await getPlayerRanks(ids!.officialLeagueId, null, 50)

    expect(official!.items).toHaveLength(1)
    expect(indep!.items.length).toBeGreaterThan(official!.items.length)
  })
})

describe.runIf(up)('경기 기록은 감추지 않는다', () => {
  it('무소속 경기의 참가자 K/D/A가 그대로 나온다', async () => {
    const detail = await getMatch(ids!.indepLeagueId, MATCH_ID, null)
    const me = detail?.red_stats.find((entry) => entry.player_id === ids!.playerId)

    expect(me?.kill).toBe(23)
    expect(me?.death).toBe(7)
    expect(me?.assist).toBe(3)
  })

  it('상대 선수 기록과 래더 증감·MVP도 나온다', async () => {
    const detail = await getMatch(ids!.indepLeagueId, MATCH_ID, null)
    const opponent = detail?.blue_stats.find((entry) => entry.player_id === ids!.mateId)
    const me = detail?.red_stats.find((entry) => entry.player_id === ids!.playerId)

    expect(opponent?.kill).toBe(15)
    expect(me?.rating_update).toBe(12)
    expect(me?.mvp).toBe(true)
  })
})

describe.runIf(up)('시즌 카드도 리그별로 따로다', () => {
  it('무소속 시즌 카드가 존재하고 승패·래더가 남는다', async () => {
    const cards = await getLeaguePlayerSeasons(ids!.indepLeaguePlayerId)

    expect(cards).toHaveLength(1)
    expect(cards![0]?.win).toBe(INDEP.win)
    expect(cards![0]?.rating).toBe(INDEP.rating)
  })

  it('무소속 시즌 카드에서는 누적 킬·데스·킬뎃만 빠진다', async () => {
    const cards = await getLeaguePlayerSeasons(ids!.indepLeaguePlayerId)

    expect(cards![0]?.kill).toBeNull()
    expect(cards![0]?.death).toBeNull()
    expect(cards![0]?.kd_rate).toBeNull()
  })

  it('공식 시즌 카드는 그대로다 — 두 카드가 서로 다른 값을 가진다', async () => {
    const official = await getLeaguePlayerSeasons(ids!.officialLeaguePlayerId)

    expect(official![0]?.kill).toBe(OFFICIAL.kill)
    expect(official![0]?.win).toBe(OFFICIAL.win)
    expect(official![0]?.win).not.toBe(INDEP.win)
  })
})

describe.runIf(up)('공식리그 용병 출전 (D-107 11장)', () => {
  it('무소속 클랜 선수가 공식리그에서 뛴 경기는 공식리그 기록에 잡힌다', async () => {
    const page = await getLeaguePlayerMatches(ids!.officialLeagueId, ids!.playerId, null, 20)

    expect(page!.items.map((item) => item.id)).toContain(MERC_MATCH_ID)
  })

  it('그 경기가 무소속리그 기록에는 들어가지 않는다', async () => {
    const page = await getLeaguePlayerMatches(ids!.indepLeagueId, ids!.playerId, null, 20)

    expect(page!.items.map((item) => item.id)).not.toContain(MERC_MATCH_ID)
    // 무소속리그에는 자기 리그 경기만 있다
    expect(page!.items.map((item) => item.id)).toContain(MATCH_ID)
  })

  it('용병 경기의 K/D/A와 래더 증감은 공식리그에서 그대로 보인다', async () => {
    const detail = await getMatch(ids!.officialLeagueId, MERC_MATCH_ID, null)
    const me = detail?.red_stats.find((entry) => entry.player_id === ids!.playerId)

    expect(me?.kill).toBe(30)
    expect(me?.rating_update).toBe(9)
  })

  it('리그가 다르면 같은 경기를 서로의 기록실에서 볼 수 없다', async () => {
    const wrongLeague = await getMatch(ids!.indepLeagueId, MERC_MATCH_ID, null)

    expect(wrongLeague).toBeNull()
  })
})
