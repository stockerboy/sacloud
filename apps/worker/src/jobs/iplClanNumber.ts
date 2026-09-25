/**
 * IPL **클랜 번호 잇기** — 매치목록 원문에서 호출 0회로 푼다 (`lib/iplClanNumber.ts` 참조).
 *
 * ```
 * pnpm --filter @sacloud/worker nexon ipl-clan-number            # 미리보기
 * pnpm --filter @sacloud/worker nexon ipl-clan-number --confirm  # 실제 저장
 * ```
 *
 * ── 왜 `clan-number` 를 안 쓰나
 *   그쪽은 `MatchPlayerStat` 으로 팀번호와 진영을 맞춘다. IPL 은 그 표가 0건이라
 *   **자기가 만들려는 것을 자기가 요구하는 순환**이 된다. 판정 근거와 이유는
 *   `lib/iplClanNumber.ts` 머리말에 있다. **옛 잡은 그대로 살아 있다** (`CLAUDE.md` 10-4).
 *
 * ── 안전
 *   · `--confirm` 없이는 한 줄도 쓰지 않는다
 *   · 멱등하다 — `clanNo` 로 upsert 한다. 다시 돌려도 늘지 않는다
 *   · 요청을 한 건도 보내지 않는다. 이미 저장된 원문만 읽는다
 *   · 못 이은 것은 **사유별로 세어 보고한다.** 조용히 버리지 않는다
 */
import { prisma } from '@sacloud/db'
import { IPL_ROSTER } from '@sacloud/db/ops'
import { log, warn } from '../lib/log.js'
import {
  decideIplClanNumbers,
  type ClanNumberSkipReason,
  type SubjectClanNoRow,
} from '../lib/iplClanNumber.js'

const IPL_SLUG = 'nolink'
/** 이 잡이 이은 행을 나중에 가려낼 수 있게 남긴다 */
export const IPL_CLAN_NUMBER_SOURCE = 'ipl-matchlist'

export interface IplClanNumberResult {
  /** 원문에서 본 (주체, 클랜번호) 짝 */
  pairs: number
  subjects: number
  /** 우리 IPL 등록 클랜 수 */
  registered: number
  linked: number
  created: number
  updated: number
  /** 이미 다른 잡이 이어 둔 것과 값이 달라 덮지 않은 수 */
  conflicts: number
  skipped: Record<ClanNumberSkipReason, number>
  unresolvedSubjects: string[]
  written: boolean
}

/**
 * 병영수첩 slug → 우리 `Clan.id`.
 *
 * 세 경로로 찾는다. 로컬과 운영의 `Clan.slug` 가 다를 수 있어서다 —
 * 로컬에서 만든 클랜은 `ipl-<병영수첩slug>` 꼴이고 운영은 다른 slug 로 들어가 있다
 * (`dev/iplProjectPush.ts` 실측). 이름이 겹치면 **버린다.** 지어내지 않는다.
 */
export async function buildSubjectIndex(leagueId: string): Promise<{
  resolve: (subject: string) => string | null
  registered: number
}> {
  const rows = await prisma.leagueClan.findMany({
    where: { leagueId },
    select: { clan: { select: { id: true, slug: true, name: true } } },
  })

  const bySlug = new Map<string, string>()
  const byName = new Map<string, string>()
  const nameConflicts = new Set<string>()
  for (const row of rows) {
    bySlug.set(row.clan.slug, row.clan.id)
    const seen = byName.get(row.clan.name)
    if (seen !== undefined && seen !== row.clan.id) nameConflicts.add(row.clan.name)
    else byName.set(row.clan.name, row.clan.id)
  }
  for (const name of nameConflicts) byName.delete(name)
  if (nameConflicts.size) {
    warn(`이름이 겹쳐 못 쓰는 클랜명 ${nameConflicts.size}개: ${[...nameConflicts].join(', ')}`)
  }

  const rosterBySlug = new Map(IPL_ROSTER.map((entry) => [entry.barracks, entry]))

  const resolve = (subject: string): string | null => {
    /* ① slug 가 그대로인 경우 */
    const direct = bySlug.get(subject)
    if (direct !== undefined) return direct
    /* ② 로컬에서 만든 `ipl-` 접두 slug */
    const prefixed = bySlug.get(`ipl-${subject}`)
    if (prefixed !== undefined) return prefixed
    /* ③ 명단이 아는 이름 (지금 이름 · 사용자가 처음 준 옛 표기) */
    const entry = rosterBySlug.get(subject)
    if (entry === undefined) return null
    return byName.get(entry.name) ?? byName.get(entry.given) ?? null
  }

  return { resolve, registered: rows.length }
}

