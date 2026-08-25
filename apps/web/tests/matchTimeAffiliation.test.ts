/**
 * 현재 소속 ↔ 경기 당시 소속 분리 회귀 테스트 (D-130 · D-131).
 *
 * 실제 DB에 임시 리그를 만들고 **실제 조회 함수**를 돌린다.
 * 순수 함수로는 "이적해도 과거 화면이 안 바뀌는가"를 증명할 수 없기 때문이다.
 *
 * 시나리오 — 사용자가 지정한 그대로다.
 *   선수 P 는 8/20 경기 당시 **Clan A**, 지금은 **Clan B** 소속이다.
 *
 * 여기서 고정하는 약속
 *   1. 기록실 목록의 라인업     → 그 경기 **당시** 클랜(A)
 *   2. 경기 상세의 선수 행      → 그 경기 **당시** 클랜(A)
 *   3. 현재 선수 프로필         → **현재** 클랜(B)
 *   4. 현재 개인 랭킹           → **현재** 클랜(B)
 *   5. 현재 Clan B 클랜원 목록  → 선수 P 포함
 *   6. 공식 판정·클랜 결과      → 경기 당시(A) 기준. B 에는 영향이 없다
 *   7. 근거가 없으면 `null`     → 현재 소속으로 메우지 않는다
 *
 * 만든 데이터는 전부 `T131-` 접두사이고 끝나면 지운다.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@sacloud/db'
import { getLeaguePlayerMatches, getMatch } from '../lib/server/queries/matches'
import { getPlayer } from '../lib/server/queries/players'
import { getPlayerRanks } from '../lib/server/queries/leagues'
import { getLeagueClanPlayers } from '../lib/server/queries/records'

const P = 'T131-'
const SLUG = 't131league'
const MATCH_ID = '990820000000000131'

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
  playerId: string
  mateId: string
  foeId: string
  leaguePlayerId: string
  clanAId: string
  clanBId: string
  lcAId: string
  lcBId: string
  lcFoeId: string
} | null = null

async function cleanup() {
  await prisma.matchPlayerStat.deleteMany({ where: { matchId: MATCH_ID } })
  await prisma.match.deleteMany({ where: { id: MATCH_ID } })
  await prisma.leagueRosterMembership.deleteMany({
    where: { player: { id: { startsWith: P } } },
  })
  await prisma.leaguePlayer.deleteMany({ where: { player: { id: { startsWith: P } } } })
  await prisma.season.deleteMany({ where: { league: { slug: SLUG } } })
  await prisma.leagueClan.deleteMany({ where: { league: { slug: SLUG } } })
  await prisma.league.deleteMany({ where: { slug: SLUG } })
  await prisma.player.deleteMany({ where: { id: { startsWith: P } } })
  await prisma.clan.deleteMany({ where: { slug: { startsWith: P.toLowerCase() } } })
  await prisma.gameMap.deleteMany({ where: { name: `${P}맵` } })
}

beforeAll(async () => {
  if (!up) return
  await cleanup()

  const map = await prisma.gameMap.create({ data: { name: `${P}맵` } })

  const [clanA, clanB, clanFoe] = await Promise.all([
    prisma.clan.create({
      data: {
        slug: `${P.toLowerCase()}a`,
        name: `${P}클랜A`,
        category: 'official',
        // D-146: sourceClanId 가 있어야 공식 1/2부 등록 클랜이고 실제 마크를 쓴다
        sourceClanId: `${P}-src-a`,
        markBgUrl: 'https://example.invalid/a-bg.png',
        markFrontUrl: 'https://example.invalid/a-front.png',
      },
    }),
    prisma.clan.create({
      data: {
        slug: `${P.toLowerCase()}b`,
        name: `${P}클랜B`,
        category: 'official',
        sourceClanId: `${P}-src-b`,
        markBgUrl: 'https://example.invalid/b-bg.png',
        markFrontUrl: 'https://example.invalid/b-front.png',
      },
    }),
    prisma.clan.create({
      data: { slug: `${P.toLowerCase()}f`, name: `${P}상대클랜`, category: 'official' },
    }),
  ])

  const league = await prisma.league.create({
    data: {
      slug: SLUG,
      name: `${P}리그`,
      category: 'official',
      official: true,
      maps: { create: [{ mapId: map.id }] },
      playerLimits: { create: [{ playerCount: 5 }] },
    },
  })

  const [lcA, lcB, lcFoe] = await Promise.all([
    prisma.leagueClan.create({
      data: { leagueId: league.id, clanId: clanA.id, division: 1, placement: false },
    }),
    prisma.leagueClan.create({
      data: { leagueId: league.id, clanId: clanB.id, division: 1, placement: false },
    }),
    prisma.leagueClan.create({
      data: { leagueId: league.id, clanId: clanFoe.id, division: 1, placement: false },
    }),
  ])

  /* 선수 P — **현재는 Clan B** 다. 8/20 경기는 Clan A 소속으로 뛰었다 */
  const player = await prisma.player.create({
    data: { id: `${P}이적선수`, name: `${P}이적선수`, clanId: clanB.id },
  })
  const mate = await prisma.player.create({
    data: { id: `${P}동료`, name: `${P}동료`, clanId: clanA.id },
  })
  const foe = await prisma.player.create({
    data: { id: `${P}상대`, name: `${P}상대`, clanId: clanFoe.id },
  })

  const leaguePlayer = await prisma.leaguePlayer.create({
    data: {
      leagueId: league.id,
      playerId: player.id,
      // 현재 소속. 랭킹·프로필이 읽는 값이다
      clanId: clanB.id,
      placement: false,
      rating: 1700,
      baseRating: 1700,
      win: 10,
      lose: 5,
      kill: 200,
      death: 150,
    },
  })
  await prisma.leaguePlayer.createMany({
    data: [
      {
        leagueId: league.id,
        playerId: mate.id,
        clanId: clanA.id,
        placement: false,
        rating: 1600,
        baseRating: 1600,
      },
      {
        leagueId: league.id,
        playerId: foe.id,
        clanId: clanFoe.id,
        placement: false,
        rating: 1550,
        baseRating: 1550,
      },
    ],
  })

  /* 소속 이력 — A 는 닫혔고 B 가 열려 있다. **A 를 지우지 않는다** */
  await prisma.leagueRosterMembership.createMany({
    data: [
      {
        leagueId: league.id,
        leagueClanId: lcA.id,
        playerId: player.id,
        joinedAt: new Date('2026-08-01T00:00:00Z'),
        leftAt: new Date('2026-08-22T00:00:00Z'),
        source: '3rd.supply-lineup',
        verified: true,
        observedAt: new Date('2026-08-22T00:00:00Z'),
        confidence: 'high',
      },
      {
        leagueId: league.id,
        leagueClanId: lcB.id,
        playerId: player.id,
        joinedAt: new Date('2026-08-22T00:00:00Z'),
        source: '3rd.supply-lineup',
        verified: true,
        observedAt: new Date('2026-08-24T00:00:00Z'),
        confidence: 'high',
      },
    ],
  })

  /* 8/20 경기 — 선수 P 는 **Clan A** 소속으로 뛰었다.
     당시 소속은 참가 기록에 박혀 있고, 현재 소속(B)과 무관하다 */
  await prisma.match.create({
    data: {
      id: MATCH_ID,
      leagueId: league.id,
      mapId: map.id,
      playerCount: 5,
      startAt: new Date('2026-08-20T12:00:00Z'),
      winnerSide: 'red',
      redLeagueClanId: lcA.id,
      blueLeagueClanId: lcFoe.id,
      redDivisionAtMatch: 1,
      blueDivisionAtMatch: 1,
      official: true,
      origin: 'nexon',
      sourceMatchId: MATCH_ID,
      stats: {
        create: [
          {
            playerId: player.id,
            side: 'red',
            kill: 20,
            death: 5,
            assist: 2,
            playerDivisionAtMatch: 1,
            opponentDivisionAtMatch: 1,
            participantRole: 'member',
            rosterLeagueClanId: lcA.id,
            matchTimeClanName: `${P}클랜A`,
            matchTimeLeagueClanId: lcA.id,
            matchTimeClanSlug: `${P.toLowerCase()}a`,
            matchTimeClanMarkBgUrl: 'https://example.invalid/a-bg.png',
            matchTimeClanMarkFrontUrl: 'https://example.invalid/a-front.png',
            matchTimeClanSource: 'nexon-detail',
            matchTimeClanObservedAt: new Date('2026-08-20T12:00:00Z'),
            matchTimeClanConfidence: 'high',
          },
          {
            playerId: mate.id,
            side: 'red',
            kill: 8,
            death: 9,
            assist: 1,
            playerDivisionAtMatch: 1,
            opponentDivisionAtMatch: 1,
            participantRole: 'member',
            rosterLeagueClanId: lcA.id,
            matchTimeClanName: `${P}클랜A`,
            matchTimeLeagueClanId: lcA.id,
            matchTimeClanSlug: `${P.toLowerCase()}a`,
            matchTimeClanSource: 'nexon-detail',
            matchTimeClanConfidence: 'high',
          },
          {
            // 근거가 없는 참가자 — **현재 소속으로 메우지 않는다**
            playerId: foe.id,
            side: 'blue',
            kill: 4,
            death: 12,
            assist: 0,
            playerDivisionAtMatch: 1,
            opponentDivisionAtMatch: 1,
            participantRole: 'mercenary',
          },
        ],
      },
    },
  })

  ids = {
    leagueId: league.id,
    playerId: player.id,
    mateId: mate.id,
    foeId: foe.id,
    leaguePlayerId: leaguePlayer.id,
    clanAId: clanA.id,
    clanBId: clanB.id,
    lcAId: lcA.id,
    lcBId: lcB.id,
    lcFoeId: lcFoe.id,
  }
})

