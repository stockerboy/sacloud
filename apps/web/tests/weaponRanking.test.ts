/**
 * 개인랭킹 무기 축(통합/스나/라플) · 폼 TOP3 회귀 테스트 (D-169).
 *
 * 실제 DB에 임시 리그를 만들고 **실제 조회 함수**를 돌린다.
 *
 * 여기서 고정하는 것
 *   1. **통합 래더 = baseRating + 스나 증감 + 라플 증감** — 무기 분리가 통합 값을 바꾸지 않는다
 *      (`CLAUDE.md` 3-B 2번). 이 항등식이 깨지면 결함이다
 *   2. 무기 축을 붙여도 **통합 랭킹의 순서·점수는 한 줄도 바뀌지 않는다**
 *   3. 스나 랭킹과 라플 랭킹은 서로 섞이지 않고, 각자 그 무기 버킷의 승·패·킬로 만들어진다
 *   4. 정렬은 `ratingDelta` 내림차순 — 선수 프로필의 무기별 순위(D-149)와 같은 기준이다
 *   5. 배치고사 중이거나 K/D 를 아는 경기가 없으면 무기 랭킹에 넣지 않는다
 *   6. **폼 TOP3 는 미러 경기(D-164)를 센다** — `ratingUpdate` 가 비어 있고
 *      `sourceRatingDelta` 에만 값이 있는 3rd.supply 경기를 빠뜨리면 화면이 통째로 빈다
 *   7. 폼 TOP3 는 3경기 미만을 후보에서 빼고, 동점이면 경기 수가 많은 쪽을 위에 둔다
 *
 * 만든 데이터는 전부 `T166-` 접두사이고 끝나면 지운다.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@sacloud/db'
import { getPlayerRanks } from '../lib/server/queries/leagues'
import { getFormTop, getPlayerRanksByWeapon, kstDayRange } from '../lib/server/queries/rankings'

const P = 'T166-'
const SLUG = 't166league'

async function dbUp(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`
    return true
  } catch {
    return false
  }
}

const up = await dbUp()

/**
 * 폼 TOP3 픽스처를 몰아 넣는 KST 날짜.
 *
 * **시즌0 창 안**이어야 한다 (D-178 — 폼 TOP3 도 창을 본다).
 * 예전에는 `2026-03-10` 이었는데 창 시작보다 앞이라 결과가 통째로 비었다.
 * **2026-08-31 에 또 같은 일이 났다** — 창이 4/1 에서 7/1 로 옮겨지자 `2026-05-10` 이
 * 창 밖이 됐다. 창을 옮길 때 이 날짜도 같이 옮겨야 한다.
 */
const FORM_DAY = '2026-08-10'

let leagueId = ''
let mapId = ''
let redClanId = ''
let blueClanId = ''

/** 이름 → leaguePlayerId */
const lp = new Map<string, string>()
/** 이름 → playerId */
const pid = new Map<string, string>()

/**
 * 픽스처 설계.
 *
 * `rating` 은 **항등식이 성립하도록** `baseRating + 스나 + 라플` 로 직접 계산해 넣는다.
 * 시드(`packages/db/seed/seed.ts`)가 하는 것과 같은 규칙이다.
 */
const PLAYERS = [
  //           base   스나   라플   배치고사        판수(스나/라플)
  { name: 'sniperace', base: 3000, sniper: 200, rifle: 10, placement: false },
  { name: 'sniper2', base: 2900, sniper: 150, rifle: 0, placement: false },
  { name: 'rifleace', base: 3100, sniper: -20, rifle: 300, placement: false },
  { name: 'rifle2', base: 3000, sniper: 0, rifle: 120, placement: false },
  /* 배치고사 중 — 어떤 무기 랭킹에도 들어가지 않는다 */
  { name: 'placement', base: 3000, sniper: 900, rifle: 900, placement: true },
  /* 라플수인데 스나를 두 판 들었다 — **스나 랭킹에 올라오면 안 된다** (D-173).
     기록(판수·증감)은 그대로 남고 모집단에서만 빠진다 */
  {
    name: 'subweapon',
    base: 3000,
    sniper: 50,
    rifle: 100,
    placement: false,
    sniperGames: 2,
    rifleGames: 18,
  },
] as const

