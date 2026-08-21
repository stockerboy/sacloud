/**
 * 넥슨 수집 워커 CLI.
 *
 *   pnpm nexon:identities --nicknames "닉1,닉2" [--dry-run] [--resume] [--limit N]
 *   pnpm nexon:collect    --ouid <OUID>[,<OUID>] | --all-identities [--dry-run] [--limit N]
 *   pnpm nexon:project    [--league <slug>] [--reproject] [--allow-mock-league] [--limit N]
 *   pnpm nexon:refresh    [--limit N] [--dry-run]
 *   pnpm nexon:check
 *   pnpm nexon:status
 *
 * 큐 인프라(Redis/BullMQ)를 쓰지 않는다. 체크포인트는 DB(`ImportJob`)에 남는다 (C 결정).
 * `--dry-run`은 **요청을 한 건도 보내지 않는다.** API 키 없이 파이프라인을 점검할 때 쓴다.
 */
import { readFileSync } from 'node:fs'
import { prisma } from '@sacloud/db'
import { hasApiKey, MATCH_MODES, NexonClient, readNexonConfig, type MatchMode } from '@sacloud/nexon'
import { loadEnvFiles } from './lib/env.js'
import { fail, log, registerSecret, table } from './lib/log.js'
import { AbortCollection, type JobContext } from './jobs/context.js'
import { runIdentities } from './jobs/identities.js'
import { runCollect } from './jobs/collect.js'
import { runProject } from './jobs/project.js'
import { runRefresh } from './jobs/refresh.js'
import { runCheck } from './jobs/check.js'
import { ensurePollStates, requestManualRefresh, runPoll } from './jobs/poll.js'
import { readPollingConfig } from './lib/pollingPolicy.js'

interface Args {
  command: string
  flags: Map<string, string | boolean>
}

function parseArgs(argv: readonly string[]): Args {
  const [command = 'help', ...rest] = argv
  const flags = new Map<string, string | boolean>()
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index]
    if (!token || !token.startsWith('--')) continue
    const key = token.slice(2)
    const next = rest[index + 1]
    if (next && !next.startsWith('--')) {
      flags.set(key, next)
      index += 1
    } else {
      flags.set(key, true)
    }
  }
  return { command, flags }
}

function stringFlag(args: Args, name: string): string | null {
  const value = args.flags.get(name)
  return typeof value === 'string' ? value : null
}

function boolFlag(args: Args, name: string): boolean {
  return args.flags.get(name) === true || args.flags.get(name) === 'true'
}

function numberFlag(args: Args, name: string): number | null {
  const value = stringFlag(args, name)
  if (value === null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null
}

/** 닉네임 목록 — `--nicknames "a,b"` 또는 `--nicknames-file <파일>` (한 줄에 하나 / 첫 열) */
function readNicknames(args: Args): string[] {
  const inline = stringFlag(args, 'nicknames')
  if (inline) {
    return inline
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  }

  const file = stringFlag(args, 'nicknames-file')
  if (!file) return []

  return readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.split(',')[0]?.trim().replace(/^"|"$/g, '') ?? '')
    .filter((value) => value.length > 0 && value.toLowerCase() !== 'nickname')
}

