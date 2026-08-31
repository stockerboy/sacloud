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

/** 픽스처 만들기·지우기에 주는 시간. 기본 10초는 로컬 DB 가 붐빌 때 모자란다 */
const HOOK_TIMEOUT_MS = 60_000

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

/**
 * **탈주만 한 라플수** (D-209).
 *
 * `damage = 0` 은 "0딜을 넣었다" 가 아니라 **결측**이다. 10판을 뛰었지만 딜량을 잴 판이
 * 하나도 없으므로 `샷싸움` 은 `경기 부족` 이어야 한다. 예전 규칙이라면 `판당 0딜` 로
 * 계산돼 분포 맨 아래에 실제 백분위가 찍혔다.
 */
const DROPPER = `${P}drop`

/** 탈주판 수 — `TRAIT_MIN_GAMES` 와 같게 둬서 "판수는 채웠지만 딜량 표본이 없다" 를 만든다 */
const DROPOUT_GAMES = TRAIT_MIN_GAMES

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

  for (const entry of [...PLAYERS.map((row) => row.id), MIXED, DROPPER]) {
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

  /*
    탈주판 (D-209) — `damage = 0` 은 결측이지 0딜이 아니다.
    같은 판에 두 사람을 넣는다.

      r3       정상 10판(판당 3000딜) + 여기 10판 → 딜량 평균은 **3000** 이어야 한다.
               탈주판을 세면 30000/20 = 1500 이 되고 백분위가 50 에서 30 으로 내려간다
      DROPPER  여기 10판만 → **딜량을 잴 판이 하나도 없다**. 킬은 아는 값이라
               캐리력은 재지고 `샷싸움` 만 `경기 부족` 이다
  */
  const dropoutIds = Array.from({ length: DROPOUT_GAMES }, (_, index) => `${P}d${index}`)
  /* 한 줄씩 만들면 왕복이 30번이라 `beforeAll` 이 기본 10초를 넘긴다. 한 번에 넣는다 */
  await prisma.match.createMany({
    data: dropoutIds.map((id, index) => ({
      id,
      leagueId,
      mapId,
      redLeagueClanId: redClanId,
      blueLeagueClanId: blueClanId,
      startAt: new Date(IN_WINDOW.getTime() + (100 + index) * DAY),
      winnerSide: 'red',
      official: true,
      origin: '3rd.supply',
      playerCount: 10,
      participantCompleteness: '5v5',
      redDivisionAtMatch: 1,
      blueDivisionAtMatch: 1,
    })),
  })
  await prisma.matchPlayerStat.createMany({
    data: dropoutIds.flatMap((matchId) =>
      [`${P}r3`, DROPPER].map((playerId) => ({
        matchId,
        playerId,
        side: 'red',
        kill: 3,
        death: 5,
        /* 실제 탈주판은 어시·헤드샷도 전원 0 이다 (D-209 실측) */
        assist: 0,
        headshot: 0,
        damage: 0,
        weapon: 0,
        playerDivisionAtMatch: 1,
        opponentDivisionAtMatch: 1,
      })),
    ),
  })

  /* 픽스처를 만든 뒤에 캐시를 비운다. 리그가 새로 생겼으니 원래 비어 있지만,
     같은 프로세스에서 다른 테스트가 먼저 이 리그를 읽었을 가능성을 없앤다 */
  clearTraitDistributionCache()
  /* 픽스처가 100행이 넘고 로컬 DB 를 다른 작업과 나눠 쓴다. 기본 10초로는 모자란다 */
}, HOOK_TIMEOUT_MS)

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
}, HOOK_TIMEOUT_MS)