beforeAll(async () => {
  if (!up) return

  const league = await prisma.league.create({
    data: { slug: SLUG, name: `${P}리그`, official: true, divisionCount: 1, category: 'official' },
  })
  leagueId = league.id

  const map = await prisma.gameMap.create({ data: { id: `${P}map`, name: `${P}맵` } })
  mapId = map.id

  const makeClan = async (suffix: string) => {
    const clan = await prisma.clan.create({
      data: { id: `${P}${suffix}`, slug: `${P}${suffix}`, name: `${P}${suffix}` },
    })
    const leagueClan = await prisma.leagueClan.create({
      data: { leagueId, clanId: clan.id, division: 1, rating: 3000 },
    })
    return leagueClan.id
  }
  redClanId = await makeClan('red')
  blueClanId = await makeClan('blue')

  for (const entry of PLAYERS) {
    const player = await prisma.player.create({
      data: { id: `${P}${entry.name}`, name: `${P}${entry.name}` },
    })
    pid.set(entry.name, player.id)
    const leaguePlayer = await prisma.leaguePlayer.create({
      data: {
        leagueId,
        playerId: player.id,
        placement: entry.placement,
        baseRating: entry.base,
        // 항등식대로 만든다 — 무기 분리가 통합 값을 바꾸지 않는다 (3-B 2번)
        rating: entry.base + entry.sniper + entry.rifle,
      },
    })
    lp.set(entry.name, leaguePlayer.id)

    /* 주무기 판정은 **운영과 같은 규칙**으로 픽스처에서도 계산한다 (D-173) —
       그 무기 판수가 그 선수 전체 판수의 절반 이상이면 주무기다.
       판수를 안 적은 선수는 두 무기를 10판씩 뛴 것으로 본다(= 둘 다 주무기) */
    const weaponRows = (
      [
        [1, entry.sniper, 'sniperGames' in entry ? entry.sniperGames : 10],
        [0, entry.rifle, 'rifleGames' in entry ? entry.rifleGames : 10],
      ] as const
    ).filter(([, delta]) => delta !== 0)
    const totalGames = weaponRows.reduce((acc, [, , games]) => acc + games, 0)

    for (const [weapon, delta, games] of weaponRows) {
      await prisma.leaguePlayerWeaponStat.create({
        data: {
          leaguePlayerId: leaguePlayer.id,
          weapon,
          ratingDelta: delta,
          games,
          knownStatGames: games,
          isMain: games * 2 >= totalGames,
          win: weapon === 1 ? 7 : 6,
          lose: weapon === 1 ? 3 : 4,
          kill: weapon === 1 ? 100 : 80,
          death: weapon === 1 ? 50 : 60,
        },
      })
    }
  }

  /* 무기 기록은 있는데 K/D 를 하나도 모르는 선수 — 무기 랭킹 모집단에서 빠진다 (D-149) */
  const unknown = await prisma.player.create({
    data: { id: `${P}unknown`, name: `${P}unknown` },
  })
  pid.set('unknown', unknown.id)
  const unknownLp = await prisma.leaguePlayer.create({
    data: { leagueId, playerId: unknown.id, placement: false, baseRating: 3000, rating: 3999 },
  })
  lp.set('unknown', unknownLp.id)
  await prisma.leaguePlayerWeaponStat.create({
    data: {
      leaguePlayerId: unknownLp.id,
      weapon: 1,
      ratingDelta: 999,
      games: 5,
      knownStatGames: 0,
      /* 주무기는 맞다 — 빠지는 이유는 **K/D 를 아는 경기가 0** 이기 때문이어야 한다 */
      isMain: true,
      win: 3,
      lose: 2,
      kill: 0,
      death: 0,
    },
  })

  /* ---------------------------- 폼 TOP3 용 경기 ----------------------------
     **전부 미러 경기다** (`origin='3rd.supply'`, `redRatingUpdate = null`).
     증감은 `sourceRatingDelta` 에만 있다 — D-164 함정을 그대로 재현한다.
     이 조건에서 결과가 비면 폴백이 빠진 것이다.

     KST 같은 날에 몰아 넣는다. 마지막 경기가 그날이므로
     `getFormTop` 이 고르는 대상 날짜도 그날이 된다.

     날짜는 **시즌0 창 안**이어야 한다 (D-178 — 폼 TOP3 도 창을 본다).
     예전에는 `2026-03-10` 이었는데 창 시작보다 앞이라
     폼 TOP3 가 통째로 비었다. */
  const day = FORM_DAY
  const stats: {
    who: string
    delta: number
    weapon: number
  }[][] = [
    /* 경기 1~4 */
    [
      { who: 'sniperace', delta: 20, weapon: 1 },
      { who: 'rifleace', delta: 10, weapon: 0 },
      { who: 'rifle2', delta: 30, weapon: 0 },
    ],
    [
      { who: 'sniperace', delta: 20, weapon: 1 },
      { who: 'rifleace', delta: 10, weapon: 0 },
      { who: 'rifle2', delta: 30, weapon: 0 },
    ],
    [
      { who: 'sniperace', delta: 20, weapon: 1 },
      { who: 'rifleace', delta: 10, weapon: 0 },
      { who: 'rifle2', delta: 30, weapon: 0 },
    ],
    /* 4번째 경기는 rifleace 만 뛴다 → rifleace 4경기 40점 / rifle2 3경기 90점 */
    [
      { who: 'rifleace', delta: 10, weapon: 0 },
      /* sniper2 는 이 경기 하나뿐이다 → 3경기 미만이라 후보에서 빠진다 */
      { who: 'sniper2', delta: 500, weapon: 1 },
    ],
  ]

  for (const [index, rows] of stats.entries()) {
    const match = await prisma.match.create({
      data: {
        id: `${P}match${index}`,
        leagueId,
        mapId,
        playerCount: 10,
        // KST 12:00 = UTC 03:00 — 날짜 경계에서 흔들리지 않는 한낮으로 잡는다
        startAt: new Date(`${day}T03:00:00.000Z`),
        winnerSide: 'red',
        redLeagueClanId: redClanId,
        blueLeagueClanId: blueClanId,
        redDivisionAtMatch: 1,
        blueDivisionAtMatch: 1,
        /* 미러 경기 — 우리 공식이 계산하지 않았다 (D-153) */
        origin: '3rd.supply',
        sourceMatchId: `${P}src${index}`,
        redRatingUpdate: null,
        blueRatingUpdate: null,
      },
    })
    for (const row of rows) {
      await prisma.matchPlayerStat.create({
        data: {
          matchId: match.id,
          playerId: pid.get(row.who) ?? '',
          side: 'red',
          weapon: row.weapon,
          playerDivisionAtMatch: 1,
          opponentDivisionAtMatch: 1,
          // **우리 계산값은 없다.** 증감은 원본 칸에만 있다 (D-164 함정)
          ratingUpdate: null,
          sourceRatingDelta: row.delta,
        },
      })
    }
  }
})

