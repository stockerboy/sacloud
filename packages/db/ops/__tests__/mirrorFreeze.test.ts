/**
 * ★★3rd.supply 신규 경기 동결★★ (2026-09-04 · Pre-Part 0).
 *
 * ── 여기서 고정하는 것
 *   1. 경계 판정 — 기준시각 ★직전은 들어오고 · 정각부터는 막힌다★
 *   2. `startAt` 을 모르면 ★막는다★ — 「모른다」를 「과거다」로 바꾸지 않는다
 *   3. 동결 해제 스위치(`SACLOUD_MIRROR_UNFREEZE=yes`)가 실제로 문을 연다
 *   4. ★DB 로 실제 적재해 본다★ — 경계 직전 경기는 `Match` 가 생기고,
 *      경계 정각 경기는 `Match` 가 ★0건★ 이며 사유 칸에 세어진다
 *
 * ── ★왜 4번이 필요한가★
 *   1~3 은 순수 함수 시험이다. ★함수가 맞아도 부르지 않으면 아무 소용이 없다.★
 *   실제로 이 저장소에는 ★아무도 안 부르는 판정 함수★ 가 이미 하나 있다
 *   (`packages/nexon/src/supplyLeagueScope.ts` — 자기 테스트에서만 쓰인다).
 *   그래서 ★적재 경로가 진짜로 이 함수를 통과하는지★ 를 DB 로 확인한다.
 *
 * ── DB 를 실제로 쓴다. 다만 **트랜잭션 안에서 쓰고 전부 되돌린다.**
 *   한 줄도 남지 않는다. 로컬 DB(5433)가 없으면 조용히 건너뛴다.
 */
import { describe, expect, it } from 'vitest'
import { prisma } from '../../src/index'
import {
  MIRROR_FREEZE_FROM,
  MIRROR_FREEZE_ORIGIN,
  MIRROR_FREEZE_SKIP_REASON,
  blocksNewMirrorMatch,
  mirrorUnfrozen,
} from '../mirrorFreeze'
import { parseSupplyMirrorFile, sourceFromParsedFile } from '../supplyMirrorParse'
import { importSupplyMirror } from '../supplyMirrorImport'
import type { SupplyMirrorFileLike } from '../supplyMirrorParse'

const dbUp = await prisma
  .$queryRawUnsafe('select 1')
  .then(() => true)
  .catch(() => false)

/* ------------------------------------------------------------------ 순수 --- */

describe('동결 기준시각', () => {
  it('2026-09-03 07:00 (KST) 다', () => {
    expect(MIRROR_FREEZE_FROM.toISOString()).toBe('2026-09-02T22:00:00.000Z')
    expect(MIRROR_FREEZE_ORIGIN).toBe('3rd.supply')
  })
})

describe('경계 판정', () => {
  const clean = {} as NodeJS.ProcessEnv

  it('기준시각 1초 전은 들어온다 — ★과거 자료는 막지 않는다★', () => {
    expect(blocksNewMirrorMatch(new Date('2026-09-02T21:59:59.000Z'), clean)).toBe(false)
  })

  it('★기준시각 정각부터 막는다★ — 「이후」는 정각을 포함한다', () => {
    expect(blocksNewMirrorMatch(new Date('2026-09-02T22:00:00.000Z'), clean)).toBe(true)
  })

  it('기준시각 이후는 막는다', () => {
    expect(blocksNewMirrorMatch(new Date('2026-09-04T00:00:00.000Z'), clean)).toBe(true)
  })

  it('아주 오래된 경기는 들어온다 (2024-05)', () => {
    expect(blocksNewMirrorMatch(new Date('2024-05-24T13:03:09.000Z'), clean)).toBe(false)
  })

  it('★시각을 모르면 막는다★ — 「모른다」를 「과거다」로 바꾸지 않는다', () => {
    expect(blocksNewMirrorMatch(null, clean)).toBe(true)
    expect(blocksNewMirrorMatch(undefined, clean)).toBe(true)
  })
})

