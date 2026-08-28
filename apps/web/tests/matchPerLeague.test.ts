/**
 * 같은 경기가 여러 리그에 있을 때, **각 리그에서 자기 기록이 나오는가** (D-155).
 *
 * ── 왜 이 테스트가 필요한가
 *   클랜은 리그를 겸한다. e2stro- 와 The|vub 가 둘 다 공식리그·열산리그 소속이면
 *   그 경기는 양쪽 리그에 다 찍힌다. 그래서 **같은 경기 번호를 가진 행이 둘 이상** 생긴다
 *   (실측: 공식리그와 열산리그에 1,828건이 겹친다).
 *
 *   행의 기본키는 리그마다 다르지만(`<18자리>@<리그slug>`), **밖으로 나가는 값은
 *   원본 경기 번호 18자리**다. 그러면 조회 키가 더 이상 유일하지 않다 —
 *   **리그를 함께 걸지 않으면 엉뚱한 리그의 기록이 나온다.** 그걸 잡는 것이 이 파일이다.
 *
 * ── 고정하는 것
 *   1. 응답의 `id` 는 **원본 18자리**다 (계약 `MatchId` 를 만족한다). `@슬러그`가 새지 않는다
 *   2. 리그 A 에서 열면 A 의 기록, 리그 B 에서 열면 B 의 기록이 나온다
 *   3. 리그를 안 걸면 둘 중 아무거나 나올 수 있다 — 그래서 조회에 리그가 **반드시** 걸린다
 *   4. 예전 형식 행(`id === sourceMatchId`)도 그대로 열린다
 *   5. 목록(기록실)도 같은 규칙을 따른다
 *
 * 실제 DB에 임시 데이터를 만들고 끝나면 지운다. 전부 `T155-` 접두사다.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@sacloud/db'
import { MatchId } from '@sacloud/contract'
import { getLeagueClanMatches, getMatch } from '../lib/server/queries/matches'

const P = 'T155-'
const SLUG_A = 't155a'
const SLUG_B = 't155b'

/** 두 리그에 **똑같이** 들어가는 경기 번호 (원본 대조 키) */
const SHARED = '990827000000000001'
/** 리그 A 에만 있는 **예전 형식** 행 — id 가 곧 경기 번호다 */
const LEGACY = '990827000000000002'

/** 행의 기본키. 리그마다 다르다 (`packages/db/ops/supplyMirrorImport.ts` 의 규칙과 같다) */
const rowId = (sourceMatchId: string, leagueSlug: string) => `${sourceMatchId}@${leagueSlug}`

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
  leagueA: string
  leagueB: string
  redA: string
  blueA: string
  redB: string
  blueB: string
} | null = null

async function cleanup() {
  const rows = [rowId(SHARED, SLUG_A), rowId(SHARED, SLUG_B), LEGACY]
  await prisma.matchPlayerStat.deleteMany({ where: { matchId: { in: rows } } })
  await prisma.match.deleteMany({ where: { id: { in: rows } } })
  await prisma.leagueClan.deleteMany({ where: { league: { slug: { in: [SLUG_A, SLUG_B] } } } })
  await prisma.league.deleteMany({ where: { slug: { in: [SLUG_A, SLUG_B] } } })
  await prisma.clan.deleteMany({ where: { slug: { startsWith: 't155-' } } })
  await prisma.player.deleteMany({ where: { id: { startsWith: P } } })
  await prisma.gameMap.deleteMany({ where: { name: `${P}맵` } })
}

