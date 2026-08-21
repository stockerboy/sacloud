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
import type { JobContext } from '../jobs/context.js'

const SMOKE_VERSION = 'smoke-offline'
const SMOKE_OUID = 'SMOKE-OUID-0001'
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
  await prisma.nexonIdentityCandidate.deleteMany({ where: { ouid: SMOKE_OUID } })
  await prisma.nexonIdentity.deleteMany({ where: { ouid: SMOKE_OUID } })
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
  await prisma.nexonIdentity.deleteMany({ where: { ouid: { startsWith: SMOKE_OUID } } })

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
