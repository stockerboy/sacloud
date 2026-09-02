/**
 * IPL(`nolink`) **배틀로그 수집 대상 명단** — 읽기 전용 실측 스크립트 (총괄 지시 #2 · 2026-09-02).
 *
 * ```
 * cd packages/db
 * DATABASE_URL="…운영 읽기 URL…" npx tsx ../../apps/worker/src/dev/iplCollectTargets.ts [--out <파일>]
 * ```
 *
 * ── 왜 필요한가
 *   IPL 경기 24,662건 중 킬데스(라인업)가 있는 것이 1,562건(6.3%)뿐이다
 *   (`docs/HANDOFF_2026-09-02_EVENING.md` 3-1). 나머지는 병영수첩 배틀로그
 *   (`GetBattleLogClan/{matchKey}/{clanNo}`)를 받아야 채워진다. 수집기(LANE A)가
 *   페이지 넘기기를 뚫는 순간 달릴 수 있게 **「어느 클랜의 · 어느 경기가 · 아직 없는가」**
 *   를 파일로 떨어뜨린다.
 *
 * ── 판정 기준 (두 가지를 따로 센다 — 같은 값이 아니다)
 *   라인업 있음    `MatchPlayerStat` 행이 하나라도 있는 경기 → 문서의 **1,562**
 *   배틀로그 있음  `BarracksBattleLogRaw(subjectKind='clan', status='ok')` 에 그 `matchKey` 가
 *                  있는 경기 → 로컬 실측 **1,685** (`docs/DECISIONS.md` 12479)
 *   두 수의 차(≈123)는 **배틀로그를 받았지만 라인업을 못 만든 경기**다 — `battlelog-lineup`
 *   이 `클랜번호모름 121 · 명단미달 2` 로 건너뛴 것. **다시 받아도 안 풀린다**
 *   (원문은 이미 있다). 클랜번호를 잇고 라인업 잡을 다시 돌리면 된다.
 *   그래서 **수집 대상(`targets`) = 배틀로그가 없는 경기** 다. 라인업만 없는 경기는
 *   `lineupPending` 에 따로 적는다.
 *
 * ── 창
 *   `SEASON0_FROM`(2026-07-01 KST) 이후만 센다. `iplProject` 가 그 앞 경기를 애초에 넣지
 *   않으므로 전체 건수와 같아야 한다 — 다르면 그 수를 `matchesBeforeSeason` 에 남긴다.
 *
 * ── 안전
 *   · **SELECT 만 한다.** 쓰지 않는다
 *   · 운영 통로가 하나다 — 질의는 **순차**. `Promise.all` 을 쓰지 않는다 (HANDOFF 6-4)
 *   · 큰 표는 키셋 페이지로 나눠 한 질의가 짧게 끝나게 한다. 끊기면 한 번 더 시도한다
 *   · `payload` 는 끌어오지 않는다 (`battlelogWorklist.ts` 의 OOM 교훈)
 *   · 없는 값은 0 이 아니라 `null` 이다 (클랜번호를 모르면 `clanNos: null`)
 *
 * ── 클랜번호(`clanNo`)는 어디서 오나 — 두 출처, 번호마다 출처를 적는다
 *   ① `BarracksClanNumber` — `ipl-clan-number` 잡이 이은 것. **운영에는 0건이다**
 *      (2026-09-02 실측 · 로컬에서만 돌렸다, `docs/DECISIONS.md` 12784)
 *   ② `BarracksClanMatchRaw` 의 `subject`(조회한 클랜의 병영수첩 slug) ↔ `payload.clan_no`
 *      — 매치목록은 **그 클랜이 자기 번호로 조회한 것**이라 짝이 정확하다. 추측이 아니다.
 *      병영수첩 slug 는 `IPL_ROSTER.barracks` 로 우리 클랜에 잇는다 (`jobs/iplProject.ts` 와 같은 길)
 *      **운영에는 이 표도 0건이다** (2026-09-02 실측 · 매치목록은 로컬에만 있다)
 *   ③ 배틀로그 + 라인업이 **둘 다 있는** 경기(1,562)에서 **참가 선수로 투표** — `jobs/clanNumber.ts`
 *      (D-200)와 같은 판정이다: `teamList`(팀번호↔클랜번호) · 사건의 `str_usn`(팀번호↔선수) ·
 *      `MatchPlayerStat`(선수↔진영) 을 이어 팀번호를 진영에 붙이고, 진영의 클랜에 표를 준다.
 *      **8할 미만이면 잇지 않는다.** 그 잡과 다른 점은 셋뿐이다 — 쓰지 않는다 · payload 를
 *      통째로 안 가져오고 SQL 에서 짝만 뽑는다 · 결정 목록을 파일에 남긴다.
 *      운영에 재료가 있다: 클랜응답 7,229행 · 경기 6,844 · 조회 번호 91개 (2026-09-02 실측).
 *   ④ 배틀로그 **전부**(6,844경기)에서 **클랜원 명부로 투표** — `BarracksClanMember`(병영수첩
 *      slug ↔ `strUsn` · 운영 43 slug 2,796명)와 사건의 `(team_no, str_usn)` 을 이으면 라인업이
 *      없어도 팀번호 → 클랜이 정해진다. 한 계정이 두 클랜 명부에 있으면 그 계정은 안 센다.
 *      ③과 같은 8할 규칙. ③과 ④가 같은 번호를 서로 다른 클랜에 주면 **둘 다 버리고** 적는다.
 *
 *      ⚠ **용병 함정** (2026-09-02 첫 실행에서 밟았다) — 팀의 다수결만 보면 IPL 클랜 A 의
 *      클랜원 둘이 다른 클랜 X 에 용병으로 뛴 경기에서 X 의 번호가 A 로 투표된다. X 는 후보
 *      자체가 아니라 8할 규칙에 안 걸리고, 32곳이 번호를 2~5개씩 갖게 됐다. 넥슨 클랜 번호는
 *      **하나**다. 그래서 팀 하나에서 **같은 명부 계정이 3명 이상**(5명 중 과반)이고 그 팀에서
 *      식별된 계정의 8할 이상일 때만 표를 준다 (`MEMBER_MIN_ACCOUNTS`).
 *
 * ── 대표 번호(`clanNo`)는 하나다
 *   클랜마다 후보(`clanNoCandidates`)는 여럿 남길 수 있지만 수집기가 쓰는 `clanNo` 는 하나다.
 *   ③(라인업 투표)이 있으면 그것, 없으면 ④ 중 표가 가장 많은 것. ③과 ④의 1위가 다르면
 *   **`null`** 로 두고 `clanNoDisagreements` 에 적는다 — 지어내지 않는다.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { prisma } from '@sacloud/db'
import { IPL_ROSTER } from '@sacloud/db/ops'
import { SEASON0_FROM, season0WindowLabel } from '../lib/season0Window.js'

const IPL_SLUG = 'nolink'
/** 클랜번호 투표 — 이 비율 미만이면 잇지 않는다 (`jobs/clanNumber.ts` 의 `AGREEMENT` 와 같은 값 · D-200) */
const AGREEMENT = 0.8
/** 명부 투표에서 한 팀이 어느 클랜인지 말하려면 같은 명부의 계정이 이만큼은 있어야 한다 (5명 중 과반) */
const MEMBER_MIN_ACCOUNTS = 3
/** `Player.sourcePlayerId` 의 병영수첩 표식 (`jobs/battlelogLineup.ts` 의 `BARRACKS_PLAYER_PREFIX`) */
const BRK = 'BRK-'
/** 배틀로그 보관 창. 실측 하한 96일, 문서 추정 약 60일 (`docs/DECISIONS.md` 12471·12494). 보고용 */
const RETENTION_SAFE_DAYS = 60
const RETENTION_SEEN_DAYS = 96

