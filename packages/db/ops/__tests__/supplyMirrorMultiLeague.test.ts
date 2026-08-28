/**
 * 같은 경기를 **여러 리그에 기록**한다 (D-155).
 *
 * ── 왜 이 테스트가 있나
 *   클랜은 리그를 겸한다. e2stro- 와 The|vub 가 둘 다 공식리그·열산리그 소속이면
 *   그 경기는 양쪽 리그에 다 찍혀야 한다. 예전 코드는 "다른 리그에 이미 있다"며 버렸고
 *   그렇게 공식리그 1,828건 · 열산리그 28건이 사라졌다.
 *
 * ── 여기서 고정하는 것
 *   1. 같은 경기를 리그 둘에 넣으면 **행이 둘** 생긴다 (id 는 다르고 경기 번호는 같다)
 *   2. 같은 리그에 두 번 넣으면 두 번째는 `already_in_db` 다 (idempotent)
 *   3. **예전 형식 행(`id === sourceMatchId`)과 새 형식 행이 섞여도 중복이 안 생긴다**
 *      — 중복 판정을 `(리그, sourceMatchId)` 로만 하기 때문이다
 *
 * ── DB 를 실제로 쓴다. 다만 **트랜잭션 안에서 쓰고 전부 되돌린다.**
 *   한 줄도 남지 않는다. 로컬 DB(5433)가 없으면 조용히 건너뛴다.
 */
import { describe, expect, it } from 'vitest'
import { prisma } from '../../src/index'
import { parseSupplyMirrorFile, sourceFromParsedFile } from '../supplyMirrorParse'
import { importSupplyMirror, supplyMatchRowId } from '../supplyMirrorImport'
import type { SupplyMirrorFileLike } from '../supplyMirrorParse'

/* 로컬 DB 가 없는 환경에서는 건너뛴다 (개발 DB 는 `pnpm db:start` 로 띄운다) */
const dbUp = await prisma
  .$queryRawUnsafe('select 1')
  .then(() => true)
  .catch(() => false)

/** 실제 데이터와 겹치지 않게 실행마다 다른 번호대를 쓴다 */
const RUN = Date.now() % 100000
const clanId = (n: number) => 900000000 + RUN * 10 + n
const playerId = (n: number) => 1900000000 + RUN * 100 + n
const tag = `d155-${RUN}`

const RED = { id: clanId(1), name: `테스트레드-${RUN}`, slug: `${tag}-red`, mark_bg: null, mark_front: null }
const BLUE = { id: clanId(2), name: `테스트블루-${RUN}`, slug: `${tag}-blue`, mark_bg: null, mark_front: null }