beforeAll(async () => {
  if (!up) return
  await cleanup()

  const map = await prisma.gameMap.create({ data: { name: `${P}맵` } })

  /* 클랜 넷 — 리그마다 다른 클랜이 뛴 것처럼 만들어 두면 결과가 섞였을 때 눈에 보인다 */
  const clans = await Promise.all(
    ['ar', 'ab', 'br', 'bb'].map((tag, index) =>
      prisma.clan.create({ data: { slug: `t155-${tag}`, name: `${P}클랜${index}` } }),
    ),
  )

  const [leagueA, leagueB] = await Promise.all([
    prisma.league.create({
      data: { slug: SLUG_A, name: `${P}리그A`, maps: { create: [{ mapId: map.id }] } },
    }),
    prisma.league.create({
      data: { slug: SLUG_B, name: `${P}리그B`, maps: { create: [{ mapId: map.id }] } },
    }),
  ])

  const [redA, blueA, redB, blueB] = await Promise.all([
    prisma.leagueClan.create({
      data: { leagueId: leagueA.id, clanId: clans[0]!.id, division: 1, placement: false },
    }),
    prisma.leagueClan.create({
      data: { leagueId: leagueA.id, clanId: clans[1]!.id, division: 1, placement: false },
    }),
    prisma.leagueClan.create({
      data: { leagueId: leagueB.id, clanId: clans[2]!.id, division: 2, placement: false },
    }),
    prisma.leagueClan.create({
      data: { leagueId: leagueB.id, clanId: clans[3]!.id, division: 2, placement: false },
    }),
  ])

  const player = await prisma.player.create({ data: { id: `${P}선수`, name: `${P}선수` } })

  /* 같은 경기 번호로 리그 둘에 각각 한 행씩. 기본키만 다르다 */
  await prisma.match.create({
    data: {
      id: rowId(SHARED, SLUG_A),
      sourceMatchId: SHARED,
      origin: '3rd.supply',
      leagueId: leagueA.id,
      mapId: map.id,
      playerCount: 10,
      startAt: new Date('2026-08-27T12:00:00Z'),
      playTime: 111,
      winnerSide: 'red',
      redLeagueClanId: redA.id,
      blueLeagueClanId: blueA.id,
      redDivisionAtMatch: 1,
      blueDivisionAtMatch: 1,
      stats: {
        create: [
          {
            playerId: player.id,
            side: 'red',
            kill: 11,
            death: 1,
            assist: 1,
            playerDivisionAtMatch: 1,
            opponentDivisionAtMatch: 1,
          },
        ],
      },
    },
  })
  await prisma.match.create({
    data: {
      id: rowId(SHARED, SLUG_B),
      sourceMatchId: SHARED,
      origin: '3rd.supply',
      leagueId: leagueB.id,
      mapId: map.id,
      playerCount: 10,
      startAt: new Date('2026-08-27T12:00:00Z'),
      /* 리그 A 와 **다른 값**을 넣는다. 섞이면 이 숫자로 들통난다 */
      playTime: 222,
      winnerSide: 'blue',
      redLeagueClanId: redB.id,
      blueLeagueClanId: blueB.id,
      redDivisionAtMatch: 2,
      blueDivisionAtMatch: 2,
      stats: {
        create: [
          {
            playerId: player.id,
            side: 'blue',
            kill: 22,
            death: 2,
            assist: 2,
            playerDivisionAtMatch: 2,
            opponentDivisionAtMatch: 2,
          },
        ],
      },
    },
  })

  /* 예전 형식 행 — 기본키가 곧 경기 번호다 (DB 에 12,567행이 이 형식이다) */
  await prisma.match.create({
    data: {
      id: LEGACY,
      sourceMatchId: LEGACY,
      origin: '3rd.supply',
      leagueId: leagueA.id,
      mapId: map.id,
      playerCount: 10,
      startAt: new Date('2026-08-27T13:00:00Z'),
      playTime: 333,
      winnerSide: 'red',
      redLeagueClanId: redA.id,
      blueLeagueClanId: blueA.id,
      redDivisionAtMatch: 1,
      blueDivisionAtMatch: 1,
    },
  })

  ids = {
    leagueA: leagueA.id,
    leagueB: leagueB.id,
    redA: redA.id,
    blueA: blueA.id,
    redB: redB.id,
    blueB: blueB.id,
  }
})

afterAll(async () => {
  if (up) await cleanup()
})