function usage(): void {
  log(`넥슨 수집 워커

  identities  --nicknames "닉1,닉2" | --nicknames-file <파일>
  poll        [--targets N] [--detail-limit N] [--type "퀵매치 클랜전"] [--modes "폭파미션"]
  manual-refresh --ouid <OUID> | --player <playerId>
  report      [--limit N]
  collect     --ouid <OUID>[,<OUID>] | --all-identities  [--type "퀵매치 클랜전"] [--match-id <ID>] [--modes "폭파미션"]
  project     [--league <slug>] [--reproject] [--allow-mock-league]
  refresh
  check
  status

공통 플래그: --dry-run  --resume  --limit N
`)
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2))
  loadEnvFiles()

  const config = readNexonConfig()
  registerSecret(config.apiKey)

  const dryRun = boolFlag(args, 'dry-run')
  const ctx: JobContext = {
    config,
    client: null,
    dryRun,
    limit: numberFlag(args, 'limit'),
    resume: boolFlag(args, 'resume'),
  }

  const needsNetwork = ['identities', 'collect', 'refresh', 'poll'].includes(args.command) && !dryRun
  if (needsNetwork) {
    if (!hasApiKey(config)) {
      fail('NEXON_API_KEY가 없다. apps/web/.env.local 에 키를 넣고 다시 실행한다.')
      fail('키 없이 파이프라인만 점검하려면 --dry-run 을 쓴다.')
      return 1
    }
    ctx.client = new NexonClient({ config })
    log(
      `수집 준비 완료 — 속도 ${config.requestsPerSecond}/s · 재시도 ${config.maxRetries} · ` +
        `신선도 ${config.refreshIntervalDays}일 · 버전 ${config.migrationVersion}`,
    )
  }

  switch (args.command) {
    case 'identities': {
      const nicknames = readNicknames(args)
      if (nicknames.length === 0) {
        fail('닉네임이 없다. --nicknames "닉1,닉2" 또는 --nicknames-file <파일>')
        return 1
      }
      const result = await runIdentities(ctx, nicknames)
      // 새 신원은 곧바로 폴링 대상이 된다
      const created = await ensurePollStates()
      if (created > 0) log(`폴링 대상 ${created}명 추가`)
      table([result as unknown as Record<string, unknown>])
      return 0
    }

    case 'collect': {
      let ouids = (stringFlag(args, 'ouid') ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)

      if (ouids.length === 0 && boolFlag(args, 'all-identities')) {
        const identities = await prisma.nexonIdentity.findMany({
          where: { status: { not: 'superseded' } },
          select: { ouid: true },
          take: ctx.limit ?? undefined,
        })
        ouids = identities.map((identity) => identity.ouid)
      }

      if (ouids.length === 0) {
        fail('대상이 없다. --ouid <OUID> 또는 --all-identities')
        return 1
      }

      const detailMatchType = stringFlag(args, 'type')
      log(
        `수집 대상 ouid ${ouids.length}건` +
          (detailMatchType ? ` · 상세는 "${detailMatchType}"만` : ''),
      )
      const detailSourceMatchIds = (stringFlag(args, 'match-id') ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
      const modes = (stringFlag(args, 'modes') ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter((value): value is MatchMode => MATCH_MODES.includes(value as MatchMode))
      const result = await runCollect(ctx, {
        ouids,
        detailMatchType,
        detailSourceMatchIds,
        modes,
        skipDetails: boolFlag(args, 'no-detail'),
      })
      table([result as unknown as Record<string, unknown>])
      return 0
    }

    case 'poll': {
      const modes = (stringFlag(args, 'modes') ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter((value): value is MatchMode => MATCH_MODES.includes(value as MatchMode))

      const metrics = await runPoll(ctx, {
        targets: numberFlag(args, 'targets') ?? 10,
        detailLimit: numberFlag(args, 'detail-limit') ?? 0,
        detailMatchType: stringFlag(args, 'type'),
        modes,
      })
      table([metrics as unknown as Record<string, unknown>])
      return 0
    }

    case 'manual-refresh': {
      const count = await requestManualRefresh({
        ouid: stringFlag(args, 'ouid'),
        playerId: stringFlag(args, 'player'),
      })
      log(`수동 갱신 요청 표시: ${count}건 (다음 poll에서 최우선)`)
      return count > 0 ? 0 : 1
    }

    case 'report': {
      const config = readPollingConfig()
      log(
        `폴링 주기(분) — hot ${config.intervalMinutes.hot} · warm ${config.intervalMinutes.warm} · ` +
          `cold ${config.intervalMinutes.cold} · dormant ${config.intervalMinutes.dormant}`,
      )

      const tiers = await prisma.nexonPollState.groupBy({
        by: ['tier'],
        _count: { _all: true },
      })
      log('')
      log('티어 분포')
      table(tiers.map((row) => ({ tier: row.tier, 대상: row._count._all })))

      const runs = await prisma.nexonPollRun.findMany({
        orderBy: { startedAt: 'desc' },
        take: numberFlag(args, 'limit') ?? 5,
      })
      log('')
      log('최근 실행 (호출량 계측)')
      table(
        runs.map((run) => ({
          시작: run.startedAt.toISOString().slice(0, 19),
          대상: run.playersPolled,
          목록호출: run.matchListRequests,
          신규경기: run.uniqueNewMatchIds,
          중복경기: run.duplicateMatchIds,
          상세호출: run.matchDetailRequests,
          상세건너뜀: run.detailSkippedByDedupe,
          빈조회: run.emptyPolls,
          '429': run.rateLimitedCount,
          실패: run.failedPolls,
        })),
      )

      const totals = runs.reduce(
        (acc, run) => ({
          active: acc.active + run.activePlayersPolled,
          inactive: acc.inactive + run.inactivePlayersPolled,
          activeRequests: acc.activeRequests + run.requestsForActive,
          inactiveRequests: acc.inactiveRequests + run.requestsForInactive,
        }),
        { active: 0, inactive: 0, activeRequests: 0, inactiveRequests: 0 },
      )
      log('')
      log('평균 호출 수')
      table([
        {
          '활동 대상당': totals.active > 0 ? (totals.activeRequests / totals.active).toFixed(2) : '-',
          '비활동 대상당':
            totals.inactive > 0 ? (totals.inactiveRequests / totals.inactive).toFixed(2) : '-',
        },
      ])
      return 0
    }

    case 'project': {
      const result = await runProject(ctx, {
        leagueSlug: stringFlag(args, 'league'),
        allowMockLeague: boolFlag(args, 'allow-mock-league'),
        reproject: boolFlag(args, 'reproject'),
      })
      table([
        {
          considered: result.considered,
          projected: result.projected,
          skipped: result.skipped,
        },
      ])
      for (const [code, count] of Object.entries(result.reasons)) {
        log(`  보류 사유 ${code}: ${count}건`)
      }
      return 0
    }

    case 'refresh': {
      const result = await runRefresh(ctx)
      table([result as unknown as Record<string, unknown>])
      return 0
    }

    case 'check': {
      const { allPassed } = await runCheck({ migrationVersion: config.migrationVersion })
      return allPassed ? 0 : 1
    }

    case 'status': {
      const [identities, candidates, staging, projected, domain, failures] = await Promise.all([
        prisma.nexonIdentity.count(),
        prisma.nexonIdentityCandidate.count({ where: { status: 'open' } }),
        prisma.nexonMatch.count(),
        prisma.nexonMatch.count({ where: { projectionStatus: 'projected' } }),
        prisma.match.count({ where: { origin: 'nexon' } }),
        prisma.importFailure.count({ where: { source: 'nexon', resolvedAt: null } }),
      ])
      table([
        {
          신원: identities,
          '연결후보(미결)': candidates,
          '스테이징 매치': staging,
          투영됨: projected,
          '운영 매치(nexon)': domain,
          '미해결 실패': failures,
        },
      ])
      const [pollStates, duePolls, manualPending, lastRun] = await Promise.all([
        prisma.nexonPollState.count(),
        prisma.nexonPollState.count({ where: { nextPollAt: { lte: new Date() } } }),
        prisma.nexonPollState.count({ where: { manualRefreshRequestedAt: { not: null } } }),
        prisma.nexonPollRun.findFirst({ orderBy: { startedAt: 'desc' } }),
      ])
      table([
        {
          '폴링 대상': pollStates,
          '조회 예정(지금)': duePolls,
          '수동 갱신 대기': manualPending,
          '목록 관측값': await prisma.nexonMatchObservation.count(),
        },
      ])
      if (lastRun) {
        log(
          `마지막 실행 ${lastRun.startedAt.toISOString().slice(0, 19)} — ` +
            `대상 ${lastRun.playersPolled} · 목록 ${lastRun.matchListRequests}회 · ` +
            `상세 ${lastRun.matchDetailRequests}회 · 신규 ${lastRun.uniqueNewMatchIds}건 · 429 ${lastRun.rateLimitedCount}`,
        )
      }
      log(`API 키: ${hasApiKey(config) ? '설정됨' : '없음'}`)
      return 0
    }

    default:
      usage()
      return args.command === 'help' ? 0 : 1
  }
}

main()
  .then(async (code) => {
    await prisma.$disconnect()
    process.exit(code)
  })
  .catch(async (error: unknown) => {
    if (error instanceof AbortCollection) {
      fail(error.message)
    } else {
      fail(error instanceof Error ? error.message : String(error))
    }
    await prisma.$disconnect()
    process.exit(1)
  })
