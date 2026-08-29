/**
 * 전투력 육각형의 **백분위 재료**가 상세정보와 같은 경기를 센다 (D-185).
 *
 * ── 여기서 고정하는 것
 *
 *   1. **모집단은 같은 주무기 선수들이다.** 라플수는 라플수끼리 줄 세운다.
 *      스나가 킬이 많은 것은 무기의 성질이지 실력이 아니다 (사양 4절).
 *   2. **판당 평균 킬이 상세정보의 `평균킬` 과 같은 값에서 나온다.**
 *      두 숫자가 같은 카드 안에 나란히 붙으므로 어긋나면 바로 보인다 (D-176 이 고친 사고).
 *   3. **못 재는 축은 `null` 이고 이유가 남는다.** 0으로 채우지 않는다 (D-106).
 *   4. **주무기가 반반이면 어느 무리에도 넣지 않는다** — 그 절반의 스나 판이
 *      라플 무리 안에서 견줘지면 안 된다.
 *
 * 만든 데이터는 전부 `T185-` 접두사이고 끝나면 지운다.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@sacloud/db'
import { TRAIT_MIN_GAMES } from '@sacloud/contract'
import { getLeaguePlayerDetail } from '../lib/server/queries/records'
import { clearTraitDistributionCache, playerTraits } from '../lib/server/queries/playerTraits'
import { SEASON0_FROM } from '../lib/server/queries/season0Scope'

const P = 'T185-'
const SLUG = 't185league'

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

const DAY = 24 * 60 * 60 * 1000
/** 창 **안** — 시작 시각보다 확실히 뒤 */
const IN_WINDOW = new Date(SEASON0_FROM.getTime() + 30 * DAY)

/**
 * 이 리그의 선수들.
 *
 * `kill` 은 **매 경기 같은 값**이라 판당 평균 킬이 곧 그 값이다 — 백분위 순서를
 * 손으로 확인할 수 있게 일부러 이렇게 뒀다.
 */
const PLAYERS = [
  /* 라플수 5명 — 판당 1·2·3·4·5킬 */
  { id: `${P}r1`, games: 10, weapon: 0 as const, kill: 1, damage: 1000 },
  { id: `${P}r2`, games: 10, weapon: 0 as const, kill: 2, damage: 2000 },
  { id: `${P}r3`, games: 10, weapon: 0 as const, kill: 3, damage: 3000 },
  { id: `${P}r4`, games: 10, weapon: 0 as const, kill: 4, damage: 4000 },
  { id: `${P}r5`, games: 10, weapon: 0 as const, kill: 5, damage: 5000 },
  /* 스나수 1명 — 라플 무리에 섞이면 안 된다 */
  { id: `${P}s1`, games: 10, weapon: 1 as const, kill: 9, damage: 900 },
  /* 판수가 모자란 라플수 — 모집단에도 들어가지 않는다 */
  { id: `${P}few`, games: TRAIT_MIN_GAMES - 1, weapon: 0 as const, kill: 9, damage: 9000 },
]

/** 무기가 정확히 반반인 선수 — 주무기가 없다 */
const MIXED = `${P}mixed`

async function addStat(
  matchId: string,
  playerId: string,
  weapon: 0 | 1,
  kill: number,
  damage: number,
): Promise<void> {
  await prisma.matchPlayerStat.create({
    data: {
      matchId,
      playerId,
      side: 'red',
      kill,
      death: 5,
      assist: 1,
      damage,
      weapon,
      playerDivisionAtMatch: 1,
      opponentDivisionAtMatch: 1,
    },
  })
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

  for (const entry of [...PLAYERS.map((row) => row.id), MIXED]) {
    await prisma.player.create({ data: { id: entry, name: entry } })
    await prisma.leaguePlayer.create({
      data: { leagueId, playerId: entry, placement: false, rating: 3000 },
    })
  }

  /* 경기 10판. 한 판에 여러 선수를 넣어 참가기록만 늘린다 —
     경기 수가 아니라 **참가기록 수**가 판수이기 때문이다 */
  for (let index = 0; index < TRAIT_MIN_GAMES; index += 1) {
    const match = await prisma.match.create({
      data: {
        id: `${P}m${index}`,
        leagueId,
        mapId,
        redLeagueClanId: redClanId,
        blueLeagueClanId: blueClanId,
        startAt: new Date(IN_WINDOW.getTime() + index * DAY),
        winnerSide: 'red',
        official: true,
        /* 미러 origin 이라 래더 경기로 잡힌다 (D-164 · D-175) */
        origin: '3rd.supply',
        playerCount: 10,
        participantCompleteness: '5v5',
        redDivisionAtMatch: 1,
        blueDivisionAtMatch: 1,
      },
    })
    for (const entry of PLAYERS) {
      if (index >= entry.games) continue
      await addStat(match.id, entry.id, entry.weapon, entry.kill, entry.damage)
    }
    /* 반반 선수 — 앞 5판은 라플, 뒤 5판은 스나 */
    await addStat(match.id, MIXED, index < 5 ? 0 : 1, 3, 3000)
  }

  /* 픽스처를 만든 뒤에 캐시를 비운다. 리그가 새로 생겼으니 원래 비어 있지만,
     같은 프로세스에서 다른 테스트가 먼저 이 리그를 읽었을 가능성을 없앤다 */
  clearTraitDistributionCache()
})

