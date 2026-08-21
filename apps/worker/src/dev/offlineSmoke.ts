/**
 * 오프라인 스모크 — **네트워크 없이** 파이프라인 전 구간을 실제 DB에 돌려 본다.
 *
 *   pnpm --filter @sacloud/worker exec tsx src/dev/offlineSmoke.ts
 *
 * 왜 필요한가
 *   단위 테스트는 순수 함수만 본다. 실제 DB에 쓰는 경로(원본 보존·스테이징 upsert·멱등성)는
 *   돌려 봐야 안다. API 키를 받기 전에도 여기까지는 확인할 수 있다.
 *
 * 안전장치
 *   - `fetch`를 가짜 응답으로 **주입**한다. 넥슨에 요청을 보내지 않는다.
 *   - 전용 `migrationVersion`(smoke-*)을 써서 실제 수집분과 섞이지 않는다.
 *   - 끝나면 **자기가 만든 행만** 지운다.
 *   - 로컬 개발 DB 전용이다. 운영 DB에 대고 돌리지 않는다.
 */
import { prisma } from '@sacloud/db'
import {
  DEFAULT_CONFIG,
  NexonClient,
  SAMPLE_MATCH_DETAIL,
  SAMPLE_MATCH_LIST,
  type FetchLike,
  type NexonConfig,
} from '@sacloud/nexon'
import { runCollect } from '../jobs/collect.js'
import { runIdentities } from '../jobs/identities.js'
import { runProject } from '../jobs/project.js'
import { runPoll } from '../jobs/poll.js'
import { backfillObservations, runReconstruct } from '../jobs/reconstruct.js'
import { applyPropagation, collectPropagationPeers } from '../jobs/propagate.js'
import { syncLeaguePriority } from '../jobs/roster.js'
import { DEFAULT_POLLING_CONFIG } from '../lib/pollingPolicy.js'
import type { JobContext } from '../jobs/context.js'

const SMOKE_VERSION = 'smoke-offline'
const SMOKE_OUID = 'SMOKE-OUID-0001'
/** 같은 경기를 다른 사람이 발견하는 상황을 만들기 위한 두 번째 계정 */
const SMOKE_OUID_2 = 'SMOKE-OUID-0002'
const SMOKE_NICKNAME = '스모크닉'
const SMOKE_MATCH_IDS = SAMPLE_MATCH_LIST.match.map((entry) => entry.match_id)

/** 실제 키가 아니다. 클라이언트가 "키가 있다"고 판단하게만 하는 자리표시자다 */
const PLACEHOLDER_KEY = 'smoke-not-a-real-key'

const SMOKE_LEAGUE_SLUG = 'smoke-league'
const SMOKE_CLAN_SLUGS = ['smoke-alpha', 'smoke-bravo']
const SMOKE_MAP_NAME = SAMPLE_MATCH_DETAIL.match_map
const SMOKE_PLAYER_PREFIX = 'SMOKE-PLAYER-'

let failures = 0

function check(name: string, expected: unknown, actual: unknown) {
  const ok = JSON.stringify(expected) === JSON.stringify(actual)
  if (!ok) failures += 1
  console.info(`${ok ? 'PASS' : 'FAIL'}  ${name}  기대=${expected}  실제=${actual}`)
}

/** 가짜 넥슨 — 스펙 형태의 픽스처를 돌려준다 */
const fakeFetch: FetchLike = async (url) => {
  const body = url.includes('/match-detail')
    ? SAMPLE_MATCH_DETAIL
    : url.includes('/v1/match')
      ? SAMPLE_MATCH_LIST
      : { ouid: SMOKE_OUID }

  return {
    status: 200,
    headers: { get: () => null },
    text: async () => JSON.stringify(body),
  }
}