/* --------------------------------------------------------------- 옵션 --- */

function flag(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? String(process.argv[i + 1]) : fallback
}

/** 저장소 루트 — `cwd` 가 `packages/db` 든 어디든 같은 자리에 쓴다 */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const OUT_FILE = resolve(flag('out', join(REPO_ROOT, 'data', 'ipl', 'collect-targets.json')))

/* --------------------------------------------------------------- 유틸 --- */

/** 운영 통로가 가끔 끊긴다 — 한 번 더 시도한다. 질의마다 시간 상한을 둔다 */
async function withRetry<T>(label: string, run: () => Promise<T>, timeoutMs = 60_000): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    let timer: NodeJS.Timeout | undefined
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label}: ${timeoutMs}ms 초과`)), timeoutMs)
      })
      return await Promise.race([run(), timeout])
    } catch (error) {
      lastError = error
      console.error(`  ⚠ ${label} 실패 (${attempt}/2): ${String((error as Error).message ?? error)}`)
    } finally {
      if (timer) clearTimeout(timer)
    }
  }
  throw lastError
}

const n = (v: number): string => v.toLocaleString('en-US')
const kst = (at: Date): string => new Date(at.getTime() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 16)

/* --------------------------------------------------------------- 형 --- */

interface ClanRow {
  leagueClanId: string
  clanId: string
  slug: string
  name: string
  division: number
  /** 병영수첩 slug (`IPL_ROSTER.barracks`). 명단에 없으면 null */
  barracksSlug: string | null
  /** **대표 번호** — 수집기가 쓰는 값. 근거가 없거나 출처끼리 어긋나면 null */
  clanNo: string | null
  /** 대표 번호의 근거 */
  clanNoSource: string | null
  /** 후보 번호 전부 (대표 포함). 하나도 모르면 null */
  clanNos: string[] | null
  /** 후보마다 어디서 왔나 — `clan_number` · `clan_match_list` · `battlelog_roster:표/전체` · `battlelog_member:표/전체` */
  clanNoSources: Record<string, string[]> | null
}

interface MatchRow {
  id: string
  sourceMatchId: string | null
  origin: string
  startAt: Date
  redLeagueClanId: string
  blueLeagueClanId: string
  hasLineup: boolean
  hasBattlelog: boolean
}

interface ClanSummary {
  slug: string
  name: string
  clanId: string
  leagueClanId: string
  division: number
  barracksSlug: string | null
  clanNo: string | null
  clanNoSource: string | null
  clanNos: string[] | null
  clanNoSources: Record<string, string[]> | null
  matches: number
  withLineup: number
  withoutLineup: number
  withBattlelog: number
  withoutBattlelog: number
}

/* --------------------------------------------------------------- 본체 --- */

async function main(): Promise<void> {
  console.error(`시즌 창 ${season0WindowLabel()} · 출력 ${OUT_FILE}`)

  /* ── 1. 리그 ---------------------------------------------------------- */
  const league = await withRetry('league', () =>
    prisma.league.findUnique({ where: { slug: IPL_SLUG }, select: { id: true, slug: true, name: true } }),
  )
  if (!league) throw new Error(`리그 ${IPL_SLUG} 가 없다`)

  /* ── 2. 클랜 전부 + 병영수첩 클랜번호 -------------------------------- */
  const clanRows = await withRetry('leagueClan', () =>
    prisma.leagueClan.findMany({
      where: { leagueId: league.id },
      select: {
        id: true,
        division: true,
        clan: {
          select: {
            id: true,
            slug: true,
            name: true,
            barracksNumbers: { select: { clanNo: true, source: true, votes: true }, orderBy: { clanNo: 'asc' } },
          },
        },
      },
      orderBy: [{ division: 'asc' }, { clan: { slug: 'asc' } }],
    }),
  )
  /* ── 2-a. 병영수첩 slug — `IPL_ROSTER.barracks`. `iplProject` 와 같은 순서로 잇는다:
     slug 가 같으면 그것, 아니면 지금 이름, 아니면 옛 표기(given) */
  const barracksSlugOf = (slug: string, name: string): string | null => {
    const hit =
      IPL_ROSTER.find((e) => e.barracks === slug) ??
      IPL_ROSTER.find((e) => e.name === name) ??
      IPL_ROSTER.find((e) => e.given === name) ??
      null
    return hit ? hit.barracks : null
  }

  /* ── 2-b. 매치목록 원문에서 `subject ↔ clan_no` 짝 — 조회한 클랜 자신의 번호라 정확하다.
     `payload` 는 통째로 안 가져온다. 집계만 SQL 에서 한다 */
  const listRows = await withRetry(
    'clanMatchRaw(subject, clan_no)',
    () =>
      prisma.$queryRaw<Array<{ subject: string; clan_no: string | null; rows: number }>>`
        SELECT "subject", "payload"->>'clan_no' AS clan_no, COUNT(*)::int AS rows
        FROM "BarracksClanMatchRaw"
        WHERE "status" = 'ok'
        GROUP BY 1, 2
        ORDER BY 1, 2
      `,
    120_000,
  )
  const clanNosBySubject = new Map<string, Set<string>>()
  for (const r of listRows) {
    if (!r.clan_no) continue
    const set = clanNosBySubject.get(r.subject) ?? new Set<string>()
    set.add(String(r.clan_no))
    clanNosBySubject.set(r.subject, set)
  }
  console.error(`매치목록 원문 조회 주체 ${n(clanNosBySubject.size)}곳 (짝 ${n(listRows.length)}줄)`)

  const clans: ClanRow[] = clanRows.map((r) => {
    const barracksSlug = barracksSlugOf(r.clan.slug, r.clan.name)
    const sources = new Map<string, string[]>()
    const add = (no: string, source: string) => sources.set(no, [...(sources.get(no) ?? []), source])
    for (const b of r.clan.barracksNumbers) add(b.clanNo, 'clan_number')
    for (const no of clanNosBySubject.get(barracksSlug ?? r.clan.slug) ?? []) add(no, 'clan_match_list')
    const clanNos = [...sources.keys()].sort()
    return {
      leagueClanId: r.id,
      clanId: r.clan.id,
      slug: r.clan.slug,
      name: r.clan.name,
      division: r.division,
      barracksSlug,
      /* 대표 번호는 투표가 끝난 뒤 정한다. ①②가 있으면 그것이 우선이다 */
      clanNo: clanNos.length === 1 ? clanNos[0]! : null,
      clanNoSource: clanNos.length === 1 ? sources.get(clanNos[0]!)!.join('+') : null,
      clanNos: clanNos.length > 0 ? clanNos : null,
      clanNoSources: clanNos.length > 0 ? Object.fromEntries(sources) : null,
    }
  })
  const clanByLeagueClanId = new Map(clans.map((c) => [c.leagueClanId, c]))
  const countSource = (source: string): number =>
    clans.filter((c) => c.clanNoSources && Object.values(c.clanNoSources).some((s) => s.some((x) => x.startsWith(source)))).length
  console.error(
    `클랜 ${n(clans.length)}곳 · 병영수첩 slug 아는 곳 ${n(clans.filter((c) => c.barracksSlug).length)} · ` +
      `후보 번호 아는 곳 ${n(clans.filter((c) => c.clanNos).length)} (BarracksClanNumber ${countSource('clan_number')} · 매치목록 ${countSource('clan_match_list')})`,
  )

  /* ── 3. 경기 건수 (창 밖 포함) — 문서의 24,662 와 대조하기 위한 값 ---- */
  const matchesAll = await withRetry('match.count(all)', () => prisma.match.count({ where: { leagueId: league.id } }))
  const matchesBeforeSeason = await withRetry('match.count(before)', () =>
    prisma.match.count({ where: { leagueId: league.id, startAt: { lt: SEASON0_FROM } } }),
  )
  const originRows = await withRetry('match.groupBy(origin)', () =>
    prisma.match.groupBy({ by: ['origin'], where: { leagueId: league.id }, _count: { _all: true } }),
  )
  const byOrigin: Record<string, number> = {}
  for (const r of originRows) byOrigin[r.origin] = r._count._all
  console.error(
    `nolink 경기 전체 ${n(matchesAll)}건 (창 앞 ${n(matchesBeforeSeason)}건) · origin ${JSON.stringify(byOrigin)}`,
  )

  /* ── 4. 창 안 경기 하나하나 — 라인업·배틀로그 유무를 SQL 에서 판정한다 -- */
  /* 키셋 페이지. 한 질의가 짧아야 통로 하나짜리 운영에서 끊기지 않는다 */
  const PAGE = 5000
  const matches: MatchRow[] = []
  let cursor = ''
  for (;;) {
    const page = await withRetry(`match page after "${cursor}"`, () =>
      prisma.$queryRaw<MatchRow[]>`
        SELECT m."id",
               m."sourceMatchId",
               m."origin",
               m."startAt",
               m."redLeagueClanId",
               m."blueLeagueClanId",
               EXISTS (SELECT 1 FROM "MatchPlayerStat" s WHERE s."matchId" = m."id") AS "hasLineup",
               EXISTS (
                 SELECT 1 FROM "BarracksBattleLogRaw" b
                 WHERE b."matchKey" = m."sourceMatchId"
                   AND b."subjectKind" = 'clan' AND b."status" = 'ok'
               ) AS "hasBattlelog"
        FROM "Match" m
        WHERE m."leagueId" = ${league.id}
          AND m."startAt" >= ${SEASON0_FROM}
          AND m."id" > ${cursor}
        ORDER BY m."id" ASC
        LIMIT ${PAGE}
      `,
    )
    if (page.length === 0) break
    matches.push(...page)
    cursor = page[page.length - 1]!.id
    console.error(`  경기 ${n(matches.length)}건 읽음`)
    if (page.length < PAGE) break
  }

  /* ── 4-b. 클랜번호 투표 — 배틀로그와 라인업이 둘 다 있는 경기에서 (D-200 방식 · 읽기만) --- */
  const votable = matches.filter((m) => m.hasBattlelog && m.hasLineup && m.sourceMatchId)
  /** clanNo → leagueClanId → 표 */
  const votes = new Map<string, Map<string, number>>()
  const seenClanNos = new Set<string>()
  const voteStat = { matches: votable.length, rawsRead: 0, voted: 0, noTeamList: 0, noLineupAccount: 0, tie: 0 }
  interface TeamRow {
    matchKey: string
    teamList: Array<{ team_no?: string | number | null; clan_no?: string | number | null }> | null
    /** [team_no, str_usn] 짝 — 사건의 행위자와 대상을 합친 것. SQL 에서 중복을 지웠다 */
    pairs: Array<[string | null, string | null]> | null
  }
  /* 사람 ↔ 계정(str_usn) — `jobs/battlelogLineup.ts` 와 같은 순서:
     1순위 `NexonIdentity.barracksUsn`(D-221) · 2순위 `Player.sourcePlayerId = 'BRK-<usn>'` */
  const identityRows = await withRetry('nexonIdentity', () =>
    prisma.nexonIdentity.findMany({
      where: { barracksUsn: { not: null }, playerId: { not: null } },
      select: { barracksUsn: true, playerId: true },
    }),
  )
  const usnOfPlayer = new Map<string, string>()
  for (const r of identityRows) if (r.barracksUsn && r.playerId) usnOfPlayer.set(r.playerId, r.barracksUsn)
  console.error(`NexonIdentity(barracksUsn) ${n(usnOfPlayer.size)}명`)

  /* payload 를 통째로 안 가져온다 — teamList 와 (팀번호, 계정) 짝만 SQL 에서 뽑는다 */
  const fetchTeamRows = (label: string, keys: string[]): Promise<TeamRow[]> =>
    withRetry(
      label,
      () => prisma.$queryRaw<TeamRow[]>`
        SELECT DISTINCT ON (b."matchKey") b."matchKey",
               COALESCE(b."payload"->'teamList', b."payload"->'raw'->'teamList') AS "teamList",
               (
                 SELECT jsonb_agg(DISTINCT p)
                 FROM (
                   SELECT jsonb_build_array(e->>'team_no', e->>'str_usn') AS p
                   FROM jsonb_array_elements(COALESCE(b."payload"->'battleLog', b."payload"->'raw'->'battleLog', '[]'::jsonb)) e
                   WHERE e->>'team_no' IS NOT NULL AND COALESCE(e->>'str_usn', '') <> ''
                   UNION ALL
                   SELECT jsonb_build_array(e->>'target_team_no', e->>'target_str_usn')
                   FROM jsonb_array_elements(COALESCE(b."payload"->'battleLog', b."payload"->'raw'->'battleLog', '[]'::jsonb)) e
                   WHERE e->>'target_team_no' IS NOT NULL AND COALESCE(e->>'target_str_usn', '') <> ''
                 ) u
               ) AS pairs
        FROM "BarracksBattleLogRaw" b
        WHERE b."subjectKind" = 'clan' AND b."status" = 'ok' AND b."matchKey" = ANY(${keys}::text[])
        ORDER BY b."matchKey" ASC, b."fetchedAt" DESC, b."id" ASC
      `,
      120_000,
    )

  /** 진영·클랜 표를 세고 다수를 고른다. 동률이면 null — 억지로 고르지 않는다 */
  const majority = (inner: Map<string, number>): string | null => {
    const sorted = [...inner.entries()].sort((a, b) => b[1] - a[1])
    const best = sorted[0]
    if (!best) return null
    if (sorted[1] && sorted[1][1] === best[1]) return null
    return best[0]
  }

  const VOTE_PAGE = 200
  for (let i = 0; i < votable.length; i += VOTE_PAGE) {
    const batch = votable.slice(i, i + VOTE_PAGE)
    const keys = batch.map((m) => m.sourceMatchId!)
    const raws = await fetchTeamRows(`battlelog teams ${i}`, keys)
    const rawOfKey = new Map(raws.map((r) => [r.matchKey, r]))
    const stats = await withRetry(`lineup ${i}`, () =>
      prisma.matchPlayerStat.findMany({
        where: { matchId: { in: batch.map((m) => m.id) } },
        select: { matchId: true, playerId: true, side: true, player: { select: { sourcePlayerId: true } } },
      }),
    )
    const sideOfUsnByMatch = new Map<string, Map<string, string>>()
    for (const s of stats) {
      const src = s.player.sourcePlayerId
      const usn = usnOfPlayer.get(s.playerId) ?? (src && src.startsWith(BRK) ? src.slice(BRK.length) : null)
      if (!usn) continue
      const inner = sideOfUsnByMatch.get(s.matchId) ?? new Map<string, string>()
      inner.set(usn, s.side)
      sideOfUsnByMatch.set(s.matchId, inner)
    }

    for (const m of batch) {
      const raw = rawOfKey.get(m.sourceMatchId!)
      if (!raw) continue
      voteStat.rawsRead += 1
      const teamList = Array.isArray(raw.teamList) ? raw.teamList : []
      for (const t of teamList) if (t.clan_no != null) seenClanNos.add(String(t.clan_no))
      if (teamList.length !== 2) {
        voteStat.noTeamList += 1
        continue
      }
      const sideOfUsn = sideOfUsnByMatch.get(m.id)
      if (!sideOfUsn || sideOfUsn.size === 0) {
        voteStat.noLineupAccount += 1
        continue
      }
      /* 팀번호마다 그 팀 계정들의 진영을 센다 */
      const sideVotes = new Map<string, Map<string, number>>()
      for (const [teamNo, usn] of raw.pairs ?? []) {
        if (teamNo == null || usn == null) continue
        const side = sideOfUsn.get(usn)
        if (!side) continue
        const inner = sideVotes.get(String(teamNo)) ?? new Map<string, number>()
        inner.set(side, (inner.get(side) ?? 0) + 1)
        sideVotes.set(String(teamNo), inner)
      }
      let counted = false
      for (const t of teamList) {
        if (t.team_no == null || t.clan_no == null) continue
        const inner = sideVotes.get(String(t.team_no))
        if (!inner) continue
        const best = majority(inner)
        if (best === null) {
          voteStat.tie += 1
          continue
        }
        const leagueClanId = best === 'red' ? m.redLeagueClanId : m.blueLeagueClanId
        const bucket = votes.get(String(t.clan_no)) ?? new Map<string, number>()
        bucket.set(leagueClanId, (bucket.get(leagueClanId) ?? 0) + 1)
        votes.set(String(t.clan_no), bucket)
        counted = true
      }
      if (counted) voteStat.voted += 1
    }
    console.error(`  투표 ${n(Math.min(i + VOTE_PAGE, votable.length))}/${n(votable.length)}경기`)
  }

  /* ── 4-c. 클랜원 명부로 투표 — 배틀로그 전부에서 (라인업이 없어도 된다) -------------- */
  const memberRows = await withRetry('barracksClanMember', () =>
    prisma.barracksClanMember.findMany({
      select: { clanSlug: true, strUsn: true, observedAt: true },
      orderBy: { observedAt: 'desc' },
    }),
  )
  /** strUsn → 병영수첩 slug. 두 클랜 명부에 다 있으면 그 계정은 안 센다 (`null`) */
  const slugOfUsn = new Map<string, string | null>()
  for (const r of memberRows) {
    const seen = slugOfUsn.get(r.strUsn)
    if (seen === undefined) slugOfUsn.set(r.strUsn, r.clanSlug)
    else if (seen !== null && seen !== r.clanSlug) slugOfUsn.set(r.strUsn, null)
  }
  const leagueClanIdOfBarracksSlug = new Map<string, string>()
  for (const c of clans) if (c.barracksSlug) leagueClanIdOfBarracksSlug.set(c.barracksSlug, c.leagueClanId)
  const ambiguousUsn = [...slugOfUsn.values()].filter((v) => v === null).length
  console.error(`클랜원 명부 ${n(memberRows.length)}행 · 계정 ${n(slugOfUsn.size)} (두 클랜에 걸친 계정 ${n(ambiguousUsn)})`)

  const allKeyRows = await withRetry('battlelog keys', () =>
    prisma.$queryRaw<Array<{ matchKey: string }>>`
      SELECT DISTINCT "matchKey" FROM "BarracksBattleLogRaw"
      WHERE "subjectKind" = 'clan' AND "status" = 'ok' ORDER BY "matchKey" ASC
    `,
  )
  const allKeys = allKeyRows.map((r) => r.matchKey)
  /** clanNo → leagueClanId → 표 (명부 기준) */
  const memberVotes = new Map<string, Map<string, number>>()
  const memberStat = { matches: allKeys.length, rawsRead: 0, voted: 0, noTeamList: 0, noMember: 0, tie: 0, tooFew: 0 }
  for (let i = 0; i < allKeys.length; i += VOTE_PAGE) {
    const keys = allKeys.slice(i, i + VOTE_PAGE)
    const raws = await fetchTeamRows(`battlelog members ${i}`, keys)
    for (const raw of raws) {
      memberStat.rawsRead += 1
      const teamList = Array.isArray(raw.teamList) ? raw.teamList : []
      for (const t of teamList) if (t.clan_no != null) seenClanNos.add(String(t.clan_no))
      if (teamList.length !== 2) {
        memberStat.noTeamList += 1
        continue
      }
      /* 팀번호마다 그 팀 계정들이 어느 명부에 있는지 센다 */
      const slugVotes = new Map<string, Map<string, number>>()
      for (const [teamNo, usn] of raw.pairs ?? []) {
        if (teamNo == null || usn == null) continue
        const slug = slugOfUsn.get(usn)
        if (!slug) continue
        const inner = slugVotes.get(String(teamNo)) ?? new Map<string, number>()
        inner.set(slug, (inner.get(slug) ?? 0) + 1)
        slugVotes.set(String(teamNo), inner)
      }
      if (slugVotes.size === 0) {
        memberStat.noMember += 1
        continue
      }
      let counted = false
      for (const t of teamList) {
        if (t.team_no == null || t.clan_no == null) continue
        const inner = slugVotes.get(String(t.team_no))
        if (!inner) continue
        const best = majority(inner)
        if (best === null) {
          memberStat.tie += 1
          continue
        }
        /* 용병 함정 — 같은 명부 계정이 과반(3명)이고 식별 계정의 8할 이상이어야 그 팀이 그 클랜이다 */
        const bestCount = inner.get(best)!
        const identified = [...inner.values()].reduce((a, b) => a + b, 0)
        if (bestCount < MEMBER_MIN_ACCOUNTS || bestCount / identified < AGREEMENT) {
          memberStat.tooFew += 1
          continue
        }
        const leagueClanId = leagueClanIdOfBarracksSlug.get(best)
        if (!leagueClanId) continue
        const bucket = memberVotes.get(String(t.clan_no)) ?? new Map<string, number>()
        bucket.set(leagueClanId, (bucket.get(leagueClanId) ?? 0) + 1)
        memberVotes.set(String(t.clan_no), bucket)
        counted = true
      }
      if (counted) memberStat.voted += 1
    }
    console.error(`  명부 투표 ${n(Math.min(i + VOTE_PAGE, allKeys.length))}/${n(allKeys.length)}경기`)
  }

  /** 8할 이상 한쪽으로 몰린 번호만 잇는다. 나머지는 `clanNoConflicts` 에 남긴다 */
  interface Decision {
    clanNo: string
    leagueClanId: string
    votes: number
    total: number
    source: 'battlelog_roster' | 'battlelog_member'
  }
  const clanNoConflicts: Array<{ clanNo: string; source: string; candidates: Array<{ slug: string; votes: number }> }> = []
  const decide = (bucketBy: Map<string, Map<string, number>>, source: Decision['source']): Decision[] => {
    const out: Decision[] = []
    for (const [clanNo, bucket] of bucketBy) {
      const sorted = [...bucket.entries()].sort((a, b) => b[1] - a[1])
      const top = sorted[0]!
      const total = sorted.reduce((sum, [, c]) => sum + c, 0)
      if (top[1] / total >= AGREEMENT) out.push({ clanNo, leagueClanId: top[0], votes: top[1], total, source })
      else
        clanNoConflicts.push({
          clanNo,
          source,
          candidates: sorted.map(([id, c]) => ({ slug: clanByLeagueClanId.get(id)?.slug ?? id, votes: c })),
        })
    }
    return out
  }
  const rosterDecided = decide(votes, 'battlelog_roster')
  const memberDecided = decide(memberVotes, 'battlelog_member')
  /* ③과 ④가 같은 번호를 다른 클랜에 주면 둘 다 버린다 */
  const crossConflicts: Array<{ clanNo: string; roster: string; member: string }> = []
  const rosterOf = new Map(rosterDecided.map((d) => [d.clanNo, d]))
  const memberOf = new Map(memberDecided.map((d) => [d.clanNo, d]))
  const decided: Decision[] = []
  for (const clanNo of new Set([...rosterOf.keys(), ...memberOf.keys()])) {
    const a = rosterOf.get(clanNo)
    const b = memberOf.get(clanNo)
    if (a && b && a.leagueClanId !== b.leagueClanId) {
      crossConflicts.push({
        clanNo,
        roster: clanByLeagueClanId.get(a.leagueClanId)?.slug ?? a.leagueClanId,
        member: clanByLeagueClanId.get(b.leagueClanId)?.slug ?? b.leagueClanId,
      })
      continue
    }
    if (a) decided.push(a)
    if (b) decided.push(b)
  }
  for (const d of decided) {
    const c = clanByLeagueClanId.get(d.leagueClanId)
    if (!c) continue
    const sources = new Map<string, string[]>(Object.entries(c.clanNoSources ?? {}))
    sources.set(d.clanNo, [...(sources.get(d.clanNo) ?? []), `${d.source}:${d.votes}/${d.total}`])
    c.clanNos = [...sources.keys()].sort()
    c.clanNoSources = Object.fromEntries(sources)
  }
  const decidedClanNos = new Set(decided.map((d) => d.clanNo))

  /* 대표 번호 하나를 고른다 — ①② > ③(라인업) > ④(명부, 표 최다). ③과 ④ 1위가 다르면 null */
  const clanNoDisagreements: Array<{ slug: string; roster: string; member: string }> = []
  for (const c of clans) {
    if (c.clanNo) continue /* ①② 에서 이미 정해졌다 */
    const mine = decided.filter((d) => d.leagueClanId === c.leagueClanId)
    const roster = mine.filter((d) => d.source === 'battlelog_roster').sort((a, b) => b.votes - a.votes)[0]
    const member = mine.filter((d) => d.source === 'battlelog_member').sort((a, b) => b.votes - a.votes)[0]
    if (roster && member && roster.clanNo !== member.clanNo) {
      clanNoDisagreements.push({ slug: c.slug, roster: roster.clanNo, member: member.clanNo })
      continue
    }
    const pick = roster ?? member
    if (!pick) continue
    c.clanNo = pick.clanNo
    c.clanNoSource = `${pick.source}:${pick.votes}/${pick.total}`
  }
  console.error(
    `클랜번호 투표(라인업): 대상 ${n(voteStat.matches)} · 원문 읽음 ${n(voteStat.rawsRead)} · 표 낸 경기 ${n(voteStat.voted)} · ` +
      `이음 ${n(rosterDecided.length)} · teamList≠2 ${voteStat.noTeamList} · 라인업 계정 없음 ${voteStat.noLineupAccount} · 동률 ${voteStat.tie}`,
  )
  console.error(
    `클랜번호 투표(명부): 대상 ${n(memberStat.matches)} · 원문 읽음 ${n(memberStat.rawsRead)} · 표 낸 경기 ${n(memberStat.voted)} · ` +
      `이음 ${n(memberDecided.length)} · teamList≠2 ${memberStat.noTeamList} · 명부 계정 없음 ${memberStat.noMember} · 동률 ${memberStat.tie} · 과반 미달 ${memberStat.tooFew}`,
  )
  console.error(
    `→ 본 번호 ${n(seenClanNos.size)} · 이은 번호 ${n(decidedClanNos.size)} · 8할 미만 ${n(clanNoConflicts.length)} · 출처끼리 어긋남 ${n(crossConflicts.length)} · ` +
      `대표 번호 정한 클랜 ${n(clans.filter((c) => c.clanNo).length)} · 대표 못 정함(어긋남) ${n(clanNoDisagreements.length)}`,
  )
  const multiNo = clans.filter((c) => (c.clanNos?.length ?? 0) > 1)
  if (multiNo.length > 0)
    console.error(`  후보가 둘 이상인 클랜 ${multiNo.length}곳: ${multiNo.map((c) => `${c.slug}(${c.clanNos!.join('/')} → ${c.clanNo ?? 'null'})`).join(', ')}`)

  /* ── 5. 집계 --------------------------------------------------------- */
  const summaryOf = (c: ClanRow): ClanSummary => ({
    slug: c.slug,
    name: c.name,
    clanId: c.clanId,
    leagueClanId: c.leagueClanId,
    division: c.division,
    barracksSlug: c.barracksSlug,
    clanNo: c.clanNo,
    clanNoSource: c.clanNoSource,
    clanNos: c.clanNos,
    clanNoSources: c.clanNoSources,
    matches: 0,
    withLineup: 0,
    withoutLineup: 0,
    withBattlelog: 0,
    withoutBattlelog: 0,
  })
  const perClan = new Map<string, ClanSummary>(clans.map((c) => [c.leagueClanId, summaryOf(c)]))
  /** 경기의 한쪽이 `nolink` 클랜 목록에 없는 경우 — 있어서는 안 되지만 있으면 센다 */
  const unknownLeagueClanIds = new Map<string, number>()

  const totals = {
    matches: matches.length,
    withLineup: 0,
    withoutLineup: 0,
    withBattlelog: 0,
    withoutBattlelog: 0,
    /** 배틀로그는 있는데 라인업이 없다 — 재수집 대상이 아니다 */
    battlelogButNoLineup: 0,
    /** 라인업은 있는데 배틀로그 원문이 없다 — 있으면 원문 보존 원칙(3-A 1번) 위반이니 적는다 */
    lineupButNoBattlelog: 0,
    missingSourceMatchId: 0,
    originNotBarracks: 0,
  }

  interface Target {
    matchId: string
    matchKey: string | null
    startAt: string
    startAtKst: string
    red: { slug: string; name: string; clanNo: string | null } | null
    blue: { slug: string; name: string; clanNo: string | null } | null
    /** 수집기가 부를 클랜번호 — 양쪽 **대표 번호**, 사전순. 하나도 모르면 null. 하나면 된다 (D-218) */
    clanNos: string[] | null
  }
  const targets: Target[] = []
  const lineupPending: Array<{ matchId: string; matchKey: string | null; startAtKst: string }> = []

  for (const m of matches) {
    if (!m.sourceMatchId) totals.missingSourceMatchId += 1
    if (m.origin !== 'nexon_barracks') totals.originNotBarracks += 1
    if (m.hasLineup) totals.withLineup += 1
    else totals.withoutLineup += 1
    if (m.hasBattlelog) totals.withBattlelog += 1
    else totals.withoutBattlelog += 1
    if (m.hasBattlelog && !m.hasLineup) {
      totals.battlelogButNoLineup += 1
      lineupPending.push({ matchId: m.id, matchKey: m.sourceMatchId, startAtKst: kst(m.startAt) })
    }
    if (m.hasLineup && !m.hasBattlelog) totals.lineupButNoBattlelog += 1

    const sides = [m.redLeagueClanId, m.blueLeagueClanId]
    for (const lcId of sides) {
      const s = perClan.get(lcId)
      if (!s) {
        unknownLeagueClanIds.set(lcId, (unknownLeagueClanIds.get(lcId) ?? 0) + 1)
        continue
      }
      s.matches += 1
      if (m.hasLineup) s.withLineup += 1
      else s.withoutLineup += 1
      if (m.hasBattlelog) s.withBattlelog += 1
      else s.withoutBattlelog += 1
    }

    if (!m.hasBattlelog) {
      const red = clanByLeagueClanId.get(m.redLeagueClanId) ?? null
      const blue = clanByLeagueClanId.get(m.blueLeagueClanId) ?? null
      const nos = [...new Set([red?.clanNo, blue?.clanNo].filter((x): x is string => !!x))].sort()
      targets.push({
        matchId: m.id,
        matchKey: m.sourceMatchId,
        startAt: m.startAt.toISOString(),
        startAtKst: kst(m.startAt),
        red: red ? { slug: red.slug, name: red.name, clanNo: red.clanNo } : null,
        blue: blue ? { slug: blue.slug, name: blue.name, clanNo: blue.clanNo } : null,
        clanNos: nos.length > 0 ? nos : null,
      })
    }
  }
  /* 수집은 **오래된 것부터** — 보관 창을 넘기면 영구히 사라진다 (DECISIONS 12471) */
  targets.sort((a, b) => (a.startAt < b.startAt ? -1 : a.startAt > b.startAt ? 1 : 0))

  /* 보관 창 기준 나이 분포 — 보고용. `now` 는 파일에 적어 두어 언제 기준인지 남긴다 */
  const now = new Date()
  const ageDays = (iso: string): number => (now.getTime() - new Date(iso).getTime()) / 86_400_000
  const retention = {
    asOf: now.toISOString(),
    withinSafeDays: targets.filter((t) => ageDays(t.startAt) <= RETENTION_SAFE_DAYS).length,
    betweenSafeAndSeen: targets.filter(
      (t) => ageDays(t.startAt) > RETENTION_SAFE_DAYS && ageDays(t.startAt) <= RETENTION_SEEN_DAYS,
    ).length,
    beyondSeenDays: targets.filter((t) => ageDays(t.startAt) > RETENTION_SEEN_DAYS).length,
    withoutAnyClanNo: targets.filter((t) => t.clanNos === null).length,
  }

  /* ── 6. 문서 대조 ---------------------------------------------------- */
  const DOC = { matches: 24_662, withLineup: 1_562, withBattlelogLocal: 1_685 }
  const compare = {
    doc: DOC,
    matchesAll,
    matchesInSeason: totals.matches,
    withLineup: totals.withLineup,
    withBattlelog: totals.withBattlelog,
    withoutBattlelog: totals.withoutBattlelog,
    matchesDelta: totals.matches - DOC.matches,
    lineupDelta: totals.withLineup - DOC.withLineup,
    battlelogDeltaVsLocal: totals.withBattlelog - DOC.withBattlelogLocal,
  }

  /* ── 7. 파일 --------------------------------------------------------- */
  const clanSummaries = [...perClan.values()]
  const clanSum = clanSummaries.reduce(
    (acc, c) => {
      acc.matches += c.matches
      acc.withBattlelog += c.withBattlelog
      acc.withoutBattlelog += c.withoutBattlelog
      return acc
    },
    { matches: 0, withBattlelog: 0, withoutBattlelog: 0 },
  )

  const output = {
    version: 1,
    generatedAt: now.toISOString(),
    league: { id: league.id, slug: league.slug, name: league.name },
    seasonFrom: SEASON0_FROM.toISOString(),
    seasonWindow: season0WindowLabel(),
    note:
      'targets = 배틀로그 원문(BarracksBattleLogRaw subjectKind=clan status=ok)이 없는 경기. ' +
      'GetBattleLogClan/{matchKey}/{clanNo} 를 경기당 1회 부른다 (D-218). clanNos 가 null 이면 ' +
      '우리가 아는 클랜번호가 없다 — 매치목록(GetClanMatchList) 원문의 clan_no 로 채운다. ' +
      'lineupPending 은 원문은 있는데 라인업을 못 만든 경기 — 재수집 대상이 아니다. ' +
      '클랜별 건수의 합은 경기마다 두 클랜에 세므로 경기 수의 2배다.',
    summary: {
      clans: clans.length,
      clansWithBarracksSlug: clans.filter((c) => c.barracksSlug).length,
      /** 대표 번호가 정해진 클랜 — 수집기가 바로 쓸 수 있는 곳 */
      clansWithClanNo: clans.filter((c) => c.clanNo).length,
      clansWithAnyCandidate: clans.filter((c) => c.clanNos).length,
      clanNoDisagreements: clanNoDisagreements.length,
      clansWithClanNoFromNumberTable: countSource('clan_number'),
      clansWithClanNoFromMatchList: countSource('clan_match_list'),
      clansWithClanNoFromBattlelogRoster: countSource('battlelog_roster'),
      clansWithClanNoFromBattlelogMember: countSource('battlelog_member'),
      clanNoVote: {
        agreement: AGREEMENT,
        roster: { ...voteStat, decided: rosterDecided.length },
        member: { ...memberStat, decided: memberDecided.length },
        seenClanNos: seenClanNos.size,
        decidedClanNos: decidedClanNos.size,
        conflicts: clanNoConflicts.length,
        crossConflicts: crossConflicts.length,
      },
      matchesAll,
      matchesBeforeSeason,
      matchesByOrigin: byOrigin,
      ...totals,
      targets: targets.length,
      lineupPending: lineupPending.length,
      unknownLeagueClanIds: unknownLeagueClanIds.size,
      perClanSum: clanSum,
      retention: { safeDays: RETENTION_SAFE_DAYS, seenDays: RETENTION_SEEN_DAYS, ...retention },
    },
    compare,
    clans: clanSummaries,
    /** 8할 미만이라 잇지 않은 클랜번호 — 지어내지 않고 후보를 그대로 적는다 */
    clanNoConflicts,
    /** 라인업 투표와 명부 투표가 같은 번호를 다른 클랜에 준 것 — 둘 다 안 썼다 */
    clanNoCrossConflicts: crossConflicts,
    /** 한 클랜 안에서 라인업 투표 1위와 명부 투표 1위가 다른 것 — 대표 번호를 비워 뒀다 */
    clanNoDisagreements,
    lineupPending,
    targets,
  }

  mkdirSync(dirname(OUT_FILE), { recursive: true })
  writeFileSync(OUT_FILE, JSON.stringify(output, null, 1), 'utf8')

  /* ── 8. 보고 --------------------------------------------------------- */
  console.info('')
  console.info(`IPL(${league.slug}) 수집 대상 명단 — ${season0WindowLabel()}`)
  console.info(
    `클랜 ${n(clans.length)}곳 (병영수첩 slug 아는 곳 ${n(clans.filter((c) => c.barracksSlug).length)} · ` +
      `대표 클랜번호 정한 곳 ${n(clans.filter((c) => c.clanNo).length)} · 후보라도 있는 곳 ${n(clans.filter((c) => c.clanNos).length)} — ` +
      `BarracksClanNumber ${countSource('clan_number')} · 매치목록 원문 ${countSource('clan_match_list')} · ` +
      `라인업 투표 ${countSource('battlelog_roster')} · 명부 투표 ${countSource('battlelog_member')})`,
  )
  if (clanNoDisagreements.length > 0)
    console.info(`  ⚠ 라인업/명부 1위가 다른 클랜: ${clanNoDisagreements.map((d) => `${d.slug}(${d.roster}≠${d.member})`).join(', ')}`)
  console.info(
    `  투표: 라인업 ${n(voteStat.voted)}/${n(voteStat.matches)}경기 → 이음 ${n(rosterDecided.length)} · 명부 ${n(memberStat.voted)}/${n(memberStat.matches)}경기 → 이음 ${n(memberDecided.length)} · ` +
      `본 번호 ${n(seenClanNos.size)} · 이은 번호 ${n(decidedClanNos.size)} · 8할 미만 ${n(clanNoConflicts.length)} · 출처끼리 어긋남 ${n(crossConflicts.length)}`,
  )
  const noNumber = clans.filter((c) => !c.clanNo)
  if (noNumber.length > 0) console.info(`  대표 클랜번호 없는 클랜: ${noNumber.map((c) => c.slug).join(', ')}`)
  console.info(`경기 전체 ${n(matchesAll)} · 창 안 ${n(totals.matches)} · 창 앞 ${n(matchesBeforeSeason)}`)
  console.info(`라인업   있음 ${n(totals.withLineup)} · 없음 ${n(totals.withoutLineup)}`)
  console.info(`배틀로그 있음 ${n(totals.withBattlelog)} · 없음 ${n(totals.withoutBattlelog)}`)
  console.info(
    `  배틀로그만 있고 라인업 없음 ${n(totals.battlelogButNoLineup)} · 라인업만 있고 배틀로그 없음 ${n(totals.lineupButNoBattlelog)}`,
  )
  console.info(`수집 대상(targets) ${n(targets.length)}건 · 클랜번호 모르는 대상 ${n(retention.withoutAnyClanNo)}건`)
  console.info(
    `  나이: ${RETENTION_SAFE_DAYS}일 안 ${n(retention.withinSafeDays)} · ${RETENTION_SAFE_DAYS}~${RETENTION_SEEN_DAYS}일 ${n(retention.betweenSafeAndSeen)} · ${RETENTION_SEEN_DAYS}일 밖 ${n(retention.beyondSeenDays)}`,
  )
  console.info(
    `문서 대조: 경기 ${n(DOC.matches)} → ${n(totals.matches)} (${compare.matchesDelta >= 0 ? '+' : ''}${n(compare.matchesDelta)}) · ` +
      `라인업 ${n(DOC.withLineup)} → ${n(totals.withLineup)} (${compare.lineupDelta >= 0 ? '+' : ''}${n(compare.lineupDelta)}) · ` +
      `배틀로그(로컬 ${n(DOC.withBattlelogLocal)}) → ${n(totals.withBattlelog)}`,
  )
  if (totals.missingSourceMatchId > 0) console.info(`⚠ sourceMatchId 없는 경기 ${n(totals.missingSourceMatchId)}건`)
  if (totals.originNotBarracks > 0) console.info(`⚠ origin ≠ nexon_barracks 경기 ${n(totals.originNotBarracks)}건`)
  if (unknownLeagueClanIds.size > 0)
    console.info(`⚠ nolink 클랜 목록에 없는 leagueClanId ${unknownLeagueClanIds.size}개 (경기 ${n([...unknownLeagueClanIds.values()].reduce((a, b) => a + b, 0))}건)`)
  console.info(`클랜별 합 = 경기 ${n(clanSum.matches)} · 배틀로그 있음 ${n(clanSum.withBattlelog)} · 없음 ${n(clanSum.withoutBattlelog)} (경기 수의 2배여야 한다)`)
  console.info(`파일 ${OUT_FILE}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
