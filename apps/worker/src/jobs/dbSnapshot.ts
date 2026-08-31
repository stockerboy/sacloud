/**
 * DB 이전 검증용 스냅샷 (D-147).
 *
 * ── 무엇을 위한 것인가
 *   managed PostgreSQL 로 옮긴 뒤 **"제대로 다 넘어갔는지"** 를 숫자로 판정하기 위한 기준선이다.
 *   `docs/RATING_FINAL_SPEC.md` 의 rating 백업(JSON)과는 **다른 것**이다 —
 *   그쪽은 래더 rollback 전용이고, 이건 전체 DB 이전 검증용이다.
 *
 * ── 무엇을 재는가
 *   1. 모델별 행 수
 *   2. 핵심 테이블의 createdAt 최소·최대 (기간이 잘리지 않았는지)
 *   3. 무결성 검사 — orphan FK · 중복 unique · 필수 필드 null
 *
 * 데이터를 **읽기만** 한다. 아무것도 쓰지 않는다.
 */
import { prisma } from '@sacloud/db'
import { SUPPLY_FORMULA_VERSION } from '@sacloud/db/ops'

export interface DbSnapshot {
  takenAt: string
  counts: Record<string, number>
  ranges: Record<string, { min: string | null; max: string | null }>
  integrity: { name: string; expected: number; actual: number; pass: boolean }[]
}

/** 세는 모델 — 스키마의 모든 모델을 이름 그대로 쓴다 */
const MODELS = [
  'user', 'userPlayerLink', 'playerLinkClaim', 'authToken', 'refreshToken',
  'player', 'clan', 'clanAlias', 'adminAuditLog', 'appSetting', 'gameMap',
  'league', 'leagueMap', 'leaguePlayerLimit', 'season', 'leagueClan',
  'leaguePlayer', 'leaguePlayerWeaponStat', 'leaguePlayerSeason', 'leagueClanSeason',
  'leagueInvitation', 'match', 'matchPlayerStat', 'rankSnapshot',
  'boardCategory', 'board', 'comment', 'vote', 'upload',
  'rawImport', 'legacyPlayerSeason', 'legacyCollectionJob', 'legacyCollectionPlayer',
  'sourceMapping', 'importJob', 'importFailure', 'migrationCheck',
  'nexonIdentity', 'nexonNickname', 'nexonIdentityCandidate', 'nexonMatch',
  'nexonMatchParticipant', 'nexonMatchObservation', 'nexonPollState', 'nexonPollRun',
  'leagueRosterMembership', 'ratingConfig', 'auditLog', 'rateLimit',
  'barracksRawImport', 'matchWeaponEvidence',
] as const