function makeContext(): JobContext {
  const config: NexonConfig = {
    ...DEFAULT_CONFIG,
    apiKey: PLACEHOLDER_KEY,
    migrationVersion: SMOKE_VERSION,
    requestsPerSecond: 1000, // 가짜 fetch라 대기할 이유가 없다
  }
  return {
    config,
    client: new NexonClient({ config, fetchImpl: fakeFetch }),
    dryRun: false,
    limit: 50,
    resume: false,
  }
}

async function cleanupLeague() {
  // Match → MatchPlayerStat, League → LeagueClan 은 cascade 삭제된다
  await prisma.match.deleteMany({ where: { league: { slug: SMOKE_LEAGUE_SLUG } } })
  await prisma.league.deleteMany({ where: { slug: SMOKE_LEAGUE_SLUG } })
  await prisma.matchPlayerStat.deleteMany({
    where: { player: { id: { startsWith: SMOKE_PLAYER_PREFIX } } },
  })
  await prisma.player.deleteMany({ where: { id: { startsWith: SMOKE_PLAYER_PREFIX } } })
  await prisma.clan.deleteMany({ where: { slug: { in: SMOKE_CLAN_SLUGS } } })
}

async function cleanup() {
  await cleanupLeague()
  await prisma.nexonMatchParticipant.deleteMany({
    where: { nexonMatch: { sourceMatchId: { in: SMOKE_MATCH_IDS } } },
  })
  await prisma.nexonMatch.deleteMany({ where: { sourceMatchId: { in: SMOKE_MATCH_IDS } } })
  await prisma.nexonIdentityCandidate.deleteMany({ where: { ouid: { startsWith: 'SMOKE-OUID' } } })
  await prisma.nexonPollState.deleteMany({ where: { ouid: { startsWith: 'SMOKE-OUID' } } })
  await prisma.nexonIdentity.deleteMany({ where: { ouid: { startsWith: 'SMOKE-OUID' } } })
  await prisma.nexonPollRun.deleteMany({ where: { migrationVersion: SMOKE_VERSION } })
  await prisma.nexonNickname.deleteMany({
    where: {
      OR: [
        { identityKey: SMOKE_OUID },
        { nickname: { in: [SMOKE_NICKNAME, ...SAMPLE_MATCH_DETAIL.match_detail.map((p) => p.user_name)] } },
      ],
    },
  })
  await prisma.rawImport.deleteMany({ where: { migrationVersion: SMOKE_VERSION } })
  await prisma.importJob.deleteMany({ where: { migrationVersion: SMOKE_VERSION } })
  await prisma.importFailure.deleteMany({ where: { jobKey: { contains: SMOKE_OUID } } })
  await prisma.migrationCheck.deleteMany({ where: { migrationVersion: SMOKE_VERSION } })
}

