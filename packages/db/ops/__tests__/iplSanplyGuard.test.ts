/**
 * **IPL 클랜끼리의 경기는 열산 기록이 아니다** (D-210).
 *
 * ── 왜 이 테스트가 있나
 *   2026-08-30 에 열산에서 IPL끼리의 경기 1,101건을 지웠는데, 5분마다 도는 증분
 *   동기화가 원본에서 새 경기를 가져오면서 **하루도 안 돼 다시 쌓이기 시작했다.**
 *   지우는 것만으로는 끝나지 않는다. 들어오는 길목에서 막아야 한다.
 *
 * ── 여기서 고정하는 것
 *   1. 양 팀이 모두 IPL 등록 클랜이면 → `Match` 를 만들지 않고 `ipl_only_not_sanply` 로 센다
 *   2. **한쪽만 IPL 이면 막지 않는다** — 그건 열산 경기가 맞다
 *   3. IPL 등록행에 `expelledAt` 이 붙어 있으면 그 클랜은 IPL 소속이 아니다 → 막지 않는다
 *   4. **규칙이 안 걸리는 리그(DPL·대룰)는 그대로다** — 양쪽 다 IPL 이어도 들어간다
 *
 * ── DB 를 실제로 쓴다. 다만 **트랜잭션 안에서 쓰고 전부 되돌린다.**
 *   한 줄도 남지 않는다. 로컬 DB(5433)가 없으면 조용히 건너뛴다.
 */
import { describe, expect, it } from 'vitest'
import { prisma } from '../../src/index'
import {
  IPL_LEAGUE_SLUG,
  IPL_ONLY_GUARDED_LEAGUE_SLUGS,
  IPL_ONLY_SKIP_REASON,
  SANPLY_LEAGUE_SLUG,
  loadIplOnlyMatchGuard,
} from '../iplSanplyGuard'
import { parseSupplyMirrorFile, sourceFromParsedFile } from '../supplyMirrorParse'
import { importSupplyMirror } from '../supplyMirrorImport'
import type { SupplyMirrorFileLike } from '../supplyMirrorParse'

const dbUp = await prisma
  .$queryRawUnsafe('select 1')
  .then(() => true)
  .catch(() => false)

/** 실제 데이터와 겹치지 않게 실행마다 다른 번호대를 쓴다 */
const RUN = Date.now() % 100000
const clanId = (n: number) => 910000000 + RUN * 10 + n
const playerId = (n: number) => 1910000000 + RUN * 100 + n
const tag = `d210-${RUN}`

const A = { id: clanId(1), name: `IPL가-${RUN}`, slug: `${tag}-a`, mark_bg: null, mark_front: null }
const B = { id: clanId(2), name: `IPL나-${RUN}`, slug: `${tag}-b`, mark_bg: null, mark_front: null }
const C = { id: clanId(3), name: `열산다-${RUN}`, slug: `${tag}-c`, mark_bg: null, mark_front: null }

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

/** 5:5 한 판. `_seenFrom` 은 레드 쪽이다 */
function fixture(
  matchId: string,
  leagueSlug: string,
  red: ClanFixture,
  blue: ClanFixture,
): SupplyMirrorFileLike {
  return {
    leagueSlug,
    leagueId: 999,
    capturedAt: '2026-08-30',
    clans: {
      [red.slug]: { leagueClanId: red.id + leagueSlug.length, clanId: red.id, name: red.name, division: 1 },
      [blue.slug]: { leagueClanId: blue.id + leagueSlug.length, clanId: blue.id, name: blue.name, division: 1 },
    },
    matches: {
      [matchId]: {
        id: matchId,
        map: '프로방스',
        mvp_player_id: playerId(1),
        player_count: 10,
        start_at: '2026-08-30 21:39:28',
        end_at: '2026-08-30 21:55:00',
        play_time: '15분 32초',
        rating_update: 9,
        win: true,
        blue_team: false,
        placement: false,
        opponent: { id: blue.id, rating: 1754, division: 1, placement: false, clan: blue },
        _seenFrom: red.slug,
      },
    },
    details: {
      [matchId]: {
        red: [1, 2, 3, 4, 5].map((n) => detailRow(n, red, true)),
        blue: [6, 7, 8, 9, 10].map((n) => detailRow(n, blue, false)),
      },
    } as SupplyMirrorFileLike['details'],
  }
}

const sourceFor = (matchId: string, leagueSlug: string, red: ClanFixture, blue: ClanFixture) =>
  sourceFromParsedFile(parseSupplyMirrorFile(fixture(matchId, leagueSlug, red, blue)))

describe('규칙이 걸리는 범위', () => {
  it('열산 하나뿐이다 — DPL·대룰은 건드리지 않는다', () => {
    expect([...IPL_ONLY_GUARDED_LEAGUE_SLUGS]).toEqual([SANPLY_LEAGUE_SLUG])
    expect(IPL_ONLY_GUARDED_LEAGUE_SLUGS).not.toContain('supply')
    expect(IPL_ONLY_GUARDED_LEAGUE_SLUGS).not.toContain('daerule')
    expect(IPL_LEAGUE_SLUG).toBe('nolink')
  })
})