afterAll(async () => {
  if (!up || !leagueId) return
  await prisma.matchPlayerStat.deleteMany({ where: { match: { leagueId } } })
  await prisma.match.deleteMany({ where: { leagueId } })
  await prisma.leaguePlayerWeaponStat.deleteMany({ where: { leaguePlayer: { leagueId } } })
  await prisma.leaguePlayer.deleteMany({ where: { leagueId } })
  await prisma.leagueClan.deleteMany({ where: { leagueId } })
  await prisma.league.delete({ where: { id: leagueId } })
  await prisma.player.deleteMany({ where: { name: { startsWith: P } } })
  await prisma.clan.deleteMany({ where: { name: { startsWith: P } } })
  await prisma.gameMap.deleteMany({ where: { name: { startsWith: P } } })
})

describe.skipIf(!up)('통합 래더 항등식 (CLAUDE.md 3-B 2번)', () => {
  it('통합 래더 = baseRating + 스나 증감 + 라플 증감 — 한 명도 어긋나지 않는다', async () => {
    const rows = await prisma.leaguePlayer.findMany({
      where: { leagueId },
      select: { rating: true, baseRating: true, weaponStats: { select: { ratingDelta: true } } },
    })
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      const sum = row.weaponStats.reduce((acc, stat) => acc + stat.ratingDelta, 0)
      expect(row.rating).toBe(row.baseRating + sum)
    }
  })

  it('무기 축을 붙여도 통합 랭킹의 순서·점수는 그대로다', async () => {
    const page = await getPlayerRanks(leagueId, null, 20)
    // 배치고사 중인 선수는 빠지고, 나머지는 rating 내림차순
    const ratings = page?.items.map((row) => row.rating) ?? []
    expect(ratings).toEqual([...ratings].sort((a, b) => b - a))
    // 통합 행은 무기 증감을 싣지 않는다
    for (const row of page?.items ?? []) {
      expect(row.rating_delta ?? null).toBeNull()
    }
  })
})

