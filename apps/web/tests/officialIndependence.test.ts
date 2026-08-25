/**
 * `official` 라벨이 통계를 바꾸지 않는다 (D-149).
 *
 * ── 왜 이 테스트가 있나
 *   D-145 에서 "비공식이라 래더 미반영" 규칙이 폐기됐다. 그런데 승패·평균킬·무기 집계는
 *   여전히 `Match.official = true` 로 걸러지고 있었다. 실경기 중 `official=true` 는 17건,
 *   래더가 붙은 경기는 98건이라 **래더는 오르는데 전적은 `0전 0승 0패`** 로 보였다.
 *
 *   기준은 이제 하나다 — **래더에 반영된 경기인가** (`Match.redRatingUpdate != null`).
 *
 * ── 여기서 고정하는 것
 *   1. `official` 만 바꾸면 승패·킬·평균킬·무기 집계가 **하나도** 달라지지 않는다
 *   2. `official = false` 인 정상 5v5 도 전적에 정상으로 들어간다
 *   3. 래더에 반영되지 않은 경기는 `official` 이 true 여도 전적에 들어가지 않는다
 *
 * 만든 데이터는 전부 `T149-` 접두사이고 끝나면 지운다.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@sacloud/db'
import { getLeaguePlayerDetail } from '../lib/server/queries/records'
import { getLeaguePlayerMatches } from '../lib/server/queries/matches'

const P = 'T149-'
const SLUG = 't149league'

async function dbUp(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`
    return true
  } catch {
    return false
  }
}

const up = await dbUp()

let leagueId = ''
let mapId = ''
let redClanId = ''
let blueClanId = ''
let playerId = ''
/** 래더가 붙은 5v5 경기 (official = false 로 만든다) */
let ratedMatchId = ''
/** 래더가 붙지 않은 경기 (official = true 로 만든다) */
let unratedMatchId = ''

async function makeMatch(input: {
  id: string
  official: boolean
  rated: boolean
  startAt: Date
}): Promise<string> {
  const match = await prisma.match.create({
    data: {
      id: input.id,
      leagueId,
      mapId,
      redLeagueClanId: redClanId,
      blueLeagueClanId: blueClanId,
      startAt: input.startAt,
      winnerSide: 'red',
      official: input.official,
      origin: 'nexon',
      playerCount: 10,
      participantCompleteness: '5v5',
      redDivisionAtMatch: 1,
      blueDivisionAtMatch: 1,
      redRatingUpdate: input.rated ? 20 : null,
      blueRatingUpdate: input.rated ? -20 : null,
    },
  })
  /* 본인 한 명만 만든다 — 이 테스트가 보는 것은 집계 모집단이지 인원 판정이 아니다 */
  await prisma.matchPlayerStat.create({
    data: {
      matchId: match.id,
      playerId,
      side: 'red',
      kill: 12,
      death: 6,
      assist: 3,
      weapon: 1,
      playerDivisionAtMatch: 1,
      opponentDivisionAtMatch: 1,
      ratingUpdate: input.rated ? 20 : null,
      formulaVersion: input.rated ? 'sacloud-d145' : null,
    },
  })
  return match.id
}

beforeAll(async () => {
  if (!up) return
  const league = await prisma.league.create({
    data: { slug: SLUG, name: `${P}리그`, official: true, divisionCount: 1, category: 'official' },
  })
  leagueId = league.id
  const map = await prisma.gameMap.create({ data: { name: `${P}맵` } })
  mapId = map.id

  const makeClan = async (suffix: string) => {
    const clan = await prisma.clan.create({
      data: { slug: `${P}${suffix}`, name: `${P}${suffix}` },
    })
    const leagueClan = await prisma.leagueClan.create({
      data: { leagueId, clanId: clan.id, division: 1, rating: 3000 },
    })
    return leagueClan.id
  }
  redClanId = await makeClan('red')
  blueClanId = await makeClan('blue')

  const player = await prisma.player.create({
    data: { id: `${P}p1`, name: `${P}p1` },
  })
  playerId = player.id
  await prisma.leaguePlayer.create({
    data: {
      leagueId,
      playerId,
      placement: false,
      rating: 3000,
      win: 1,
      lose: 0,
      kill: 12,
      death: 6,
      assist: 3,
    },
  })

  ratedMatchId = await makeMatch({
    id: `${P}rated`,
    official: false,
    rated: true,
    startAt: new Date('2026-08-01T00:00:00Z'),
  })
  unratedMatchId = await makeMatch({
    id: `${P}unrated`,
    official: true,
    rated: false,
    startAt: new Date('2026-08-02T00:00:00Z'),
  })
})