async function main() {
  console.info('오프라인 스모크 — 넥슨에 요청을 보내지 않는다\n')
  await cleanup()

  const ctx = makeContext()

  /* 1) 신원 — ouid를 알아내되 사람을 확정하지 않는다 */
  const identities = await runIdentities(ctx, [SMOKE_NICKNAME])
  check('신원 관측', 1, identities.resolved)
  const identity = await prisma.nexonIdentity.findUnique({ where: { ouid: SMOKE_OUID } })
  check('신원 기본 상태는 unresolved (자동 연결 금지)', 'unresolved', identity?.status)
  check('Player 자동 연결 없음', null, identity?.playerId ?? null)

  /* 2) 수집 1회차 — 원본 → 스테이징
     **자기 경기만** 상세를 받는다. DB에 실제 수집분이 있어도 건드리면 안 된다 (D-045) */
  const first = await runCollect(ctx, {
    ouids: [SMOKE_OUID],
    detailSourceMatchIds: SMOKE_MATCH_IDS,
  })
  check('목록 호출 수 (모드 4개)', 4, first.listCalls)
  check('스테이징 신규 매치', SMOKE_MATCH_IDS.length, first.matchesCreated)

  const staged = await prisma.nexonMatch.findMany({
    where: { sourceMatchId: { in: SMOKE_MATCH_IDS } },
    include: { participants: true },
  })
  check('스테이징 매치 수', SMOKE_MATCH_IDS.length, staged.length)
  const detailed = staged.find((match) => match.sourceMatchId === SAMPLE_MATCH_DETAIL.match_id)
  check('참가자 수', SAMPLE_MATCH_DETAIL.match_detail.length, detailed?.participants.length ?? 0)
  check('검증 통과', 'valid', detailed?.validationStatus)
  check('신선도 기한 설정됨', true, detailed?.refreshDueAt !== null)
  check(
    '넥슨이 안 주는 값은 스테이징에도 없다 (damage는 원본 그대로 소수)',
    SAMPLE_MATCH_DETAIL.match_detail[0]?.damage,
    detailed?.participants.find((p) => p.slot === 0)?.damage,
  )

  const rawAfterFirst = await prisma.rawImport.count({ where: { migrationVersion: SMOKE_VERSION } })

  /* 3) 수집 2회차 — 같은 응답이면 원본도 스테이징도 늘지 않는다 (멱등성) */
  const second = await runCollect(ctx, {
    ouids: [SMOKE_OUID],
    detailSourceMatchIds: [SAMPLE_MATCH_DETAIL.match_id],
  })
  check('재수집 시 신규 매치 없음', 0, second.matchesCreated)

  const rawAfterSecond = await prisma.rawImport.count({ where: { migrationVersion: SMOKE_VERSION } })
  check('같은 내용이면 원본 행이 늘지 않는다', rawAfterFirst, rawAfterSecond)

  const listRaw = await prisma.rawImport.findFirst({
    where: { migrationVersion: SMOKE_VERSION, endpoint: '/suddenattack/v1/match' },
    select: { fetchCount: true, requestParams: true },
  })
  check('재수집은 fetchCount로 센다', true, (listRaw?.fetchCount ?? 0) >= 2)
  check(
    '저장된 요청 파라미터에 키가 없다',
    false,
    JSON.stringify(listRaw?.requestParams ?? {}).includes(PLACEHOLDER_KEY),
  )

  const participantsAfterSecond = await prisma.nexonMatchParticipant.count({
    where: { nexonMatch: { sourceMatchId: SAMPLE_MATCH_DETAIL.match_id } },
  })
  check('참가자도 중복되지 않는다', SAMPLE_MATCH_DETAIL.match_detail.length, participantsAfterSecond)

  /* 4) 투영 — 리그 소속이 아니므로 보류돼야 한다 (부분 저장 금지) */
  const projected = await runProject(ctx, { sourceMatchIds: SMOKE_MATCH_IDS })
  check('투영된 경기 없음 (리그 소속 클랜이 아니다)', 0, projected.projected)
  check('보류로 기록됨', true, projected.skipped > 0)
  const domainMatches = await prisma.match.count({ where: { origin: 'nexon' } })
  check('운영 테이블에 넥슨 경기 없음', 0, domainMatches)

  /* 5) 리그를 구성하면 투영된다 — 운영 테이블 쓰기 경로까지 확인한다 */
  const map = await prisma.gameMap.findUnique({ where: { name: SMOKE_MAP_NAME ?? '' } })
  const mapId =
    map?.id ??
    (await prisma.gameMap.create({ data: { name: SMOKE_MAP_NAME ?? '스모크맵' } })).id
  const createdMap = map === null

  const clans = await Promise.all(
    ['알파클랜', '브라보클랜'].map((name, index) =>
      prisma.clan.create({ data: { slug: SMOKE_CLAN_SLUGS[index]!, name } }),
    ),
  )
  const league = await prisma.league.create({
    data: {
      slug: SMOKE_LEAGUE_SLUG,
      name: '스모크 리그',
      maps: { create: [{ mapId }] },
      playerLimits: { create: [{ playerCount: 5 }] },
      clans: {
        create: clans.map((clan, index) => ({ clanId: clan.id, division: index + 1 })),
      },
    },
  })

  // 참가자 10명을 플레이어로 만들고 **명시적으로** 신원을 연결한다 (자동 병합이 아니다)
  for (const [index, participant] of SAMPLE_MATCH_DETAIL.match_detail.entries()) {
    const player = await prisma.player.create({
      data: { id: `${SMOKE_PLAYER_PREFIX}${index}`, name: participant.user_name },
    })
    await prisma.nexonIdentity.upsert({
      where: { ouid: `${SMOKE_OUID}-${index}` },
      create: {
        ouid: `${SMOKE_OUID}-${index}`,
        userName: participant.user_name,
        playerId: player.id,
        status: 'active',
        linkReason: 'offline smoke — 사람이 확인했다고 가정',
      },
      update: { playerId: player.id, status: 'active' },
    })
  }

  const projectedAgain = await runProject(ctx, {
    leagueSlug: SMOKE_LEAGUE_SLUG,
    reproject: true,
    sourceMatchIds: SMOKE_MATCH_IDS,
  })
  check('리그 구성 후 투영', 1, projectedAgain.projected)

  const domainMatch = await prisma.match.findUnique({
    where: { origin_sourceMatchId: { origin: 'nexon', sourceMatchId: SAMPLE_MATCH_DETAIL.match_id } },
    include: { stats: true },
  })
  check('내부 ID는 우리 규칙(18자리)이다', true, /^\d{18}$/.test(domainMatch?.id ?? ''))
  check('외부 ID는 sourceMatchId에 보존된다', SAMPLE_MATCH_DETAIL.match_id, domainMatch?.sourceMatchId)
  check('넥슨이 안 주는 endAt은 null', null, domainMatch?.endAt ?? null)
  check('playTime은 null', null, domainMatch?.playTime ?? null)
  check('blueFirst는 null (false로 단정하지 않는다)', null, domainMatch?.blueFirst ?? null)
  check('MVP는 null', null, domainMatch?.mvpPlayerId ?? null)
  check('참가 기록 10건', 10, domainMatch?.stats.length ?? 0)
  const firstStat = domainMatch?.stats.find((stat) => stat.playerId === `${SMOKE_PLAYER_PREFIX}0`)
  check('weapon은 null (넥슨 미제공)', null, firstStat?.weapon ?? null)
  check('dropout은 null', null, firstStat?.dropout ?? null)
  check('mvp는 null', null, firstStat?.mvp ?? null)
  check('래더는 Phase 9 — 값을 넣지 않는다', null, firstStat?.ratingUpdate ?? null)
  check('formulaVersion 없음', null, firstStat?.formulaVersion ?? null)
  check('경기 시점 division 스냅샷', 1, firstStat?.playerDivisionAtMatch ?? 0)

  const reprojected = await runProject(ctx, {
    leagueSlug: SMOKE_LEAGUE_SLUG,
    reproject: true,
    sourceMatchIds: SMOKE_MATCH_IDS,
  })
  const domainCount = await prisma.match.count({ where: { origin: 'nexon' } })
  check('재투영해도 매치가 늘지 않는다', 1, domainCount)
  check('재투영 결과도 1건', 1, reprojected.considered)

  const leagueMatches = await prisma.match.count({ where: { leagueId: league.id } })
  check('리그 매치 수', 1, leagueMatches)

  await cleanupLeague()
  if (createdMap) await prisma.gameMap.deleteMany({ where: { id: mapId } })
  // 참가자용 파생 신원(SMOKE-OUID-0001-0 …)만 지운다. 폴링에 쓰는 기본 신원은 남긴다
  await prisma.nexonIdentity.deleteMany({ where: { ouid: { startsWith: `${SMOKE_OUID}-` } } })

  /* 6) 적응형 폴링 — 같은 경기를 다른 사람이 발견해도 중복이 생기지 않는다 */
  await prisma.nexonIdentity.create({
    data: { ouid: SMOKE_OUID_2, userName: '스모크닉2', status: 'unresolved' },
  })

  const SMOKE_OUIDS = [SMOKE_OUID, SMOKE_OUID_2]
  const firstPoll = await runPoll(ctx, {
    targets: 5,
    detailLimit: 2,
    ouids: SMOKE_OUIDS, // 실제 폴링 대상을 건드리지 않는다 (D-045)
    config: DEFAULT_POLLING_CONFIG,
  })
  check('폴링 대상 2명', 2, firstPoll.playersPolled)
  check('목록 호출 = 대상 × 모드 4개', 8, firstPoll.matchListRequests)
  check('신규 경기는 한 번만 센다', 0, firstPoll.uniqueNewMatchIds)
  check('이미 아는 경기는 중복으로 집계된다', true, firstPoll.duplicateMatchIds > 0)

  const stagingAfterPoll = await prisma.nexonMatch.count({
    where: { sourceMatchId: { in: SMOKE_MATCH_IDS } },
  })
  check('여러 사람이 같은 경기를 봐도 스테이징은 늘지 않는다', SMOKE_MATCH_IDS.length, stagingAfterPoll)

  const observations = await prisma.nexonMatchObservation.findMany({
    where: { nexonMatch: { sourceMatchId: SAMPLE_MATCH_DETAIL.match_id } },
    select: { ouid: true, source: true, kill: true },
  })
  check('같은 경기에 사람별 관측값이 쌓인다', 2, observations.length)
  check('관측값 출처가 남는다', 'player_match_list', observations[0]?.source ?? '')

  const domainAfterPoll = await prisma.match.count({ where: { origin: 'nexon' } })
  check('폴링이 운영 매치를 만들지 않는다 (투영은 별도 단계)', 0, domainAfterPoll)

  const stateAfterFirst = await prisma.nexonPollState.findUnique({ where: { ouid: SMOKE_OUID } })
  check('새 경기가 없으면 빈 조회로 기록된다', 'empty', stateAfterFirst?.lastPollStatus ?? '')
  check('연속 빈 조회 1회', 1, stateAfterFirst?.consecutiveEmptyPolls ?? -1)

  // 두 번째 폴링: 예정 시각을 지나게 만들어 다시 뽑히게 한다
  await prisma.nexonPollState.updateMany({
    where: { ouid: { startsWith: 'SMOKE-OUID' } },
    data: { nextPollAt: new Date(Date.now() - 60_000) },
  })
  const secondPoll = await runPoll(ctx, {
    targets: 5,
    detailLimit: 2,
    ouids: SMOKE_OUIDS,
    config: DEFAULT_POLLING_CONFIG,
  })
  check('이미 상세를 가진 경기는 다시 부르지 않는다', 0, secondPoll.matchDetailRequests)

  const stateAfterSecond = await prisma.nexonPollState.findUnique({ where: { ouid: SMOKE_OUID } })
  check('빈 조회가 이어지면 강등된다', 'warm', stateAfterSecond?.tier ?? '')
  check(
    '주기가 길어진다',
    DEFAULT_POLLING_CONFIG.intervalMinutes.warm,
    stateAfterSecond?.intervalMinutes ?? -1,
  )

  // 수동 갱신 요청 → 최우선
  await prisma.nexonPollState.update({
    where: { ouid: SMOKE_OUID },
    data: { manualRefreshRequestedAt: new Date(), tier: 'dormant' },
  })
  const manualPoll = await runPoll(ctx, {
    targets: 1,
    ouids: SMOKE_OUIDS,
    config: DEFAULT_POLLING_CONFIG,
  })
  check('수동 갱신 요청이 최우선으로 뽑힌다', 1, manualPoll.playersPolled)
  const stateAfterManual = await prisma.nexonPollState.findUnique({ where: { ouid: SMOKE_OUID } })
  check('처리 후 수동 요청 표시는 지워진다', null, stateAfterManual?.manualRefreshRequestedAt ?? null)

  const runs = await prisma.nexonPollRun.count({ where: { migrationVersion: SMOKE_VERSION } })
  check('실행마다 호출량이 기록된다', 3, runs)

  /* 7) 관측값 백필 — 보관된 원본만 다시 읽는다 (요청 없음) */
  const backfill = await backfillObservations({ ouids: SMOKE_OUIDS })
  check('보관된 목록 원본을 다시 읽는다', true, backfill.listRawsScanned > 0)
  check('원본에서 관측값이 나온다', true, backfill.entriesScanned > 0)
  const backfillAgain = await backfillObservations({ ouids: SMOKE_OUIDS })
  check('백필은 멱등하다 (다시 돌려도 새 관측값이 없다)', 0, backfillAgain.observationsCreated)

  /* 8) 로스터 기반 재구성 (Phase 8.2) — 상세가 반쪽이어도 관측으로 완성되는가 */
  const rmap = await prisma.gameMap.findUnique({ where: { name: SMOKE_MAP_NAME ?? '' } })
  const rMapId =
    rmap?.id ?? (await prisma.gameMap.create({ data: { name: SMOKE_MAP_NAME ?? '스모크맵' } })).id
  const createdMapForReconstruct = rmap === null

  const rClans = await Promise.all(
    ['알파클랜', '브라보클랜'].map((name, index) =>
      prisma.clan.create({ data: { slug: SMOKE_CLAN_SLUGS[index]!, name } }),
    ),
  )
  const rLeague = await prisma.league.create({
    data: {
      slug: SMOKE_LEAGUE_SLUG,
      name: '스모크 리그',
      maps: { create: [{ mapId: rMapId }] },
      playerLimits: { create: [{ playerCount: 5 }] },
      clans: { create: rClans.map((clan, index) => ({ clanId: clan.id, division: index + 1 })) },
    },
    include: { clans: true },
  })
  const leagueClanByClanId = new Map(rLeague.clans.map((row) => [row.clanId, row.id]))

  // 참가자 10명 = 우리 리그 선수 10명. 신원은 **사람이 확인했다고 가정**하고 명시적으로 연결한다
  const ROSTER_JOINED = new Date('2026-01-01T00:00:00Z')
  for (const [index, participant] of SAMPLE_MATCH_DETAIL.match_detail.entries()) {
    const player = await prisma.player.create({
      data: { id: `${SMOKE_PLAYER_PREFIX}${index}`, name: participant.user_name },
    })
    await prisma.nexonIdentity.upsert({
      where: { ouid: `${SMOKE_OUID}-${index}` },
      create: {
        ouid: `${SMOKE_OUID}-${index}`,
        userName: participant.user_name,
        playerId: player.id,
        status: 'active',
        linkReason: 'offline smoke — 사람이 확인했다고 가정',
      },
      update: { playerId: player.id, status: 'active' },
    })
    await prisma.leagueRosterMembership.create({
      data: {
        leagueId: rLeague.id,
        leagueClanId: leagueClanByClanId.get(rClans[index < 5 ? 0 : 1]!.id)!,
        playerId: player.id,
        joinedAt: ROSTER_JOINED,
        source: 'manual',
        // 운영자가 확인한 소속만 완전성 판정에 쓴다
        verified: true,
      },
    })
  }

  // 상세의 닉네임을 우리 선수로 해석시킨다 (투영 경로와 같은 규칙을 쓴다)
  await runProject(ctx, {
    leagueSlug: SMOKE_LEAGUE_SLUG,
    reproject: true,
    sourceMatchIds: [SAMPLE_MATCH_DETAIL.match_id],
  })
  await prisma.match.deleteMany({ where: { league: { slug: SMOKE_LEAGUE_SLUG } } })
  await prisma.nexonMatch.updateMany({
    where: { sourceMatchId: SAMPLE_MATCH_DETAIL.match_id },
    data: { projectionStatus: 'pending', projectedMatchId: null, projectedAt: null },
  })

  const reconstructTarget = { leagueSlug: SMOKE_LEAGUE_SLUG, sourceMatchIds: [SAMPLE_MATCH_DETAIL.match_id], redo: true }

  // 8-1) 관측이 없으면 재구성하지 않는다 — 상세만 가지고 만들어내지 않는다
  const noObservation = await runReconstruct(ctx, reconstructTarget)
  check('관측 없이는 재구성하지 않는다', 0, noObservation.projected)
  check('사유는 관측 부족이다', 1, noObservation.reasons['missing_observation'] ?? 0)

  // 8-2) 관측을 채우되 한 명의 kill을 어긋나게 둔다 → 자동 투영 금지
  const stagingForReconstruct = await prisma.nexonMatch.findUnique({
    where: {
      source_sourceMatchId: { source: 'nexon', sourceMatchId: SAMPLE_MATCH_DETAIL.match_id },
    },
    select: { id: true },
  })
  const observationRows = SAMPLE_MATCH_DETAIL.match_detail.map((participant, index) => ({
    nexonMatchId: stagingForReconstruct!.id,
    ouid: `${SMOKE_OUID}-${index}`,
    userName: participant.user_name,
    matchResult: participant.match_result,
    outcome: participant.match_result === '1' ? 'win' : 'lose',
    kill: participant.kill,
    death: participant.death,
    assist: participant.assist,
  }))
  await prisma.nexonMatchObservation.createMany({
    data: observationRows.map((row, index) =>
      index === 3 ? { ...row, kill: (row.kill ?? 0) + 5 } : row,
    ),
  })

  const conflicted = await runReconstruct(ctx, reconstructTarget)
  check('상세와 관측이 어긋나면 투영하지 않는다', 0, conflicted.projected)
  check('사유는 상세 불일치다', 1, conflicted.reasons['conflict_with_detail'] ?? 0)

  // 8-3) 어긋난 값을 바로잡으면 재구성된다
  await prisma.nexonMatchObservation.update({
    where: {
      nexonMatchId_ouid: { nexonMatchId: stagingForReconstruct!.id, ouid: `${SMOKE_OUID}-3` },
    },
    data: { kill: observationRows[3]!.kill },
  })
  const reconstructed = await runReconstruct(ctx, reconstructTarget)
  check('관측이 갖춰지면 재구성된다', 1, reconstructed.projected)

  const reconstructedMatch = await prisma.match.findUnique({
    where: {
      origin_sourceMatchId: { origin: 'nexon', sourceMatchId: SAMPLE_MATCH_DETAIL.match_id },
    },
    include: { stats: true },
  })
  check('재구성 경기의 참가자 10명', 10, reconstructedMatch?.stats.length ?? 0)
  check('대전 인원은 5', 5, reconstructedMatch?.playerCount ?? 0)
  check(
    '양 팀 인원이 같다',
    5,
    reconstructedMatch?.stats.filter((stat) => stat.side === 'red').length ?? 0,
  )
  check('래더는 Phase 9 — 재구성도 값을 넣지 않는다', null, reconstructedMatch?.stats[0]?.ratingUpdate ?? null)
  check('넥슨이 안 주는 endAt은 재구성해도 null', null, reconstructedMatch?.endAt ?? null)

  const stagingAfterReconstruct = await prisma.nexonMatch.findUnique({
    where: { id: stagingForReconstruct!.id },
    select: { reconstruction: true, reconstructedAt: true, projectionStatus: true },
  })
  check('판정 근거가 남는다', true, stagingAfterReconstruct?.reconstruction !== null)
  check('판정 시각이 남는다', true, stagingAfterReconstruct?.reconstructedAt !== null)
  check('투영 상태가 갱신된다', 'projected', stagingAfterReconstruct?.projectionStatus ?? '')

  const reconstructedAgain = await runReconstruct(ctx, reconstructTarget)
  const reconstructedCount = await prisma.match.count({ where: { origin: 'nexon' } })
  check('다시 돌려도 경기가 늘지 않는다 (멱등)', 1, reconstructedCount)
  check('재판정 결과도 1건', 1, reconstructedAgain.projected)

  /* 9) 리그 우선순위 + 매치 전파 — 호출을 늘리지 않고 순서만 바꾼다 */
  for (const [index] of SAMPLE_MATCH_DETAIL.match_detail.entries()) {
    await prisma.nexonPollState.create({
      data: {
        ouid: `${SMOKE_OUID}-${index}`,
        playerId: `${SMOKE_PLAYER_PREFIX}${index}`,
        nextPollAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
      },
    })
  }
  const synced = await syncLeaguePriority()
  check('로스터 선수는 리그 우선 대상이 된다', 10, synced.leagueMarked)

  const peers = await collectPropagationPeers({
    nexonMatchId: stagingForReconstruct!.id,
    discoveredByOuid: `${SMOKE_OUID}-0`,
    at: new Date(SAMPLE_MATCH_DETAIL.date_match),
  })
  check('같은 클랜 동료 4명을 찾는다', 4, peers.rosterPeers.length)
  check('증거로 확인된 상대 클랜 5명도 찾는다', 5, peers.opponentPeers.length)
  check('발견자 자신은 대상이 아니다', false, peers.rosterPeers.includes(`${SMOKE_OUID}-0`))

  const propagationNow = new Date()
  const propagated = await applyPropagation({
    peers,
    discoveredByOuid: `${SMOKE_OUID}-0`,
    reason: 'smoke',
    now: propagationNow,
    config: DEFAULT_POLLING_CONFIG,
  })
  check('앞당긴 대상 9명', 9, propagated.pulledForward)
  const pulled = await prisma.nexonPollState.findUnique({
    where: { ouid: `${SMOKE_OUID}-1` },
    select: { nextPollAt: true, propagatedAt: true, propagationReason: true },
  })
  check('예정 시각이 당겨진다', true, (pulled?.nextPollAt.getTime() ?? 0) <= propagationNow.getTime())
  check('앞당긴 사유가 남는다', 'smoke', pulled?.propagationReason ?? '')

  const propagatedTwice = await applyPropagation({
    peers,
    discoveredByOuid: `${SMOKE_OUID}-0`,
    reason: 'smoke',
    now: new Date(),
    config: DEFAULT_POLLING_CONFIG,
  })
  check('이미 조회 예정인 대상은 더 당기지 않는다', 0, propagatedTwice.pulledForward)

  const untouchedTier = await prisma.nexonPollState.findUnique({
    where: { ouid: `${SMOKE_OUID}-1` },
    select: { tier: true, intervalMinutes: true },
  })
  check('전파는 티어를 바꾸지 않는다', 'hot', untouchedTier?.tier ?? '')

  await cleanupLeague()
  await prisma.nexonIdentity.deleteMany({ where: { ouid: { startsWith: `${SMOKE_OUID}-` } } })
  if (createdMapForReconstruct) await prisma.gameMap.deleteMany({ where: { id: rMapId } })

  await cleanup()
  const leftover = await prisma.nexonMatch.count({
    where: { sourceMatchId: { in: SMOKE_MATCH_IDS } },
  })
  check('정리 완료', 0, leftover)

  console.info(failures === 0 ? '\n전부 통과.' : `\n${failures}건 실패.`)
  if (failures > 0) process.exitCode = 1
}

main()
  .catch(async (error: unknown) => {
    console.error(error)
    await cleanup().catch(() => undefined)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