/**
 * 매치목록 원문에서 뽑은 **(주체, 클랜번호) 짝**. 저장된 것만 읽는다.
 *
 * `payload` 를 통째로 끌어오지 않는다 — 20만 행 × 최대 8KB 면 로컬 PostgreSQL 이
 * `out of memory (printtup)` 로 죽는다 (`dev/battlelogWorklist.ts` 실측).
 * `DISTINCT` 로 짝만 뽑으면 39줄이다 — ★단, 그 39줄을 뽑으려면 `BarracksClanMatchRaw`
 * 110만 행을 인덱스로 훑어야 한다.★ `status='ok'` 인 행 거의 전부가 이제 `rawClanNo` 를
 * 채우고 있어서(예전엔 드물었다) 부분 인덱스도 카디널리티를 거의 못 줄인다 — 이제는
 * 사실상 전체 스캔이다.
 *
 * ⚠ ★2026-09-25 — 로그인이 500으로 죽던 진짜 원인★ (사장님 「로그인이 느려」)
 *
 *   운영 `pg_stat_activity` 를 직접 찍어서 잡았다 — 이 질의가 6분 45초째 `DataFileRead`
 *   로 걸려 있었다. 호출부(`battlelogLineup.ts` 378줄)의 주석은 이미 2026-09-15 에
 *   같은 증상(「DB 시간초과(57014)로 죽기 시작했고 라인업 잡이 통째로 멈췄다」)을
 *   적어 뒀고 `try/catch` 로 ★라인업 잡 자체★ 는 지켰다 — 하지만 그 try/catch 는
 *   질의가 ★끝난 뒤★ 에야 잡힌다. 끝나기 전까지는 Supavisor 의 기본 `statement_timeout`
 *   (2분)까지 커넥션 하나를 붙들고 있었고, 그게 2분마다(`lineup.sh` 크론) 반복되면서
 *   로그인 같은 사이트 요청이 쓸 풀을 갉아먹었다.
 *
 *   ★진짜 해결(표를 가볍게 만들기)은 아직 안 했다★ — `docs/ORDERS.md` 에 남아 있다.
 *   그 전까지, 이 질의에만 ★짧은 statement_timeout(5초)★ 을 건다. 5초 안에 못 끝내면
 *   Postgres 가 스스로 취소하고(57014), 호출부의 기존 catch 가 「보정 없이 간다」로
 *   넘어간다 — 어차피 실패해도 괜찮게 설계된 보정 단계였다(위 호출부 주석). 커넥션을
 *   몇 분이 아니라 최대 5초만 붙잡는 것만으로 이 회차의 부담이 없어진다.
 */
export async function loadSubjectClanNoPairs(): Promise<SubjectClanNoRow[]> {
  const [, rows] = await prisma.$transaction([
    prisma.$executeRawUnsafe(`SET LOCAL statement_timeout = '5000'`),
    prisma.$queryRaw<SubjectClanNoRow[]>`
      SELECT DISTINCT "subject", "rawClanNo" AS "clanNo"
      FROM "BarracksClanMatchRaw"
      WHERE "status" = 'ok' AND "rawClanNo" IS NOT NULL AND "rawClanNo" <> ''
    `,
  ])
  return rows
}

