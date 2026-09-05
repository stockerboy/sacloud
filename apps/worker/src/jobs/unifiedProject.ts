/**
 * ★★통합 투영 — 원문 → IPL / SPL / 열산 중 정확히 하나★★ (2026-09-05 · Part 3 ④단계).
 *
 * ```
 * pnpm --filter @sacloud/worker nexon unified-project            미리보기
 * pnpm --filter @sacloud/worker nexon unified-project --confirm  적재
 * ```
 *
 * ══ ★왜 새로 만드나 — `iplProject` 를 늘리지 않고★ ══
 *
 * 사장님: «기존 iplProject를 억지로 확장하지 마라. ★새 통합 projection 구조★ 를 만들고
 *         기존 것은 보존한다»
 *
 * `iplProject` 는 뼈대에 IPL 이 박혀 있다 —
 * ```
 * IPL_SLUG = 'nolink'                리그가 하나로 고정
 * IPL_LEAGUE_MAP_NAME = '제3보급창고'   ★맵이 하나로 고정★
 * not_ipl_pair                        「IPL 이 아니면 버린다」
 * ```
 * 늘리려면 세 곳을 다 뜯어야 하고, 뜯는 순간 ★지금 도는 IPL 수집이 위험해진다.★
 * 그래서 옆에 새로 짓는다. ★`iplProject.ts` 는 그대로 둔다★ (`CLAUDE.md` 1-4).
 *
 * ══ ★흐름★ ══
 * ```
 * 원문(BarracksClanMatchRaw)
 *   → normalize        경기키·시각·맵·양쪽 클랜명·승수      (맵으로 안 거른다)
 *   → league verdict   양쪽 클랜의 확정 리그 → 하나          (갈리면 unclassified)
 *   → 맵 확인          ★그 리그가 인정하는 맵인가★           (리그마다 다르다)
 *   → canonical        이미 있나                            (1차 방어)
 *   → Match 만들기      DB 유니크가 2차 방어                  (틈을 막는다)
 * ```
 *
 * ══ ★안 하는 것★ ══
 * ```
 * 세 리그를 따로 세 번 돌지 않는다 — ★등록 클랜 전체를 한 번에 보고 경기마다 분류한다★
 * 맵을 공통으로 박지 않는다        — 리그의 `LeagueMap` 표가 정한다
 * 기준시각 이전은 안 건드린다       — 과거는 동결이다
 * unclassified 를 버리지 않는다    — ★경기키와 사유를 남기고 센다★
 * `MatchPlayerStat` 을 안 만든다   — 원문에 참가자가 없다. 라인업은 배틀로그가 채운다
 * ```
 */
import { prisma } from '@sacloud/db'
import { log, warn } from '../lib/log.js'
import { allocateInternalMatchId } from '../lib/internalMatchId.js'
import { normalizeBarracksMatch, type NormalizeFailure } from '../lib/matchNormalize.js'
import {
  LEAGUE_LABEL,
  LIVE_LEAGUE_SLUGS,
  buildClanIndex,
  resolveSides,
  verdictFromSides,
  type ClanLeague,
  type LiveLeagueSlug,
  type UnclassifiedReason,
} from '../lib/leagueVerdict.js'
import { CANONICAL_FROM, decideCanonical, isDuplicateMatchError } from '../lib/canonicalMatch.js'
import { deriveClanNames, type SideRow } from '../lib/iplClanNames.js'

/** 이 잡이 만든 경기의 출처. `iplProject` 와 ★같은 값★ 이다 — 같은 원문에서 왔기 때문이다 */
export const UNIFIED_ORIGIN = 'nexon_barracks'

/** 넘어간 사유 — 정규화 실패 + 분류 실패 + 그 밖 */
export type SkipReason =
  | NormalizeFailure
  | UnclassifiedReason
  /** 그 리그가 인정하지 않는 맵이다 (리그마다 다르다) */
  | 'map_not_in_league'
  /** 기준시각 이전이다 — 과거는 동결 */
  | 'before_cutoff'
  /** 이미 있다 — 고장이 아니다 */
  | 'already_exists'

export interface UnifiedProjectResult {
  /** 본 경기 수 (경기키 기준) */
  seen: number
  /** 만든 경기 수 */
  created: number
  /** 사유별 건수. ★조용히 버리지 않는다★ */
  skipped: Record<SkipReason, number>
  /** 리그별 만든 수 */
  createdByLeague: Record<LiveLeagueSlug, number>
  /** ★unclassified 표본★ — 경기키와 사유 (앞에서부터 몇 개만 들고 온다) */
  unclassified: Array<{ matchKey: string; reason: SkipReason; detail: string }>
  /** 이름을 못 이은 클랜 (많이 나온 순) */
  unknownClanNames: Array<{ name: string; count: number }>
  /** 같은 이름인데 클랜이 둘 이상이라 표에서 뺀 이름 */
  ambiguousNames: string[]
  confirm: boolean
}