afterAll(async () => {
  if (!up || !leagueId) return
  clearTraitDistributionCache()
  await prisma.matchPlayerStat.deleteMany({ where: { match: { leagueId } } })
  await prisma.match.deleteMany({ where: { leagueId } })
  await prisma.leaguePlayer.deleteMany({ where: { leagueId } })
  await prisma.leagueClan.deleteMany({ where: { leagueId } })
  await prisma.league.delete({ where: { id: leagueId } })
  await prisma.clan.deleteMany({ where: { slug: { startsWith: P } } })
  await prisma.player.deleteMany({ where: { name: { startsWith: P } } })
  await prisma.gameMap.deleteMany({ where: { name: { startsWith: P } } })
})

describe.runIf(up)('전투력 육각형 — 모집단과 백분위 (D-185)', () => {
  it('라플수는 라플수끼리만 견준다 — 스나수는 그 무리에 없다', async () => {
    const { traits } = await playerTraits(leagueId, `${P}r3`)
    expect(traits.weapon).toBe(0)
    /* 라플 5명. 스나 1명 · 판수 부족 1명 · 반반 1명은 들어오지 않는다 */
    expect(traits.cohort).toBe(5)
  })

  it('판당 킬이 가장 높은 선수가 가장 위다', async () => {
    const top = await playerTraits(leagueId, `${P}r5`)
    const bottom = await playerTraits(leagueId, `${P}r1`)
    const carry = (result: Awaited<ReturnType<typeof playerTraits>>) =>
      result.traits.axes.find((axis) => axis.key === 'carry')?.percentile

    /* 5명 중 꼴찌는 mid-rank 로 10, 1등은 90 이다 (동점 없음) */
    expect(carry(bottom)).toBe(10)
    expect(carry(top)).toBe(90)
  })

  it('상세정보의 `평균킬` 과 같은 경기를 센다', async () => {
    const detail = await getLeaguePlayerDetail(SLUG, `${P}r4`)
    expect(detail).not.toBeNull()
    /* 매 경기 4킬 · 10판이므로 판당 4.0 이다. 육각형이 이 값으로 줄을 세웠다 */
    expect(detail?.kill_per_match).toBe(4)
    expect(detail?.traits?.weapon).toBe(0)
    expect(detail?.traits?.known_games).toBe(TRAIT_MIN_GAMES)
  })

  it('라플수는 `샷싸움`(딜량)이 재지고 `원어택 성공률` 은 포지션 판정을 기다린다', async () => {
    const { traits } = await playerTraits(leagueId, `${P}r5`)
    const axis = (key: string) => traits.axes.find((row) => row.key === key)

    expect(axis('duel')?.label).toBe('샷싸움')
    expect(axis('duel')?.percentile).toBe(90)
    expect(axis('finish')?.label).toBe('원어택 성공률')
    expect(axis('finish')?.percentile).toBeNull()
    expect(axis('finish')?.pending).toBe('position')
  })

  it('스나수는 `스나싸움` 을 아직 못 잰다 — 킬로그가 있어야 한다', async () => {
    const { traits } = await playerTraits(leagueId, `${P}s1`)
    const axis = (key: string) => traits.axes.find((row) => row.key === key)

    expect(traits.weapon).toBe(1)
    expect(axis('duel')?.label).toBe('스나싸움')
    expect(axis('duel')?.pending).toBe('battlelog')
    expect(axis('finish')?.label).toBe('작업 성공률')
    expect(axis('finish')?.pending).toBe('battlelog')
    /* 캐리력은 스나 무리(1명) 안에서 재진다 — 라플 무리에 섞이지 않았다 */
    expect(axis('carry')?.percentile).toBe(50)
  })

  it('라운드 복원이 필요한 세 축은 항상 `측정중` 이다', async () => {
    const { traits } = await playerTraits(leagueId, `${P}r3`)
    for (const key of ['save', 'matchman', 'outnumbered']) {
      const axis = traits.axes.find((row) => row.key === key)
      expect(axis?.percentile).toBeNull()
      expect(axis?.pending).toBe('rounds')
    }
    expect(traits.measuring).toBe(true)
  })

  it('판수가 모자란 선수는 모집단에도 들어가지 않고 전부 `경기 부족` 이다', async () => {
    const { traits } = await playerTraits(leagueId, `${P}few`)
    expect(traits.weapon).toBeNull()
    expect(traits.cohort).toBeNull()
    expect(traits.measured).toBe(0)
    expect(traits.axes.every((axis) => axis.pending === 'weapon')).toBe(true)
  })

  it('무기가 반반인 선수는 어느 무리에도 넣지 않는다', async () => {
    const { traits } = await playerTraits(leagueId, MIXED)
    expect(traits.weapon).toBeNull()
    expect(traits.measured).toBe(0)
  })

  it('플레이스타일 바 두 줄은 아직 못 잰다 — 가운데로 채우지 않는다', async () => {
    const { playstyle } = await playerTraits(leagueId, `${P}r3`)
    expect(playstyle.bars).toHaveLength(2)
    expect(playstyle.bars.map((bar) => bar.key)).toEqual(['blue', 'red'])
    for (const bar of playstyle.bars) {
      expect(bar.value).toBeNull()
      expect(bar.pending).toBe('battlelog')
    }
    expect(playstyle.measuring).toBe(true)
  })
})
