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
/* ★시즌 판정의 단일 규칙★ — 화면이 쓰는 창과 같은 함수다 (Part 5 · 사장님 지시) */
import { seasonWindowAt } from '@sacloud/contract'
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
  /** ★시즌을 못 붙인 경기★ — 창 밖이거나 그 리그에 시즌 행이 없다 */
  seasonUnresolved: number
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
  /*
   * ⚠⚠ ★이 쿼리 하나가 사이트를 통째로 멈춰 세웠다★ (2026-09-19 진단) ⚠⚠
   *
   *   옛 판은 `WHERE "status"='ok'` 뿐이었다 — ★LIMIT 도 없고 좁히지도 않았다.★
   *   그 표가 ★756,243행 · 1.63GB★ 로 자라면서 한 번 훑는 데 80초가 넘게 걸렸고,
   *   Postgres 의 `statement_timeout`(2분)을 넘겨 ★매번 취소★ 됐다.
   *
   *   그래서 무너진 것 (전부 한 뿌리다):
   *   ```
   *     정규화가 죽음   → Match 가 안 만들어짐   (09-19 16:43 이후 0건)
   *     명단이 죽음     → 「기록은 찍히는데 명단이 없다」 (7일 85건)
   *     Match 가 없음   → 「경기분석이 안 된다」   (7일 41건 · 버림 «Match 없음» 88,241)
   *     health 가 느려짐 → 수집 게이트가 «무겁다» 며 ★45바퀴를 통째로 건너뜀★
   *   ```
   *   사장님: 「기록이 자꾸 멈추는거 이것도 치명적이야」 — 이게 그 원인이었다.
   *
   *   ★고침 — 필요한 클랜만 묻는다.★
   *   아래에서 `bySlug.get(subject)` 로 ★우리가 아는 클랜만★ 골라 쓴다.
   *   그러면 나머지 수십만 행은 애초에 읽을 까닭이 없다. 결과는 한 줄도 안 바뀐다.
   *   ⚠ `subject` 인덱스는 ★이미 있었다★ — 쿼리가 그것을 안 쓰고 있었을 뿐이다.
   */
  /*
   * ★이름 칸만 읽는다★ (2026-09-20) — `payload` 는 건드리지 않는다.
   *
   *   옛 판은 `payload->>'red_clan_name'` 으로 꺼냈는데, 그 JSON 이 ★행 안에 그대로★
   *   들어 있어(본체 1,378MB) 한 행을 읽을 때마다 JSON 을 통째로 들어 올렸다.
   *   실측 ★초당 500행★ — 760,000행이면 25분이라 2분 벽에 매번 걸려 죽었다.
   *   그 바람에 09-19 16:43 부터 ★Match 가 한 건도 안 만들어졌고★,
   *   명단·경기분석·수집까지 줄줄이 멈췄다.
   *
   * ⚠ ★아직 안 채워진 옛 줄은 `null` 이라 그냥 빠진다.★ 그래도 안전하다 —
   *   빠지면 「지금 이름」 으로만 잇게 되고, 옛 경기는 이미 이어져 있다.
   *   backfill 이 돌수록 옛 이름이 되살아난다.
   */
  /*
   * ★이름표만 읽는다★ (2026-09-20) — 원문 표는 건드리지 않는다.
   *
   *   원문(`BarracksClanMatchRaw`)은 758,851행 · 1.63GB 이고 `payload` 가
   *   ★행 안에 그대로★ 있어(행당 1.8KB) ★어느 칸을 읽든★ 1.38GB 를 통째로 훑는다.
   *   이름 칸을 따로 빼 봤지만 EXPLAIN 이 여전히 `Parallel Seq Scan` 이었다 —
   *   칸을 빼도 «행을 읽는 값» 이 안 줄기 때문이다. 그래서 ★표를 따로★ 뒀다.
   *
   *   `BarracksClanAlias` 는 클랜 수백 곳 × 이름 몇 개 = ★수천 행★ 이다.
   *   `clan-name-backfill` 이 원문을 훑으며 한 번만 채운다.
   *
   * ⚠ 아직 안 채워진 동안에는 이름표가 비어 있다 — 그러면 ★지금 이름★ 으로만 잇는다.
   *   옛 경기는 이미 이어져 있으니 안전하다. 채워질수록 옛 이름이 되살아난다.
   */
  const sideRows: SideRow[] = (
    await prisma.barracksClanAlias.findMany({ select: { subject: true, name: true } })
  ).map((r) => ({ subject: r.subject, red: r.name, blue: null }))

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

  /*
   * ── ★★시즌 표 — 리그마다 (시즌번호 → Season.id)★★ (2026-09-06 · Part 5)
   *
   *   경기마다 DB 를 찌르지 않으려고 ★한 번만 읽어 둔다.★
   *   판정은 `seasonWindowAt(startAt)` ★하나만★ 쓴다 — 화면이 쓰는 그 창이다.
   */
  const seasonOf = new Map<string, Map<number, string>>()
  for (const row of await prisma.season.findMany({
    where: { leagueId: { in: [...leagueIdOf.values()] } },
    select: { id: true, leagueId: true, number: true },
  })) {
    if (!seasonOf.has(row.leagueId)) seasonOf.set(row.leagueId, new Map())
    seasonOf.get(row.leagueId)?.set(row.number, row.id)
  }
  /** 그 리그·그 시각의 시즌. ★못 찾으면 null★ — 엉뚱한 곳에 넣지 않는다 */
  const seasonIdFor = (leagueId: string, at: Date): string | null => {
    const w = seasonWindowAt(at)
    if (w === null) return null
    return seasonOf.get(leagueId)?.get(w.number) ?? null
  }

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
    seasonUnresolved: 0,
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
      if (confirm && seasonIdFor(leagueId, m.startAt) === null) {
        /* ★조용히 넘어가지 않는다★ — 시즌을 못 찾으면 그 수를 센다 */
        result.seasonUnresolved += 1
      }

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
            /*
             * ★★시즌을 처음부터 붙인다★★ (2026-09-06 · Part 5 · 사장님 지시).
             *
             * > «새 Collector 가 Match 를 만들 때 ★seasonId 를 비워 두지 않게 한다★»
             * > «시즌 판정 로직을 ★여러 군데 하드코딩하지 말고 하나의 공통 규칙★ 으로»
             *
             * ★규칙은 `seasonWindowAt` 하나뿐이다★ — 화면이 쓰는 그 창과 같은 값이라
             * DB 와 화면이 서로 다른 기준을 가질 수 없다.
             * ★못 찾으면 null 이다.★ 엉뚱한 시즌에 넣느니 비워 두는 게 낫다.
             */
            seasonId: seasonIdFor(leagueId, m.startAt),
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