const emptySkips = (): Record<SkipReason, number> => ({
  bad_key: 0,
  bad_time: 0,
  no_clan_name: 0,
  bad_score: 0,
  draw: 0,
  same_clan: 0,
  cross_league: 0,
  unknown_clan: 0,
  map_not_in_league: 0,
  before_cutoff: 0,
  already_exists: 0,
})

/** 한 리그의 등록 클랜 하나 */
interface LiveClan extends ClanLeague {
  leagueClanId: string
  division: number
  clanName: string
  clanSlug: string
}

/**
 * ★운영 3리그의 활성 등록 클랜을 한 표로★ — 세 번 도는 대신 한 번에 본다.
 *
 * ⚠ ★활성만 본다★ (`expelledAt IS NULL`). 2026-09-05 에 겹친 등록 44개를 숨겼으므로
 *   ★한 클랜은 한 리그에만 활성★ 이다. 그것이 이 판정의 전제다.
 */
async function loadLiveClans(): Promise<Map<string, LiveClan>> {
  const rows = await prisma.leagueClan.findMany({
    where: { expelledAt: null, league: { slug: { in: [...LIVE_LEAGUE_SLUGS] } } },
    select: {
      id: true,
      division: true,
      clanId: true,
      league: { select: { slug: true } },
      clan: { select: { name: true, slug: true } },
    },
  })
  const byClanId = new Map<string, LiveClan>()
  for (const r of rows) {
    const league = r.league.slug as LiveLeagueSlug
    const prev = byClanId.get(r.clanId)
    if (prev && prev.league !== league) {
      /* ★있으면 안 되는 일이다.★ 조용히 고르지 말고 크게 알린다 */
      warn(`★한 클랜이 두 리그에 활성이다★ ${r.clan.name} — ${prev.league} · ${league}`)
      continue
    }
    byClanId.set(r.clanId, {
      clanId: r.clanId,
      league,
      leagueClanId: r.id,
      division: r.division,
      clanName: r.clan.name,
      clanSlug: r.clan.slug,
    })
  }
  return byClanId
}

/**
 * ★리그마다 인정하는 맵★ — `LeagueMap` 표가 정한다. 코드에 박지 않는다.
 *
 * ⚠ ★비어 있는 리그가 있다★ (실측 2026-09-05: `nolink` 는 `LeagueMap` 0행).
 *   그때는 ★맵으로 거르지 않는다★ — 표가 없다는 것이 「전부 금지」일 리 없다.
 *   ★모르는 것을 금지로 바꾸면 조용히 다 버린다.★
 */
async function loadLeagueMaps(): Promise<Map<LiveLeagueSlug, Map<string, string> | null>> {
  const rows = await prisma.leagueMap.findMany({
    where: { league: { slug: { in: [...LIVE_LEAGUE_SLUGS] } } },
    select: { league: { select: { slug: true } }, map: { select: { id: true, name: true } } },
  })
  const out = new Map<LiveLeagueSlug, Map<string, string> | null>()
  for (const slug of LIVE_LEAGUE_SLUGS) out.set(slug, null)
  for (const r of rows) {
    const slug = r.league.slug as LiveLeagueSlug
    const m = out.get(slug) ?? null
    const map = m ?? new Map<string, string>()
    map.set(r.map.name, r.map.id)
    out.set(slug, map)
  }
  return out
}

/** 옛 이름까지 담은 「이름 → 클랜」 표를 만든다 */
async function buildNameIndex(liveClans: Map<string, LiveClan>) {
  const entries: Array<{ name: string; clanId: string; league: LiveLeagueSlug }> = []

  /* ① 지금 이름 */
  for (const c of liveClans.values()) {
    entries.push({ name: c.clanName, clanId: c.clanId, league: c.league })
  }

  /* ② ★원문에서 되찾은 옛 이름★ — 클랜은 이름을 바꾼다.
        지금 이름만 보면 개명 전 경기를 통째로 놓친다 (melody 1,901건 실측) */
  const sideRows = await prisma.$queryRaw<SideRow[]>`
    SELECT "subject",
           "payload"->>'red_clan_name'  AS red,
           "payload"->>'blue_clan_name' AS blue
    FROM "BarracksClanMatchRaw" WHERE "status" = 'ok'`
  const derived = deriveClanNames(sideRows)

  const bySlug = new Map<string, LiveClan>()
  for (const c of liveClans.values()) bySlug.set(c.clanSlug, c)

  let recovered = 0
  for (const [subject, names] of derived) {
    const owner = bySlug.get(subject)
    if (!owner) continue
    for (const n of names) {
      if (n.name === owner.clanName) continue
      entries.push({ name: n.name, clanId: owner.clanId, league: owner.league })
      recovered += 1
    }
  }

  /* ★클랜별로 「이 클랜이 써 온 이름들」을 따로 모은다★ (2026-09-05 · ⑤단계).
     이름표(`index`)는 모호한 이름을 빼지만, ★slug 로 앉힐 때는 그 이름도 써야 한다★ —
     「그 클랜이 나왔다」는 것을 원본이 말해 줬으니 이름이 겹쳐도 자리가 정해진다 */
  const namesByClanId = new Map<string, Set<string>>()
  for (const e of entries) {
    const set = namesByClanId.get(e.clanId) ?? new Set<string>()
    set.add(e.name)
    namesByClanId.set(e.clanId, set)
  }

  const built = buildClanIndex(entries)
  return { ...built, recovered, namesByClanId, clanBySlug: bySlug }
}