export async function takeDbSnapshot(stamp: string): Promise<DbSnapshot> {
  const counts: Record<string, number> = {}
  for (const model of MODELS) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const delegate = (prisma as any)[model]
    counts[model] = delegate ? await delegate.count() : -1
  }

  const ranges: Record<string, { min: string | null; max: string | null }> = {}
  const match = await prisma.match.aggregate({ _min: { startAt: true }, _max: { startAt: true } })
  ranges['match.startAt'] = {
    min: match._min.startAt?.toISOString() ?? null,
    max: match._max.startAt?.toISOString() ?? null,
  }
  const user = await prisma.user.aggregate({ _min: { createdAt: true }, _max: { createdAt: true } })
  ranges['user.createdAt'] = {
    min: user._min.createdAt?.toISOString() ?? null,
    max: user._max.createdAt?.toISOString() ?? null,
  }

  /* 무결성 — 전부 0이어야 한다. 이전 뒤 이 값이 바뀌면 뭔가 빠진 것이다 */
  const integrity: DbSnapshot['integrity'] = []
  const check = async (name: string, actual: number, expected = 0): Promise<void> => {
    integrity.push({ name, expected, actual, pass: actual === expected })
  }

  /* FK 는 DB 가 강제하므로 orphan 을 Prisma 로 찾는 것은 의미가 없다.
     여기서는 **이전이 잘못되면 실제로 깨지는 것**만 본다. */
  await check(
    'Match 에 진영 클랜이 비어 있음',
    await prisma.match.count({ where: { OR: [{ redLeagueClanId: '' }, { blueLeagueClanId: '' }] } }),
  )
  await check(
    'rating 이 있는데 formulaVersion 이 없음',
    await prisma.matchPlayerStat.count({ where: { ratingUpdate: { not: null }, formulaVersion: null } }),
  )
  /**
   * **우리 공식으로 계산했다고 표시된 행에는 rating 이 있어야 한다.**
   *
   * ⚠ 2026-09-01 정정 — 예전에는 `formulaVersion` 이 있으면 **무조건** rating 이 있어야 한다고
   *   단언했다. 그 단언은 **틀렸고, CI 를 3일 동안 빨갛게 만들었다** (D-224).
   *
   *   `formulaVersion` 에는 「우리가 계산했다」가 아니라 **「계산하지 않았다」는 표시**로 들어가는
   *   값이 있다. 미러 적재가 박는 `3rd.supply-imported` 가 그것이다 —
   *   원본 점수를 추정 공식으로 덮지 않기 위한 표식이고(`CLAUDE.md` 3-A 2번),
   *   원본값은 `sourceRating` / `sourceRatingDelta` 에 따로 남는다.
   *   그런 행은 `ratingUpdate` 가 비어 있는 것이 **정상**이다. 로컬 실측 3,614,696건.
   *
   *   `mock-fixture`(D-023)도 같은 성격의 표식이라 함께 뺀다.
   *
   * 지키려던 성질(우리 공식이 계산했으면 값이 있어야 한다)은 그대로다.
   */
  await check(
    '우리 공식으로 표시됐는데 rating 이 없음',
    await prisma.matchPlayerStat.count({
      where: {
        ratingUpdate: null,
        formulaVersion: { not: null },
        NOT: { formulaVersion: { in: [SUPPLY_FORMULA_VERSION, 'mock-fixture'] } },
      },
    }),
  )
  await check(
    '승률 48% 미만인데 표시 4000+ (D-145 위반)',
    (
      await prisma.leaguePlayer.findMany({ select: { rating: true, win: true, lose: true } })
    ).filter((row) => {
      const played = row.win + row.lose
      return played > 0 && row.win / played < 0.48 && row.rating >= 4000
    }).length,
  )
  await check(
    '활성 리그에 이름이 빈 클랜',
    await prisma.clan.count({ where: { name: '' } }),
  )
  await check(
    '이메일이 중복된 User',
    (await prisma.user.groupBy({ by: ['email'], _count: true })).filter((row) => row._count > 1).length,
  )

  return { takenAt: stamp, counts, ranges, integrity }
}

export function formatSnapshot(snapshot: DbSnapshot): string {
  const lines: string[] = []
  lines.push(`DB 스냅샷 — ${snapshot.takenAt}`)
  lines.push('')
  lines.push('[행 수]')
  for (const [model, count] of Object.entries(snapshot.counts)) {
    if (count === 0) continue
    lines.push(`  ${model.padEnd(28)} ${count}`)
  }
  const empty = Object.entries(snapshot.counts).filter(([, c]) => c === 0).map(([m]) => m)
  if (empty.length > 0) lines.push(`  (0건: ${empty.join(' ')})`)
  lines.push('')
  lines.push('[기간]')
  for (const [key, range] of Object.entries(snapshot.ranges)) {
    lines.push(`  ${key.padEnd(20)} ${range.min ?? '-'} ~ ${range.max ?? '-'}`)
  }
  lines.push('')
  lines.push('[무결성] — 전부 0이어야 한다')
  for (const row of snapshot.integrity) {
    lines.push(`  ${row.pass ? 'PASS' : 'FAIL'}  ${row.name.padEnd(44)} ${row.actual}`)
  }
  return lines.join('\n')
}
