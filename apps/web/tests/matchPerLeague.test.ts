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
/*
 * ⚠ ★픽스처 경기 시각을 창 안으로 옮겼다★ (2026-09-04).
 *   전에는 `2026-08-…` 이 박혀 있었다. ★시즌0 창이 9/3 07:00 ~ 10/1 로 바뀌자
 *   그 경기들이 창 밖으로 나가 검사가 깨졌다.★
 *   ★창을 따라가게 `IN_WINDOW` 를 쓴다★ — 창이 또 바뀌어도 안 깨진다.
 */
import { BEFORE_WINDOW, IN_WINDOW } from './seasonWindowFixture'

const HOUR = 60 * 60 * 1000

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
/** ★창 안(기준시각 이후) 경기★ — 신규 규칙을 재는 데 쓴다 (2026-09-05) */
const NEWKEY = '990827000000000003'

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
  mapId: string
} | null = null

async function cleanup() {
  const rows = [
    rowId(SHARED, SLUG_A), rowId(SHARED, SLUG_B), LEGACY,
    rowId(NEWKEY, SLUG_A), rowId(NEWKEY, SLUG_B),
    `${P}DUP-A`, `${P}DUP-B`,
  ]
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
      startAt: new Date(BEFORE_WINDOW.getTime() + 0 * HOUR),
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
      startAt: new Date(BEFORE_WINDOW.getTime() + 0 * HOUR),
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
      startAt: new Date(IN_WINDOW.getTime() + 1 * HOUR),
      playTime: 333,
      winnerSide: 'red',
      redLeagueClanId: redA.id,
      blueLeagueClanId: blueA.id,
      redDivisionAtMatch: 1,
      blueDivisionAtMatch: 1,
    },
  })

  /* ★창 안(기준시각 이후) 경기★ — 리그 A 에만. 신규 규칙에서는 이것이 정상이다 */
  await prisma.match.create({
    data: {
      id: rowId(NEWKEY, SLUG_A),
      sourceMatchId: NEWKEY,
      origin: '3rd.supply',
      leagueId: leagueA.id,
      mapId: map.id,
      playerCount: 10,
      startAt: new Date(IN_WINDOW.getTime() + 2 * HOUR),
      playTime: 444,
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
            kill: 44,
            death: 4,
            assist: 4,
            playerDivisionAtMatch: 1,
            opponentDivisionAtMatch: 1,
          },
        ],
      },
    },
  })

  ids = {
    leagueA: leagueA.id,
    leagueB: leagueB.id,
    redA: redA.id,
    blueA: blueA.id,
    redB: redB.id,
    blueB: blueB.id,
    mapId: map.id,
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

  /* ══════════════════════════════════════════════════════════════════════
   * ★★2026-09-05 · 여기 다섯을 새 규칙 검사로 갈아끼웠다★★ (사장님 지시)
   *
   *   옛 다섯은 ★「같은 경기가 창 안에 두 줄」★ 을 전제로 했다.
   *   사장님이 «2026-09-03 07:00 이후 · ★한 실제 경기 = 활성 Match 정확히 1개★» 를
   *   정하셨고 DB 자물쇠(`Match_new_sourceMatchId_key`)가 그것을 강제한다.
   *   ★그 전제가 사라졌으므로 옛 검사를 되살리는 것이 아니라 지금 규칙을 검사한다.★
   *
   *   ⚠ ★과거 구간은 그대로다★ — 위 「전제」 검사가 창 밖 두 줄을 그대로 확인한다.
   *     그것이 8번(과거 중복이 신규 제약 때문에 깨지지 않는다)의 증거다.
   * ══════════════════════════════════════════════════════════════════════ */

  it('★같은 경기번호를 신규 구간에 두 번 활성 저장할 수 없다★', async () => {
    await expect(
      prisma.match.create({
        data: {
          id: `${P}DUP-A`,
          sourceMatchId: NEWKEY,
          origin: '3rd.supply',
          leagueId: ids!.leagueA,
          mapId: ids!.mapId,
          playerCount: 10,
          startAt: new Date(IN_WINDOW.getTime() + 3 * HOUR),
          winnerSide: 'red',
          redLeagueClanId: ids!.redA,
          blueLeagueClanId: ids!.blueA,
          redDivisionAtMatch: 1,
          blueDivisionAtMatch: 1,
        },
      }),
    ).rejects.toThrow()
  })

  it('★리그를 달리해도 막힌다★ — 한 경기는 세 리그 중 하나에만 들어간다', async () => {
    await expect(
      prisma.match.create({
        data: {
          id: rowId(NEWKEY, SLUG_B),
          sourceMatchId: NEWKEY,
          origin: '3rd.supply',
          /* ★다른 리그다.★ 옛 구조에서는 이것이 정상이었다 (D-155) */
          leagueId: ids!.leagueB,
          mapId: ids!.mapId,
          playerCount: 10,
          startAt: new Date(IN_WINDOW.getTime() + 2 * HOUR),
          winnerSide: 'blue',
          redLeagueClanId: ids!.redB,
          blueLeagueClanId: ids!.blueB,
          redDivisionAtMatch: 2,
          blueDivisionAtMatch: 2,
        },
      }),
    ).rejects.toThrow()
  })

  it('★origin 이 달라도 막힌다★ — 같은 실제 경기는 하나다', async () => {
    await expect(
      prisma.match.create({
        data: {
          id: `${P}DUP-B`,
          sourceMatchId: NEWKEY,
          /* 우리 자체 수집이 같은 경기를 또 만들려는 상황이다 */
          origin: 'nexon_barracks',
          leagueId: ids!.leagueA,
          mapId: ids!.mapId,
          playerCount: 10,
          startAt: new Date(IN_WINDOW.getTime() + 2 * HOUR),
          winnerSide: 'red',
          redLeagueClanId: ids!.redA,
          blueLeagueClanId: ids!.blueA,
          redDivisionAtMatch: 1,
          blueDivisionAtMatch: 1,
        },
      }),
    ).rejects.toThrow()
  })

  it('★숨긴 줄은 자리를 안 막는다★ — 잘못 분류한 경기를 다시 넣을 수 있어야 한다', async () => {
    /*
     * ★이것이 「지우지 않고 숨긴다」가 성립하는 이유다.★
     *
     * 경기를 엉뚱한 리그에 넣었다는 것을 나중에 알았다고 하자. 옛 줄을 ★숨기고★
     * 맞는 리그에 새로 넣어야 한다. 자물쇠가 ★`supersededAt IS NULL` 만 보기★ 때문에
     * 그것이 된다 — 숨긴 줄은 「경기당 하나」를 세는 데서 빠진다.
     *
     * ⚠ ★새 줄은 다른 리그에 만든다.★ 같은 리그에 만들면 옛 제약
     *   `unique(leagueId, origin, sourceMatchId)` 에 걸린다 — 그건 이 검사의 주제가 아니다
     *   (2026-09-05 · 처음에 같은 리그로 썼다가 그 제약에 걸렸다).
     */
    await prisma.match.update({
      where: { id: rowId(NEWKEY, SLUG_A) },
      data: { supersededAt: new Date(), supersededBy: 'TEST', supersededReason: '검사' },
    })
    try {
      const made = await prisma.match.create({
        data: {
          id: `${P}DUP-A`,
          sourceMatchId: NEWKEY,
          origin: '3rd.supply',
          /* ★맞는 리그로 옮겨 다시 넣는 상황★ */
          leagueId: ids!.leagueB,
          mapId: ids!.mapId,
          playerCount: 10,
          startAt: new Date(IN_WINDOW.getTime() + 2 * HOUR),
          winnerSide: 'blue',
          redLeagueClanId: ids!.redB,
          blueLeagueClanId: ids!.blueB,
          redDivisionAtMatch: 2,
          blueDivisionAtMatch: 2,
        },
        select: { id: true },
      })
      expect(made.id).toBe(`${P}DUP-A`)
      await prisma.match.delete({ where: { id: made.id } })
    } finally {
      await prisma.match.update({
        where: { id: rowId(NEWKEY, SLUG_A) },
        data: { supersededAt: null, supersededBy: null, supersededReason: null },
      })
    }
  })

  it('밖으로 나가는 id 는 원본 18자리다 — `@슬러그`가 새지 않는다', async () => {
    const detail = await getMatch(ids!.leagueA, NEWKEY, null)
    expect(detail?.id).toBe(NEWKEY)
    expect(MatchId.safeParse(detail?.id).success).toBe(true)
    expect(detail?.play_time).toBe(444)
  })

  it('기록실 목록도 원본 18자리를 내보낸다', async () => {
    const page = await getLeagueClanMatches(ids!.redA, null, 20)
    const found = page?.items.find((item) => item.id === NEWKEY)
    expect(found).toBeTruthy()
    expect(found?.play_time).toBe(444)
    for (const item of page?.items ?? []) {
      expect(MatchId.safeParse(item.id).success).toBe(true)
    }
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

})