describe.runIf(up)('전투력 육각형 — 모집단과 백분위 (D-185)', () => {
  it('라플수는 라플수끼리만 견준다 — 스나수는 그 무리에 없다', async () => {
    const { traits } = await playerTraits(leagueId, `${P}r3`)
    expect(traits.weapon).toBe(0)
    /* 라플 5명 + 탈주만 한 1명. 스나 1명 · 판수 부족 1명 · 반반 1명은 들어오지 않는다.
       탈주만 한 선수도 **킬은 아는 값**이라 캐리력 모집단에는 든다 (D-209) */
    expect(traits.cohort).toBe(6)
  })

  it('판당 킬이 가장 높은 선수가 가장 위다', async () => {
    const top = await playerTraits(leagueId, `${P}r5`)
    const bottom = await playerTraits(leagueId, `${P}r1`)
    const carry = (result: Awaited<ReturnType<typeof playerTraits>>) =>
      result.traits.axes.find((axis) => axis.key === 'carry')?.percentile

    /* 판당 킬 [1, 2, 3, 3, 5 …] 6명. mid-rank 로 꼴찌 8.3, 1등 91.7 이다 */
    expect(carry(bottom)).toBe(8.3)
    expect(carry(top)).toBe(91.7)
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
    /* 기회창출(D-214)도 라운드 복원이 재료다 — 세 축이 함께 기다린다 */
    for (const key of ['save', 'opening', 'outnumbered']) {
      const axis = traits.axes.find((row) => row.key === key)
      expect(axis?.percentile).toBeNull()
      expect(axis?.pending).toBe('rounds')
    }
    expect(traits.measuring).toBe(true)
  })

  it('4번 자리는 `기회창출` 이다 — 빈 자리도 `매치의 사나이` 도 아니다 (D-214)', async () => {
    const { traits } = await playerTraits(leagueId, `${P}r3`)
    /* 꼭지점은 그대로 6개다. 오각형이 되지 않는다 */
    expect(traits.axes).toHaveLength(6)
    const axis = traits.axes[3]
    expect(axis?.key).toBe('opening')
    expect(axis?.label).toBe('기회창출')
    /* 이 픽스처에는 라운드 자료가 없다 — 그래서 `라운드 복원 필요` 다.
       D-206 시절의 `미정` 과는 다른 상태다 */
    expect(axis?.percentile).toBeNull()
    expect(axis?.pending).toBe('rounds')
    expect(traits.axes.some((row) => row.label === '매치의 사나이')).toBe(false)
    expect(traits.axes.some((row) => row.label === '미정')).toBe(false)
  })

  it('판수가 모자란 선수는 모집단에 안 들어가지만 이유는 `경기 부족` 이다', async () => {
    /*
      **`주무기 미정` 이 아니다.** 둘은 기다려야 하는 것이 다르다 —
      하나는 더 뛰면 되고, 하나는 무기를 한쪽으로 몰아야 한다.
      예전에는 모집단에서 빠진 선수에게 무기까지 `null` 로 넘겨서
      판수가 모자란 선수 전원이 `주무기 미정` 으로 떴다.
    */
    const { traits } = await playerTraits(leagueId, `${P}few`)
    expect(traits.weapon).toBe(0)
    /* 모집단에 못 들었으므로 견줄 무리가 없다 */
    expect(traits.cohort).toBeNull()
    expect(traits.measured).toBe(0)
    /* 4번도 이제 데이터 축이라 함께 `경기 부족` 이다 (D-214) */
    expect(traits.axes.every((axis) => axis.pending === 'games')).toBe(true)
  })

  it('무기가 반반인 선수는 어느 무리에도 넣지 않는다', async () => {
    const { traits } = await playerTraits(leagueId, MIXED)
    expect(traits.weapon).toBeNull()
    expect(traits.measured).toBe(0)
  })

  /*
    ── 탈주판은 딜량 평균에 넣지 않는다 (D-209)

    `MatchPlayerStat.damage = 0` 은 결측이 0 으로 저장된 것이다. 실측(2026-08-30 · 미러 DB)
    으로 그런 행의 98.4% 가 탈주였고, 같은 행에서 `assist` 와 `headshot` 도 전원 0 이었다.
    그걸 평균에 넣으면 `샷싸움` 축이 딜량이 아니라 **팀의 탈주 빈도**를 재게 된다 —
    운영 데이터에서 라플 판당딜 중앙값이 919.7 로 찍혔다(실제 1,400대).
  */
  it('탈주판(`딜량 0`)은 판당 딜량 평균에서 빠진다', async () => {
    const { traits } = await playerTraits(leagueId, `${P}r3`)
    const duel = traits.axes.find((axis) => axis.key === 'duel')

    /* r3 은 3000딜 10판 + 탈주 10판이다. 딜량 평균은 **3000** —
       [1000, 2000, 3000, 4000, 5000] 안에서 한가운데라 50 이다.
       탈주판을 세면 평균이 1500 이 되고 백분위가 30 으로 내려간다 */
    expect(duel?.percentile).toBe(50)
    expect(duel?.pending).toBeNull()
  })

  it('탈주만 한 선수는 `샷싸움` 을 못 잰다 — `판당 0딜` 로 세지 않는다', async () => {
    const { traits } = await playerTraits(leagueId, DROPPER)
    const axis = (key: string) => traits.axes.find((row) => row.key === key)

    /* 킬은 아는 값이라 캐리력은 재진다 — 딜량만 잴 판이 없는 것이다 */
    expect(traits.weapon).toBe(0)
    expect(axis('carry')?.percentile).not.toBeNull()

    /* 예전 규칙이라면 `판당 0딜` 로 분포 맨 아래(8.3%)에 실제 숫자가 찍혔다.
       0은 "딜을 못 넣는다" 가 아니라 **모른다** 이므로 `null` 이어야 한다 (D-106) */
    expect(axis('duel')?.percentile).toBeNull()
    expect(axis('duel')?.pending).toBe('games')
  })

  /**
   * 이 픽스처에는 **배틀로그가 없다** — `PlayerPlaystyleProfile` 이 한 줄도 없다.
   * 그러니 두 줄 다 못 재는 것이 맞다.
   *
   * ⚠ 못 재는 **이유**가 D-211 에서 바뀌었다. 예전에는 `배틀로그 필요`(`battlelog`)로
   * 뭉뚱그렸는데, 이제는 자료 자체가 없으면 `라운드 복원 필요`(`rounds`)이고
   * 자료는 있는데 표본이 모자라면 `경기 부족`(`games`)이다. 둘을 가르지 않으면
   * "더 뛰면 나온다" 와 "자료가 아예 없다" 가 같은 말이 된다.
   */
  it('배틀로그가 없으면 두 줄 다 못 잰다 — 가운데로 채우지 않는다', async () => {
    const { playstyle } = await playerTraits(leagueId, `${P}r3`)
    expect(playstyle.bars).toHaveLength(2)
    expect(playstyle.bars.map((bar) => bar.key)).toEqual(['blue', 'red'])
    for (const bar of playstyle.bars) {
      expect(bar.value).toBeNull()
      /* 0 은 "재 봤더니 가운데(정석)" 라는 실제 판정이다. 모르는 것과 섞지 않는다 */
      expect(bar.value).not.toBe(0)
      expect(bar.pending).toBe('rounds')
    }
    expect(playstyle.measuring).toBe(true)
  })
})