/**
 * **그 리그 안에서만** 통하는 클랜번호 표 — `클랜번호 → Clan.id`.
 *
 * ── 왜 리그 범위가 필요한가 (2026-09-01 실측)
 *   같은 병영수첩 클랜이 **우리 DB 에 두 행으로** 있을 수 있다. 실제로 `EVOA` 가 그렇다 —
 *   `melody`(slug `EVOA`, 열산 등록)와 `idylic`(slug `asdf123498`, IPL 등록)이 각각 있다.
 *   그 클랜은 그 사이에 개명했다 (`docs/IPL_SPEC.md` 7-A 의 `melody | idylic`).
 *
 *   `BarracksClanNumber.clanNo` 는 **기본키**라 한 번호에 한 클랜만 담긴다. 그래서
 *   그 표만 믿으면 IPL 배틀로그의 팀번호가 **열산 클랜**으로 풀리고, 그 경기는
 *   통째로 `side_mismatch` 로 버려진다. 리그를 정하고 그 안에서 다시 푼다.
 *
 * 저장된 표는 **덮지 않는다.** 여기서 만드는 것은 메모리 위의 읽기 전용 표다.
 */
export async function iplClanNumberMap(leagueId: string): Promise<Map<string, string>> {
  const { resolve } = await buildSubjectIndex(leagueId)
  const decision = decideIplClanNumbers(await loadSubjectClanNoPairs(), resolve)
  return new Map(decision.links.map((link) => [link.clanNo, link.clanId]))
}

export async function runIplClanNumber(
  options: { confirm?: boolean } = {},
): Promise<IplClanNumberResult> {
  const league = await prisma.league.findUnique({
    where: { slug: IPL_SLUG },
    select: { id: true },
  })
  if (!league) throw new Error(`리그 ${IPL_SLUG} 이 없다`)

  const { resolve, registered } = await buildSubjectIndex(league.id)

  const pairs = await loadSubjectClanNoPairs()

  const decision = decideIplClanNumbers(pairs, resolve)
  const result: IplClanNumberResult = {
    pairs: pairs.length,
    subjects: new Set(pairs.map((row) => row.subject)).size,
    registered,
    linked: decision.links.length,
    created: 0,
    updated: 0,
    conflicts: 0,
    skipped: decision.counts,
    unresolvedSubjects: decision.skipped
      .filter((row) => row.reason === 'unresolved_subject')
      .map((row) => row.subject),
    written: false,
  }

  /* 이미 이어져 있는 것과 다르면 **덮지 않는다.** 어느 쪽이 맞는지 우리가 모른다 */
  const existing = new Map(
    (
      await prisma.barracksClanNumber.findMany({
        where: { clanNo: { in: decision.links.map((link) => link.clanNo) } },
        select: { clanNo: true, clanId: true, source: true },
      })
    ).map((row) => [row.clanNo, row]),
  )

  for (const link of decision.links) {
    const seen = existing.get(link.clanNo)
    if (seen && seen.clanId !== link.clanId) {
      result.conflicts += 1
      warn(
        `클랜번호 ${link.clanNo} 는 이미 다른 클랜에 이어져 있다 ` +
          `(기존 ${seen.clanId} · ${seen.source} / 새것 ${link.clanId} · ${link.subject}) — 덮지 않는다`,
      )
      continue
    }
    if (seen) result.updated += 1
    else result.created += 1
    if (!options.confirm) continue
    await prisma.barracksClanNumber.upsert({
      where: { clanNo: link.clanNo },
      update: { clanId: link.clanId, source: IPL_CLAN_NUMBER_SOURCE, votes: 1 },
      create: {
        clanNo: link.clanNo,
        clanId: link.clanId,
        source: IPL_CLAN_NUMBER_SOURCE,
        votes: 1,
      },
    })
  }
  result.written = options.confirm === true

  log(
    `IPL 클랜번호 ${options.confirm ? '적재' : '미리보기'} — ` +
      `짝 ${result.pairs} · 주체 ${result.subjects} · 등록클랜 ${result.registered} · ` +
      `이음 ${result.linked}(신규 ${result.created} · 기존 ${result.updated}) · 충돌 ${result.conflicts}`,
  )
  log(
    `건너뜀 — 번호여럿 ${result.skipped.multiple_clan_no} · ` +
      `번호공유 ${result.skipped.shared_clan_no} · ` +
      `클랜모름 ${result.skipped.unresolved_subject}`,
  )
  if (result.unresolvedSubjects.length) {
    log(`잇지 못한 주체: ${result.unresolvedSubjects.join(', ')}`)
  }
  if (!options.confirm) log('--confirm 없이는 한 줄도 쓰지 않았다')

  return result
}
