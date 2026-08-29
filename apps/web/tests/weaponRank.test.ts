/**
 * 무기별 전적 · 랭킹 회귀 테스트 (D-146 · D-149).
 *
 * 실제 DB에 임시 리그를 만들고 **실제 조회 함수**를 돌린다.
 *
 * 여기서 고정하는 것
 *   1. 그 무기로 뛴 기록이 없으면 `null` 이다 — 표본이 없는데 순위를 만들지 않는다
 *   2. **본인이 모집단에 없으면(배치고사) 순위도 없다**
 *      — 실제로 "0명중 1위" 가 나왔던 버그다
 *   3. 순위가 있으면 모집단 수도 함께 있고, 순위 ≤ 모집단 수다
 *   4. **뛴 경기 수와 기록을 아는 경기 수는 다르다** (D-149).
 *      K/D 는 아는 경기만으로 계산하고, 모르는 경기를 0킬로 세지 않는다
 *   5. 스나이퍼와 라이플은 서로 섞이지 않는다
 *   6. K/D 정의는 통합 킬뎃과 **같다** — `킬 / (킬 + 데스) × 100`
 *
 * 만든 데이터는 전부 `T146-` 접두사이고 끝나면 지운다.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@sacloud/db'
import { kdRate } from '@sacloud/contract'
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
/** 라이플로 뛰었지만 K/D 를 하나도 모르는 선수 (라인업만 복원된 경우) */
let unknownOnlyId = ''
/** 스나이퍼와 라이플을 둘 다 쓰는 선수 */
let bothId = ''

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
  unknownOnlyId = await make('unknown', false)
  bothId = await make('both', false)

  /* `isMain` 은 **그 무기 판수가 그 선수 전체 판수의 절반 이상**일 때 참이다 (D-173).
     여기서는 그 규칙대로 손으로 계산해 넣는다 — 규칙이 바뀌면 이 픽스처도 같이 바꿔야 한다 */
  await prisma.leaguePlayerWeaponStat.createMany({
    data: [
      /* 4전 중 3전만 K/D 를 안다. 나머지 한 판은 넥슨이 주지 않았다 */
      {
        leaguePlayerId: rankedId,
        weapon: 0,
        games: 4,
        knownStatGames: 3,
        win: 3,
        lose: 1,
        kill: 30,
        death: 20,
        ratingDelta: 40,
        isMain: true,
      },
      {
        leaguePlayerId: placementId,
        weapon: 0,
        games: 3,
        knownStatGames: 3,
        win: 3,
        lose: 0,
        kill: 40,
        death: 10,
        ratingDelta: 90,
        isMain: true,
      },
      /* 뛴 건 알지만 K/D 를 하나도 모른다 — 순위 모집단에 넣지 않는다 */
      {
        leaguePlayerId: unknownOnlyId,
        weapon: 0,
        games: 5,
        knownStatGames: 0,
        win: 2,
        lose: 3,
        kill: 0,
        death: 0,
        ratingDelta: 5,
        isMain: true,
      },
      /* 두 무기를 모두 쓴다. 값이 서로 섞이면 안 된다.
         8판 중 라플은 2판뿐이라 **라플은 부무기**다 (2×2 < 8) */
      {
        leaguePlayerId: bothId,
        weapon: 0,
        games: 2,
        knownStatGames: 2,
        win: 1,
        lose: 1,
        kill: 10,
        death: 10,
        ratingDelta: 3,
        isMain: false,
      },
      {
        leaguePlayerId: bothId,
        weapon: 1,
        games: 6,
        knownStatGames: 6,
        win: 5,
        lose: 1,
        kill: 60,
        death: 20,
        ratingDelta: 77,
        isMain: true,
      },
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
    for (const id of [rankedId, placementId, noWeaponId, unknownOnlyId, bothId]) {
      for (const weapon of [0, 1] as const) {
        const r = await playerWeaponRankOf(id, leagueId, weapon)
        if (r.rank === null) {
          expect(r.rankCount).toBeNull()
          continue
        }
        expect(r.rankCount).not.toBeNull()
        expect(r.rank).toBeLessThanOrEqual(r.rankCount as number)
      }
    }
  })
})