function detailRow(n: number, clan: typeof RED, win: boolean) {
  return {
    player: { id: playerId(n), name: `테스트선수-${RUN}-${n}`, clan },
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
 * 5:5 한 판. `_seenFrom` 은 레드(=우리 클랜).
 *
 * `mirrorId` 를 주면 **같은 두 클랜이 블루 화면에서 보인 경기**를 한 건 더 넣는다.
 * 그 행에는 레드 클랜이 상대로 나오므로 **레드의 클랜 점수**가 드러난다 (D-155 후속).
 */
function fixture(matchIds: string[], leagueSlug: string, mirrorId?: string): SupplyMirrorFileLike {
  const matches: SupplyMirrorFileLike['matches'] = {}
  const details: Record<string, unknown> = {}
  for (const [i, id] of matchIds.entries()) {
    matches[id] = {
      id,
      map: '프로방스',
      mvp_player_id: playerId(1),
      player_count: 10,
      start_at: `2026-07-2${i + 1} 21:39:28`,
      end_at: `2026-07-2${i + 1} 21:55:00`,
      play_time: '15분 32초',
      rating_update: 9,
      win: true,
      blue_team: false,
      placement: false,
      opponent: { id: clanId(2), rating: 1754, division: 1, placement: false, clan: BLUE },
      _seenFrom: RED.slug,
    }
    details[id] = {
      red: [1, 2, 3, 4, 5].map((n) => detailRow(n, RED, true)),
      blue: [6, 7, 8, 9, 10].map((n) => detailRow(n, BLUE, false)),
    }
  }
  if (mirrorId) {
    matches[mirrorId] = {
      ...(matches[matchIds[0] as string] as NonNullable<SupplyMirrorFileLike['matches'][string]>),
      id: mirrorId,
      start_at: '2026-07-30 21:39:28',
      end_at: '2026-07-30 21:55:00',
      win: false,
      blue_team: true,
      rating_update: -11,
      opponent: { id: clanId(1), rating: 2100, division: 1, placement: false, clan: RED },
      _seenFrom: BLUE.slug,
    }
    details[mirrorId] = details[matchIds[0] as string]
  }
  return {
    leagueSlug,
    leagueId: 999,
    capturedAt: '2026-08-27',
    clans: {
      /* `league_clan` id 는 (리그, 클랜) 쌍마다 다르다 — 원본이 리그별로 다른 번호를 준다.
         그래서 리그 slug 에서 뽑은 값을 섞어 리그마다 다른 번호가 되게 한다 */
      [RED.slug]: { leagueClanId: clanId(1) + leagueSlug.length, clanId: clanId(1), name: RED.name, division: 1 },
      [BLUE.slug]: { leagueClanId: clanId(2) + leagueSlug.length, clanId: clanId(2), name: BLUE.name, division: 1 },
    },
    matches,
    details: details as SupplyMirrorFileLike['details'],
  }
}

function sourceFor(matchIds: string[], leagueSlug: string, mirrorId?: string) {
  return sourceFromParsedFile(parseSupplyMirrorFile(fixture(matchIds, leagueSlug, mirrorId)))
}

describe('경기 행 id 규칙', () => {
  it('리그 slug 를 붙여 리그별로 다른 행이 된다 — 경기 번호는 그대로다', () => {
    expect(supplyMatchRowId('260725213928124003', 'daerule')).toBe('260725213928124003@daerule')
    expect(supplyMatchRowId('260725213928124003', 'supply')).toBe('260725213928124003@supply')
  })
})

describe.skipIf(!dbUp)('같은 경기를 여러 리그에 기록한다 (DB · 전부 롤백)', () => {
  class Rollback extends Error {}

  /** 트랜잭션 안에서 돌리고 무조건 되돌린다 — DB 에 아무것도 남기지 않는다 */
  async function inRollback<T>(run: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<T>) {
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

  it('리그 둘에 각각 들어간다 — 행은 둘, 경기 번호는 하나', async () => {
    const matchId = `2607252139281${String(RUN).padStart(5, '0')}`
    const result = await inRollback(async (tx) => {
      const a = `${tag}-a`
      const b = `${tag}-b`
      for (const slug of [a, b]) {
        await tx.league.create({ data: { slug, name: slug, origin: '3rd.supply' } })
      }
      const first = await importSupplyMirror({
        source: sourceFor([matchId], a),
        leagueSlug: a,
        confirm: true,
        client: tx,
      })
      /* 예전 코드는 여기서 `exists_in_other_league` 로 버렸다 */
      const second = await importSupplyMirror({
        source: sourceFor([matchId], b),
        leagueSlug: b,
        confirm: true,
        client: tx,
      })
      const rows = await tx.match.findMany({
        where: { sourceMatchId: matchId },
        select: { id: true, sourceMatchId: true, league: { select: { slug: true } } },
        orderBy: { id: 'asc' },
      })
      const stats = await tx.matchPlayerStat.count({
        where: { match: { sourceMatchId: matchId } },
      })
      return { first, second, rows, stats, a, b }
    })

    expect(result.first.written.matches).toBe(1)
    expect(result.second.written.matches).toBe(1)
    expect(result.second.skipped['exists_in_other_league']).toBeUndefined()
    expect(result.rows).toHaveLength(2)
    expect(result.rows.map((row) => row.id)).toEqual([
      `${matchId}@${result.a}`,
      `${matchId}@${result.b}`,
    ])
    /* 경기 번호는 두 행 모두 같다 — 원본 대조 키를 잃지 않는다 (3-A 3번) */
    expect(result.rows.every((row) => row.sourceMatchId === matchId)).toBe(true)
    expect(result.rows.map((row) => row.league.slug)).toEqual([result.a, result.b])
    expect(result.stats).toBe(20)
  })

  it('같은 리그에 두 번 넣으면 두 번째는 already_in_db 다', async () => {
    const matchId = `2607262139281${String(RUN).padStart(5, '0')}`
    const result = await inRollback(async (tx) => {
      const slug = `${tag}-same`
      await tx.league.create({ data: { slug, name: slug, origin: '3rd.supply' } })
      const first = await importSupplyMirror({
        source: sourceFor([matchId], slug),
        leagueSlug: slug,
        confirm: true,
        client: tx,
      })
      const second = await importSupplyMirror({
        source: sourceFor([matchId], slug),
        leagueSlug: slug,
        confirm: true,
        client: tx,
      })
      const count = await tx.match.count({ where: { sourceMatchId: matchId } })
      return { first, second, count }
    })

    expect(result.first.written.matches).toBe(1)
    expect(result.second.written.matches).toBe(0)
    expect(result.second.skipped['already_in_db']).toBe(1)
    expect(result.count).toBe(1)
  })

  it('--update-source 는 **비어 있는 칸만** 채운다 (클랜 점수 4칸 포함)', async () => {
    const matchId = `2607292139281${String(RUN).padStart(5, '0')}`
    const mirrorId = `2607302139281${String(RUN).padStart(5, '0')}`
    const result = await inRollback(async (tx) => {
      const slug = `${tag}-fill`
      await tx.league.create({ data: { slug, name: slug, origin: '3rd.supply' } })

      /* 1) 한 행만 아는 상태로 넣는다 → 레드(보는 쪽) 점수는 비어 있다 */
      await importSupplyMirror({
        source: sourceFor([matchId], slug),
        leagueSlug: slug,
        confirm: true,
        client: tx,
      })
      const before = await tx.match.findFirstOrThrow({
        where: { sourceMatchId: matchId },
        select: {
          redSourceRating: true,
          blueSourceRating: true,
          redSourceRatingUpdate: true,
          blueSourceRatingUpdate: true,
        },
      })

      /* 2) 레드 점수를 알게 된 뒤 다시 돌린다 (거울 경기가 그 점수를 알려 준다) */
      const filled = await importSupplyMirror({
        source: sourceFor([matchId], slug, mirrorId),
        leagueSlug: slug,
        confirm: true,
        updateSource: true,
        client: tx,
      })
      const after = await tx.match.findFirstOrThrow({
        where: { sourceMatchId: matchId },
        select: {
          redSourceRating: true,
          blueSourceRating: true,
          redSourceRatingUpdate: true,
          blueSourceRatingUpdate: true,
        },
      })
      return { before, after, filled }
    })

    /* 처음에는 상대(블루) 점수와 보는 쪽(레드) 증감만 있었다 */
    expect(result.before.redSourceRating).toBeNull()
    expect(result.before.blueSourceRating).toBe(1754)
    expect(result.before.redSourceRatingUpdate).toBe(9)

    /* 비어 있던 레드 점수가 채워졌다. **있던 값은 그대로다** */
    expect(result.after.redSourceRating).toBe(2100)
    expect(result.after.blueSourceRating).toBe(1754)
    expect(result.after.redSourceRatingUpdate).toBe(9)
    expect(result.after.blueSourceRatingUpdate).toBeNull()

    expect(result.filled.written.sourceBackfilledMatches).toBeGreaterThanOrEqual(1)
    expect(result.filled.written.sourceBackfilledColumns).toBeGreaterThanOrEqual(1)
  })

  it('예전 형식 행(id = 경기번호)과 새 형식 행이 섞여도 중복이 생기지 않는다', async () => {
    const fresh = `2607272139281${String(RUN).padStart(5, '0')}`
    const legacy = `2607282139281${String(RUN).padStart(5, '0')}`
    const result = await inRollback(async (tx) => {
      const slug = `${tag}-mixed`
      await tx.league.create({ data: { slug, name: slug, origin: '3rd.supply' } })

      /* 1) 새 형식으로 한 건 넣는다 → id = "<번호>@<slug>" */
      await importSupplyMirror({
        source: sourceFor([fresh], slug),
        leagueSlug: slug,
        confirm: true,
        client: tx,
      })
      const seed = await tx.match.findFirstOrThrow({
        where: { sourceMatchId: fresh },
        select: {
          leagueId: true,
          mapId: true,
          redLeagueClanId: true,
          blueLeagueClanId: true,
        },
      })

      /* 2) **예전 형식** 행을 손으로 하나 만든다 — id 가 곧 경기 번호다.
            이미 DB 에 12,567행이 이 형식으로 들어가 있다 */
      await tx.match.create({
        data: {
          id: legacy,
          sourceMatchId: legacy,
          origin: '3rd.supply',
          leagueId: seed.leagueId,
          mapId: seed.mapId,
          redLeagueClanId: seed.redLeagueClanId,
          blueLeagueClanId: seed.blueLeagueClanId,
          playerCount: 10,
          startAt: new Date('2026-07-28T12:39:28.000Z'),
          winnerSide: 'red',
          redDivisionAtMatch: 1,
          blueDivisionAtMatch: 1,
        },
      })

      /* 3) 두 경기를 한꺼번에 다시 넣어 본다 — 둘 다 이미 있으므로 아무것도 안 만들어야 한다 */
      const again = await importSupplyMirror({
        source: sourceFor([fresh, legacy], slug),
        leagueSlug: slug,
        confirm: true,
        client: tx,
      })
      const rows = await tx.match.findMany({
        where: { sourceMatchId: { in: [fresh, legacy] } },
        select: { id: true, sourceMatchId: true },
      })
      return { again, rows, slug }
    })

    expect(result.again.written.matches).toBe(0)
    expect(result.again.skipped['already_in_db']).toBe(2)
    /* 경기 번호마다 행이 하나씩. 형식이 섞여 있어도 늘어나지 않는다 */
    expect(result.rows).toHaveLength(2)
    expect(result.rows.map((row) => row.id).sort()).toEqual(
      [`${fresh}@${result.slug}`, legacy].sort(),
    )
  })
})
