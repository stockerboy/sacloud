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
import { runRate, runSeasonStart } from '../jobs/rate.js'
import { DEFAULT_RATING_CONSTANTS, PERSONAL_FORMULA_VERSION, seasonStartRating } from '@sacloud/rating'
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
  await prisma.clan.deleteMany({ where: { slug: { in: [...SMOKE_CLAN_SLUGS, 'smoke-charlie'] } } })
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
  const domainMatches = await prisma.match.count({ where: { origin: 'nexon', league: { slug: SMOKE_LEAGUE_SLUG } } })
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
  const domainCount = await prisma.match.count({ where: { origin: 'nexon', league: { slug: SMOKE_LEAGUE_SLUG } } })
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

  const domainAfterPoll = await prisma.match.count({ where: { origin: 'nexon', league: { slug: SMOKE_LEAGUE_SLUG } } })
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

  const stagingForReconstruct = await prisma.nexonMatch.findUnique({
    where: {
      source_sourceMatchId: { source: 'nexon', sourceMatchId: SAMPLE_MATCH_DETAIL.match_id },
    },
    select: { id: true },
  })

  // 8-1) 상세에 본인 기록이 있으면 그것도 **자기 기록**이라 근거가 된다 (D-068).
  //      로스터에만 있고 어디에도 기록이 없는 사람은 여전히 만들어내지 않는다.
  const detailOnly = await runReconstruct(ctx, reconstructTarget)
  check('상세 근거만으로도 인정된다', 1, detailOnly.projected)
  const detailOnlyStaging = await prisma.nexonMatch.findUnique({
    where: { id: stagingForReconstruct!.id },
    select: { participantCompleteness: true, observationParticipantCount: true },
  })
  check('상세만 있으면 목록 관측 수는 0이다', 0, detailOnlyStaging?.observationParticipantCount ?? -1)
  check('확인 수준은 5v5다', '5v5', detailOnlyStaging?.participantCompleteness ?? '')

  // 다음 단계를 깨끗한 상태에서 보기 위해 되돌린다
  await prisma.match.deleteMany({ where: { league: { slug: SMOKE_LEAGUE_SLUG } } })
  await prisma.nexonMatch.updateMany({
    where: { id: stagingForReconstruct!.id },
    data: { projectionStatus: 'pending', projectedMatchId: null, projectedAt: null },
  })

  // 8-2) 관측을 채우되 한 명의 kill을 어긋나게 둔다 → 자동 투영 금지
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
  const reconstructedCount = await prisma.match.count({ where: { origin: 'nexon', league: { slug: SMOKE_LEAGUE_SLUG } } })
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

  /* 10) 확인 수준 — 3명만 확인돼도 경기는 인정된다 (Phase 9 · D-057) */
  const dropped = [`${SMOKE_OUID}-3`, `${SMOKE_OUID}-4`]
  await prisma.nexonMatchObservation.deleteMany({
    where: { nexonMatchId: stagingForReconstruct!.id, ouid: { in: dropped } },
  })
  // 상세에도 그 두 명이 남아 있으면 상세 근거로 다시 확인된다 → 상세 연결도 끊는다
  await prisma.nexonMatchParticipant.updateMany({
    where: {
      nexonMatchId: stagingForReconstruct!.id,
      resolvedPlayerId: { in: [`${SMOKE_PLAYER_PREFIX}3`, `${SMOKE_PLAYER_PREFIX}4`] },
    },
    data: { resolvedPlayerId: null, resolutionStatus: 'unresolved' },
  })
  await prisma.match.deleteMany({ where: { league: { slug: SMOKE_LEAGUE_SLUG } } })

  const partial = await runReconstruct(ctx, reconstructTarget)
  check('3명만 확인돼도 경기는 인정된다 (양측 3명 이상)', 1, partial.projected)

  const partialStaging = await prisma.nexonMatch.findUnique({
    where: { id: stagingForReconstruct!.id },
    select: {
      participantCompleteness: true,
      reconstructionConfidence: true,
      winnerMembersConfirmed: true,
      loserMembersConfirmed: true,
    },
  })
  check('확인 수준이 기록된다', '5v3', partialStaging?.participantCompleteness ?? '')
  check('확신 등급이 기록된다', 'low', partialStaging?.reconstructionConfidence ?? '')

  const partialMatch = await prisma.match.findUnique({
    where: {
      origin_sourceMatchId: { origin: 'nexon', sourceMatchId: SAMPLE_MATCH_DETAIL.match_id },
    },
    include: { stats: true },
  })
  check('확인된 8명만 참가 기록이 생긴다 (없는 참가자를 만들지 않는다)', 8, partialMatch?.stats.length ?? 0)
  check('대전 인원은 리그 기준(5)을 쓴다', 5, partialMatch?.playerCount ?? 0)
  check('확인 수준이 운영 매치까지 간다', '5v3', partialMatch?.participantCompleteness ?? '')

  /* 10-2) 용병 — 본클랜원이 아니어도 개인 기록을 받는다 (D-073 · D-075) */
  const MERCENARY_CLAN = 'smoke-charlie'
  const mercenaryClan = await prisma.clan.create({
    data: { slug: MERCENARY_CLAN, name: '찰리클랜' },
  })
  const mercenaryLeagueClan = await prisma.leagueClan.create({
    data: { leagueId: rLeague.id, clanId: mercenaryClan.id, division: 3, rating: 1234 },
  })
  // 진 팀의 마지막 선수를 **다른 클랜 소속**으로 바꾼다 → 이 경기에서는 용병이다.
  // 이긴 팀은 이미 3명만 확인된 상태라(10번 항목) 건드리면 본클랜원 조건이 깨진다
  await prisma.leagueRosterMembership.updateMany({
    where: { playerId: `${SMOKE_PLAYER_PREFIX}9`, leagueId: rLeague.id },
    data: { leagueClanId: mercenaryLeagueClan.id },
  })
  await prisma.match.deleteMany({ where: { league: { slug: SMOKE_LEAGUE_SLUG } } })

  const withMercenary = await runReconstruct(ctx, reconstructTarget)
  check('용병이 섞여도 본클랜원 3명이면 공식전이다', 1, withMercenary.projected)

  const mercenaryStaging = await prisma.nexonMatch.findUnique({
    where: { id: stagingForReconstruct!.id },
    select: {
      participantCompleteness: true,
      winnerMembersConfirmed: true,
      loserMembersConfirmed: true,
      loserMercenariesConfirmed: true,
    },
  })
  check('이긴 팀 본클랜원 확인 인원', 3, mercenaryStaging?.winnerMembersConfirmed ?? -1)
  check('진 팀 본클랜원 확인 인원', 4, mercenaryStaging?.loserMembersConfirmed ?? -1)
  check('용병 확인 인원도 따로 남는다', 1, mercenaryStaging?.loserMercenariesConfirmed ?? -1)
  check('확인 수준은 출전자 전원 기준이다', '5v3', mercenaryStaging?.participantCompleteness ?? '')

  const mercenaryStat = await prisma.matchPlayerStat.findFirst({
    where: {
      playerId: `${SMOKE_PLAYER_PREFIX}9`,
      match: { origin: 'nexon', league: { slug: SMOKE_LEAGUE_SLUG } },
    },
    select: { participantRole: true, rosterLeagueClanId: true, side: true },
  })
  check('용병도 개인 기록을 받는다', true, mercenaryStat !== null)
  check('역할이 기록된다', 'mercenary', mercenaryStat?.participantRole ?? '')
  check('원소속이 따로 기록된다', mercenaryLeagueClan.id, mercenaryStat?.rosterLeagueClanId ?? '')

  /* 10-3) 참고 기록 — 양 팀 모두 본클랜원 3명 미만이면 저장은 하되 공식 통계 미반영 (D-080) */
  const referenceDropped = [`${SMOKE_OUID}-0`, `${SMOKE_OUID}-5`, `${SMOKE_OUID}-6`]
  const referenceBackup = await prisma.nexonMatchObservation.findMany({
    where: { nexonMatchId: stagingForReconstruct!.id, ouid: { in: referenceDropped } },
  })
  await prisma.nexonMatchObservation.deleteMany({
    where: { nexonMatchId: stagingForReconstruct!.id, ouid: { in: referenceDropped } },
  })
  await prisma.nexonMatchParticipant.updateMany({
    where: {
      nexonMatchId: stagingForReconstruct!.id,
      resolvedPlayerId: {
        in: [`${SMOKE_PLAYER_PREFIX}0`, `${SMOKE_PLAYER_PREFIX}5`, `${SMOKE_PLAYER_PREFIX}6`],
      },
    },
    data: { resolvedPlayerId: null, resolutionStatus: 'unresolved' },
  })
  await prisma.match.deleteMany({ where: { league: { slug: SMOKE_LEAGUE_SLUG } } })

  const referenceRun = await runReconstruct(ctx, reconstructTarget)
  check('참고 기록도 경기는 저장한다 (지우지 않는다)', 1, referenceRun.projected)
  const referenceMatch = await prisma.match.findUnique({
    where: {
      origin_sourceMatchId: { origin: 'nexon', sourceMatchId: SAMPLE_MATCH_DETAIL.match_id },
    },
    include: { stats: true },
  })
  check('공식 통계 대상이 아니다', false, referenceMatch?.official ?? true)
  check('참가자 기록은 그대로 남는다', true, (referenceMatch?.stats.length ?? 0) > 0)

  const referenceRate = await runRate(ctx, { leagueSlug: SMOKE_LEAGUE_SLUG })
  check('참고 기록은 래더 계산 대상이 아니다', 0, referenceRate.matchesRated)

  // 되돌린다
  await prisma.nexonMatchObservation.createMany({
    data: referenceBackup.map((row) => ({
      nexonMatchId: row.nexonMatchId,
      ouid: row.ouid,
      userName: row.userName,
      matchResult: row.matchResult,
      outcome: row.outcome,
      kill: row.kill,
      death: row.death,
      assist: row.assist,
    })),
  })
  await prisma.match.deleteMany({ where: { league: { slug: SMOKE_LEAGUE_SLUG } } })
  await runReconstruct(ctx, reconstructTarget)

  /* 11) 래더 반영 — 결정적 replay */
  const rated = await runRate(ctx, { leagueSlug: SMOKE_LEAGUE_SLUG })
  check('래더를 계산한 경기 수', 1, rated.matchesRated)
  check('선수 래더가 갱신된다', 8, rated.playersUpdated)
  check('클랜 래더가 갱신된다', 2, rated.clansUpdated)

  const mercenaryHomeClan = await prisma.leagueClan.findUnique({
    where: { id: mercenaryLeagueClan.id },
    select: { rating: true },
  })
  check('용병의 원소속 클랜 래더는 변하지 않는다', 1234, mercenaryHomeClan?.rating ?? -1)

  const ratedStats = await prisma.matchPlayerStat.findMany({
    where: { match: { origin: 'nexon', league: { slug: SMOKE_LEAGUE_SLUG } } },
    select: { playerId: true, ratingBefore: true, ratingUpdate: true, ratingAfter: true, formulaVersion: true },
    orderBy: { playerId: 'asc' },
  })
  check('배치고사 구간이라 증감은 0이다', 0, ratedStats[0]?.ratingUpdate ?? -1)
  check('formulaVersion이 남는다', PERSONAL_FORMULA_VERSION, ratedStats[0]?.formulaVersion ?? '')

  const firstRun = JSON.stringify(ratedStats)
  await runRate(ctx, { leagueSlug: SMOKE_LEAGUE_SLUG })
  const secondRun = JSON.stringify(
    await prisma.matchPlayerStat.findMany({
      where: { match: { origin: 'nexon', league: { slug: SMOKE_LEAGUE_SLUG } } },
      select: { playerId: true, ratingBefore: true, ratingUpdate: true, ratingAfter: true, formulaVersion: true },
      orderBy: { playerId: 'asc' },
    }),
  )
  check('다시 계산해도 같은 값이 나온다 (결정적 replay)', firstRun, secondRun)

  // 배치고사를 끄고 다시 계산하면 실제 증감이 나온다 (제로섬 확인)
  const noPlacement = { ...DEFAULT_RATING_CONSTANTS, placementMatches: 0 }
  await runRate(ctx, { leagueSlug: SMOKE_LEAGUE_SLUG, constants: noPlacement })
  const livesStats = await prisma.matchPlayerStat.findMany({
    where: { match: { origin: 'nexon', league: { slug: SMOKE_LEAGUE_SLUG } } },
    select: { side: true, ratingUpdate: true },
  })
  const winnerSum = livesStats
    .filter((stat) => stat.side === 'red')
    .reduce((sum, stat) => sum + (stat.ratingUpdate ?? 0), 0)
  const loserSum = livesStats
    .filter((stat) => stat.side === 'blue')
    .reduce((sum, stat) => sum + (stat.ratingUpdate ?? 0), 0)
  check('배치고사를 끄면 실제 증감이 나온다', true, winnerSum !== 0)
  check('이긴 쪽은 오르고 진 쪽은 내린다', true, winnerSum > 0 && loserSum < 0)

  const ratedMatch = await prisma.match.findFirst({
    where: { origin: 'nexon', league: { slug: SMOKE_LEAGUE_SLUG } },
    select: { redRatingUpdate: true, blueRatingUpdate: true, redRatingBefore: true },
  })
  check('클랜 증감도 경기에 남는다', true, (ratedMatch?.redRatingUpdate ?? 0) !== 0)
  check(
    '동급 클랜 경기는 제로섬이다',
    0,
    (ratedMatch?.redRatingUpdate ?? 0) + (ratedMatch?.blueRatingUpdate ?? 0),
  )

  const ratingConfig = await prisma.ratingConfig.findFirst({
    where: { league: { slug: SMOKE_LEAGUE_SLUG } },
    select: { expectedScoreDivisor: true, formulaVersion: true },
  })
  check('쓴 상수를 DB에 남긴다', DEFAULT_RATING_CONSTANTS.expectedScoreDivisor, ratingConfig?.expectedScoreDivisor ?? -1)

  /* 12) 새 시즌 시작 — 모두 같은 출발점 (D-064) */
  await prisma.leagueClan.updateMany({
    where: { league: { slug: SMOKE_LEAGUE_SLUG } },
    data: { rating: 2500 },
  })
  await prisma.leagueClan.updateMany({
    where: { league: { slug: SMOKE_LEAGUE_SLUG }, division: 2 },
    data: { rating: 900 },
  })
  await runSeasonStart(ctx, { leagueSlug: SMOKE_LEAGUE_SLUG })
  const afterStart = await prisma.leagueClan.findMany({
    where: { league: { slug: SMOKE_LEAGUE_SLUG } },
    select: { rating: true },
  })
  check(
    '새 시즌은 전원 같은 점수에서 시작한다',
    [seasonStartRating()],
    [...new Set(afterStart.map((clan) => clan.rating))],
  )
  const historyKept = await prisma.matchPlayerStat.count({
    where: { match: { origin: 'nexon', league: { slug: SMOKE_LEAGUE_SLUG } } },
  })
  check('지난 시즌 경기 기록은 남는다', true, historyKept > 0)

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