describe.skipIf(!up)('부분 집계 — 뛴 경기와 기록을 아는 경기는 다르다 (D-149)', () => {
  it('K/D 를 모르는 경기가 섞여 있어도 아는 경기로 집계한다', async () => {
    const rifle = await playerWeaponRankOf(rankedId, leagueId, 0)
    // 4전 중 3전만 기록을 안다. 나머지 한 판 때문에 전체를 버리지 않는다
    expect(rifle.games).toBe(4)
    expect(rifle.knownGames).toBe(3)
    expect(rifle.kill).toBe(30)
    expect(rifle.death).toBe(20)
  })

  it('K/D 정의는 통합 킬뎃과 같다 — 킬 / (킬 + 데스)', async () => {
    const rifle = await playerWeaponRankOf(rankedId, leagueId, 0)
    expect(rifle.kdRate).toBe(kdRate(30, 20))
    expect(rifle.kdRate).toBe(60)
  })

  it('K/D 를 아는 경기가 하나도 없으면 K/D 는 null 이다 — 0% 가 아니다', async () => {
    const rifle = await playerWeaponRankOf(unknownOnlyId, leagueId, 0)
    expect(rifle.games).toBe(5)
    expect(rifle.knownGames).toBe(0)
    // 뛴 경기는 없던 일이 되지 않는다
    expect(rifle.kdRate).toBeNull()
  })

  it('K/D 를 아는 경기가 없으면 순위 모집단에 넣지 않는다', async () => {
    const rifle = await playerWeaponRankOf(unknownOnlyId, leagueId, 0)
    expect(rifle.rank).toBeNull()
    expect(rifle.rankCount).toBeNull()
  })

  it('기록 없는 선수는 다른 사람의 모집단 수도 늘리지 않는다', async () => {
    const rifle = await playerWeaponRankOf(rankedId, leagueId, 0)
    /* 라이플 모집단 = ranked 뿐이다 —
       placement 는 배치고사 · unknown 은 기록 0 · both 는 라플이 부무기다 (D-173) */
    expect(rifle.rankCount).toBe(1)
  })
})

describe.skipIf(!up)('스나이퍼와 라이플은 섞이지 않는다', () => {
  it('두 무기를 쓰는 선수의 값이 서로 넘어가지 않는다', async () => {
    const sniper = await playerWeaponRankOf(bothId, leagueId, 1)
    const rifle = await playerWeaponRankOf(bothId, leagueId, 0)

    expect(sniper.games).toBe(6)
    expect(sniper.kill).toBe(60)
    expect(sniper.death).toBe(20)
    expect(sniper.kdRate).toBe(kdRate(60, 20))

    expect(rifle.games).toBe(2)
    expect(rifle.kill).toBe(10)
    expect(rifle.death).toBe(10)
    expect(rifle.kdRate).toBe(kdRate(10, 10))

    // 합쳐지지 않았다
    expect(sniper.kill + rifle.kill).toBe(70)
    expect(sniper.kdRate).not.toBe(rifle.kdRate)
  })

  it('무기별 모집단도 서로 다르다', async () => {
    const sniper = await playerWeaponRankOf(bothId, leagueId, 1)
    // 스나 기록은 이 선수뿐이다
    expect(sniper.rankCount).toBe(1)
    expect(sniper.rank).toBe(1)
  })

  it('부무기는 기록만 남고 순위는 없다 (D-173)', async () => {
    const rifle = await playerWeaponRankOf(bothId, leagueId, 0)
    // 8판 중 라플 2판 — 라플 랭킹의 모집단이 아니다
    expect(rifle.rank).toBeNull()
    expect(rifle.rankCount).toBeNull()
    // 그래도 기록 자체는 지우지 않는다
    expect(rifle.games).toBe(2)
    expect(rifle.kill).toBe(10)
    expect(rifle.kdRate).toBe(kdRate(10, 10))
  })
})