describe.skipIf(!up)('무기별 개인랭킹', () => {
  it('스나 랭킹은 스나 증감 내림차순이다', async () => {
    const page = await getPlayerRanksByWeapon(leagueId, 'sniper', null, 20)
    const deltas = page?.items.map((row) => row.rating_delta ?? 0) ?? []
    expect(deltas.length).toBeGreaterThan(0)
    expect(deltas).toEqual([...deltas].sort((a, b) => b - a))
    expect(page?.items[0]?.player.name).toBe(`${P}sniperace`)
    expect(page?.items[0]?.rank).toBe(1)
    expect(page?.items[0]?.weapon).toBe('sniper')
  })

  it('라플 랭킹은 스나 랭킹과 섞이지 않는다', async () => {
    const page = await getPlayerRanksByWeapon(leagueId, 'rifle', null, 20)
    expect(page?.items[0]?.player.name).toBe(`${P}rifleace`)
    expect(page?.items[0]?.rating_delta).toBe(300)
  })

  it('승·패·킬은 통합 누적이 아니라 그 무기 버킷의 값이다', async () => {
    const sniper = await getPlayerRanksByWeapon(leagueId, 'sniper', null, 20)
    const rifle = await getPlayerRanksByWeapon(leagueId, 'rifle', null, 20)
    const s = sniper?.items.find((row) => row.player.name === `${P}sniperace`)
    const r = rifle?.items.find((row) => row.player.name === `${P}sniperace`)
    expect(s?.win).toBe(7)
    expect(s?.lose).toBe(3)
    expect(r?.win).toBe(6)
    expect(r?.lose).toBe(4)
    // 평균킬 분모는 knownStatGames (10)
    expect(s?.kill_per_match).toBeCloseTo(10)
    expect(r?.kill_per_match).toBeCloseTo(8)
  })

  it('무기 탭에서도 통합 래더 값은 통합 래더 그대로다', async () => {
    const page = await getPlayerRanksByWeapon(leagueId, 'sniper', null, 20)
    const row = page?.items.find((entry) => entry.player.name === `${P}sniperace`)
    // base 3000 + 스나 200 + 라플 10
    expect(row?.rating).toBe(3210)
  })

  it('부무기는 그 무기 랭킹에 오르지 않는다 (D-173)', async () => {
    /* subweapon 은 라플 18판 · 스나 2판이다. 스나 증감 50점은 남지만 스나 랭킹에는 없다 —
       이게 빠지면 라플수가 어쩌다 든 스나 몇 판으로 스나 랭킹에 올라온다 */
    const sniper = await getPlayerRanksByWeapon(leagueId, 'sniper', null, 20)
    expect(sniper?.items.map((row) => row.player.name)).not.toContain(`${P}subweapon`)

    const rifle = await getPlayerRanksByWeapon(leagueId, 'rifle', null, 20)
    expect(rifle?.items.map((row) => row.player.name)).toContain(`${P}subweapon`)
  })

  it('배치고사 중이거나 K/D 를 아는 경기가 없으면 무기 랭킹에 없다', async () => {
    for (const weapon of ['sniper', 'rifle'] as const) {
      const page = await getPlayerRanksByWeapon(leagueId, weapon, null, 20)
      const names = page?.items.map((row) => row.player.name) ?? []
      expect(names).not.toContain(`${P}placement`)
      expect(names).not.toContain(`${P}unknown`)
    }
  })
})

describe.skipIf(!up)('폼 TOP3', () => {
  it('미러 경기(D-164)를 센다 — sourceRatingDelta 폴백이 빠지면 여기서 빈다', async () => {
    const form = await getFormTop(leagueId, 'all')
    expect(form?.date).toBe(FORM_DAY)
    expect(form?.rows.length).toBeGreaterThan(0)
  })

  it('증감 합이 큰 순서로 3명까지', async () => {
    const form = await getFormTop(leagueId, 'all')
    // rifle2 90점(3경기) · sniperace 60점(3경기) · rifleace 40점(4경기)
    expect(form?.rows.map((row) => row.player.name)).toEqual([
      `${P}rifle2`,
      `${P}sniperace`,
      `${P}rifleace`,
    ])
    expect(form?.rows[0]?.rating_delta).toBe(90)
    expect(form?.rows[0]?.games).toBe(3)
  })

  it('3경기 미만은 아무리 점수가 높아도 후보가 아니다', async () => {
    const form = await getFormTop(leagueId, 'all')
    // sniper2 는 1경기에 500점이지만 들어오면 안 된다
    expect(form?.rows.map((row) => row.player.name)).not.toContain(`${P}sniper2`)
  })

  it('무기 축을 따라간다 — 스나 폼에는 라플만 쓴 선수가 없다', async () => {
    const sniper = await getFormTop(leagueId, 'sniper')
    const names = sniper?.rows.map((row) => row.player.name) ?? []
    expect(names).toContain(`${P}sniperace`)
    expect(names).not.toContain(`${P}rifle2`)

    const rifle = await getFormTop(leagueId, 'rifle')
    const rifleNames = rifle?.rows.map((row) => row.player.name) ?? []
    expect(rifleNames).toContain(`${P}rifle2`)
    expect(rifleNames).not.toContain(`${P}sniperace`)
  })

  it('없는 리그는 null', async () => {
    expect(await getFormTop('no-such-league', 'all')).toBeNull()
  })
})

describe('KST 하루 경계 [미확인 — 원본이 알려주지 않은 우리 결정]', () => {
  it('KST 자정에서 자정까지다 (UTC 로는 전날 15:00 시작)', () => {
    const { from, to } = kstDayRange('2026-03-10')
    expect(from.toISOString()).toBe('2026-03-09T15:00:00.000Z')
    expect(to.toISOString()).toBe('2026-03-10T15:00:00.000Z')
  })
})