describe('동결 해제 스위치', () => {
  it('기본값은 ★잠김★ 이다 — 아무것도 안 주면 안 열린다', () => {
    expect(mirrorUnfrozen({} as NodeJS.ProcessEnv)).toBe(false)
    expect(mirrorUnfrozen({ SACLOUD_MIRROR_UNFREEZE: 'no' } as NodeJS.ProcessEnv)).toBe(false)
    /* ★참 비슷한 값으로는 안 열린다★ — 오타로 동결이 풀리면 안 된다 */
    expect(mirrorUnfrozen({ SACLOUD_MIRROR_UNFREEZE: 'YES' } as NodeJS.ProcessEnv)).toBe(false)
    expect(mirrorUnfrozen({ SACLOUD_MIRROR_UNFREEZE: '1' } as NodeJS.ProcessEnv)).toBe(false)
    expect(mirrorUnfrozen({ SACLOUD_MIRROR_UNFREEZE: 'true' } as NodeJS.ProcessEnv)).toBe(false)
  })

  it("'yes' 일 때만 열린다", () => {
    const env = { SACLOUD_MIRROR_UNFREEZE: 'yes' } as NodeJS.ProcessEnv
    expect(mirrorUnfrozen(env)).toBe(true)
    expect(blocksNewMirrorMatch(new Date('2026-09-04T00:00:00.000Z'), env)).toBe(false)
  })
})

/* --------------------------------------------------------------- DB 적재 --- */

/** 실제 데이터와 겹치지 않게 실행마다 다른 번호대를 쓴다 */
const RUN = Date.now() % 100000
const clanId = (n: number) => 930000000 + RUN * 10 + n
const playerId = (n: number) => 1930000000 + RUN * 100 + n
const tag = `freeze-${RUN}`

const A = { id: clanId(1), name: `동결가-${RUN}`, slug: `${tag}-a`, mark_bg: null, mark_front: null }
const B = { id: clanId(2), name: `동결나-${RUN}`, slug: `${tag}-b`, mark_bg: null, mark_front: null }

type ClanFixture = typeof A

function detailRow(n: number, clan: ClanFixture, win: boolean) {
  return {
    player: { id: playerId(n), name: `선수-${RUN}-${n}`, clan },
    kill: 4,
    death: 10,
    assist: 6,
    headshot: 0,
    damage: 820,
    win,
    dropout: false,
    weapon: 0,
    rating: 2910,
    rating_update: 6,
    placement: false,
  }
}

/**
 * 5:5 한 판. `startAt` 은 ★KST 문자열★ 이다 (원본 표기 그대로).
 * 기준시각은 `2026-09-03 07:00` 이므로 그 앞뒤 1초로 경계를 친다.
 */
function fixture(
  matchId: string,
  leagueSlug: string,
  startAtKst: string,
  endAtKst: string,
): SupplyMirrorFileLike {
  return {
    leagueSlug,
    leagueId: 999,
    capturedAt: '2026-09-04',
    clans: {
      [A.slug]: { leagueClanId: A.id + leagueSlug.length, clanId: A.id, name: A.name, division: 1 },
      [B.slug]: { leagueClanId: B.id + leagueSlug.length, clanId: B.id, name: B.name, division: 1 },
    },
    matches: {
      [matchId]: {
        id: matchId,
        map: '프로방스',
        mvp_player_id: playerId(1),
        player_count: 10,
        start_at: startAtKst,
        end_at: endAtKst,
        play_time: '15분 32초',
        rating_update: 9,
        win: true,
        blue_team: false,
        placement: false,
        opponent: { id: B.id, rating: 1754, division: 1, placement: false, clan: B },
        _seenFrom: A.slug,
      },
    },
    details: {
      [matchId]: {
        red: [1, 2, 3, 4, 5].map((n) => detailRow(n, A, true)),
        blue: [6, 7, 8, 9, 10].map((n) => detailRow(n, B, false)),
      },
    } as SupplyMirrorFileLike['details'],
  }
}