export async function runUnifiedProject(
  options: { confirm?: boolean; limit?: number } = {},
): Promise<UnifiedProjectResult> {
  const confirm = options.confirm === true

  const liveClans = await loadLiveClans()
  const leagueMaps = await loadLeagueMaps()
  const { index, ambiguous, recovered, namesByClanId, clanBySlug } =
    await buildNameIndex(liveClans)

  const leagueRows = await prisma.league.findMany({
    where: { slug: { in: [...LIVE_LEAGUE_SLUGS] } },
    select: { id: true, slug: true },
  })
  const leagueIdOf = new Map(leagueRows.map((l) => [l.slug as LiveLeagueSlug, l.id]))

  log(`활성 등록 클랜 ${liveClans.size}곳 · 이름 색인 ${index.size}개 (옛 이름 ${recovered}개 되찾음)`)
  if (ambiguous.length > 0) {
    log(`  ⚠ ★같은 이름 다른 클랜이라 뺀 이름 ${ambiguous.length}개★ — ${ambiguous.join(' · ')}`)
  }
  for (const slug of LIVE_LEAGUE_SLUGS) {
    const m = leagueMaps.get(slug)
    log(
      `  ${LEAGUE_LABEL[slug]} 인정 맵 ` +
        (m == null ? '★표가 없다 — 안 거른다★' : [...m.keys()].join(' · ')),
    )
  }
  log(`★기준시각 ${CANONICAL_FROM.toISOString()} 이후만 만든다★`)

  /* ★살아 있는 경기키★ — 숨긴 줄은 세지 않는다 (재분류가 가능해야 한다) */
  const liveRows = await prisma.match.findMany({
    where: { startAt: { gte: CANONICAL_FROM }, supersededAt: null, sourceMatchId: { not: null } },
    select: { id: true, sourceMatchId: true },
  })
  const liveByKey = new Map<string, string>()
  for (const r of liveRows) if (r.sourceMatchId) liveByKey.set(r.sourceMatchId, r.id)
  log(`이미 있는 신규 경기 ${liveByKey.size}건`)

  const result: UnifiedProjectResult = {
    seen: 0,
    created: 0,
    skipped: emptySkips(),
    createdByLeague: { nolink: 0, supply: 0, sanply: 0 },
    unclassified: [],
    unknownClanNames: [],
    ambiguousNames: ambiguous,
    confirm,
  }
  const unknown = new Map<string, number>()
  const noteUnclassified = (matchKey: string, reason: SkipReason, detail: string) => {
    result.skipped[reason] += 1
    if (result.unclassified.length < 40) result.unclassified.push({ matchKey, reason, detail })
  }

  const BATCH = 500
  let after = ''
  const limit = options.limit ?? Number.POSITIVE_INFINITY

  outer: for (;;) {
    /* ★subject 를 같이 가져온다★ — 이름이 아니라 이것으로 자리를 정한다.
       한 경기를 여러 클랜이 봤으면 그만큼 증거가 늘어난다 (실측: 880경기가 2개) */
    const rows = await prisma.$queryRaw<
      Array<{ matchKey: string; payload: Record<string, unknown>; subjects: string[] }>
    >`
      SELECT "matchKey",
             (ARRAY_AGG("payload" ORDER BY "id"))[1] AS "payload",
             ARRAY_AGG(DISTINCT "subject") AS "subjects"
      FROM "BarracksClanMatchRaw"
      WHERE "matchKey" > ${after} AND "status" = 'ok'
      GROUP BY "matchKey"
      ORDER BY "matchKey" ASC
      LIMIT ${BATCH}
    `
    if (rows.length === 0) break
    after = rows[rows.length - 1]!.matchKey

    for (const row of rows) {
      if (result.seen >= limit) break outer
      result.seen += 1

      /* ── ① 정규화 ─────────────────────────────────────────────── */
      const norm = normalizeBarracksMatch(row.payload)
      if (!norm.ok) {
        noteUnclassified(row.matchKey, norm.code, norm.reason)
        continue
      }
      const m = norm.match

      /* ── ② 기준시각 ───────────────────────────────────────────── */
      const canon = decideCanonical(m.startAt, m.matchKey, liveByKey)
      if (canon.action === 'out_of_scope') {
        result.skipped.before_cutoff += 1
        continue
      }
      if (canon.action === 'exists') {
        result.skipped.already_exists += 1
        continue
      }

      /* ── ③ 리그 판정 ──────────────────────────────────────────────
             ★이름으로 합치지 않는다★ — subject(slug) 로 증명되는 것만 앉힌다.
             남은 자리만 ★모호하지 않은 이름★ 으로 채운다 (사장님 2026-09-05) */
      const sides = resolveSides({
        redClanName: m.redClanName,
        blueClanName: m.blueClanName,
        subjects: row.subjects,
        clanBySlug,
        namesByClanId,
        nameIndex: index,
      })
      const verdict = verdictFromSides(m.redClanName, m.blueClanName, sides)
      if (!verdict.ok) {
        noteUnclassified(m.matchKey, verdict.reason, verdict.detail)
        if (verdict.reason === 'unknown_clan') {
          for (const n of [m.redClanName, m.blueClanName]) {
            if (!index.has(n)) unknown.set(n, (unknown.get(n) ?? 0) + 1)
          }
        }
        continue
      }

      /* ── ④ 그 리그가 인정하는 맵인가 ─────────────────────────────
             ★리그마다 다르다.★ 표가 없으면 안 거른다 */
      const maps = leagueMaps.get(verdict.league) ?? null
      let mapId: string | null = null
      if (maps !== null) {
        mapId = (m.mapName && maps.get(m.mapName)) || null
        if (mapId === null) {
          noteUnclassified(
            m.matchKey,
            'map_not_in_league',
            `${LEAGUE_LABEL[verdict.league]} 이 인정하지 않는 맵이다: ${m.mapName ?? '(없음)'}`,
          )
          continue
        }
      } else {
        /* 표가 없는 리그다 — 맵 행만 찾아 쓴다. 없으면 만들지 않는다 */
        const found = m.mapName
          ? await prisma.gameMap.findUnique({ where: { name: m.mapName }, select: { id: true } })
          : null
        if (!found) {
          noteUnclassified(m.matchKey, 'map_not_in_league', `맵 행이 없다: ${m.mapName ?? '(없음)'}`)
          continue
        }
        mapId = found.id
      }

      /* ── ⑤ 만든다 ─────────────────────────────────────────────── */
      const red = liveClans.get(verdict.redClanId)!
      const blue = liveClans.get(verdict.blueClanId)!
      const leagueId = leagueIdOf.get(verdict.league)!

      if (!confirm) {
        result.created += 1
        result.createdByLeague[verdict.league] += 1
        liveByKey.set(m.matchKey, '(미리보기)')
        continue
      }

      /* ★이미 쓰는 id 인지 물어보는 함수를 넘긴다★ — 같은 초에 여러 경기가 있을 수 있다 */
      const id = await allocateInternalMatchId(
        m.startAt,
        async (candidate) =>
          (await prisma.match.findUnique({ where: { id: candidate }, select: { id: true } })) !== null,
      )
      try {
        await prisma.match.create({
          data: {
            id,
            leagueId,
            mapId,
            playerCount: (m.playerLimit ?? 5) * 2,
            startAt: m.startAt,
            winnerSide: m.winnerSide,
            redLeagueClanId: red.leagueClanId,
            blueLeagueClanId: blue.leagueClanId,
            redDivisionAtMatch: red.division,
            blueDivisionAtMatch: blue.division,
            origin: UNIFIED_ORIGIN,
            sourceMatchId: m.matchKey,
          },
        })
        result.created += 1
        result.createdByLeague[verdict.league] += 1
        liveByKey.set(m.matchKey, id)
      } catch (e) {
        /* ★2차 방어가 걸린 것은 고장이 아니다★ — 그 한 건만 세고 넘어간다 */
        if (isDuplicateMatchError(e)) {
          result.skipped.already_exists += 1
          liveByKey.set(m.matchKey, '(DB 가 막았다)')
          continue
        }
        throw e
      }
    }
  }

  result.unknownClanNames = [...unknown]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([name, count]) => ({ name, count }))
  return result
}
