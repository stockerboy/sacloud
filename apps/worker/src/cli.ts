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
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { prisma } from '@sacloud/db'
import {
  freezeSeason,
  fromCsv,
  fromJsonRows,
  fromSupplyHtml,
  fromSupplyState,
  importLegacySeasons,
  mergeRows,
  type LegacySeasonRow,
} from '@sacloud/db/ops'
import { hasApiKey, MATCH_MODES, NexonClient, readNexonConfig, type MatchMode } from '@sacloud/nexon'
import { loadEnvFiles } from './lib/env.js'
import { fail, log, registerSecret, table, warn } from './lib/log.js'
import { AbortCollection, type JobContext } from './jobs/context.js'
import { runIdentities } from './jobs/identities.js'
import { runCollect } from './jobs/collect.js'
import { runProject } from './jobs/project.js'
import { runRefresh } from './jobs/refresh.js'
import { runCheck } from './jobs/check.js'
import { ensurePollStates, requestManualRefresh, runPoll } from './jobs/poll.js'
import { backfillObservations, runReconstruct } from './jobs/reconstruct.js'
import { bootstrapBeta, BETA_DATA_START } from './jobs/betaBootstrap.js'
import { linkIdentitiesByEvidence, registerObservedMaps } from './jobs/identityLink.js'
import { buildRosterFromMatchEvidence, syncRosterFromBarracks } from './jobs/rosterSync.js'
import { applyWeaponToStats, importWeaponEvidence, rebuildWeaponBuckets } from './jobs/weapon.js'
import { runRate } from './jobs/rate.js'
import { runSeasonClose, runSeasonOpen, seasonStatus } from './jobs/season.js'
import { clanList, joinLeague, mergeClans, registerClan, renameClan } from './jobs/clan.js'
import {
  deriveRosterFromLeaguePlayers,
  importRoster,
  rosterStatus,
  syncLeaguePriority,
} from './jobs/roster.js'
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

  roster      --league <slug> --file <CSV> [--verified] | --from-league-players | --sync-priority
              (플래그 없으면 등록 현황만 보여 준다)
  backfill-observations [--ouid <OUID>[,<OUID>]]
              보관된 목록 원본 → 관측값. **넥슨에 요청하지 않는다**
  reconstruct [--league <slug>] [--redo] [--match-id <ID>[,<ID>]] [--allow-unverified-roster]
              [--allow-mock-league]
  rate        --league <slug> [--season N] [--allow-mock-league] [--dry-run]
              재구성된 경기로 래더를 **처음부터 다시** 계산한다 (결정적 replay)
  season      --league <slug> [--close | --start] [--at <ISO>] [--number N] [--no-promotion]
              시즌 운영. 플래그가 없으면 현재 상태만 보여 준다.
              --close 최종 랭킹 스냅샷 + 시즌 종료 / --start 승강 반영 + 전원 같은 점수로 시작
              **자동으로 도는 것이 없다. 운영자가 부를 때만 실행된다**
  clan        [--league <slug>] | --register --slug <s> --name <n> | --rename --slug <s> --name <n>
              | --join --league <slug> --slug <s> --division N | --merge --from <s> --into <s>
              클랜 등록·이름 변경·리그 참여·병합 (병합은 slug 두 개를 정확히 지정할 때만)
  legacy      --league <slug> --file <파일> | --dir <폴더> [--current-season N] [--confirm]
              --league <slug> --freeze N
              과거 시즌 이관. 입력은 HTML(supplyPc-state) · JSON · CSV.
              **--confirm 없이는 한 줄도 쓰지 않는다** (기본은 미리보기).
              --freeze N 은 그 시즌을 확정해 이후 수정을 막는다

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

    /* ------------------------------------------------------------ Phase 8.2 --- */

    case 'roster': {
      const leagueSlug = stringFlag(args, 'league')
      const file = stringFlag(args, 'file')

      if (file) {
        if (!leagueSlug) {
          fail('--league <slug> 가 필요하다')
          return 1
        }
        const result = await importRoster({
          leagueSlug,
          file,
          verified: boolFlag(args, 'verified'),
          dryRun,
        })
        table([
          {
            줄: result.rows,
            신규: result.created,
            갱신: result.updated,
            거부: result.rejected.length,
          },
        ])
        for (const rejected of result.rejected) {
          fail(`  ${rejected.line}행: ${rejected.reason}`)
        }
        if (!dryRun) {
          const synced = await syncLeaguePriority()
          log(`폴링 우선순위 갱신 — league ${synced.leagueMarked}명 · general 복귀 ${synced.generalReset}명`)
        }
        return result.rejected.length > 0 ? 1 : 0
      }

      if (boolFlag(args, 'from-league-players')) {
        if (!leagueSlug) {
          fail('--league <slug> 가 필요하다')
          return 1
        }
        const result = await deriveRosterFromLeaguePlayers({ leagueSlug, dryRun })
        table([{ 후보: result.candidates, 생성: result.created, 건너뜀: result.skipped }])
        log('파생된 소속은 전부 unverified다. 운영자가 확인해야 재구성에 쓰인다')
        if (!dryRun) await syncLeaguePriority()
        return 0
      }

      if (boolFlag(args, 'sync-priority')) {
        const synced = await syncLeaguePriority()
        table([{ 'league로 표시': synced.leagueMarked, 'general로 복귀': synced.generalReset }])
        return 0
      }

      table(await rosterStatus(leagueSlug))
      return 0
    }

    case 'backfill-observations': {
      const ouids = (stringFlag(args, 'ouid') ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
      const result = await backfillObservations({ ouids })
      table([result as unknown as Record<string, unknown>])
      log(
        '넥슨에 요청하지 않았다. 보관된 원본만 다시 읽었다' +
          (ouids.length > 0 ? ` (대상 ${ouids.length}명)` : ' (전체)'),
      )
      return 0
    }

    case 'reconstruct': {
      const sourceMatchIds = (stringFlag(args, 'match-id') ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)

      const result = await runReconstruct(ctx, {
        leagueSlug: stringFlag(args, 'league'),
        allowMockLeague: boolFlag(args, 'allow-mock-league'),
        // 기본은 **운영자가 확인한 로스터만** 인정한다
        requireVerifiedRoster: !boolFlag(args, 'allow-unverified-roster'),
        redo: boolFlag(args, 'redo'),
        sourceMatchIds,
      })
      table([
        { considered: result.considered, projected: result.projected, incomplete: result.incomplete },
      ])
      for (const [code, count] of Object.entries(result.reasons)) {
        log(`  미완 사유 ${code}: ${count}건`)
      }
      if (result.samples.length > 0) {
        log('')
        log('경기별 관측 현황 (상위 20건)')
        table(
          result.samples.slice(0, 20).map((sample) => ({
            매치: sample.sourceMatchId,
            관측: sample.observations,
            확정: sample.confirmed,
            상세참가자: sample.detailParticipants,
            판정: sample.code ?? 'projected',
          })),
        )
      }
      return 0
    }

    case 'rate': {
      const leagueSlug = stringFlag(args, 'league')
      if (!leagueSlug) {
        fail('--league <slug> 가 필요하다')
        return 1
      }
      const result = await runRate(ctx, {
        leagueSlug,
        seasonNumber: numberFlag(args, 'season'),
        allowMockLeague: boolFlag(args, 'allow-mock-league'),
      })
      table([
        {
          리그: result.league,
          시즌: result.season ?? '-',
          대상경기: result.matchesConsidered,
          계산됨: result.matchesRated,
          선수: result.playersUpdated,
          클랜: result.clansUpdated,
          공식: result.formulaVersion,
        },
      ])
      for (const [code, count] of Object.entries(result.skipped)) {
        log(`  제외 ${code}: ${count}건`)
      }
      return 0
    }

    case 'season': {
      const leagueSlug = stringFlag(args, 'league')
      if (!leagueSlug) {
        fail('--league <slug> 가 필요하다')
        return 1
      }
      const at = stringFlag(args, 'at')
      const when = at ? new Date(at) : undefined
      if (at && Number.isNaN(when?.getTime())) {
        fail(`--at 날짜를 해석할 수 없다: ${at}`)
        return 1
      }

      if (boolFlag(args, 'close')) {
        const result = await runSeasonClose(ctx, { leagueSlug, endedAt: when })
        table([
          {
            시즌: result.season ?? '-',
            '클랜 스냅샷': result.clanRows,
            '선수 스냅샷': result.playerRows,
            종료시각: result.endedAt ?? '-',
          },
        ])
        return result.season === null ? 1 : 0
      }

      if (boolFlag(args, 'start')) {
        const result = await runSeasonOpen(ctx, {
          leagueSlug,
          startedAt: when,
          number: numberFlag(args, 'number') ?? undefined,
          skipPromotion: boolFlag(args, 'no-promotion'),
        })
        table([
          {
            시즌: result.nextNumber,
            시작시각: result.startedAt ?? '(dry-run)',
            승격: result.promoted?.clan ?? '-',
            강등: result.relegated?.clan ?? '-',
            선수: result.players,
            클랜: result.clans,
            시작점수: result.baseline,
          },
        ])
        return result.ok ? 0 : 1
      }

      const status = await seasonStatus(leagueSlug)
      if (!status) {
        fail(`리그를 찾을 수 없다: ${leagueSlug}`)
        return 1
      }
      table([
        {
          리그: status.leagueSlug,
          '활성 시즌': status.activeSeason?.number ?? '없음',
          시작: status.activeSeason?.startedAt ?? '-',
          '시즌 경기': status.matchesInSeason,
          공식: status.officialMatches,
          '비공식 경기': status.referenceMatches,
        },
      ])
      table(
        status.seasons.map((season) => ({
          시즌: season.number,
          상태: season.status === 'active' ? '진행 중' : '종료',
          시작: season.startedAt.slice(0, 10),
          종료: season.endedAt?.slice(0, 10) ?? '-',
          '클랜 스냅샷': season.hasClanSnapshot ? 'O' : '-',
          '개인 스냅샷': season.hasPlayerSnapshot ? 'O' : '-',
        })),
      )
      log('시즌 전환은 --close → --start 를 운영자가 직접 실행할 때만 일어난다 (D-077)')
      return 0
    }

    case 'clan': {
      if (boolFlag(args, 'register')) {
        const slug = stringFlag(args, 'slug')
        const name = stringFlag(args, 'name')
        if (!slug || !name) {
          fail('--slug 와 --name 이 필요하다')
          return 1
        }
        const result = await registerClan(ctx, { slug, name })
        return result.created || dryRun ? 0 : 1
      }

      if (boolFlag(args, 'rename')) {
        const slug = stringFlag(args, 'slug')
        const name = stringFlag(args, 'name')
        if (!slug || !name) {
          fail('--slug 와 --name 이 필요하다')
          return 1
        }
        return (await renameClan(ctx, { slug, name })) || dryRun ? 0 : 1
      }

      if (boolFlag(args, 'join')) {
        const joinLeagueSlug = stringFlag(args, 'league')
        const slug = stringFlag(args, 'slug')
        const division = numberFlag(args, 'division') ?? 1
        if (!joinLeagueSlug || !slug) {
          fail('--league 와 --slug 가 필요하다')
          return 1
        }
        const ok = await joinLeague(ctx, { leagueSlug: joinLeagueSlug, clanSlug: slug, division })
        return ok || dryRun ? 0 : 1
      }

      if (boolFlag(args, 'merge')) {
        const fromSlug = stringFlag(args, 'from')
        const intoSlug = stringFlag(args, 'into')
        if (!fromSlug || !intoSlug) {
          fail('--from 과 --into 에 **정확한 slug**를 지정해야 한다 (이름으로 추측하지 않는다)')
          return 1
        }
        const result = await mergeClans(ctx, { fromSlug, intoSlug })
        table([{ 옮긴선수: result.movedPlayers, 옮긴로스터: result.movedMemberships }])
        return 0
      }

      table(await clanList(stringFlag(args, 'league')))
      return 0
    }

    case 'refresh': {
      const result = await runRefresh(ctx)
      table([result as unknown as Record<string, unknown>])
      return 0
    }

    /**
     * 과거 시즌 기록 이관 (Phase 11-F).
     *
     *   pnpm nexon legacy --league supply --file ./s7.html
     *   pnpm nexon legacy --league supply --dir ./saved --current-season 7
     *   pnpm nexon legacy --league supply --dir ./saved --confirm
     *   pnpm nexon legacy --league supply --freeze 7
     *
     * **`--confirm` 없이는 한 줄도 쓰지 않는다.** 기본은 미리보기다.
     */
    case 'weapon-import': {
      const file = stringFlag(args, 'file')
      if (!file) {
        fail('--file <수집.json> 이 필요하다')
        return 1
      }
      const result = await importWeaponEvidence({ file, confirm: boolFlag(args, 'confirm') })
      table([
        {
          경기: result.matches,
          성공: result.succeeded,
          실패: result.failed,
          '원문 신규': result.rawStored,
          '원문 중복': result.rawDuplicate,
          '근거 신규': result.evidence.created,
          '근거 갱신': result.evidence.updated,
        },
      ])
      table([
        {
          라플: result.classification.rifle,
          스나: result.classification.sniper,
          unknown: result.classification.unknown,
          '사람 미확정': result.unresolved,
        },
      ])
      if (!boolFlag(args, 'confirm')) log('미리보기다. 실제로 넣으려면 --confirm')
      return 0
    }

    case 'weapon-apply': {
      const result = await applyWeaponToStats({ confirm: boolFlag(args, 'confirm') })
      table([
        {
          근거: result.evidence,
          '반영됨': result.statsUpdated,
          'unknown 제외': result.skippedUnknown,
          '경기기록 없음': result.skippedNoStat,
          충돌: result.conflicts,
        },
      ])
      if (result.conflicts > 0) warn('이미 다른 값이 있는 기록은 덮어쓰지 않았다. 사람이 확인해야 한다')
      if (!boolFlag(args, 'confirm')) log('미리보기다. 실제로 넣으려면 --confirm')
      return 0
    }

    case 'weapon-rebuild': {
      const leagueSlug = stringFlag(args, 'league')
      if (!leagueSlug) {
        fail('--league <slug> 가 필요하다')
        return 1
      }
      const result = await rebuildWeaponBuckets({ leagueSlug, confirm: boolFlag(args, 'confirm') })
      table([
        {
          선수: result.players,
          버킷: result.buckets,
          '라플 경기': result.rifleGames,
          '스나 경기': result.sniperGames,
          '무기 미상': result.unknownGames,
        },
      ])
      if (!boolFlag(args, 'confirm')) log('미리보기다. 실제로 넣으려면 --confirm')
      return 0
    }

    case 'roster-sync': {
      const leagueSlug = stringFlag(args, 'league')
      if (!leagueSlug) {
        fail('--league <slug> 가 필요하다')
        return 1
      }
      if (boolFlag(args, 'from-match-evidence')) {
        const rows = await buildRosterFromMatchEvidence({
          leagueSlug,
          from: BETA_DATA_START,
          to: new Date(),
          minAppearances: numberFlag(args, 'min-appearances') ?? 2,
          confirm: boolFlag(args, 'confirm'),
        })
        table(
          rows.map((row) => ({
            클랜: row.clanName,
            후보: row.candidates,
            생성: row.created,
            기존: row.existing,
            근거부족: row.tooWeak,
          })),
        )
        log('경기 근거 로스터는 verified=false 다. 운영자 확인 전에는 공식 판정에 쓰이지 않는다')
        if (!boolFlag(args, 'confirm')) log('미리보기다. 실제로 넣으려면 --confirm')
        return 0
      }

      const result = await syncRosterFromBarracks({
        leagueSlug,
        clanSlugFilter: stringFlag(args, 'clan'),
        confirm: boolFlag(args, 'confirm'),
      })
      table(
        result.clans.map((clan) => ({
          클랜: clan.clanName,
          slug: clan.clanSlug ?? '-',
          멤버: clan.members,
          신규: clan.membershipsCreated,
          기존: clan.membershipsExisting,
          교체: clan.membershipsRepaired,
          상태: clan.status,
        })),
      )
      for (const clan of result.clans) {
        if (clan.note) warn(`  ${clan.clanName}: ${clan.note}`)
      }
      log(`병영수첩 요청 ${result.requests}회`)
      if (!boolFlag(args, 'confirm')) log('미리보기다. 실제로 넣으려면 --confirm')
      return 0
    }

    case 'identity-link': {
      const leagueSlug = stringFlag(args, 'league')
      if (!leagueSlug) {
        fail('--league <slug> 가 필요하다')
        return 1
      }
      const result = await linkIdentitiesByEvidence({
        leagueSlug,
        minEvidence: numberFlag(args, 'min-evidence') ?? 3,
        confirm: boolFlag(args, 'confirm'),
      })
      table([{ 검토: result.considered, 연결: result.linked, 보류: result.skipped }])
      for (const candidate of result.candidates) {
        log(
          `  ${candidate.verdict.padEnd(12)} ${candidate.userName} — ${candidate.reason}` +
            ` [${candidate.guildCounts.slice(0, 3).map(([name, count]) => `${name}×${count}`).join(' ')}]`,
        )
      }
      if (!boolFlag(args, 'confirm')) log('후보만 보여 줬다. 실제로 연결하려면 --confirm')
      return 0
    }

    case 'league-maps': {
      const leagueSlug = stringFlag(args, 'league')
      if (!leagueSlug) {
        fail('--league <slug> 가 필요하다')
        return 1
      }
      const fromFlag = stringFlag(args, 'from')
      const toFlag = stringFlag(args, 'to')
      const result = await registerObservedMaps({
        leagueSlug,
        from: fromFlag ? new Date(fromFlag) : BETA_DATA_START,
        to: toFlag ? new Date(toFlag) : new Date(),
        confirm: boolFlag(args, 'confirm'),
      })
      log(`관측된 맵 ${result.observed.length}개: ${result.observed.join(', ')}`)
      log(`${boolFlag(args, 'confirm') ? '등록함' : '등록 예정'} ${result.added.length}개: ${result.added.join(', ')}`)
      return 0
    }

    case 'beta-bootstrap': {
      const leagueSlug = stringFlag(args, 'league')
      if (!leagueSlug) {
        fail('--league <slug> 가 필요하다')
        return 1
      }
      const atFlag = stringFlag(args, 'at')
      const startedAt = atFlag ? new Date(atFlag) : BETA_DATA_START
      if (Number.isNaN(startedAt.getTime())) {
        fail(`--at 이 날짜가 아니다: ${atFlag}`)
        return 1
      }

      const result = await bootstrapBeta({ leagueSlug, startedAt, dryRun })
      if (!result.ok) {
        fail(result.reason)
        return 1
      }
      table([
        {
          '닫은 시즌': result.closedSeason ?? '(없음)',
          '베타 번호': result.betaNumber ?? '-',
          '시작(KST)': result.startedAtKst ?? '-',
          클랜: result.clans.length,
          로스터: result.rosterMemberships,
          선수: result.players,
        },
      ])
      for (const clan of result.clans) log(`  ${clan.division}부 ${clan.name} (${clan.slug})`)
      if (result.reason) log(result.reason)
      return 0
    }

    case 'legacy': {
      const leagueSlug = stringFlag(args, 'league')
      if (!leagueSlug) {
        fail('--league <slug> 가 필요하다')
        return 1
      }

      const freeze = stringFlag(args, 'freeze')
      if (freeze) {
        const number = Number(freeze)
        if (!Number.isInteger(number)) {
          fail(`--freeze 는 시즌 번호여야 한다: ${freeze}`)
          return 1
        }
        const result = await freezeSeason({ leagueSlug, number, seasonType: 'legacy' })
        table([
          {
            시즌: result.number,
            확정됨: result.frozen,
            종류: result.seasonType,
            '선수 카드': result.playerCards,
          },
        ])
        log('확정된 시즌은 importer가 더 이상 수정하지 못한다')
        return 0
      }

      const file = stringFlag(args, 'file')
      const dir = stringFlag(args, 'dir')
      if (!file && !dir) {
        fail('--file <경로> 또는 --dir <폴더> 가 필요하다')
        return 1
      }
      const currentSeasonFlag = stringFlag(args, 'current-season')
      const currentSeason = currentSeasonFlag ? Number(currentSeasonFlag) : undefined
      if (currentSeasonFlag && !Number.isInteger(currentSeason)) {
        fail(`--current-season 은 시즌 번호여야 한다: ${currentSeasonFlag}`)
        return 1
      }

      const paths = file
        ? [file]
        : (await readdir(dir as string))
            .filter((name) => /\.(html?|json|csv)$/i.test(name))
            .map((name) => join(dir as string, name))
      if (paths.length === 0) {
        fail('읽을 파일이 없다 (.html / .json / .csv)')
        return 1
      }

      const rows: LegacySeasonRow[] = []
      const warnings: string[] = []
      for (const path of paths) {
        const text = await readFile(path, 'utf8')
        const parsed = /\.csv$/i.test(path)
          ? fromCsv(text)
          : /\.json$/i.test(path)
            ? // 정규화된 배열일 수도, 저장한 state 페이로드일 수도 있다
              (() => {
                const json: unknown = JSON.parse(text)
                return Array.isArray(json) ? fromJsonRows(json) : fromSupplyState(json, { currentSeason })
              })()
            : fromSupplyHtml(text, { currentSeason })
        rows.push(...parsed.rows)
        warnings.push(...parsed.warnings.map((message) => `${path}: ${message}`))
        log(`${path} — 카드 ${parsed.rows.length}건`)
      }

      // 같은 (선수, 시즌)이 여러 파일에서 나오면 합친다 (마감 직전 + 마감 직후)
      const merged = mergeRows(rows)
      log(`파일 ${paths.length}개 → 카드 ${rows.length}건 → 병합 후 ${merged.length}건`)

      const confirm = boolFlag(args, 'confirm')
      const result = await importLegacySeasons({
        leagueSlug,
        rows: merged,
        warnings,
        confirm,
      })
      table([
        {
          시즌: result.seasons.join(', ') || '(없음)',
          신규: result.counts.create,
          중복: result.counts.duplicate,
          충돌: result.counts.conflict,
          '확정됨(거부)': result.counts.frozen,
          실행: result.executed ? `${result.created}건 저장` : '미리보기',
        },
      ])
      for (const message of result.warnings.slice(0, 20)) warn(message)
      for (const plan of result.plans.filter((entry) => entry.verdict !== 'create').slice(0, 20)) {
        warn(`${plan.row.legacyPlayerId} S${plan.row.season} — ${plan.verdict}: ${plan.note ?? ''}`)
      }
      if (!confirm) log('미리보기다. 실제로 넣으려면 --confirm 을 붙인다')
      return result.counts.conflict > 0 && !confirm ? 1 : 0
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

      // Phase 8.2 — 재구성 조건이 얼마나 갖춰졌는가
      const [rosterRows, rosterVerified, leaguePriority, propagated, reconstructed] =
        await Promise.all([
          prisma.leagueRosterMembership.count(),
          prisma.leagueRosterMembership.count({ where: { verified: true } }),
          prisma.nexonPollState.count({ where: { priorityClass: 'league' } }),
          prisma.nexonPollState.count({ where: { propagatedAt: { not: null } } }),
          prisma.nexonMatch.count({ where: { reconstructedAt: { not: null } } }),
        ])
      table([
        {
          '로스터 등록': rosterRows,
          '확인된 소속': rosterVerified,
          '리그 우선 대상': leaguePriority,
          '전파로 앞당김': propagated,
          '재구성 판정됨': reconstructed,
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