describe.skipIf(!dbUp)('적재 경로가 실제로 동결을 통과한다 (DB · 전부 롤백)', () => {
  class Rollback extends Error {}
  type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

  async function inRollback<T>(run: (tx: Tx) => Promise<T>) {
    let captured: T | undefined
    try {
      await prisma.$transaction(
        async (tx) => {
          captured = await run(tx)
          throw new Rollback()
        },
        { timeout: 120_000, maxWait: 30_000 },
      )
    } catch (error) {
      if (!(error instanceof Rollback)) throw error
    }
    return captured as T
  }

  /** 임시 리그 하나 + 맵 하나. 클랜은 적재가 스스로 만든다 */
  async function setup(tx: Tx, suffix: string) {
    const slug = `${tag}-${suffix}`
    const league = await tx.league.create({
      data: { slug, name: slug, origin: '3rd.supply' },
      select: { id: true },
    })
    const map = await tx.gameMap.upsert({
      where: { name: '프로방스' },
      update: {},
      create: { name: '프로방스' },
      select: { id: true },
    })
    await tx.leagueMap.create({ data: { leagueId: league.id, mapId: map.id } })
    return slug
  }

  const run = (tx: Tx, slug: string, matchId: string, startAt: string, endAt: string) =>
    importSupplyMirror({
      source: sourceFromParsedFile(parseSupplyMirrorFile(fixture(matchId, slug, startAt, endAt))),
      leagueSlug: slug,
      confirm: true,
      client: tx,
    })

  it('★기준시각 직전 경기는 들어온다★ — 과거 자료를 막으면 안 된다', async () => {
    const matchId = `2609030659591${String(RUN).padStart(5, '0')}`
    const out = await inRollback(async (tx) => {
      const slug = await setup(tx, 'before')
      const imported = await run(tx, slug, matchId, '2026-09-03 06:59:59', '2026-09-03 07:10:00')
      const rows = await tx.match.count({ where: { sourceMatchId: matchId } })
      return { imported, rows }
    })

    expect(out.imported.skipped[MIRROR_FREEZE_SKIP_REASON]).toBeUndefined()
    expect(out.imported.written.matches).toBe(1)
    expect(out.rows).toBe(1)
  })

  it('★기준시각 정각 경기는 Match 를 만들지 않는다★', async () => {
    const matchId = `2609030700001${String(RUN).padStart(5, '0')}`
    const out = await inRollback(async (tx) => {
      const slug = await setup(tx, 'at')
      const imported = await run(tx, slug, matchId, '2026-09-03 07:00:00', '2026-09-03 07:10:00')
      const rows = await tx.match.count({ where: { sourceMatchId: matchId } })
      return { imported, rows }
    })

    /* ★조용히 버리지 않는다★ — 사유별 건수에 남는다 (3-A 6번) */
    expect(out.imported.skipped[MIRROR_FREEZE_SKIP_REASON]).toBe(1)
    expect(out.imported.written.matches).toBe(0)
    expect(out.rows).toBe(0)
  })

  it('★기준시각 한참 뒤 경기도 막힌다★', async () => {
    const matchId = `2609041200001${String(RUN).padStart(5, '0')}`
    const out = await inRollback(async (tx) => {
      const slug = await setup(tx, 'after')
      const imported = await run(tx, slug, matchId, '2026-09-04 12:00:00', '2026-09-04 12:10:00')
      const rows = await tx.match.count({ where: { sourceMatchId: matchId } })
      return { imported, rows }
    })

    expect(out.imported.skipped[MIRROR_FREEZE_SKIP_REASON]).toBe(1)
    expect(out.rows).toBe(0)
  })
})
