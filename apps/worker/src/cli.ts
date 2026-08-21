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
import { hasApiKey, NexonClient, readNexonConfig } from '@sacloud/nexon'
import { loadEnvFiles } from './lib/env.js'
import { fail, log, registerSecret, table } from './lib/log.js'
import { AbortCollection, type JobContext } from './jobs/context.js'
import { runIdentities } from './jobs/identities.js'
import { runCollect } from './jobs/collect.js'
import { runProject } from './jobs/project.js'
import { runRefresh } from './jobs/refresh.js'
import { runCheck } from './jobs/check.js'

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
  collect     --ouid <OUID>[,<OUID>] | --all-identities  [--type "퀵매치 클랜전"] [--match-id <ID>]
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

  const needsNetwork = ['identities', 'collect', 'refresh'].includes(args.command) && !dryRun
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
      const result = await runCollect(ctx, { ouids, detailMatchType, detailSourceMatchIds })
      table([result as unknown as Record<string, unknown>])
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