afterAll(async () => {
  if (!up || !leagueId) return
  await prisma.matchPlayerStat.deleteMany({ where: { match: { leagueId } } })
  await prisma.match.deleteMany({ where: { leagueId } })
  await prisma.leaguePlayer.deleteMany({ where: { leagueId } })
  await prisma.leagueClan.deleteMany({ where: { leagueId } })
  await prisma.league.delete({ where: { id: leagueId } })
  await prisma.clan.deleteMany({ where: { slug: { startsWith: P } } })
  await prisma.player.deleteMany({ where: { name: { startsWith: P } } })
  await prisma.gameMap.deleteMany({ where: { name: { startsWith: P } } })
})

describe.skipIf(!up)('official 은 통계 모집단이 아니다', () => {
  it('official = false 인 정상 5v5 도 전적에 들어간다', async () => {
    const record = await getLeaguePlayerDetail(SLUG, playerId)
    expect(record).not.toBeNull()
    // 래더가 붙은 경기는 official=false 인 그 한 건뿐이다
    expect(record?.match_summary.win).toBe(1)
    expect(record?.match_summary.lose).toBe(0)
  })

  it('래더에 반영되지 않은 경기는 official = true 여도 전적에 들어가지 않는다', async () => {
    const record = await getLeaguePlayerDetail(SLUG, playerId)
    // 2경기를 만들었지만 래더가 붙은 것은 1건이다
    expect(record?.match_summary.recent_count).toBe(1)
  })

  it('official 만 뒤집어도 결과가 달라지지 않는다', async () => {
    const before = await getLeaguePlayerDetail(SLUG, playerId)

    await prisma.match.update({ where: { id: ratedMatchId }, data: { official: true } })
    await prisma.match.update({ where: { id: unratedMatchId }, data: { official: false } })
    const after = await getLeaguePlayerDetail(SLUG, playerId)

    expect(after?.match_summary.win).toBe(before?.match_summary.win)
    expect(after?.match_summary.lose).toBe(before?.match_summary.lose)
    expect(after?.match_summary.recent_count).toBe(before?.match_summary.recent_count)
    expect(after?.kill_per_match).toBe(before?.kill_per_match)

    // 원래대로 돌려 둔다
    await prisma.match.update({ where: { id: ratedMatchId }, data: { official: false } })
    await prisma.match.update({ where: { id: unratedMatchId }, data: { official: true } })
  })

  it('평균킬 분모도 래더 경기 기준이다 — official 로 세면 0이 된다', async () => {
    const record = await getLeaguePlayerDetail(SLUG, playerId)
    /* 누적 12킬 / 래더 경기 1판 = 12.
       예전처럼 official=true 인 경기(래더 없는 쪽)만 세면 분자·분모가 어긋난다 */
    expect(record?.kill_per_match).toBe(12)
  })
})

describe.skipIf(!up)('사용자 응답에 official 이 없다', () => {
  it('매치 카드 payload 에 official 필드를 내보내지 않는다', async () => {
    const page = await getLeaguePlayerMatches(leagueId, playerId, null, 10)
    const first = page?.items[0]
    expect(first).toBeDefined()
    /* 필드가 남아 있으면 언젠가 다시 `공식/비공식` 배지로 그려진다.
       DB 의 Match.official 은 그대로 있고, 관리자 응답에서만 쓴다 */
    expect(first === undefined ? {} : first).not.toHaveProperty('official')
  })
})