describe.skipIf(!dbUp)('IPL끼리의 경기는 열산에 만들지 않는다 (DB · 전부 롤백)', () => {
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

  /** 임시 IPL 리그 + 임시 열산 리그를 만들고, 준 클랜들을 IPL 에 등록한다 */
  async function setup(tx: Tx, suffix: string, iplMembers: ClanFixture[], expelled: ClanFixture[] = []) {
    const iplSlug = `${tag}-ipl-${suffix}`
    const sanSlug = `${tag}-san-${suffix}`
    const ipl = await tx.league.create({
      data: { slug: iplSlug, name: iplSlug, origin: '3rd.supply' },
      select: { id: true },
    })
    await tx.league.create({ data: { slug: sanSlug, name: sanSlug, origin: '3rd.supply' } })

    for (const clan of [...iplMembers, ...expelled]) {
      const row = await tx.clan.create({
        data: {
          slug: clan.slug,
          name: clan.name,
          sourceClanId: String(clan.id),
          origin: '3rd.supply',
        },
        select: { id: true },
      })
      await tx.leagueClan.create({
        data: {
          leagueId: ipl.id,
          clanId: row.id,
          division: 1,
          expelledAt: expelled.includes(clan) ? new Date() : null,
        },
      })
    }
    return { iplSlug, sanSlug }
  }

  /** 열산 취급 리그로 가드를 만든다 (실제 slug 대신 임시 slug 를 열산 자리에 끼운다) */
  const guardFor = (tx: Tx, sanSlug: string, iplSlug: string) =>
    loadIplOnlyMatchGuard({
      targetLeagueSlug: sanSlug,
      iplLeagueSlug: iplSlug,
      guardedLeagueSlugs: [sanSlug],
      client: tx,
    })

  it('양 팀이 모두 IPL 등록 클랜이면 Match 를 만들지 않는다', async () => {
    const matchId = `2608302139281${String(RUN).padStart(5, '0')}`
    const result = await inRollback(async (tx) => {
      const { iplSlug, sanSlug } = await setup(tx, 'both', [A, B])
      const guard = await guardFor(tx, sanSlug, iplSlug)
      const imported = await importSupplyMirror({
        source: sourceFor(matchId, sanSlug, A, B),
        leagueSlug: sanSlug,
        confirm: true,
        client: tx,
        iplOnlyGuard: guard,
      })
      const rows = await tx.match.count({ where: { sourceMatchId: matchId } })
      return { guard, imported, rows }
    })

    expect(result.guard.enabled).toBe(true)
    expect(result.guard.iplClanCount).toBe(2)
    /* 조용히 버리지 않는다 — 사유별 건수에 남는다 (3-A 6번) */
    expect(result.imported.skipped[IPL_ONLY_SKIP_REASON]).toBe(1)
    expect(result.imported.written.matches).toBe(0)
    expect(result.rows).toBe(0)
  })

  it('한쪽만 IPL 이면 막지 않는다 — 그건 열산 경기가 맞다', async () => {
    const matchId = `2608312139281${String(RUN).padStart(5, '0')}`
    const result = await inRollback(async (tx) => {
      const { iplSlug, sanSlug } = await setup(tx, 'one', [A])
      const guard = await guardFor(tx, sanSlug, iplSlug)
      const imported = await importSupplyMirror({
        source: sourceFor(matchId, sanSlug, A, C),
        leagueSlug: sanSlug,
        confirm: true,
        client: tx,
        iplOnlyGuard: guard,
      })
      const rows = await tx.match.count({ where: { sourceMatchId: matchId } })
      return { imported, rows }
    })

    expect(result.imported.skipped[IPL_ONLY_SKIP_REASON]).toBeUndefined()
    expect(result.imported.written.matches).toBe(1)
    expect(result.rows).toBe(1)
  })

  it('IPL 등록행이 추방(expelledAt)이면 IPL 소속이 아니다 — 막지 않는다', async () => {
    const matchId = `2609012139281${String(RUN).padStart(5, '0')}`
    const result = await inRollback(async (tx) => {
      /* A 는 살아 있고 B 는 추방됐다 → 양쪽 다 IPL 이 아니다 */
      const { iplSlug, sanSlug } = await setup(tx, 'expelled', [A], [B])
      const guard = await guardFor(tx, sanSlug, iplSlug)
      const imported = await importSupplyMirror({
        source: sourceFor(matchId, sanSlug, A, B),
        leagueSlug: sanSlug,
        confirm: true,
        client: tx,
        iplOnlyGuard: guard,
      })
      const rows = await tx.match.count({ where: { sourceMatchId: matchId } })
      return { guard, imported, rows }
    })

    expect(result.guard.iplClanCount).toBe(1)
    expect(result.imported.skipped[IPL_ONLY_SKIP_REASON]).toBeUndefined()
    expect(result.imported.written.matches).toBe(1)
    expect(result.rows).toBe(1)
  })

  it('규칙이 안 걸리는 리그는 그대로다 — 양쪽 다 IPL 이어도 들어간다', async () => {
    const matchId = `2609022139281${String(RUN).padStart(5, '0')}`
    const result = await inRollback(async (tx) => {
      const { iplSlug, sanSlug } = await setup(tx, 'other', [A, B])
      /* 이 리그는 감시 목록에 없다 → DB 를 읽지도 않고 아무것도 막지 않는다 */
      const guard = await loadIplOnlyMatchGuard({
        targetLeagueSlug: sanSlug,
        iplLeagueSlug: iplSlug,
        guardedLeagueSlugs: ['어떤-다른-리그'],
        client: tx,
      })
      const imported = await importSupplyMirror({
        source: sourceFor(matchId, sanSlug, A, B),
        leagueSlug: sanSlug,
        confirm: true,
        client: tx,
        iplOnlyGuard: guard,
      })
      const rows = await tx.match.count({ where: { sourceMatchId: matchId } })
      return { guard, imported, rows }
    })

    expect(result.guard.enabled).toBe(false)
    expect(result.guard.blocks({ slug: A.slug }, { slug: B.slug })).toBe(false)
    expect(result.imported.skipped[IPL_ONLY_SKIP_REASON]).toBeUndefined()
    expect(result.imported.written.matches).toBe(1)
    expect(result.rows).toBe(1)
  })
})
