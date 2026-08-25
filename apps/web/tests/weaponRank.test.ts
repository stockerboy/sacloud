/**
 * 무기별 랭킹 회귀 테스트 (D-146).
 *
 * 실제 DB에 임시 리그를 만들고 **실제 조회 함수**를 돌린다.
 *
 * 여기서 고정하는 것
 *   1. 그 무기로 뛴 기록이 없으면 `null` 이다 — 표본이 없는데 순위를 만들지 않는다
 *   2. **본인이 모집단에 없으면(배치고사) 순위도 없다**
 *      — 실제로 "0명중 1위" 가 나왔던 버그다
 *   3. 순위가 있으면 모집단 수도 함께 있고, 순위 ≤ 모집단 수다
 *
 * 만든 데이터는 전부 `T146-` 접두사이고 끝나면 지운다.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@sacloud/db'
import { playerWeaponRankOf } from '../lib/server/queries/leagues'

const P = 'T146-'
const SLUG = 't146league'

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
/** 배치고사가 끝난 선수 — 랭킹 모집단에 들어간다 */
let rankedId = ''
/** 배치고사 중인 선수 — 모집단에 없다 */
let placementId = ''
/** 무기 기록이 아예 없는 선수 */
let noWeaponId = ''

beforeAll(async () => {
  if (!up) return
  const league = await prisma.league.create({
    data: { slug: SLUG, name: `${P}리그`, official: true, divisionCount: 2, category: 'official' },
  })
  leagueId = league.id

  const make = async (suffix: string, placement: boolean) => {
    const player = await prisma.player.create({
      data: { id: `${P}${suffix}`, name: `${P}${suffix}` },
    })
    const leaguePlayer = await prisma.leaguePlayer.create({
      data: { leagueId, playerId: player.id, placement, rating: 3000 },
    })
    return leaguePlayer.id
  }

  rankedId = await make('ranked', false)
  placementId = await make('placement', true)
  noWeaponId = await make('noweapon', false)

  // 라이플(0) 기록만 만든다. 스나이퍼(1) 기록은 아무에게도 없다
  await prisma.leaguePlayerWeaponStat.createMany({
    data: [
      { leaguePlayerId: rankedId, weapon: 0, win: 3, lose: 1, ratingDelta: 40 },
      { leaguePlayerId: placementId, weapon: 0, win: 3, lose: 0, ratingDelta: 90 },
    ],
  })
})

afterAll(async () => {
  if (!up || !leagueId) return
  await prisma.leaguePlayerWeaponStat.deleteMany({ where: { leaguePlayer: { leagueId } } })
  await prisma.leaguePlayer.deleteMany({ where: { leagueId } })
  await prisma.league.delete({ where: { id: leagueId } })
  await prisma.player.deleteMany({ where: { name: { startsWith: P } } })
})

describe.skipIf(!up)('무기별 랭킹', () => {
  it('그 무기로 뛴 기록이 없으면 순위가 없다 — 표본 없이 순위를 만들지 않는다', async () => {
    const sniper = await playerWeaponRankOf(rankedId, leagueId, 1)
    expect(sniper.rank).toBeNull()
    expect(sniper.rankCount).toBeNull()
    expect(sniper.games).toBe(0)
  })

  it('무기 기록 자체가 없는 선수도 순위가 없다', async () => {
    const rifle = await playerWeaponRankOf(noWeaponId, leagueId, 0)
    expect(rifle.rank).toBeNull()
    expect(rifle.games).toBe(0)
  })

  it('배치고사 중이면 순위가 없다 — "0명중 1위" 가 나오면 안 된다', async () => {
    const rifle = await playerWeaponRankOf(placementId, leagueId, 0)
    // 경기는 있었으므로 games 는 남긴다. 순위만 없다
    expect(rifle.games).toBe(3)
    expect(rifle.rank).toBeNull()
    expect(rifle.rankCount).toBeNull()
  })

  it('배치고사가 끝났고 기록이 있으면 순위가 나온다', async () => {
    const rifle = await playerWeaponRankOf(rankedId, leagueId, 0)
    expect(rifle.games).toBe(4)
    expect(rifle.rank).not.toBeNull()
    expect(rifle.rankCount).not.toBeNull()
  })

  it('순위와 모집단 수는 함께 존재하고, 순위는 모집단 수를 넘지 않는다', async () => {
    for (const id of [rankedId, placementId, noWeaponId]) {
      for (const weapon of [0, 1] as const) {
        const r = await playerWeaponRankOf(id, leagueId, weapon)
        expect(r.rank === null).toBe(r.rankCount === null)
        if (r.rank !== null && r.rankCount !== null) {
          expect(r.rank).toBeLessThanOrEqual(r.rankCount)
          expect(r.rank).toBeGreaterThan(0)
        }
      }
    }
  })

  it('배치고사 중인 선수는 모집단에 포함되지 않는다', async () => {
    const rifle = await playerWeaponRankOf(rankedId, leagueId, 0)
    // placement 선수(delta 90)가 세어졌다면 rankCount 가 2 가 된다
    expect(rifle.rankCount).toBe(1)
    expect(rifle.rank).toBe(1)
  })
})