describe.runIf(up)('같은 경기가 여러 리그에 있을 때 (D-155)', () => {
  it('전제 — 같은 경기 번호로 행이 둘이고, 기본키만 다르다', async () => {
    const rows = await prisma.match.findMany({
      where: { sourceMatchId: SHARED },
      select: { id: true, leagueId: true },
      orderBy: { id: 'asc' },
    })
    expect(rows).toHaveLength(2)
    expect(rows.map((row) => row.id)).toEqual([rowId(SHARED, SLUG_A), rowId(SHARED, SLUG_B)])
  })

  it('밖으로 나가는 id 는 원본 18자리다 — `@슬러그`가 새지 않는다', async () => {
    const detail = await getMatch(ids!.leagueA, SHARED, null)
    expect(detail?.id).toBe(SHARED)
    // 계약이 그대로 통과해야 한다 (사용자 URL 도 18자리뿐이다)
    expect(MatchId.safeParse(detail?.id).success).toBe(true)
  })

  it('리그 A 에서 열면 A 의 기록이 나온다', async () => {
    const detail = await getMatch(ids!.leagueA, SHARED, ids!.redA)
    expect(detail?.league_id).toBe(ids!.leagueA)
    expect(detail?.play_time).toBe(111)
    expect(detail?.win).toBe(true) // A 는 red 승, viewer 가 red
    expect(detail?.red_stats.map((stat) => stat.kill)).toEqual([11])
    expect(detail?.league_clan.division).toBe(1)
  })

  it('리그 B 에서 열면 B 의 기록이 나온다 — A 의 값이 섞이지 않는다', async () => {
    const detail = await getMatch(ids!.leagueB, SHARED, ids!.redB)
    expect(detail?.league_id).toBe(ids!.leagueB)
    expect(detail?.play_time).toBe(222)
    expect(detail?.win).toBe(false) // B 는 blue 승, viewer 가 red
    expect(detail?.blue_stats.map((stat) => stat.kill)).toEqual([22])
    expect(detail?.league_clan.division).toBe(2)
  })

  it('**핵심** — 리그를 안 걸면 틀린 리그가 나올 수 있다. 조회는 리그를 반드시 건다', async () => {
    /* 리그 없이 경기 번호로만 찾으면 무엇이 나올지 우리가 정하지 못한다 */
    const anyLeague = await prisma.match.findFirst({
      where: { OR: [{ sourceMatchId: SHARED }, { id: SHARED }] },
      select: { leagueId: true },
    })
    expect([ids!.leagueA, ids!.leagueB]).toContain(anyLeague?.leagueId)

    /* 반면 조회 함수는 **건 리그의 것만** 준다. 두 결과가 서로 다르다 */
    const [a, b] = await Promise.all([
      getMatch(ids!.leagueA, SHARED, null),
      getMatch(ids!.leagueB, SHARED, null),
    ])
    expect(a?.league_id).toBe(ids!.leagueA)
    expect(b?.league_id).toBe(ids!.leagueB)
    expect(a?.play_time).not.toBe(b?.play_time)
    // 같은 경기 번호를 내보내지만 속은 각 리그의 것이다
    expect(a?.id).toBe(b?.id)
  })

  it('그 리그에 없는 경기는 없다고 답한다 (다른 리그 것을 빌려오지 않는다)', async () => {
    // LEGACY 는 리그 A 에만 있다
    expect(await getMatch(ids!.leagueA, LEGACY, null)).not.toBeNull()
    expect(await getMatch(ids!.leagueB, LEGACY, null)).toBeNull()
  })

  it('예전 형식 행(id = 경기번호)도 그대로 열린다', async () => {
    const detail = await getMatch(ids!.leagueA, LEGACY, null)
    expect(detail?.id).toBe(LEGACY)
    expect(detail?.play_time).toBe(333)
  })

  it('기록실 목록도 원본 18자리를 내보낸다', async () => {
    const page = await getLeagueClanMatches(ids!.redA, null, 20)
    const shared = page?.items.find((item) => item.id === SHARED)
    expect(shared).toBeTruthy()
    expect(shared?.play_time).toBe(111)
    for (const item of page?.items ?? []) {
      expect(MatchId.safeParse(item.id).success).toBe(true)
    }
  })
})
