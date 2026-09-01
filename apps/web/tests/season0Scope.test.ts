/**
 * 화면의 **성적 수치**가 엔진 집계와 같은 경기를 센다 (D-178).
 *
 * ── 여기서 고정하는 것 두 가지
 *
 *   1. **래더 판정이 엔진 집계 대상과 같다.**
 *      화면은 `redRatingUpdate != null` 아니면 미러(`3rd.supply`) 둘만 봤다.
 *      그런데 시즌0 재계산은 읽기 전용 replay 라 원본 칸을 채우지 않는다 (D-171).
 *      그래서 `origin='nexon'` 경기가 화면에서만 빠졌다 — 같은 선수를
 *      엔진은 70판, 화면은 66판으로 셌다.
 *
 *   2. **성적 수치에는 시즌0 창이 걸린다.** 창 밖(2026-03 이전) 경기는
 *      상세정보·최근매치 요약·평균킬 분모에 들어가지 않는다.
 *      기록실(경기 목록)에는 **그대로 남는다** — 그건 다른 테스트가 지킨다.
 *
 * 창의 값은 여기서도 적지 않는다. `season0Scope.ts` 가 worker 의 단일 정의를 읽어 온다.
 *
 * 만든 데이터는 전부 `T178-` 접두사이고 끝나면 지운다.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@sacloud/db'
import { getLeaguePlayerDetail } from '../lib/server/queries/records'
import { getLeaguePlayerMatches } from '../lib/server/queries/matches'
import { ladderMatchWhere, withLadderMatch } from '../lib/server/queries/ladderScope'
import {
  SEASON0_FROM,
  SEASON0_ORIGINS,
  SEASON0_TO,
  seasonWindowWhere,
} from '../lib/server/queries/season0Scope'

const P = 'T178-'
const SLUG = 't178league'

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

const DAY = 24 * 60 * 60 * 1000

/** 창 **안** — 시작 시각보다 확실히 뒤 */
const IN_WINDOW = new Date(SEASON0_FROM.getTime() + 30 * DAY)
/** 창 **밖** — 시작 시각보다 앞 (2026-03 이전 기록에 해당한다) */
const BEFORE_WINDOW = new Date(SEASON0_FROM.getTime() - 30 * DAY)