afterAll(async () => {
  if (up) await cleanup()
})

describe.runIf(up)('기록실·경기 상세는 경기 당시 소속을 보여 준다', () => {
  it('기록실 라인업에 그 경기 당시 클랜(A)이 붙는다 — 현재 클랜(B)이 아니다', async () => {
    const page = await getLeaguePlayerMatches(ids!.leagueId, ids!.playerId, null, 20)
    expect(page).not.toBeNull()
    const card = page!.items.find((item) => item.id === MATCH_ID)
    expect(card).toBeDefined()

    const entry = card!.red.find((row) => row.player_id === ids!.playerId)
    expect(entry?.match_time_clan?.name).toBe(`${P}클랜A`)
    expect(entry?.match_time_clan?.name).not.toBe(`${P}클랜B`)
  })

  it('경기 상세의 선수 행에도 당시 클랜(A)과 그 마크가 붙는다', async () => {
    const detail = await getMatch(ids!.leagueId, MATCH_ID, ids!.lcAId)
    expect(detail).not.toBeNull()

    const row = detail!.red_stats.find((stat) => stat.player_id === ids!.playerId)
    expect(row?.match_time_clan?.name).toBe(`${P}클랜A`)
    expect(row?.match_time_clan?.mark.bg).toBe('https://example.invalid/a-bg.png')
    expect(row?.match_time_clan?.mark.front).toBe('https://example.invalid/a-front.png')
    // 공식 등록 클랜이므로 실제 마크를 쓴다 (D-146)
    expect(row?.match_time_clan?.is_official_clan).toBe(true)
  })

  it('근거가 없는 참가자는 null 이다 — 현재 소속으로 메우지 않는다', async () => {
    const detail = await getMatch(ids!.leagueId, MATCH_ID, ids!.lcAId)
    const row = detail!.blue_stats.find((stat) => stat.player_id === ids!.foeId)
    expect(row).toBeDefined()
    expect(row!.match_time_clan).toBeNull()
  })

  it('선수의 현재 소속을 바꿔도 과거 경기 표시가 흔들리지 않는다', async () => {
    // 현재 소속을 A 로 되돌렸다가 다시 B 로 — 과거 화면은 그대로여야 한다
    await prisma.player.update({ where: { id: ids!.playerId }, data: { clanId: ids!.clanAId } })
    const asA = await getMatch(ids!.leagueId, MATCH_ID, ids!.lcAId)
    await prisma.player.update({ where: { id: ids!.playerId }, data: { clanId: ids!.clanBId } })
    const asB = await getMatch(ids!.leagueId, MATCH_ID, ids!.lcAId)

    const pick = (detail: typeof asA) =>
      detail!.red_stats.find((stat) => stat.player_id === ids!.playerId)?.match_time_clan?.name

    expect(pick(asA)).toBe(`${P}클랜A`)
    expect(pick(asB)).toBe(`${P}클랜A`)
  })
})

describe.runIf(up)('현재 화면은 현재 소속을 보여 준다', () => {
  it('선수 프로필은 현재 클랜(B)이다', async () => {
    const player = await getPlayer(ids!.playerId)
    expect(player?.clan?.name).toBe(`${P}클랜B`)
  })

  it('개인 랭킹은 현재 클랜(B)이다', async () => {
    const page = await getPlayerRanks(ids!.leagueId, null, 50)
    expect(page).not.toBeNull()
    const row = page!.items.find((item) => item.player.id === ids!.playerId)
    expect(row).toBeDefined()
    expect(row!.clan?.name).toBe(`${P}클랜B`)
  })

  it('현재 클랜B 의 클랜원 목록에 선수가 들어 있다', async () => {
    const page = await getLeagueClanPlayers(SLUG, `${P.toLowerCase()}b`, null, 50)
    expect(page!.items.some((item) => item.player.id === ids!.playerId)).toBe(true)
  })

  it('현재 클랜A 의 클랜원 목록에는 더 이상 없다', async () => {
    const page = await getLeagueClanPlayers(SLUG, `${P.toLowerCase()}a`, null, 50)
    expect(page!.items.some((item) => item.player.id === ids!.playerId)).toBe(false)
  })
})

describe.runIf(up)('내부 판정은 경기 당시 소속 기준이다', () => {
  it('그 경기의 원소속 클랜은 A 다 — 이적해도 바뀌지 않는다', async () => {
    const stat = await prisma.matchPlayerStat.findFirstOrThrow({
      where: { matchId: MATCH_ID, playerId: ids!.playerId },
      select: { rosterLeagueClanId: true, participantRole: true },
    })
    expect(stat.rosterLeagueClanId).toBe(ids!.lcAId)
    expect(stat.participantRole).toBe('member')
  })

  it('경기 결과는 Clan A 의 것이다. Clan B 는 이 경기에 등장하지 않는다', async () => {
    const match = await prisma.match.findUniqueOrThrow({
      where: { id: MATCH_ID },
      select: { redLeagueClanId: true, blueLeagueClanId: true, winnerSide: true },
    })
    expect(match.redLeagueClanId).toBe(ids!.lcAId)
    expect(match.winnerSide).toBe('red')
    expect([match.redLeagueClanId, match.blueLeagueClanId]).not.toContain(ids!.lcBId)
  })

  it('소속 이력이 남는다 — 이전 소속을 지우지 않고 leftAt 으로 닫는다', async () => {
    const rows = await prisma.leagueRosterMembership.findMany({
      where: { playerId: ids!.playerId, leagueId: ids!.leagueId },
      orderBy: { joinedAt: 'asc' },
      select: { leagueClanId: true, leftAt: true, observedAt: true, confidence: true },
    })
    expect(rows).toHaveLength(2)
    expect(rows[0]!.leagueClanId).toBe(ids!.lcAId)
    expect(rows[0]!.leftAt).not.toBeNull()
    expect(rows[1]!.leagueClanId).toBe(ids!.lcBId)
    expect(rows[1]!.leftAt).toBeNull()
    // 관측 시각과 근거 강도를 잃지 않는다
    expect(rows.every((row) => row.observedAt !== null && row.confidence === 'high')).toBe(true)
  })
})