async function makeMatch(input: {
  id: string
  origin: string
  ratingUpdate: number | null
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
      official: true,
      origin: input.origin,
      playerCount: 10,
      participantCompleteness: '5v5',
      redDivisionAtMatch: 1,
      blueDivisionAtMatch: 1,
      redRatingUpdate: input.ratingUpdate,
      blueRatingUpdate: input.ratingUpdate === null ? null : -input.ratingUpdate,
    },
  })
  await prisma.matchPlayerStat.create({
    data: {
      matchId: match.id,
      playerId,
      side: 'red',
      kill: 10,
      death: 5,
      assist: 2,
      weapon: 1,
      playerDivisionAtMatch: 1,
      opponentDivisionAtMatch: 1,
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
  mapId = (await prisma.gameMap.create({ data: { name: `${P}맵` } })).id

  const makeClan = async (suffix: string): Promise<string> => {
    const clan = await prisma.clan.create({ data: { slug: `${P}${suffix}`, name: `${P}${suffix}` } })
    const leagueClan = await prisma.leagueClan.create({
      data: { leagueId, clanId: clan.id, division: 1, rating: 3000 },
    })
    return leagueClan.id
  }
  redClanId = await makeClan('red')
  blueClanId = await makeClan('blue')

  playerId = (await prisma.player.create({ data: { id: `${P}p1`, name: `${P}p1` } })).id
  await prisma.leaguePlayer.create({
    data: { leagueId, playerId, placement: false, rating: 3000 },
  })

  /* ① 창 안 · 넥슨 · 증감 없음  → **예전 화면 판정에서 빠지던 경기**다 */
  await makeMatch({ id: `${P}nexon-in`, origin: 'nexon', ratingUpdate: null, startAt: IN_WINDOW })
  /* ② 창 안 · 미러                → 예전에도 들어갔다 */
  await makeMatch({
    id: `${P}mirror-in`,
    origin: '3rd.supply',
    ratingUpdate: null,
    startAt: new Date(IN_WINDOW.getTime() + DAY),
  })
  /* ③ 창 밖 · 미러                → 성적 수치에서 빠져야 한다. 기록실에는 남는다 */
  await makeMatch({
    id: `${P}mirror-out`,
    origin: '3rd.supply',
    ratingUpdate: null,
    startAt: BEFORE_WINDOW,
  })
  /* ④ 창 안 · 래더 밖 origin      → 증감도 없으니 어디에도 들어가지 않는다 */
  await makeMatch({
    id: `${P}other-in`,
    origin: 'sacloud',
    ratingUpdate: null,
    startAt: new Date(IN_WINDOW.getTime() + 2 * DAY),
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

describe('시즌0 창은 한 곳에서만 정의된다 (D-175 · D-178)', () => {
  it('화면은 창 값을 **다시 적지 않고** worker 의 정의를 그대로 읽는다', () => {
    /* 시작은 2026-07-01 00:00 KST = 2026-06-30T15:00:00Z 다.
       이 숫자를 화면 코드가 따로 갖고 있으면 창이 바뀔 때 조용히 갈라진다.

       ⚠ 2026-08-31 정정 — 4/1 에서 7/1 로 고쳤다. 사용자가 4/1 로 말한 뒤 7/1 로
         수정했는데 그 수정이 문서·코드에 반영되지 않아 세션마다 4/1 로 되돌아갔다.
         **이 단언이 창을 지키는 자물쇠다.** 값을 바꾸려면 여기도 같이 고쳐야 한다 */
    expect(SEASON0_FROM.toISOString()).toBe('2026-06-30T15:00:00.000Z')
    /* 끝은 열린 구간이다 — 시즌1 오픈일은 사용자가 정한다 */
    expect(SEASON0_TO).toBeNull()
  })

  it('창이 열려 있으면 `where` 에 상한을 붙이지 않는다', () => {
    const where = seasonWindowWhere()
    expect(where.startAt).toEqual({ gte: SEASON0_FROM })
  })

  /**
   * ⚠ 2026-09-01 — 목록에 `nexon_barracks` 가 늘었다.
   *
   * IPL 경기는 병영수첩에서 오고 `origin='nexon_barracks'` 다. 목록에 없던 동안
   * 엔진 집계에서 빠져 있었고, 화면 래더 판정에서도 같이 빠졌다.
   * **두 쪽이 같은 상수를 읽는다** — 그래서 한쪽만 고쳐질 수 없다. 그것이 이 단언의 목적이다.
   */
  it('래더 판정 origin 이 엔진 집계 대상과 같다', () => {
    expect([...SEASON0_ORIGINS]).toEqual(['3rd.supply', 'nexon', 'nexon_barracks'])
    const or = ladderMatchWhere().OR
    expect(or).toEqual([
      { redRatingUpdate: { not: null } },
      { origin: { in: ['3rd.supply', 'nexon', 'nexon_barracks'] } },
    ])
  })
})

describe.runIf(up)('화면 래더 판정 = 엔진 집계 대상 (D-178)', () => {
  it('증감이 비어 있어도 `origin=nexon` 이면 래더 경기다', async () => {
    const counted = await prisma.match.count({
      where: withLadderMatch({ leagueId, ...seasonWindowWhere() }),
    })
    /* 창 안 4건 중 래더는 넥슨 1 + 미러 1 = 2건. `sacloud` 는 빠진다 */
    expect(counted).toBe(2)

    const nexon = await prisma.match.count({
      where: withLadderMatch({ leagueId, origin: 'nexon' }),
    })
    expect(nexon).toBe(1)
  })

  it('상세정보 판수 = 창 안 래더 경기 수 — 넥슨 경기가 빠지지 않는다', async () => {
    const detail = await getLeaguePlayerDetail(SLUG, playerId)
    expect(detail).not.toBeNull()
    expect(detail!.win + detail!.lose).toBe(2)
    /* 넷 다 이긴 진영이라, 빠진 것이 있으면 이 숫자가 줄어든다 */
    expect(detail!.win).toBe(2)
  })
})

describe.runIf(up)('창 밖 경기는 성적에서 빠지고 기록실에는 남는다 (D-175 정한 것 ②)', () => {
  it('상세정보·최근매치 요약은 창 밖 경기를 세지 않는다', async () => {
    const detail = await getLeaguePlayerDetail(SLUG, playerId)
    /* 창 밖 미러 1건을 더 만들어 두었다. 창을 안 걸면 3이 된다 */
    expect(detail!.win + detail!.lose).toBe(2)
    expect(detail!.match_summary.recent_count).toBe(2)
  })

  it('평균킬 분모도 창 안이다 — 분자와 같은 집계에서 나온다 (D-172)', async () => {
    const detail = await getLeaguePlayerDetail(SLUG, playerId)
    /* 경기마다 10킬 · 창 안 래더 2경기 → 10킬. 창 밖까지 세면 분모가 3이 되어 6.7 이 된다 */
    expect(detail!.kill).toBe(20)
    expect(detail!.kill_per_match).toBe(10)
  })

  it('경기 목록(기록실)에는 창 밖 경기가 그대로 보인다', async () => {
    const page = await getLeaguePlayerMatches(leagueId, playerId, null, 20)
    const ids = page?.items.map((row) => row.id) ?? []
    expect(ids).toContain(`${P}mirror-out`)
    /* 기록실은 래더 판정도 창도 걸지 않는다 — 만든 4건이 전부 보인다 */
    expect(ids.length).toBe(4)
  })
})
