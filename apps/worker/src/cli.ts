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
import { V2_RATING_CONSTANTS } from '@sacloud/rating'
import { readFileSync, writeFileSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { prisma } from '@sacloud/db'
/* 「일부러 안 넣은 경기」의 이름표 — `supply-import` 의 끝 처리에서 쓴다 (D-210) */
import { IPL_ONLY_SKIP_REASON } from '@sacloud/db/ops'
/* ★수집기 임대 — 두 판이 못 돌게 막는 자물쇠★ (2026-09-04 · Pre-Part 0) */
import {
  COLLECTOR_LEASE_NAME,
  acquireCollectorLease,
  describeLease,
  readLease,
  releaseCollectorLease,
  renewCollectorLease,
} from '@sacloud/db/ops'
import { countLocalCollectors } from './lib/localCollectors.js'
/* ★통합 투영★ (Part 3 · 2026-09-05) */
import { runUnifiedProject } from './jobs/unifiedProject.js'
import {
  countSharedPasswordAccounts,
  freezeSeason,
  fromCsv,
  fromJsonRows,
  fromSupplyHtml,
  fromSupplyState,
  importLegacySeasons,
  importSupplyOfficialClans,
  ensureIndependentLeague,
  registerClanTier,
  syncIndependentTiers,
  INDEPENDENT_LEAGUE_SLUG,
  INDEPENDENT_TIER_COUNT,
  mergeRows,
  provisionTestAccount,
  rotateSharedDevPasswords,
  TEST_ACCOUNT_PASSWORD_ENV,
  type LegacySeasonRow,
} from '@sacloud/db/ops'
import { hasApiKey, MATCH_MODES, NexonClient, readNexonConfig, type MatchMode } from '@sacloud/nexon'
import { loadEnvFiles, REPO_ROOT } from './lib/env.js'
import { fail, log, registerSecret, table, warn } from './lib/log.js'
import { AbortCollection, type JobContext } from './jobs/context.js'
import { runIdentities } from './jobs/identities.js'
import { runIdentityWatch } from './jobs/identityWatch.js'
import { runBarracksLink } from './jobs/barracksLink.js'
import { collectBarracks, DEFAULT_DELAY_MS, MIN_DELAY_MS } from './jobs/barracksCollect.js'
import { checkLoad, guardLine, newGuardState } from './jobs/loadGuard.js'
import { runIplProject } from './jobs/iplProject.js'
import { runIplClanRollup } from './jobs/iplClanRollup.js'
import { runPlayerCurrentClan } from './jobs/playerCurrentClan.js'
import { runIplClanNumber } from './jobs/iplClanNumber.js'
import { runLineupDedupe } from './jobs/lineupDedupe.js'
import { runPlayerTwinLink } from './jobs/playerTwinLink.js'
import { runBattlelogLineup } from './jobs/battlelogLineup.js'
import { runCollect } from './jobs/collect.js'
import { runProject, runReresolve } from './jobs/project.js'
import { runRefresh } from './jobs/refresh.js'
import { runCheck } from './jobs/check.js'
import { ensurePollStates, requestManualRefresh, runPoll } from './jobs/poll.js'
import { backfillObservations, runReconstruct } from './jobs/reconstruct.js'
import { bootstrapBeta, BETA_DATA_START } from './jobs/betaBootstrap.js'
import { linkIdentitiesByEvidence, registerObservedMaps } from './jobs/identityLink.js'
import { buildRosterFromMatchEvidence, syncRosterFromBarracks } from './jobs/rosterSync.js'
import { applyWeaponToStats, importWeaponEvidence } from './jobs/weapon.js'
/** 병영수첩 BattleLog 원문 적재 + 좌표 기반 포지션 판정 (D-174) */
import { buildPositionProfiles, importBattleLogs } from './jobs/battlelog.js'
import { checkBattleLogs } from './jobs/battlelogCheck.js'
/** 병영수첩 클랜전 목록 원문 적재 — IPL 기록 이관 */
import {
  checkIplMatches,
  findClanMatchFiles,
  formatMatchStamp,
  importIplMatches,
} from './jobs/iplMatchImport.js'
/** IPL 클랜끼리의 경기를 열산에서 막고 치운다 (D-210) */
import { runIplSanplyCheck, runIplSanplyPurge } from './jobs/iplSanplyPurge.js'
import { buildRoundProfiles } from './jobs/roundBuild.js'
/** 클랜 라운드 지표 (SITE_SPEC_V2 5-5절) — 블루방어율·어택성공률·조직력·폭발력·템포·클린시트 */
import { buildClanRoundProfiles } from './jobs/clanRoundBuild.js'
/** 클랜 육각형 V2 (D-217 · D-235) — 스나싸움·소수싸움·세이브·템포·B어택·A어택. 옛 판과 따로 산다 */
import { buildClanHexV2 } from './jobs/clanHexV2Build.js'
import {
  buildClanHexV2Summary,
  type ClanHexV2SummaryResult,
} from './jobs/clanHexV2Summary.js'
import { linkClanNumbers } from './jobs/clanNumber.js'
import { runRate } from './jobs/rate.js'
import {
  createRatingSnapshot,
  createRatingSnapshotStream,
  restoreRatingSnapshotAuto,
} from './jobs/ratingBackup.js'
import { formatSnapshot, takeDbSnapshot } from './jobs/dbSnapshot.js'
import { checkSyncFreshness, formatSyncFreshness } from './jobs/syncFreshness.js'
import {
  WATCHDOG_DEFAULT_THRESHOLDS,
  evaluateWatch,
  formatWatchMessage,
  formatWatchReport,
  loadWatchState,
  parseStaleMin,
  readWatchNumbers,
  saveWatchState,
  sendDiscord,
  transitionWatch,
  type WatchNumbers,
  type WatchThresholds,
} from './jobs/collectWatchdog.js'
import { runSupplyMatches, supplyMatchesStatus } from './jobs/supplyMatches.js'
import { readCurrentMembership, runSupplyRosters } from './jobs/supplyRosters.js'
import { explainMatches } from './dev/explainMatches.js'
import {
  backfillMatchTimeAffiliation,
  cleanupDuplicateSupplyPlayers,
  linkSupplyPlayerIds,
  completeLineupsFromSupply,
} from '@sacloud/db/ops'
import {
  compositionCurveSample,
  projectComposition,
  runSnapshotAudit,
} from './jobs/snapshotAudit.js'
import { rebuildWeaponStats } from './jobs/weaponRebuild.js'
import { runSeasonClose, runSeasonOpen, seasonStatus } from './jobs/season.js'
import { runSeason0Close } from './jobs/season0Close.js'
import { clanList, joinLeague, mergeClans, registerClan, renameClan } from './jobs/clan.js'
import {
  deriveRosterFromLeaguePlayers,
  importRoster,
  rosterStatus,
  syncLeaguePriority,
} from './jobs/roster.js'
import { readPollingConfig } from './lib/pollingPolicy.js'
import { runSupplyMirror } from './jobs/supplyMirror.js'
import { runSupplyPush } from './jobs/supplyPush.js'
import { runSupplyImport } from './jobs/supplyImport.js'
import { runSupplyRollup } from './jobs/supplyRollup.js'
import { countCollected, runSupplySeasons, supplySeasonsPaths } from './jobs/supplySeasons.js'
import { runSupplySeasonsImport } from './jobs/supplySeasonsImport.js'
import {
  countProfiles,
  runSupplyPlayerProfiles,
  supplyPlayerProfilesPaths,
} from './jobs/supplyPlayerProfiles.js'
import { runSupplyPlayerProfilesImport } from './jobs/supplyPlayerProfilesImport.js'

interface Args {
  command: string
  flags: Map<string, string | boolean>
  /**
   * ★깃발이 아닌 말들★ (2026-09-04 · Pre-Part 0).
   *
   * `collect-lease acquire` 처럼 ★하위 명령★ 이 있는 명령을 위해 더했다.
   * 그 전까지는 깃발만 읽고 나머지는 ★조용히 버렸다.★
   * ⚠ 깃발의 ★값★ 은 여기 들어오지 않는다 — `--ttl 1200` 의 `1200` 은 깃발 값이다.
   */
  positional: string[]
}

function parseArgs(argv: readonly string[]): Args {
  const [command = 'help', ...rest] = argv
  const flags = new Map<string, string | boolean>()
  const positional: string[] = []
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index]
    if (!token) continue
    if (!token.startsWith('--')) {
      positional.push(token)
      continue
    }
    const key = token.slice(2)
    const next = rest[index + 1]
    if (next && !next.startsWith('--')) {
      flags.set(key, next)
      index += 1
    } else {
      flags.set(key, true)
    }
  }
  return { command, flags, positional }
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

/**
 * 클랜 육각형 V2 **요약** 결과를 찍는다 (D-238 후속).
 *
 * `clan-hex-v2-build` 끝과 `clan-hex-v2-summary` 가 **같은 표**를 쓴다 — 둘의 숫자를
 * 나란히 놓고 봐야 «행은 늘었는데 요약이 안 따라왔다» 를 알아볼 수 있다.
 *
 * `한 리그 읽을 양` 이 이 작업의 핵심 지표다. 옛 경로는 리그 하나에 7MB 를 읽었다.
 */
function printClanHexV2Summary(result: ClanHexV2SummaryResult): void {
  table([
    {
      '대상 클랜': result.clans,
      '접은 클랜': result.built,
      '이미 최신': result.fresh,
      '등록 없음': result.noLeagueClan,
      '읽은 경기 행': result.rowsRead,
      '담긴 경기': result.matches,
    },
  ])
  table([
    {
      /* 화면이 한 리그에서 읽게 될 양의 상한이다 (여기는 대상 전체 합) */
      '요약 tally 합': `${(result.bytes / 1024).toFixed(1)}KB`,
      '요약 한 줄 평균':
        result.built === 0 ? '-' : `${Math.round(result.bytes / result.built)}B`,
      '고아 요약': result.stale,
      지움: result.pruned,
      '표 행 수': `${result.targetBefore} → ${result.targetAfter}`,
    },
  ])
  table([Object.fromEntries(result.axesHistogram.map((n, axes) => [`${axes}축`, n]))])
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

  independent-league [--league <slug>] [--confirm]
              무소속리그(기본 slug nolink) 행을 만든다 (D-165). **재실행해도 중복이 없다**
              티어 1~6 = League.divisionCount = 6 인 리그의 division 1~6 이다. 새 축이 아니다
              (IPL 은 이 리그의 다른 이름이다 · 6단 — D-181)
              --register <클랜slug> --tier <1~6>  그 티어에 클랜을 등록/이동한다
              --sync   Clan.tier 를 LeagueClan.division 에 맞춘다 (기준은 division)
              **--confirm 없이는 한 줄도 쓰지 않는다**
  iplmatch-import --dir <폴더> [--file <한 파일>] [--since <YYYY-MM-DD>] [--confirm]
              병영수첩 **클랜전 목록**(GetClanMatchList) 원문 적재 — IPL 기록 이관
              브라우저가 내려받은 ipl-<클랜slug>-<건수>.json 을 읽는다.
              크롬이 이름을 못 바꿔 .tmp 로 남은 것도 **내용으로 알아본다** (D-203)
              **Match 로 투영하지 않는다.** 원문 보존까지만 한다 (투영은 D-155 · 3-B)
              --since 는 그 날짜 이후에 받은 파일만 본다 — 내려받기 폴더에 상관없는
              파일이 수백 개면 살펴보는 것만으로 10분이 넘는다
              **--confirm 없이는 한 줄도 쓰지 않는다.** 멱등이다
  iplmatch-check [--dir <폴더>] [--since <YYYY-MM-DD>]
              적재 숫자 대조 — 파일↔DB · 맵 · 기간 · 양쪽 다 등록클랜인 경기 수
  ipl-clan-number [--confirm]
              IPL **클랜번호 ↔ 우리 클랜**을 잇는다. **요청을 한 건도 보내지 않는다**
              매치목록 원문의 (subject, clan_no) 가 1:1 이라 그것으로 끊는다 —
              clan-number 는 MatchPlayerStat 을 요구해 IPL 에서 순환이 된다
              **--confirm 없이는 한 줄도 쓰지 않는다.** 멱등이다
  player-current-clan [--league <slug>] [--confirm]
              선수의 **현재 소속 클랜**(LeaguePlayer.clanId)을 경기 기록에서 채운다 (D-161).
              가장 늦은 경기의 matchTimeLeagueClanId 를 그대로 옮긴다 — 새로 판정하지 않는다.
              기본 대상은 IPL(nolink) 이다. 미러 리그는 supplyRollup 이 이미 채운다.
              Player.clanId 는 건드리지 않는다 (D-161 은 3rd.supply 선수만 허용한다).
              **--confirm 없이는 한 줄도 쓰지 않는다.** 멱등이다
  collect-lease <acquire|renew|release|status> [--ttl 초] [--owner <id>]
              ★수집기 단일 실행 보장 — DB 임대★ (2026-09-04 · Pre-Part 0).
              프로세스를 세는 방식이 ★세 번 뚫려서★ 바꾼 것이다. 한 문장짜리 SQL 이라
              동시에 여러 판이 달려들어도 ★정확히 하나만★ 이긴다
              status 는 ★DB 장부와 이 컴퓨터의 실제 프로세스 수를 나란히★ 찍는다 —
              「임대는 살아있는데 프로세스 0개」면 죽은 판이 쥔 것이다 (20분 뒤 자동 해제)
              못 잡으면 ★코드 9★ (1=오류 · 2=차단 · 3=무거움 과 구별한다)
  barracks-collect --league <slug> [--limit N] [--clans N] [--from YYMMDD] [--confirm]
              병영수첩을 curl 로 긁는다 (O-051 · D-268). ★첫 403·429 에서 즉시 멈춘다★
              ★임대 없이는 시작하지 않는다★ — 셸은 --lease-owner <id>,
              사람이 한 번 돌릴 때는 ★--no-lease 를 의도해서★ 붙인다 (코드 9 로 거부)
  battlelog-lineup [--league <slug>] [--limit N] [--confirm]
              클랜 배틀로그 원문 → **MatchPlayerStat**(참가 기록). 라인업의 유일한 출처다
              **10명이 다 확인된 경기만** 넣는다. assist·damage·headshot·dropout·mvp 는 전부 null
              먼저 ipl-clan-number 를 돌려 클랜번호 표를 채워야 한다
              **--confirm 없이는 한 줄도 쓰지 않는다.** 멱등이다
  ipl-sanply-check [--league <slug>] [--ipl-league <slug>]
              **열산에 남은 IPL끼리의 경기**를 센다 (D-210). 0 이 아니면 exit 1
              막는 규칙은 적재(supply-import)에 들어 있다 — 이건 새는지 보는 대조다
              **IPL 명단이 마지막 청소 뒤로 바뀌었어도 exit 1** — 새 클랜의 과거 경기가
              소급해서 「IPL끼리」가 된다. 0건인 것은 통과가 아니다
  ipl-sanply-purge [--league <slug>] [--ipl-league <slug>] [--backup-dir <폴더>] [--confirm]
              이미 들어온 IPL끼리의 경기를 지우고 IPL 클랜을 열산에서 뺀다 (D-210)
              **지우기 전에 백업 JSON 을 뜬다.** 원문(수집 JSONL)은 건드리지 않는다
              **--confirm 없이는 한 줄도 지우지 않는다**
  roster      --league <slug> --file <CSV> [--verified] | --from-league-players | --sync-priority
              (플래그 없으면 등록 현황만 보여 준다)
  backfill-observations [--ouid <OUID>[,<OUID>]]
              보관된 목록 원본 → 관측값. **넥슨에 요청하지 않는다**
  supply-clans [--file <json>] [--league <slug>] [--confirm]
              3rd.supply 공식리그 참가 클랜 스냅샷 이관 (마크·division·slug 정규화)
              **--confirm 없이는 한 줄도 쓰지 않는다**
  supply-matches [--file <json>] [--since <ISO>] [--until <ISO>] [--map <이름>]
              [--player-count N] [--discover-only] [--detail-limit N] [--status] [--confirm]
              공식리그 경기 **발견** — 3rd.supply 스냅샷의 match_id → 넥슨 /match-detail (D-127)
              **--confirm 없이는 DB 에 쓰지 않고 넥슨도 부르지 않는다**
  supply-rosters [--file <json>] [--league <slug>] [--confirm] [--no-verified]
              **현재** 클랜원 자동 갱신 (경기 스냅샷 라인업 clan 에서 도출 · D-130)
              신규·이적·탈퇴를 감지해 소속 이력을 남긴다. 경기 당시 소속은 건드리지 않는다
              **--confirm 없이는 한 줄도 쓰지 않는다**
  supply-players [--file <json>] [--league <slug>] [--cleanup] [--confirm]
              넥슨 참가자 ↔ 3rd.supply 선수 id 연결 (**같은 경기 · 닉네임 정확 일치** · D-132)
              --cleanup 은 기록이 하나도 없는 중복 행만 정리한다
  supply-mirror [--league <slug>] [--league-id N] [--floor <YYYY-MM-DD>] [--file <json>]
              [--limit N] [--incremental] [--seen-from-db] [--adaptive]
              3rd.supply 공개 API 미러링 수집 (D-153). 받은 응답을 그대로 JSONL 에 쌓는다
              --incremental 은 커서를 버리고 목록 맨 앞부터 새 경기만 훑는다 (주기 실행용)
              --seen-from-db 는 "이미 받은 것" 을 DB 에서 읽는다 —
              JSONL 이 없는 빈 작업공간(GitHub Actions)에서 증분을 돌릴 때 쓴다
              --adaptive 는 **활동량이 있는 클랜만** 훑는다 (D-162).
              등급은 그 클랜의 마지막 경기 시각으로 정하고(DB 에서 읽는다 · 요청 0건),
              등급별 주기는 SUPPLY_POLL_* 로 조절한다. 어떤 클랜도 24시간을 넘겨
              방치되지 않는다. 원본 league_clan id 와 리그 id 도 DB 에서 채워
              /clans/{slug}/show · /leagues/{slug} 를 부르지 않는다
  supply-seasons [--league <slug>] [--file <json>] [--limit N] [--dry-run]
              3rd.supply **지난시즌 카드** 수집 (D-166). 경기는 가져오지 않는다.
              선수당 2요청 — leaguePlayerId 색인 + /leagueplayers/{id}/seasons.
              중단 후 재개된다. --dry-run 은 요청을 한 건도 보내지 않고 예상 요청 수만 낸다
  supply-seasons-import [--league <slug>] [--file <json>] [--limit N] [--confirm]
              지난시즌 수집 파일 → LeaguePlayerSeason (D-166). **네트워크를 쓰지 않는다**
              원본값을 그대로 넣는다. 우리가 계산한 카드(imported=false)는 덮어쓰지 않는다.
              **--confirm 없이는 한 줄도 쓰지 않는다.** 로컬 DB 가 아니면 거부한다
  supply-player-profiles [--file <json>] [--limit N] [--dry-run]
              3rd.supply **선수 프로필** 수집 — position · note · renewed_at (D-161)
              /players/{id} 로 **선수당 1요청**. 세 값은 리그와 무관한 전역 값이다.
              중단 후 재개된다. --dry-run 은 요청을 한 건도 보내지 않고 예상 요청 수만 낸다
  supply-player-profiles-import [--file <json>] [--limit N] [--confirm]
              프로필 수집 파일 → Player.position / note / renewedAt. **네트워크를 쓰지 않는다**
              origin='3rd.supply' 선수만 건드린다. position 은 숫자 코드라 표기를 아는
              코드만 채우고, 모르는 코드는 비운 채 **몇 명인지 센다** (표기 대부분 [미확인])
              **--confirm 없이는 한 줄도 쓰지 않는다.** 로컬 DB 가 아니면 거부한다
  supply-import [--league <slug>] [--file <json>] [--limit N] [--confirm]
              [--update-source] [--league-name <이름>]
              3rd.supply 미러링 수집 파일 → 우리 DB (D-153). **네트워크를 쓰지 않는다**
              예전 단일 JSON 과 줄 단위(.matches.jsonl/.details.jsonl) 둘 다 읽는다.
              줄 단위는 **흘려 읽는다** — 13만 건도 통째로 메모리에 올리지 않는다
              **--confirm 없이는 한 줄도 쓰지 않는다.** 이미 있는 경기는 건너뛴다.
              --update-source 는 있는 경기의 **비어 있는** 원본점수 칸만 채운다
  supply-rollup [--league <slug>] [--file <json>] [--confirm] [--full] [--since-hours N]
              미러 경기(origin='3rd.supply') → LeaguePlayer · LeagueClan 집계.
              **기본은 증분이다** (D-162) — 최근 N시간(기본 24) 안에 적재된 경기가
              건드린 선수만 다시 계산한다. 더하지 않는다: 그 선수의 값을 리그 전 경기에서
              **처음부터 다시** 만들므로 같은 경기를 두 번 넣어도 값이 변하지 않는다.
              --full 은 전수 재계산이다. 값이 어긋났을 때 되돌리는 길이라 없애지 않는다.
              클랜은 증분·전수가 하는 일이 같다 — 수집 파일 목록 값을 그대로 쓴다 (D-157).
              선수 점수는 가장 최근 경기의 sourceRating 을 그대로 옮긴다 (D-153).
              선수 소속(LeaguePlayer.clanId · Player.clanId)도 같은 규칙이다 —
              **가장 최근 경기**에 적힌 클랜을 현재 소속으로 쓴다 (D-161).
              무소속이거나 Clan 표에 없는 클랜이면 칸을 쓰지 않는다(만들지 않는다).
              Player.clanId 는 origin='3rd.supply' 인 선수만 건드린다.
              클랜 점수·승패·부리그는 **수집 파일 클랜 목록** 값을 그대로 쓴다 (D-157).
              그 목록이 클랜랭킹의 기준 집합이다 — 경기가 아직 없는 등록 클랜도
              Clan·LeagueClan 행을 만들어 랭킹에 올리고,
              목록에 없는 클랜은 랭킹에서 뺀다(placement=true · 경기는 그대로 남는다).
              우리 공식값(ratingBefore/ratingUpdate/formulaVersion)은 건드리지 않는다.
              --league 를 생략하면 미러 경기가 있는 리그 전부.
              **--confirm 없이는 한 줄도 쓰지 않는다.** 두 번 돌려도 같은 결과다
  explain-matches [--league <slug>] [--match-id <ID>[,<ID>]] [--limit N]
              재구성된 경기를 사람이 읽을 수 있게 풀어 쓴다 (읽기 전용)
  affiliation [--league <slug>] [--redo] [--confirm]
              **경기 당시** 소속 스냅샷 복원 (넥슨 상세 guild_name → 로스터 순 · D-131)
              현재 소속은 건드리지 않는다. **--confirm 없이는 한 줄도 쓰지 않는다**
  reresolve   상세 보유 경기의 참가자 신원을 다시 붙인다 (투영 상태는 건드리지 않는다)
  reconstruct [--league <slug>] [--redo] [--match-id <ID>[,<ID>]] [--allow-unverified-roster]
              [--allow-mock-league] [--lineup-evidence [<json>]]
              --lineup-evidence 는 3rd.supply 라인업을 **팀 식별에만** 보조로 쓴다 (D-133).
              참가자를 만들지 않고 경기 당시 소속으로도 쓰지 않는다.
              넥슨 승패와 어긋나면 그 경기는 보조 증거를 버린다
  rate        --league <slug> [--season N] [--allow-mock-league] [--dry-run]
              [--origins <o1,o2>] [--from <ISO>] [--to <ISO>]
              재구성된 경기로 래더를 **처음부터 다시** 계산한다 (결정적 replay)
              --origins 는 계산 범위를 바꾼다. 기본은 origin='nexon' 이라
              IPL(nexon_barracks)이 통째로 빠진다. **--dry-run 에서만 쓸 수 있다** —
              원본 점수를 덮지 않기 위한 가드다 (3-A 2번). 받아 적는 경로는 season0Apply
  rating-backup  --league <slug> [--stamp <문자열>] [--legacy-json]
              replay 전 래더 스냅샷을 백업한다. **replay 전에 반드시 돌린다**
              기본은 줄 단위(.jsonl) 스트리밍이다 — 202만 행짜리 리그도 통과한다.
              --legacy-json 은 옛 통짜 JSON 방식이다. 작은 리그에서만 쓴다
  rating-restore --file <경로> [--dry-run]      (.json · .jsonl 둘 다 받는다)
              백업 스냅샷으로 되돌린다 (삭제하지 않고 값만 복원)
  db-snapshot [--stamp <문자열>]
              DB 이전 검증용 기준선 — 모델별 행 수 · 기간 · 무결성. 읽기만 한다
  sync-freshness [--leagues <slug,...>] [--max-age <slug>=<시간>,...] [--warn-only]
              증분 동기화가 밀렸는지 본다 — 최신 경기 시각 vs 마지막 적재 시각.
              임계값은 리그마다 다르다(실측 근거는 jobs/syncFreshness.ts). 읽기만 한다
  collect-watchdog [--dry-run] [--state <경로>] [--fixture <숫자.json>] [--force-notify]
                   [--leagues <slug,...>] [--stale-min <slug>=<분>,...] [--ingest-stale-min N]
                   [--ingest-alert] [--apply-max-hours N] [--fail-streak N]
              수집 감시 (지시 #18) — 마지막 경기 지연 · 창구 정체 · 시즌0 반영 · 워크플로 연속 실패를
              숫자로 판정하고, **바뀔 때만** 디스코드 웹훅(DISCORD_WEBHOOK_URL)으로 알린다.
              --fixture 는 DB·GitHub 대신 그 파일의 숫자로 판정한다 (접속 없이 문구 시험). 읽기만 한다
  season      --league <slug> [--close | --start] [--at <ISO>] [--number N] [--no-promotion]
              시즌 운영. 플래그가 없으면 현재 상태만 보여 준다.
              --close 최종 랭킹 스냅샷 + 시즌 종료 / --start 승강 반영 + 전원 같은 점수로 시작
              **자동으로 도는 것이 없다. 운영자가 부를 때만 실행된다**
  season0-finish --league <slug> [--open --number N] [--at <ISO>] [--no-promotion] [--confirm]
              시즌0(테스트 시즌) 마감 — 선수·클랜 **지난시즌 카드**와 랭킹 스냅샷을 굳힌다 (D-175).
              열려 있는 시즌이 시즌0(number 0 · beta)이 아니면 거부한다.
              --open 은 이어서 다음 시즌을 연다. **--number 를 반드시 준다**
              (이관된 시즌 1~7 때문에 "시즌1" 의 번호가 [미확인]이다).
              **--confirm 없이는 한 줄도 쓰지 않는다**
  clan        [--league <slug>] | --register --slug <s> --name <n> | --rename --slug <s> --name <n>
              | --join --league <slug> --slug <s> --division N | --merge --from <s> --into <s>
              클랜 등록·이름 변경·리그 참여·병합 (병합은 slug 두 개를 정확히 지정할 때만)
  legacy      --league <slug> --file <파일> | --dir <폴더> [--current-season N] [--confirm]
              --league <slug> --freeze N
              과거 시즌 이관. 입력은 HTML(supplyPc-state) · JSON · CSV.
              **--confirm 없이는 한 줄도 쓰지 않는다** (기본은 미리보기).
              --freeze N 은 그 시즌을 확정해 이후 수정을 막는다

  accounts    --rotate-shared | --audit
              | --provision-test --email <주소> [--nickname <이름>] [--admin]
              계정 보안. 공용 개발 비밀번호를 쓰는 계정을 **로그인 불가**로 만든다.
              검수 계정 비밀번호는 인자가 아니라 환경변수로만 받는다.

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

  const needsNetwork =
    ['identities', 'collect', 'refresh', 'poll', 'identity-watch', 'barracks-link'].includes(
      args.command,
    ) &&
    !dryRun
  const needsNetworkOnConfirm =
    args.command === 'supply-matches' &&
    !dryRun &&
    boolFlag(args, 'confirm') &&
    !boolFlag(args, 'discover-only') &&
    !boolFlag(args, 'status')
  if (needsNetwork || needsNetworkOnConfirm) {
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

    case 'player-current-clan': {
      /*
        개인랭킹 행의 클랜 칸을 채운다. `season0Apply` 는 이 칸을 읽어서 그대로 되쓰므로
        (`clanOf`) 한 번 채워 두면 시간당 도는 반영 잡이 유지해 준다.
        `--confirm` 없이는 한 줄도 쓰지 않는다.
      */
      const result = await runPlayerCurrentClan({
        league: stringFlag(args, 'league') ?? undefined,
        confirm: boolFlag(args, 'confirm'),
      })
      table([
        {
          리그: result.league,
          선수: result.players,
          이미있음: result.before,
          찾음: result.resolved,
          바꿀대상: result.changed,
          모름: result.unknown,
          반영: result.confirmed ? '했다' : '안했다',
        },
      ])
      if (result.top.length) {
        log('인원 상위')
        for (const t of result.top) log(`  ${t.name}  ${t.members}명`)
      }
      return 0
    }
    case 'ipl-clan-rollup': {
      /*
        IPL 경기 결과로 `LeagueClan.{win, lose, rating, placement}` 를 채운다.
        클랜랭킹 화면이 이 네 칸을 직접 읽는다. `--confirm` 없이는 한 줄도 쓰지 않는다.
      */
      const result = await runIplClanRollup({ confirm: boolFlag(args, 'confirm') })
      table([
        {
          경기: result.matches,
          등록클랜: result.registered,
          랭킹진입: result.ranked,
          배치고사: result.placement,
          무경기: result.reset,
        },
      ])
      if (result.top.length) {
        log('래더 상위')
        for (const t of result.top) {
          log(`  ${t.division}부  ${t.name}  ${t.rating}  ${t.win}승 ${t.lose}패`)
        }
      }
      return 0
    }

    case 'ipl-clan-number': {
      /*
        IPL 클랜번호를 잇는다. **요청을 한 건도 보내지 않는다** — 이미 저장된
        매치목록 원문의 `(subject, clan_no)` 가 1:1 이라 그것으로 푼다.
        옛 `clan-number`(참가 선수 대조)는 그대로 살아 있다 (`CLAUDE.md` 10-4).
      */
      const result = await runIplClanNumber({ confirm: boolFlag(args, 'confirm') })
      table([
        {
          짝: result.pairs,
          주체: result.subjects,
          등록클랜: result.registered,
          이음: result.linked,
          신규: result.created,
          기존: result.updated,
          충돌: result.conflicts,
          클랜모름: result.skipped.unresolved_subject,
        },
      ])
      return 0
    }

    case 'player-twin-link': {
      /*
        ★두 선수로 갈린 같은 사람을 찾아 계획을 낸다★ (D-275).
        ⚠ ★DB 에는 한 줄도 안 쓴다★ — 이을 자리가 스키마에 없다 (`NexonIdentity.ouid` 가 필수인데
          병영수첩 선수는 ouid 를 모른다. ★지어낸 값을 넣지 않는다★).
          ★찾은 것을 파일로 남긴다.★ 자리가 생기면 그 파일을 먹이면 된다
      */
      const backupPath = stringFlag(args, 'backup')
      if (!backupPath) {
        log('★--backup <lineup-dedupe 백업 파일 경로>★ 가 필요하다')
        return 1
      }
      const result = await runPlayerTwinLink({
        backupPath,
        confirm: boolFlag(args, 'confirm'),
        minMatches: numberFlag(args, 'min-matches') ?? undefined,
      })
      table([
        {
          자리맞은짝: result.pairs,
          기준넘은짝: result.strong,
          애매해서제외: result.ambiguous,
          파일로냄: result.written,
        },
      ])
      return 0
    }

    case 'lineup-dedupe': {
      /*
        ★한 경기에 두 번 들어간 라인업을 걷어낸다★ (D-273).
        ★미러 것을 남기고 병영수첩 것을 지운다★ — 미러가 무기·어시스트·헤드샷까지 갖고 있다.
        ⚠ ★`--confirm` 없이는 한 줄도 안 지운다.★ ★양쪽이 다 있는 경기에서만 지운다★
      */
      const result = await runLineupDedupe({
        confirm: boolFlag(args, 'confirm'),
        leagueSlug: stringFlag(args, 'league') ?? undefined,
      })
      table([
        {
          겹친경기: result.matches,
          병영수첩버림: result.dropBarracks,
          미러버림: result.dropMirror,
          안건드림: result.leaveAlone,
          지울행: result.rows,
          열명됨: result.becomeTen,
          실제로지웠나: result.written,
        },
      ])
      return 0
    }

    case 'battlelog-lineup': {
      /*
        클랜 배틀로그 → `MatchPlayerStat`. IPL 참가 기록의 유일한 경로다.
        10명이 다 확인된 경기만 넣고, 배틀로그에 없는 칸은 전부 null 이다.
        `--confirm` 없이는 한 줄도 쓰지 않는다.
      */
      const result = await runBattlelogLineup({
        confirm: boolFlag(args, 'confirm'),
        leagueSlug: stringFlag(args, 'league') ?? undefined,
        limit: numberFlag(args, 'limit') ?? undefined,
      })
      table([
        {
          배틀로그경기: result.matchKeys,
          우리경기: result.matched,
          라인업가능: result.planned,
          참가신규: result.statsCreated,
          참가갱신: result.statsUpdated,
          선수신규: result.playersCreated,
          신원이음: result.playersFromIdentity,
        },
      ])
      table([result.skipped as unknown as Record<string, unknown>])
      return 0
    }

    case 'unified-project': {
      /*
       * ★통합 투영★ (Part 3 ④단계 · 2026-09-05) — IPL / SPL / 열산 중 정확히 하나로.
       *
       *   nexon unified-project             미리보기 (★한 줄도 안 쓴다★)
       *   nexon unified-project --confirm   적재
       *   nexon unified-project --limit 200 앞 200경기만 (시험용)
       *
       * ⚠ ★`iplmatch-project` 를 대체하는 것이지 같이 돌리는 것이 아니다.★
       *   둘 다 `origin='nexon_barracks'` 로 만든다 — 자물쇠가 막지만 헛수고다.
       */
      const out = await runUnifiedProject({
        confirm: boolFlag(args, 'confirm'),
        limit: numberFlag(args, 'limit') ?? undefined,
      })
      table([
        {
          본경기: out.seen,
          '만듦(IPL)': out.createdByLeague.nolink,
          '만듦(SPL)': out.createdByLeague.supply,
          '만듦(열산)': out.createdByLeague.sanply,
          만듦합: out.created,
          '이미있음': out.skipped.already_exists,
          '기준시각이전': out.skipped.before_cutoff,
        },
      ])
      log('\n넘어간 사유')
      for (const [k, v] of Object.entries(out.skipped)) {
        if (v > 0) log(`  ${k.padEnd(20)} ${v.toLocaleString()}`)
      }
      if (out.ambiguousNames.length > 0) {
        log(`
★같은 이름 다른 클랜이라 뺀 이름★ ${out.ambiguousNames.join(' · ')}`)
      }
      if (out.unknownClanNames.length > 0) {
        log('\n못 이은 클랜명 (많이 나온 순)')
        for (const u of out.unknownClanNames) log(`  ${u.name} — ${u.count.toLocaleString()}건`)
      }
      if (out.unclassified.length > 0) {
        log('\n★unclassified 표본★ (버리지 않고 남긴다)')
        for (const u of out.unclassified.slice(0, 12)) {
          log(`  ${u.matchKey} · ${u.reason} · ${u.detail}`)
        }
      }
      if (!out.confirm) log('\n미리보기다. 적재하려면 --confirm')
      return 0
    }

    case 'iplmatch-project': {
      /*
        IPL 원문을 `Match` 로 투영한다. `--confirm` 없이는 한 줄도 쓰지 않는다.
        양쪽이 다 IPL 등록 클랜이고 시즌 창 안일 때만 넣는다 (D-210 · D-175).
        참가자는 원문에 없으므로 `MatchPlayerStat` 은 만들지 않는다.
      */
      const result = await runIplProject({
        confirm: boolFlag(args, 'confirm'),
        limit: numberFlag(args, 'limit') ?? undefined,
      })
      table([
        {
          고유경기: result.uniqueMatches,
          투영대상: result.planned,
          신규: result.created,
          갱신: result.updated,
        },
      ])
      if (result.unknownClanNames.length) {
        log('못 이은 클랜명 (많이 나온 순)')
        for (const u of result.unknownClanNames) log(`  ${u.name} — ${u.count.toLocaleString()}건`)
      }
      return 0
    }

    /*
     * ══════════════════════════════════════════════════════════════════════
     * ★★수집기 임대 — 두 판이 못 돌게 막는 자물쇠★★ (2026-09-04 · Pre-Part 0)
     *
     *   nexon collect-lease acquire [--ttl 초] [--pid N] [--command "..."]
     *              잡는다. ★잡으면 ownerId 를 한 줄로 찍고 코드 0★
     *              ★못 잡으면 코드 ★9★ 와 쥔 사람 정보★
     *   nexon collect-lease renew   --owner <id> [--ttl 초]
     *              갱신. ★잃었으면 코드 9★ — 그때는 즉시 멈춰야 한다
     *   nexon collect-lease release --owner <id>
     *              반납. 못 해도 만료가 받아 준다
     *   nexon collect-lease status
     *              누가 쥐고 있나 + ★이 컴퓨터에 실제로 남은 수집 프로세스 수★
     *
     * ⚠ ★코드 9 를 쓴다★ — 0(성공)·1(오류)·2(차단)·3(무거움)과 겹치지 않게.
     *   「자물쇠에 막혔다」는 ★실패가 아니라 정상 동작★ 이라 따로 세운다.
     * ══════════════════════════════════════════════════════════════════════
     */
    case 'collect-lease': {
      const sub = args.positional[0] ?? 'status'
      const name = stringFlag(args, 'name') ?? COLLECTOR_LEASE_NAME
      const ttlSeconds = numberFlag(args, 'ttl')
      const leaseMs = ttlSeconds === null ? undefined : ttlSeconds * 1000

      if (sub === 'acquire') {
        const got = await acquireCollectorLease({
          name,
          leaseMs,
          pid: numberFlag(args, 'pid') ?? process.pid,
          command: stringFlag(args, 'command') ?? null,
        })
        if (!got.ok) {
          log(`★수집 임대를 이미 남이 쥐고 있다 — 이번 판은 돌지 않는다★`)
          log(`  ${describeLease(got.heldBy)}`)
          return 9
        }
        if (got.tookOverFrom) {
          /* ★조용히 뺏지 않는다★ — 낡은 임대를 치웠다는 것은 사람이 알아야 한다 */
          log(`  ⚠ 낡은 임대를 치웠다 — ${describeLease(got.tookOverFrom)}`)
        }
        log(`★임대를 잡았다★ ${got.expiresAt.toISOString()} 까지`)
        /* ★셸이 읽어 갈 줄. 형식을 바꾸지 마라★ (`collect-lock.sh` 가 이 앞부분을 자른다) */
        log(`OWNER=${got.ownerId}`)
        return 0
      }

      if (sub === 'renew') {
        const owner = stringFlag(args, 'owner')
        if (!owner) {
          log('--owner 가 필요하다')
          return 1
        }
        const out = await renewCollectorLease({ name, ownerId: owner, leaseMs })
        /* ══ ★★셋을 다른 말·다른 코드로 낸다★★ (2026-09-04 · O-055-1) ══
         *   ★9 = 임대 상실★        DB 가 답했고 0행이다 → 남이 가져갔다 → 즉시 멈춘다
         *   ★3 = DB 연결 실패★     묻지도 못했다 → ★모르는 상태다★ → 부르는 쪽이 재시도
         *   0 = 갱신됨
         *
         *   ⚠ ★3 을 9 로 뭉개면 멀쩡한 판이 죽는다★ (2026-09-04 · 4시간 43분 공백).
         *     반대로 ★9 를 3 으로 뭉개면 두 판이 된다.★ 둘 다 사고다 */
        if (out.outcome === 'lost') {
          log('★임대 상실 — 즉시 멈춘다★ (남이 가져갔거나 만료됐다)')
          return 9
        }
        if (out.outcome === 'unreachable') {
          log('★DB 연결 실패 — 임대 상태 확인 불가★ (잃은 것이 아니다. 다시 물어봐야 한다)')
          log(`  ${out.error ?? '(사유 없음)'}`)
          return 3
        }
        log(`임대 갱신 — ${out.expiresAt?.toISOString()} 까지`)
        return 0
      }

      if (sub === 'release') {
        const owner = stringFlag(args, 'owner')
        if (!owner) {
          log('--owner 가 필요하다')
          return 1
        }
        const out = await releaseCollectorLease({ name, ownerId: owner })
        log(out.ok ? '임대를 반납했다' : '반납할 임대가 없다 (이미 남의 것이거나 만료됐다)')
        return 0
      }

      /* status — ★DB 장부와 이 컴퓨터의 실제 프로세스를 나란히 찍는다★.
         둘이 어긋나는 것 자체가 정보다 (임대는 살아 있는데 프로세스가 0개 = 죽은 판) */

      /* ⚠ ★어느 DB 를 봤는지 먼저 찍는다★ (2026-09-04).
       *
       *   ★이 저장소는 「자를 잘못 댄」 사고를 여러 번 냈다★ —
       *   공개 API 를 보고 「겹침 0건」이라 보고했는데 DB 에는 43곳이 있었고,
       *   주석에서 색을 읽었는데 화면은 다른 색이었다.
       *
       *   임대도 똑같다. ★`DATABASE_URL` 없이 이 명령을 치면 로컬 DB 를 본다.★
       *   그런데 수집기는 ★운영 DB★ 의 임대를 쥔다. 그걸 모르고 로컬 장부를 보면
       *   ★「아무도 안 쥐고 있다」는 틀린 답★ 을 얻는다.
       *   ★그래서 어디를 봤는지 먼저 말한다.★ 비밀번호는 찍지 않는다 — 호스트만. */
      const rawUrl = process.env['DATABASE_URL'] ?? ''
      const host = /@([^/:]+)(?::(\d+))?/.exec(rawUrl)
      const where =
        rawUrl === ''
          ? '★DATABASE_URL 이 없다 — 기본값(로컬)을 본다★'
          : /(127\.0\.0\.1|localhost)/.test(rawUrl)
            ? `로컬 (${host?.[1] ?? '?'}:${host?.[2] ?? '?'})`
            : `★운영★ (${host?.[1] ?? '?'}:${host?.[2] ?? '?'})`
      log(`★어느 DB★  ${where}`)

      const holder = await readLease(name)
      log(`★DB 장부★  ${describeLease(holder)}`)
      const live = countLocalCollectors()
      log(
        live < 0
          ? '★이 컴퓨터★  못 셌다 (그건 「없다」가 아니다)'
          : `★이 컴퓨터★  실제로 도는 수집 프로세스 ★${live}개★`,
      )
      return 0
    }

    case 'barracks-collect': {
      /*
       * ★병영수첩을 사람 손 없이 긁는다★ (O-051 · D-268).
       *
       *   nexon barracks-collect --dry-run              ★요청 0건★ · 무엇을 받을지만 본다
       *   nexon barracks-collect --limit 10             10건 받아 본다 (안 넣는다)
       *   nexon barracks-collect --limit 10 --confirm   10건 받아 ★넣는다★
       *   nexon barracks-collect --limit 100 --confirm --health <주소>
       *
       * ⚠ ★`curl` 을 쓴다. Node fetch 는 403 이다★ (D-268 실측 · 같은 IP·같은 순간).
       * ⚠ ★첫 403 에서 즉시 멈춘다★ (D-266). 우회를 만들지 않는다.
       * ⚠ ★--health 를 주면 `checks.db` 만 본다★ — 최상위 status 는 지금도 degraded 라
       *   그걸 보면 ★수집이 시작하자마자 자기 때문에 물러난다★.
       */
      const dryRun = boolFlag(args, 'dry-run')
      const confirm = boolFlag(args, 'confirm')
      const limit = numberFlag(args, 'limit') ?? 10
      /* ★목록을 안 받으면 배틀로그는 언제나 0건이다★ — 운영의 BarracksClanMatchRaw 는 0행이었다 */
      const clans = numberFlag(args, 'clans') ?? 0
      /* ★클랜마다 목록을 몇 쪽 뒤로 넘기나★ — 기본 1 (새 것만). 과거를 채울 때만 크게 준다 */
      const listPages = numberFlag(args, 'list-pages') ?? 1
      /* ★어느 날짜에 닿으면 그만 넘기나★ (YYMMDD) — 쪽 수보다 이쪽이 맞다 */
      const listUntil = stringFlag(args, 'list-until') ?? undefined
      /* ★어느 기간의 배틀로그를 받을까★ — 안 주면 전 기간(최근 것부터) */
      const from = stringFlag(args, 'from') ?? undefined
      const to = stringFlag(args, 'to') ?? undefined
      /* ★어느 리그의 클랜 목록을 받나★ — 기본은 IPL. ★기본값에 기대지 말고 명시한다★ */
      const leagueSlug = stringFlag(args, 'league') ?? 'nolink'
      const delayMs = numberFlag(args, 'delay') ?? DEFAULT_DELAY_MS
      const healthUrl = stringFlag(args, 'health')
      const state = newGuardState()

      /* ══ ★★임대 없이는 돌지 않는다★★ (2026-09-04 · Pre-Part 0) ═══════════
       *
       *   자물쇠를 셸에만 두면 ★셸을 안 거치고 이 명령을 직접 치는 순간 뚫린다.★
       *   실제로 이 저장소에서 사람이 손으로 돌린 판과 예약 판이 겹친 적이 있다.
       *   그래서 ★일꾼 자신이 임대를 확인한다.★
       *
       *   ```
       *   --lease-owner <id>   셸이 잡아 준 임대를 쓴다 (평상시)
       *   --no-lease           ★자물쇠 없이 돈다★ — 사람이 그 순간 의도해야 한다
       *   둘 다 없으면          ★시작하지 않는다★ (코드 9)
       *   ```
       *
       *   ⚠ ★기본값을 「없으면 그냥 돈다」로 두지 마라.★ 그러면 자물쇠가 장식이 된다.
       */
      const leaseOwner = stringFlag(args, 'lease-owner')
      const noLease = boolFlag(args, 'no-lease')
      /* ★임대를 마지막으로 「확인」한 시각★ — 갱신된 순간이다.
         DB 가 안 닿는 동안 이 값이 안 움직이고, TTL 을 넘기면 안전하게 멈춘다 */
      const leaseTtlMs = (numberFlag(args, 'lease-ttl') ?? 1200) * 1000
      let leaseLastOkAt = Date.now()
      let leaseUnreachableSince: number | null = null
      if (!leaseOwner && !noLease) {
        /* ══ ★★「임대 미획득」은 「임대 상실」이 아니다★★ (2026-09-05 · 사장님 지시) ══
         *
         *   ★9 (임대 상실)★    쥐고 있던 것을 ★남에게 빼앗겼다★ — 남이 지금 돌고 있다
         *   ★10 (임대 미획득)★ ★애초에 못 잡은 채 불렸다★ — 남이 도는지는 ★모른다★
         *
         *   ⚠ 둘을 같은 코드로 내면 셸이 «남이 이미 수집 중이다» 라고 ★거짓말한다.★
         *     2026-09-05 01:03 에 실제로 그렇게 찍혔다 — 아무도 안 돌고 있었다.
         *     ★어제 고친 「상실 ≠ 연결실패」와 같은 종류의 잘못이다.★
         *
         *   ★막는 동작은 그대로다★ — 어느 쪽이든 수집은 시작하지 않는다. 말만 갈랐다.
         */
        log('★임대 미획득 — 수집을 시작하지 않는다★ (2026-09-05)')
        log('  셸이 부르는 경우: `collect-lease acquire` 로 잡고 --lease-owner <id> 를 넘겨라')
        log('  사람이 한 번 돌리는 경우: --no-lease 를 ★의도해서★ 붙여라')
        return 10
      }
      if (noLease) {
        log('⚠ ★자물쇠 없이 돈다 (--no-lease).★ 다른 판이 돌고 있지 않은지 사람이 책임진다')
      }
      if (leaseOwner) {
        /* ★시작 전에 한 번 갱신해 본다★ — 「가지고 있다고 믿는 것」과
           「실제로 쥐고 있는 것」은 다르다. 여기서 갈라야 요청이 한 건도 안 나간다 */
        const alive = await renewCollectorLease({ ownerId: leaseOwner })
        if (alive.outcome === 'lost') {
          log('★★임대 상실 — 시작하지 않는다★★')
          log(`  ${describeLease(await readLease())}`)
          return 9
        }
        if (alive.outcome === 'unreachable') {
          /* ★시작도 못 한 판이다.★ 여기서 9(상실)로 내면 셸이 판을 끝낸다 —
             단순히 DB 가 잠깐 안 닿은 것뿐인데. ★3(일시적)으로 낸다★ */
          log('★DB 연결 실패 — 임대 상태 확인 불가★ 이번 판은 시작하지 않는다 (다음 바퀴에 다시)')
          log(`  ${alive.error ?? '(사유 없음)'}`)
          return 3
        }
        log(`★임대 확인★ ${alive.expiresAt?.toISOString()} 까지`)
      }

      if (delayMs < MIN_DELAY_MS) {
        log(`★간격이 ${MIN_DELAY_MS}ms 아래다 (${delayMs}ms) — 그 아래로는 안 내린다★ (D-266)`)
        return 1
      }

      /* ★시작 전에 한 번 잰다★ — 확인 칸 ⑦ 이 「괜찮았다」가 아니라 ★숫자★ 를 요구한다.
         그리고 시작부터 무거우면 ★아예 시작하지 않는 것★ 이 맞다 */
      if (healthUrl) {
        const before = await checkLoad(healthUrl, state)
        log(`★부하(시작 전)★ ${guardLine(state)}`)
        if (before === 'stop') {
          log('★시작 전부터 무겁다 — 이번 판은 돌지 않는다★')
          /* ★차단이 아니라 무거운 것이다★ — 쉬었다 다시 걸어도 된다 (코드 3) */
          return 3
        }
      }

      const result = await collectBarracks({
        limit,
        clans,
        listPages,
        listUntil,
        from,
        to,
        leagueSlug,
        delayMs,
        dryRun,
        confirm,
        log,
        guard: healthUrl
          ? async () => {
              const verdict = await checkLoad(healthUrl, state)
              log(`  ${guardLine(state)}`)
              return verdict
            }
          : undefined,
        /* ★도는 동안 임대를 계속 갱신한다★ — 갱신이 곧 「나 아직 살아 있다」다.
         *
         * ══ ★DB 가 안 닿으면 어떻게 하나★ (2026-09-04 · O-055-1) ══
         *   ★바로 멈추지 않는다.★ 「모른다」는 「잃었다」가 아니다.
         *   다만 ★영원히 버티면 안 된다★ — 만료(TTL)를 넘기면 남이 진짜로 가져갈 수 있고,
         *   그때부터 계속 도는 것은 ★두 판★ 이다.
         *
         *   그래서 ★마지막으로 확인된 시각★ 을 들고 있다가, 그로부터 TTL 이 지나면
         *   ★안전한 쪽으로 멈춘다.★ 그 사이에 DB 가 살아나면 그대로 이어 간다.
         */
        keepLease: leaseOwner
          ? async () => {
              const out = await renewCollectorLease({ ownerId: leaseOwner, leaseMs: leaseTtlMs })
              if (out.outcome === 'renewed') {
                leaseLastOkAt = Date.now()
                if (leaseUnreachableSince !== null) {
                  log('★DB 가 돌아왔다 — 임대를 다시 확인했다★')
                  leaseUnreachableSince = null
                }
                return 'held'
              }
              if (out.outcome === 'lost') return 'lost'

              /* unreachable */
              if (leaseUnreachableSince === null) {
                leaseUnreachableSince = Date.now()
                log('★DB 연결 실패 — 임대 상태 확인 불가★ (잃은 것이 아니다. 계속 돌면서 다시 물어본다)')
                log(`  ${out.error ?? '(사유 없음)'}`)
              }
              const blind = Date.now() - leaseLastOkAt
              if (blind >= leaseTtlMs) {
                log(
                  `★${Math.round(blind / 1000)}초째 임대를 확인하지 못했다 — 만료(${Math.round(leaseTtlMs / 1000)}초)를 넘겼다.` +
                    ' 안전하게 멈춘다★',
                )
                return 'lost'
              }
              return 'unknown'
            }
          : undefined,
      })

      if (healthUrl) {
        await checkLoad(healthUrl, state)
        log(`\n★부하(끝난 뒤)★ ${guardLine(state)}`)
      }
      /*
       * ── ★★멈춘 이유마다 다른 코드를 낸다★★ (2026-09-04)
       *
       * 전에는 ★정상이 아니면 전부 1★ 이었다. 그래서 밤샘 판이 —
       * ★순간 끊김 한 번(health)★ 을 ★차단(403)★ 과 똑같이 보고 ★밤 전체를 끝냈다.★
       * ★그 둘은 정반대로 다뤄야 한다.★
       * ```
       * 0  done · limit    다 했다 → 다음 판
       * 2  ★blocked★      403·429 다 → ★절대 다시 걸지 않는다★ (D-266)
       * 3  health · error  사이트가 무겁거나 끊겼다 → ★쉬었다 다시 걸어도 된다★
       * ```
       */
      if (result.stop === 'done' || result.stop === 'limit') return 0
      if (result.stop === 'blocked') return 2
      /* ★임대를 잃은 것은 실패가 아니다★ — 「남이 돌고 있어서 물러났다」는 정상 동작이다.
         3(무거움)으로 돌려주면 셸이 ★다음 바퀴에 다시 걸어★ 두 판이 계속 다툰다 */
      if (result.stop === 'lease_lost') return 9
      return 3
    }

    case 'barracks-link': {
      /*
        배틀로그 계정 ↔ ouid 를 잇는다 (D-221).
        `/id` 로 받은 ouid 를 `user/basic` 으로 **되돌려 확인**한 것만 잇는다 —
        옛 닉으로 부르면 그 닉을 물려받은 남이 붙기 때문이다.
      */
      const result = await runBarracksLink(ctx, { limit: numberFlag(args, 'limit') ?? 300 })
      table([result as unknown as Record<string, unknown>])
      return 0
    }

    case 'identity-watch': {
      /*
        닉·클랜이 바뀌는 순간을 잡는다 (D-220).
        `--loop` 를 주면 계속 돈다. `--rps` 로 속도를 올릴 수 있다 (429 가 나면 스스로 감속한다).
        ⚠ **위장닉은 이 경로로 못 잡는다** — Open API 가 모른다 (D-221).
      */
      const limit = numberFlag(args, 'limit') ?? 200
      const loop = boolFlag(args, 'loop')
      const everySec = numberFlag(args, 'every') ?? 120

      for (;;) {
        const result = await runIdentityWatch(ctx, { limit })
        table([result as unknown as Record<string, unknown>])
        if (!loop) return 0
        log(`${everySec}초 뒤 다시 돈다 (--loop)`)
        await new Promise((resolve) => setTimeout(resolve, everySec * 1000))
      }
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

      /* 라인업 보조 증거 (D-133). 경로를 안 주면 기본 스냅샷을 쓴다 */
      const lineupFlag = args.flags.get('lineup-evidence')
      const lineupPath =
        typeof lineupFlag === 'string'
          ? lineupFlag
          : lineupFlag === true
            ? join(process.cwd(), '..', '..', 'packages/db/data/supply-official-matches.json')
            : null
      const lineupSnapshot = lineupPath ? JSON.parse(readFileSync(lineupPath, 'utf8')) : null
      if (lineupSnapshot) {
        log(`라인업 보조 증거 사용 — 경기 ${lineupSnapshot.matches.length}건 (팀 식별에만 쓴다)`)
      }

      const result = await runReconstruct(ctx, {
        leagueSlug: stringFlag(args, 'league'),
        allowMockLeague: boolFlag(args, 'allow-mock-league'),
        // 기본은 **운영자가 확인한 로스터만** 인정한다
        requireVerifiedRoster: !boolFlag(args, 'allow-unverified-roster'),
        redo: boolFlag(args, 'redo'),
        sourceMatchIds,
        lineupSnapshot,
      })
      table([
        {
          considered: result.considered,
          projected: result.projected,
          incomplete: result.incomplete,
          '보조증거 사용': result.sideEvidenceUsed,
          '보조증거 충돌': result.sideEvidenceConflicts,
          '검증 불가': result.sideEvidenceUnverifiable,
        },
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
      /*
        `--origins` 는 계산 범위를 바꾼다 (`rate.ts` 의 `matchScope`).

        기본은 `origin='nexon'` 이라 **IPL(`nexon_barracks`)이 통째로 빠진다.**
        그래서 창을 열어 두되, `rate.ts` 의 가드는 **풀지 않는다** —
        `matchScope` 는 `--dry-run` 에서만 쓸 수 있고, 아니면 그쪽이 거부한다.
        원본 점수를 덮어쓰는 일이 있어서는 안 되기 때문이다 (`CLAUDE.md` 3-A 2번).

        받아 적는 경로는 따로 있다: `season0` 이 dry-run 으로 계산하고
        `season0Apply` 가 백업을 뜬 뒤 받아 적는다 (D-172).
      */
      const originsFlag = stringFlag(args, 'origins')
      const origins = originsFlag
        ?.split(',')
        .map((value) => value.trim())
        .filter((value) => value !== '')
      const result = await runRate(ctx, {
        leagueSlug,
        /*
         * ★배치고사 지뢰를 밟지 않는다★ (2026-09-03 · O-036).
         *
         * ══ 무엇이 문제였나 ══
         *
         * `runRate` 는 상수를 안 주면 `DEFAULT_RATING_CONSTANTS` 를 쓴다 (`rate.ts` 196행).
         * 거기 `placementMatches` 는 **옛 방식 10경기**다. 그리고 `rate.ts` 는 그 값으로
         * `placement: played < 10` 을 **DB 에 그대로 쓴다** (930·962행).
         *
         * 그런데 **배치고사는 2026-09-01 에 폐지됐다** (사장님 지시 · `CLAUDE.md` 5장).
         * 운영에서 실제로 도는 `season0Apply` 는 `V2_RATING_CONSTANTS`(0경기)를 쓴다.
         * **두 경로가 서로 다른 규칙으로 같은 칸을 쓰고 있었다.**
         *
         * ══ 왜 지금 고치나 — 지금 아무도 안 부르는 게 아니다 ══
         *
         * 워크플로에서 부르는 곳은 **0곳**이다. 그런데 **사람이 부르는 길이 열려 있다** —
         * ```
         * package.json                     "nexon:rate": "… worker nexon rate"
         * docs/PRODUCTION_READINESS.md 315  6. 래더  pnpm nexon:rate --league supply
         * docs/GO_LIVE_CHECKLIST.md    422  … `nexon rate --league supply` 로 재replay
         * ```
         * **공개 전 절차서 둘이 이 명령을 시킨다.** 그대로 따르면 9판 이하 선수가
         * 전부 `placement=true` 로 되돌아가 **랭킹에서 사라진다.**
         *
         * ══ 무엇을 바꿨나 ══
         *
         * **`DEFAULT_RATING_CONSTANTS` 는 안 건드렸다.** 상수 파일이
         * *「옛 방식(10경기)을 그대로 둔다 … `DEFAULT` 를 바꾸면 IPL 클랜 집계까지
         * 같이 움직인다」*고 일부러 적어 두었다. 그 뜻을 지킨다.
         *
         * 바꾼 것은 **이 명령이 무엇을 고르는가** 하나다 — 운영이 쓰는 것과 같은 것을 고른다.
         */
        constants: V2_RATING_CONSTANTS,
        seasonNumber: numberFlag(args, 'season'),
        allowMockLeague: boolFlag(args, 'allow-mock-league'),
        ...(origins?.length
          ? {
              matchScope: {
                origins,
                ...(stringFlag(args, 'from') ? { from: new Date(stringFlag(args, 'from') as string) } : {}),
                ...(stringFlag(args, 'to') ? { to: new Date(stringFlag(args, 'to') as string) } : {}),
              },
            }
          : {}),
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

    case 'rating-backup': {
      const leagueSlug = stringFlag(args, 'league')
      if (!leagueSlug) {
        fail('--league <slug> 가 필요하다')
        return 1
      }
      const stamp = stringFlag(args, 'stamp') ?? new Date().toISOString().replace(/[:.]/g, '-')
      /* 기본은 v2(줄 단위 스트리밍)다. v1 은 sanply(202만 행)에서 죽는다 —
         findMany 가 한 번에 다 읽고 JSON.stringify 가 통짜 문자열을 만든다.
         `--legacy-json` 으로 옛 방식을 그대로 부를 수 있다 (CLAUDE.md 10-4) */
      if (boolFlag(args, 'legacy-json')) {
        const made = await createRatingSnapshot({ leagueSlug, stamp })
        if (!made) return 1
        table([
          {
            파일: made.path,
            선수: made.snapshot.counts.leaguePlayers,
            클랜: made.snapshot.counts.leagueClans,
            경기스탯: made.snapshot.counts.matchPlayerStats,
            경기: made.snapshot.counts.matches,
            checksum: made.snapshot.checksum,
          },
        ])
        return 0
      }
      const made = await createRatingSnapshotStream({ leagueSlug, stamp })
      if (!made) return 1
      table([
        {
          파일: made.path,
          선수: made.header.counts.leaguePlayers,
          클랜: made.header.counts.leagueClans,
          경기스탯: made.header.counts.matchPlayerStats,
          경기: made.header.counts.matches,
          checksum: made.checksum,
        },
      ])
      return 0
    }

    /**
     * 수집 감시 (2026-09-02 · 지시 #18). 판정·문구·전이는 `jobs/collectWatchdog.ts`.
     *
     *   nexon collect-watchdog --dry-run                         운영 숫자를 읽어 지금 상태만 찍는다
     *   nexon collect-watchdog --fixture 숫자.json --stale-min supply=1,sanply=1
     *                                                            접속 없이 「일부러 실패」 문구를 본다
     *   nexon collect-watchdog --state .watchdog/state.json      실제 (바뀐 것만 웹훅으로)
     *
     * 웹훅 주소는 `DISCORD_WEBHOOK_URL` 환경변수로만 받고 마스킹한다. 전송에 실패하면 상태를 남기지 않는다 —
     * 다음 실행이 같은 전이를 다시 시도하게 하려는 것이다.
     */
    case 'collect-watchdog': {
      const dryRun = boolFlag(args, 'dry-run')
      const statePath = stringFlag(args, 'state') ?? join(REPO_ROOT, '.watchdog', 'state.json')
      const fixturePath = stringFlag(args, 'fixture')
      const leagues = (stringFlag(args, 'leagues') ?? 'supply,sanply,nolink')
        .split(',')
        .map((slug) => slug.trim())
        .filter((slug) => slug !== '')

      let staleMin: Record<string, number>
      try {
        staleMin = parseStaleMin(stringFlag(args, 'stale-min'))
      } catch (error) {
        fail(String((error as Error).message))
        return 1
      }
      const thresholds: WatchThresholds = {
        ...WATCHDOG_DEFAULT_THRESHOLDS,
        leagueStaleMin: { ...WATCHDOG_DEFAULT_THRESHOLDS.leagueStaleMin, ...staleMin },
        ingestStaleMin: numberFlag(args, 'ingest-stale-min') ?? WATCHDOG_DEFAULT_THRESHOLDS.ingestStaleMin,
        ingestAlert: boolFlag(args, 'ingest-alert'),
        applyMaxHours: numberFlag(args, 'apply-max-hours') ?? WATCHDOG_DEFAULT_THRESHOLDS.applyMaxHours,
        failStreak: numberFlag(args, 'fail-streak') ?? WATCHDOG_DEFAULT_THRESHOLDS.failStreak,
      }

      const webhook = process.env.DISCORD_WEBHOOK_URL?.trim() || null
      registerSecret(webhook)

      let numbers: WatchNumbers
      if (fixturePath !== null) {
        numbers = JSON.parse(readFileSync(fixturePath, 'utf8')) as WatchNumbers
        log(`fixture ${fixturePath} 의 숫자로 판정한다 — DB·GitHub 를 읽지 않는다`)
      } else {
        const repo = stringFlag(args, 'repo') ?? process.env.GITHUB_REPOSITORY ?? null
        const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN ?? null
        registerSecret(token)
        numbers = await readWatchNumbers({ leagues, repo, token })
      }
      /* fixture 면 그 파일의 「지금」으로 판정한다 — 그래야 문구가 결정적이다 */
      const at = new Date(numbers.now)
      const checks = evaluateWatch(numbers, thresholds)
      log(formatWatchReport(checks, at))

      const prev = await loadWatchState(statePath)
      const { next, events } = transitionWatch(prev, checks, at)
      const message = formatWatchMessage(events, checks, at, boolFlag(args, 'force-notify'))
      if (message === null) {
        log(`바뀐 것 없음 — 보내지 않는다 (지난 판정 ${prev === null ? '없음' : `있음 · ${prev.updatedAt}`})`)
      } else {
        log('--- 보낼 문구 ---')
        log(message)
        log('---')
        if (dryRun) {
          log('--dry-run — 보내지 않고 상태도 남기지 않는다')
        } else if (webhook === null) {
          warn('DISCORD_WEBHOOK_URL 이 없다 — 문구만 찍었다')
        } else {
          const sent = await sendDiscord(webhook, message)
          if (!sent.ok) {
            fail(`디스코드 전송 실패 HTTP ${sent.status} — 상태를 남기지 않는다. 다음 실행이 다시 보낸다`)
            return 1
          }
          log(`디스코드로 보냈다 (HTTP ${sent.status})`)
        }
      }
      if (!dryRun) {
        await saveWatchState(statePath, next)
        log(`판정을 남겼다 → ${statePath}`)
      }
      return 0
    }

    case 'db-snapshot': {
      const stamp = stringFlag(args, 'stamp') ?? new Date().toISOString()
      const snapshot = await takeDbSnapshot(stamp)
      log(formatSnapshot(snapshot))
      const failed = snapshot.integrity.filter((row) => !row.pass)
      if (failed.length > 0) {
        fail(`무결성 검사 ${failed.length}건 실패`)
        return 1
      }
      return 0
    }

    /**
     * 증분 동기화 신선도 (D-225).
     *
     *   nexon sync-freshness --leagues supply,daerule,sanply
     *   nexon sync-freshness --max-age sanply=6 --max-age supply=12
     *
     * `--warn-only` 는 판정을 찍되 **잡을 실패시키지 않는다.** 임계값을 새로 재는
     * 동안 쓰는 값이다 — 평상시에는 붙이지 않는다. 조용히 넘기는 검사는 검사가 아니다.
     */
    case 'sync-freshness': {
      /* `nolink`(IPL)은 **판정하지 않고 보여 주기만** 한다 — 자동 수집이 없어서
         낡아 있는 것이 정상이다 (`jobs/syncFreshness.ts` 의 `SYNC_FRESHNESS_REPORT_ONLY`) */
      const leagues = (stringFlag(args, 'leagues') ?? 'supply,daerule,sanply,nolink')
        .split(',')
        .map((slug) => slug.trim())
        .filter((slug) => slug !== '')
      if (leagues.length === 0) {
        fail('--leagues 가 비었다')
        return 1
      }

      /* `--max-age sanply=6,supply=12` — 쉼표로 잇는다. 준 리그만 기본값을 덮는다.
         (플래그는 Map 이라 같은 이름을 두 번 주면 뒤엣것이 앞엣것을 지운다) */
      const overrides: Record<string, number> = {}
      const pairs = (stringFlag(args, 'max-age') ?? '')
        .split(',')
        .map((pair) => pair.trim())
        .filter((pair) => pair !== '')
      for (const pair of pairs) {
        const [slug, hours] = pair.split('=')
        const value = Number(hours)
        if (slug === undefined || slug === '' || !Number.isFinite(value) || value <= 0) {
          fail(`--max-age 는 <slug>=<시간> 형식이다: ${pair}`)
          return 1
        }
        overrides[slug] = value
      }

      const rows = await checkSyncFreshness({ leagues, maxAgeHours: overrides })
      log(formatSyncFreshness(rows))

      const stale = rows.filter((row) => !row.pass)
      if (stale.length === 0) {
        log('신선도 이상 없음')
        return 0
      }
      for (const row of stale) {
        const detail = row.found
          ? `최신 경기가 ${row.ageHours?.toFixed(1)}시간 전이다 (임계 ${row.maxAgeHours}시간)`
          : '리그를 찾지 못했다'
        fail(`[${row.league}] ${detail}`)
      }
      if (boolFlag(args, 'warn-only')) {
        log('--warn-only — 판정만 찍고 잡은 실패시키지 않는다')
        return 0
      }
      return 1
    }

    case 'rating-restore': {
      const path = stringFlag(args, 'file')
      if (!path) {
        fail('--file <경로> 가 필요하다')
        return 1
      }
      /* v1(통짜 JSON) · v2(JSONL) 를 파일 첫 줄로 스스로 가른다 */
      const result = await restoreRatingSnapshotAuto({ path, dryRun: ctx.dryRun })
      table([result.restored])
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

    /* 시즌0(테스트 시즌) 마감 — 지난시즌 카드를 굳힌다 (D-175) */
    case 'season0-finish': {
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
      const wantsOpen = boolFlag(args, 'open')
      const openNumber = numberFlag(args, 'number')
      if (wantsOpen && openNumber === null) {
        fail(
          '--open 에는 --number N 이 필요하다. ' +
            '이관된 시즌 1~7 이 이미 있어 "시즌1" 의 번호를 우리가 정할 수 없다 (D-175 [미확인])',
        )
        return 1
      }
      /* 기본은 미리보기다. `--confirm` 이 있어야 쓴다 */
      const confirmed = boolFlag(args, 'confirm')
      const result = await runSeason0Close(
        { ...ctx, dryRun: !confirmed },
        {
          leagueSlug,
          endedAt: when,
          open: wantsOpen
            ? {
                number: openNumber!,
                startedAt: when,
                skipPromotion: boolFlag(args, 'no-promotion'),
              }
            : undefined,
        },
      )
      if (!result.ok) {
        fail(result.reason)
        return 1
      }
      table([
        {
          '닫은 시즌': result.closedSeason ?? '-',
          '개인 카드': result.playerCards,
          '점수 있는 카드': result.playerCardsWithRating,
          '클랜 카드': result.clanCards,
          '시작시각 보정': result.alignedStartedAt ?? '-',
          '연 시즌': result.openedSeason ?? '-',
        },
      ])
      if (!confirmed) log('미리보기다. 아무것도 쓰지 않았다. 적용하려면 --confirm')
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

    case 'accounts': {
      if (boolFlag(args, 'rotate-shared')) {
        const before = await countSharedPasswordAccounts()
        if (dryRun) {
          log(`[dry-run] 공용 비밀번호 계정 ${before.total}건 (관리자 ${before.admins}건) — 바꾸지 않았다`)
          return 0
        }
        const result = await rotateSharedDevPasswords()
        const after = await countSharedPasswordAccounts()
        table([
          {
            검사: result.scanned,
            무효화: result.rotated,
            '그중 관리자': result.rotatedAdmins,
            유지: result.untouched,
            '남은 공용비번': after.total,
          },
        ])
        // 새 값은 아무도 모르는 무작위다. 원문은 어디에도 남기지 않는다 (D-119)
        log('무효화된 계정은 로그인할 수 없다. 새 비밀번호는 생성되지 않았다.')
        return after.total === 0 ? 0 : 1
      }

      if (boolFlag(args, 'audit')) {
        const found = await countSharedPasswordAccounts()
        table([{ '공용 비밀번호 계정': found.total, '그중 관리자': found.admins }])
        return found.total === 0 ? 0 : 1
      }

      if (boolFlag(args, 'provision-test')) {
        const email = stringFlag(args, 'email')
        if (!email) {
          fail('--email <주소> 가 필요하다')
          return 1
        }
        const result = await provisionTestAccount({
          email,
          nickname: stringFlag(args, 'nickname') ?? '검수계정',
          admin: boolFlag(args, 'admin'),
        })
        if (!result.ok) {
          fail(result.reason)
          fail(`예: ${TEST_ACCOUNT_PASSWORD_ENV}='...' pnpm nexon:accounts --provision-test --email ...`)
          return 1
        }
        log(
          `검수 계정 ${result.created ? '생성' : '갱신'} — ${result.email} ` +
            `(권한 ${result.role === 2 ? '운영자' : '일반'})`,
        )
        return 0
      }

      const found = await countSharedPasswordAccounts()
      table([{ '공용 비밀번호 계정': found.total, '그중 관리자': found.admins }])
      log('--rotate-shared 로 무효화한다')
      return 0
    }

    case 'supply-clans': {
      /* CLI는 `apps/worker`에서 실행되므로 저장소 루트 기준 경로로 풀어 준다 */
      const file =
        stringFlag(args, 'file') ??
        join(process.cwd(), '..', '..', 'packages/db/data/supply-official-clans.json')
      const snapshot = JSON.parse(readFileSync(file, 'utf8'))
      log(
        `스냅샷 ${snapshot.source} (${snapshot.capturedAt}) — 확인된 ${snapshot.capturedCount}개 / ` +
          `원본 표기 ${snapshot.officialTotalReported}개`,
      )
      const result = await importSupplyOfficialClans({
        snapshot,
        leagueSlug: stringFlag(args, 'league') ?? 'supply',
        confirm: boolFlag(args, 'confirm'),
      })
      table([
        {
          대상: result.rows,
          '클랜 생성': result.clansCreated,
          '클랜 갱신': result.clansUpdated,
          'slug 변경': result.slugRenamed.length,
          '별칭 보존': result.aliasesKept,
          '리그참가 생성': result.leagueClansCreated,
          '마크 반영': result.marksSet,
        },
      ])
      for (const r of result.slugRenamed.slice(0, 20)) log(`  slug ${r.from} → ${r.to}`)
      for (const s of result.skipped) fail(`  건너뜀 ${s.slug}: ${s.reason}`)
      if (!boolFlag(args, 'confirm')) log('미리보기다. 실제로 쓰려면 --confirm 을 붙인다')
      return 0
    }

    case 'supply-matches': {
      /* CLI는 `apps/worker`에서 실행되므로 저장소 루트 기준 경로로 풀어 준다 */
      const file =
        stringFlag(args, 'file') ??
        join(process.cwd(), '..', '..', 'packages/db/data/supply-official-matches.json')

      if (boolFlag(args, 'status')) {
        table([await supplyMatchesStatus(file)])
        return 0
      }

      const parseAt = (name: string): Date | null => {
        const value = stringFlag(args, name)
        if (!value) return null
        const at = new Date(value)
        if (Number.isNaN(at.getTime())) {
          fail(`--${name} 값을 날짜로 읽을 수 없다: ${value}`)
          throw new Error('bad-date')
        }
        return at
      }

      const result = await runSupplyMatches(ctx, {
        snapshotPath: file,
        since: parseAt('since'),
        until: parseAt('until'),
        map: stringFlag(args, 'map'),
        playerCount: numberFlag(args, 'player-count'),
        confirm: boolFlag(args, 'confirm'),
        discoverOnly: boolFlag(args, 'discover-only'),
        detailLimit: numberFlag(args, 'detail-limit'),
      })
      table([result as unknown as Record<string, unknown>])
      if (!boolFlag(args, 'confirm')) log('미리보기다. 실제로 수집하려면 --confirm 을 붙인다')
      return 0
    }

    case 'supply-rosters': {
      const file =
        stringFlag(args, 'file') ??
        join(process.cwd(), '..', '..', 'packages/db/data/supply-official-matches.json')
      const membership = readCurrentMembership(file)
      log(
        `현재 소속 도출 — 선수 ${membership.rows.length}명 · 근거 갈림 ${membership.conflicts.length}명 ` +
          `(관측 ${membership.capturedAt})`,
      )
      const result = await runSupplyRosters({
        membership,
        leagueSlug: stringFlag(args, 'league') ?? 'supply',
        confirm: boolFlag(args, 'confirm'),
        verified: !boolFlag(args, 'no-verified'),
      })
      table([
        {
          클랜: result.clans,
          관측선수: result.observedPlayers,
          '근거 갈림': result.conflicts,
          '선수 생성': result.playersCreated,
          '소속 신규': result.membershipsOpened,
          '소속 유지': result.membershipsUnchanged,
          '소속 종료': result.membershipsClosed,
          이적: result.transfers,
          '현재클랜 갱신': result.currentClanUpdated,
        },
      ])
      for (const per of result.perClan) {
        if (per.status !== 'ok') fail(`  ${per.slug}: ${per.status} — ${per.note}`)
      }
      if (!boolFlag(args, 'confirm')) log('미리보기다. 실제로 쓰려면 --confirm 을 붙인다')
      return 0
    }

    case 'supply-players': {
      const file =
        stringFlag(args, 'file') ??
        join(process.cwd(), '..', '..', 'packages/db/data/supply-official-matches.json')
      const snapshot = JSON.parse(readFileSync(file, 'utf8'))
      const confirm = boolFlag(args, 'confirm')
      const result = await linkSupplyPlayerIds({
        snapshot,
        leagueSlug: stringFlag(args, 'league') ?? 'supply',
        confirm,
      })
      table([
        {
          '대조 경기': result.matchesScanned,
          '닉네임 중복으로 제외': result.matchesSkippedDuplicateNickname,
          '참가 기록': result.statsScanned,
          연결: result.linked,
          '이미 연결': result.alreadyLinked,
          '빈 행 비켜줌': result.placeholdersReleased,
          충돌: result.conflicts.length,
          '근거 없음': result.noEvidence,
        },
      ])
      for (const c of result.conflicts.slice(0, 10)) {
        fail(`  충돌 ${c.playerName}: 기존 ${c.existing} ≠ 새 근거 ${c.incoming}`)
      }

      if (boolFlag(args, 'cleanup')) {
        const cleaned = await cleanupDuplicateSupplyPlayers({ confirm })
        table([
          {
            '중복 후보': cleaned.candidates,
            제거: cleaned.removed,
            '기록이 있어 보존': cleaned.keptBecauseReferenced,
          },
        ])
      }

      if (!confirm) log('미리보기다. 실제로 쓰려면 --confirm 을 붙인다')
      return 0
    }

    case 'supply-push': {
      /* D-156 — 로컬에 적재한 미러 결과를 운영으로 대량 전송한다.
         운영에 직접 적재하면 왕복 때문에 12.8만 경기가 4시간이다. */
      const targetUrl = process.env['SUPPLY_PUSH_TARGET_URL'] ?? ''
      if (targetUrl === '') {
        warn('SUPPLY_PUSH_TARGET_URL 이 없다 — 옮길 대상을 알 수 없다')
        return 1
      }
      const rows = await runSupplyPush(ctx, {
        targetUrl,
        leagueSlug: stringFlag(args, 'league') ?? undefined,
      })
      if (rows.length > 0) table(rows as unknown as Record<string, unknown>[])
      return 0
    }

    case 'supply-mirror': {
      /* D-153 — 3rd.supply 시즌7 미러링 수집.
         커서를 끝까지 따라가고, 경기마다 상세를 받아 K/D/A·딜량·헤드샷·
         경기 당시 선수별 래더까지 가져온다. 받은 응답은 **그대로** 파일에 쌓는다.
         중단 후 재개 가능하고, 다시 돌리면 새 경기만 받는다(증분 동기화). */
      const leagueSlug = stringFlag(args, 'league') ?? 'supply'
      /* 리그마다 **파일을 따로** 쓴다. 한 파일에 섞으면 어느 리그 경기인지
         나중에 가릴 수 없고, 체크포인트도 서로를 덮어쓴다.

         `--file` 은 **저장소 루트 기준**으로 푼다. 이 CLI 는 `apps/worker` 에서 도는데
         사람은 루트 기준으로 경로를 적는다. 그대로 두면 `apps/worker/packages/db/...`
         같은 엉뚱한 자리에 새 파일이 생기고, 기존 체크포인트를 못 찾아 처음부터 다시 받는다.
         실제로 그렇게 24MB 를 헛수집했다. */
      const repoRoot = join(process.cwd(), '..', '..')
      const fileFlag = stringFlag(args, 'file')
      const file = fileFlag
        ? isAbsolute(fileFlag)
          ? fileFlag
          : join(repoRoot, fileFlag)
        : join(repoRoot, `packages/db/data/supply-mirror-${leagueSlug}.json`)
      const result = await runSupplyMirror(ctx, {
        leagueSlug,
        leagueId: numberFlag(args, 'league-id') ?? undefined,
        floor: stringFlag(args, 'floor') ?? '2026-06-01',
        file,
        limit: numberFlag(args, 'limit') ?? undefined,
        /* `--incremental` — 새 경기만 훑는다. 주기 실행에 쓴다 */
        incremental: boolFlag(args, 'incremental'),
        /* `--seen-from-db` — "이미 받은 것" 을 DB 에서 읽는다.
           JSONL 이 없는 빈 작업공간(GitHub Actions)에서 증분을 돌릴 때 쓴다 */
        seenFromDb: boolFlag(args, 'seen-from-db'),
        /* `--adaptive` — 활동량이 있는 클랜만 훑는다 (`supplyPollingPolicy.ts`) */
        adaptive: boolFlag(args, 'adaptive'),
      })
      table([
        {
          클랜: result.clans,
          '훑은 클랜': result.clansScanned,
          '경기 목록': result.matches,
          '경기 상세': result.details,
          '이번에 추가': `목록 +${result.newMatches} · 상세 +${result.newDetails}`,
          요청: result.requests,
          실패: result.failures,
        },
      ])
      if (result.selection) {
        table([
          {
            사이클: result.selection.cycleIndex,
            hot: `${result.selection.byTier.hot.due}/${result.selection.byTier.hot.total}`,
            warm: `${result.selection.byTier.warm.due}/${result.selection.byTier.warm.total}`,
            cold: `${result.selection.byTier.cold.due}/${result.selection.byTier.cold.total}`,
            dormant: `${result.selection.byTier.dormant.due}/${result.selection.byTier.dormant.total}`,
            미룸: result.selection.deferred,
            하한채움: result.selection.toppedUp,
          },
        ])
      }
      log(`  파일 ${result.file} (+ .matches.jsonl / .details.jsonl)`)
      return 0
    }

    case 'supply-seasons': {
      /* D-166 — 3rd.supply 지난시즌 카드 수집. **경기는 받지 않는다.**
         `--file` 은 다른 supply 잡과 같은 규칙으로 저장소 루트 기준으로 푼다. */
      const leagueSlug = stringFlag(args, 'league') ?? 'supply'
      const repoRoot = join(process.cwd(), '..', '..')
      const fileFlag = stringFlag(args, 'file')
      const file = fileFlag
        ? isAbsolute(fileFlag)
          ? fileFlag
          : join(repoRoot, fileFlag)
        : join(repoRoot, `packages/db/data/supply-seasons-${leagueSlug}.json`)

      const result = await runSupplySeasons(ctx, {
        leagueSlug,
        file,
        limit: numberFlag(args, 'limit') ?? undefined,
      })
      table([
        {
          리그: result.leagueSlug,
          대상: result.targets,
          '이미 받음': result.alreadyDone,
          '이번 색인': result.newRefs,
          '이번 수집': result.newCards,
          '카드 있는 선수': result.playersWithSeasons,
          '시즌 줄': result.seasonRows,
          실패: result.failures,
        },
      ])
      log(`  파일 ${result.file} (+ .leagueplayers.jsonl / .seasons.jsonl)`)
      return 0
    }

    case 'supply-player-profiles': {
      /* D-161 — 선수 프로필(position · note · renewed_at) 수집.
         리그를 받지 않는다. 세 값은 **리그와 무관한 전역 값**이다 (실측 2026-08-28). */
      const repoRoot = join(process.cwd(), '..', '..')
      const fileFlag = stringFlag(args, 'file')
      const file = fileFlag
        ? isAbsolute(fileFlag)
          ? fileFlag
          : join(repoRoot, fileFlag)
        : join(repoRoot, 'packages/db/data/supply-player-profiles.json')

      const result = await runSupplyPlayerProfiles(ctx, {
        file,
        limit: numberFlag(args, 'limit') ?? undefined,
      })
      table([
        {
          대상: result.targets,
          '이미 받음': result.alreadyDone,
          '이번 수집': result.newRows,
          '받은 선수': result.collected,
          '포지션 있음': result.withPosition,
          '메모 있음': result.withNote,
          실패: result.failures,
        },
      ])
      table(
        Object.entries(result.positionCodes)
          .sort((a, b) => Number(a[0]) - Number(b[0]))
          .map(([code, count]) => ({ '포지션 코드': code, 인원: count })),
      )
      log(`  파일 ${supplyPlayerProfilesPaths.rowsPath(result.file)}`)
      return 0
    }

    case 'supply-player-profiles-import': {
      /* D-161 — 수집 파일 → Player.position / note / renewedAt. 네트워크를 쓰지 않는다.
         기본은 미리보기이고 `--confirm` 이 있어야만 쓴다. */
      const repoRoot = join(process.cwd(), '..', '..')
      const fileFlag = stringFlag(args, 'file')
      const base = fileFlag
        ? isAbsolute(fileFlag)
          ? fileFlag
          : join(repoRoot, fileFlag)
        : join(repoRoot, 'packages/db/data/supply-player-profiles.json')
      const rows = supplyPlayerProfilesPaths.rowsPath(base)

      const counted = await countProfiles(rows)
      const imported = await runSupplyPlayerProfilesImport({
        file: rows,
        confirm: boolFlag(args, 'confirm'),
        limit: numberFlag(args, 'limit'),
      })
      table([
        {
          '파일 선수': counted.collected,
          '포지션 코드 있음': counted.withPosition,
          '메모 있음': counted.withNote,
          'DB 와 연결': imported.matched,
          'DB 에 없음': imported.unknownPlayers,
          '값 변경': imported.updated,
          '이미 같음': imported.unchanged,
          '포지션 채움': imported.positionSet,
          '표기 모르는 코드': imported.positionUnknownCode,
          '메모 채움': imported.noteSet,
          '갱신시각 채움': imported.renewedAtSet,
          '빈 줄(404)': imported.emptyRows,
        },
      ])
      /* D-162 — 닉네임·소속은 사용자가 화면에서 지적한 결함이라 따로 낸다 */
      table([
        {
          '닉네임 변경': imported.namesChanged,
          '프로필이 클랜 알려줌': imported.clanGiven,
          '소속 채움': imported.clanSet,
          '소속 그대로': imported.clanUnchanged,
          '프로필에 클랜 없음': imported.clanLeftToFallback,
          '클랜 생성': imported.clansCreated,
          '클랜 입양': imported.clansAdopted,
          '마크 채움': imported.clansMarkFilled,
        },
      ])
      if (imported.nameChangeSamples.length > 0) {
        /* 표본은 사람이 **원본과 대조**하라고 내는 것이다. 숫자만 믿지 않는다 (3-A 6번) */
        log('닉네임이 바뀐 선수 표본 — 원본과 대조해라')
        table(
          imported.nameChangeSamples.map((s) => ({
            '원본 player id': s.playerId,
            '우리 이름(전)': s.before,
            '원본 이름(후)': s.after,
            원본: `https://3rd.supply/player/${s.playerId}`,
          })),
        )
      }
      const unknown = Object.entries(imported.unknownCodeSamples).sort(
        (a, b) => Number(a[0]) - Number(b[0]),
      )
      if (unknown.length > 0) {
        /* 지어내지 않는다. 사람이 원본에서 확인할 수 있게 **대표 선수**를 함께 낸다 */
        warn('표기를 모르는 포지션 코드가 있다 — 원본 화면에서 확인해 SUPPLY_POSITION_LABELS 에 넣어라')
        table(
          unknown.map(([code, s]) => ({
            '포지션 코드': code,
            인원: s.count,
            '확인용 선수': `https://3rd.supply/player/${s.samplePlayerId}`,
          })),
        )
      }
      return 0
    }

    case 'supply-seasons-import': {
      /* D-166 — 수집 파일 → LeaguePlayerSeason. 네트워크를 쓰지 않는다.
         기본은 미리보기이고 `--confirm` 이 있어야만 쓴다. */
      const leagueSlug = stringFlag(args, 'league') ?? 'supply'
      const repoRoot = join(process.cwd(), '..', '..')
      const fileFlag = stringFlag(args, 'file')
      const base = fileFlag
        ? isAbsolute(fileFlag)
          ? fileFlag
          : join(repoRoot, fileFlag)
        : join(repoRoot, `packages/db/data/supply-seasons-${leagueSlug}.json`)
      const cards = supplySeasonsPaths.cardsPath(base)

      const counted = await countCollected(cards)
      const imported = await runSupplySeasonsImport({
        file: cards,
        leagueSlug,
        confirm: boolFlag(args, 'confirm'),
        limit: numberFlag(args, 'limit'),
      })
      table([
        {
          리그: imported.leagueSlug,
          '파일 선수': imported.readPlayers,
          '카드 있는 선수': counted.playersWithSeasons,
          '시즌 줄': imported.readRows,
          'DB 와 연결': imported.matchedPlayers,
          'DB 에 없음': imported.unknownPlayers,
          '시즌 생성': imported.seasonsCreated,
          '행 생성': imported.rowsCreated,
          '행 갱신': imported.rowsUpdated,
          '우리 카드 보호': imported.rowsSkippedOurs,
          'source id 채움': imported.sourceIdsFilled,
          'DB 행': imported.dbRows,
          대조: imported.reconciled ? '일치' : '불일치',
        },
      ])
      /* 숫자 대조 — 파일 줄 수와 DB 행 수를 시즌별로 나란히 본다 (3-A 6번) */
      table(
        [...new Set([...Object.keys(imported.bySeason), ...Object.keys(imported.dbRowsBySeason)])]
          .map(Number)
          .sort((a, b) => b - a)
          .map((season) => ({
            시즌: season,
            '파일 줄': imported.bySeason[season] ?? 0,
            'DB 행': imported.dbRowsBySeason[season] ?? 0,
            일치: (imported.bySeason[season] ?? 0) === (imported.dbRowsBySeason[season] ?? 0),
          })),
      )
      log(`  파일 ${cards}`)
      return imported.confirm && !imported.reconciled ? 1 : 0
    }

    case 'supply-import': {
      /* D-153 — 미러링 수집 파일 → 우리 DB.
         수집(`supply-mirror`)과 분리돼 있고 **네트워크를 쓰지 않는다.**
         기본은 미리보기다. `--confirm` 이 있어야만 쓴다. */
      const leagueSlug = stringFlag(args, 'league') ?? 'supply'
      /* `--file` 은 `supply-mirror` 와 같은 규칙으로 **저장소 루트 기준**으로 푼다 */
      const repoRoot = join(process.cwd(), '..', '..')
      const fileFlag = stringFlag(args, 'file')
      const file = fileFlag
        ? isAbsolute(fileFlag)
          ? fileFlag
          : join(repoRoot, fileFlag)
        : join(repoRoot, `packages/db/data/supply-mirror-${leagueSlug}.json`)

      const confirm = boolFlag(args, 'confirm')
      const output = await runSupplyImport({
        file,
        leagueSlug,
        confirm,
        updateSource: boolFlag(args, 'update-source'),
        createLeagueName: stringFlag(args, 'league-name') ?? null,
        limit: numberFlag(args, 'limit'),
      })
      log(`  파일 ${file}`)
      /*
       * ★언제 실패로 끝내나★ (2026-09-03 정정).
       *
       * ── 무엇이 잘못돼 있었나
       *   여기서 **날것의 `supplyOnly`** 를 봤다. 그런데 그 숫자에는
       *   **일부러 안 넣은 경기**가 섞여 있다 — IPL 클랜끼리의 경기는 열산 기록이 아니다 (D-210).
       *   `supplyImport.ts` 397~404행이 바로 그 몫을 갈라 내면서 이렇게 적어 뒀다:
       *   *「일부러 안 넣은 경기는 "빠진 경기" 가 아니다. 이 숫자를 그대로 두면
       *     ★다음 사람이 결함으로 알고 쫓는다★」*
       *   ★그 일이 실제로 일어났다.★ `sanply` 적재가 열흘 동안 매 사이클 빨간 줄을 냈고
       *   (`supply-incremental` run#101~113), 그걸 「수집이 죽었다」로 쫓았다.
       *   ★수집은 죽지 않았다.★ 그 시간에도 경기는 정상으로 들어오고 있었다.
       *
       * ── 그래서 같은 갈래를 여기서도 쓴다
       *   설명되는 몫(D-210)을 뺀 **`unexplained` 가 남을 때만** 실패로 끝낸다.
       *   ⚠ 0 을 만들려고 기준을 낮춘 것이 아니다 — `unexplained > 0` 은 **여전히 실패다.**
       *     ★거짓 경보를 지운 것이지 경보를 끈 것이 아니다.★
       */
      const blockedByIplRule = output.imported.skipped[IPL_ONLY_SKIP_REASON] ?? 0
      const unexplainedSupplyOnly = output.reconciliation.supplyOnly - blockedByIplRule
      return output.imported.written.matches === 0 && confirm && unexplainedSupplyOnly > 0 ? 1 : 0
    }

    case 'supply-rollup': {
      /* 미러 경기 → 리그 집계. 네트워크를 쓰지 않는다.
         점수는 원본값 그대로 옮긴다(D-153). 우리 공식값은 읽지도 쓰지도 않는다 */
      const confirm = boolFlag(args, 'confirm')
      const rollup = await runSupplyRollup({
        leagueSlug: stringFlag(args, 'league'),
        file: stringFlag(args, 'file'),
        confirm,
        /* 기본은 증분이다. `--full` 은 되돌릴 길로 남겨 둔다 */
        full: boolFlag(args, 'full'),
        sinceHours: numberFlag(args, 'since-hours'),
      })

      table(
        rollup.leagues.map((row) => ({
          리그: row.leagueSlug,
          방식: row.mode === 'full' ? '전수' : `증분(바뀐 경기 ${row.changedMatches ?? 0})`,
          경기: row.matches,
          참가행: row.stats,
          선수: row.players.aggregated,
          생성: row.players.created,
          갱신: row.players.updated,
          '점수 있음': row.players.withRating,
          '점수 없음': row.players.withoutRating,
          '소속 있음': row.players.withClan,
          무소속: row.players.clanless,
          'Clan 행 없음': row.players.clanNotInDb,
        })),
      )
      table([
        {
          '현재 소속 근거': rollup.playerClans.candidates,
          '소속 있음': rollup.playerClans.withClan,
          무소속: rollup.playerClans.clanless,
          'Clan 행 없음': rollup.playerClans.clanNotInDb,
          '다른 origin': rollup.playerClans.otherOrigin,
          '이미 같음': rollup.playerClans.unchanged,
          'Player.clanId 갱신': rollup.playerClans.updated,
        },
      ])
      table(
        rollup.leagues.map((row) => ({
          리그: row.leagueSlug,
          '경기에 나온 클랜': row.clans.inMatches,
          '등록 클랜': row.clans.registered,
          '랭킹 반영': row.clans.ranked,
          '랭킹 제외': row.clans.unranked,
          '점수 있음': row.clans.withRating,
          '점수 없음': row.clans.withoutRating,
          '클랜 생성': row.clans.clansCreated,
          '리그클랜 생성': row.clans.leagueClansCreated,
          충돌: row.clans.conflicts,
          '되짚기와 다름': row.clans.ratingDiffersFromDerived,
        })),
      )
      if (rollup.skipped.length > 0) {
        log('건드리지 않은 것 —')
        table(rollup.skipped.map((row) => ({ 리그: row.league, 사유: row.reason })))
      }
      if (!confirm) log('미리보기다. 실제로 넣으려면 --confirm')
      return rollup.leagues.some((row) => row.clans.conflicts > 0 || row.clans.registryMissing)
        ? 1
        : 0
    }

    case 'snapshot-audit': {
      /* D-150 — 3rd.supply 미수입 경기를 넣어도 되는지 **수치로** 판정한다.
         이 명령에는 `--confirm` 이 없다. 쓰기 경로 자체가 없다. */
      const file =
        stringFlag(args, 'file') ??
        join(process.cwd(), '..', '..', 'packages/db/data/supply-official-matches.json')
      const leagueSlug = stringFlag(args, 'league') ?? 'supply'
      const audit = await runSnapshotAudit(
        { ...ctx, dryRun: true },
        { leagueSlug, file, limit: numberFlag(args, 'limit') ?? undefined },
      )

      log('')
      log('[1] 집합')
      table([
        {
          '스냅샷 총': audit.set.snapshotTotal,
          '중복 id': audit.set.duplicateIds,
          '형식 오류 id': audit.set.malformedIds,
          'DB 에 있음': audit.set.existsInDb,
          '미수입': audit.set.missing,
        },
      ])

      log('')
      log('[2] 미수입 경기 원본 품질')
      const c = audit.coverage
      table([
        {
          경기: c.matches,
          'start_at': c.withStartAt,
          맵: c.withMap,
          '플레이시간': c.withPlayTime,
          '종료시각': c.withEndAt,
          MVP: c.withMvp,
          '승패': c.withResult,
        },
      ])
      table([
        {
          '정확히 10명': c.roster.exactly10,
          '9명 이하': c.roster.under10,
          '11명 이상': c.roster.over10,
          '5대5': c.teams.balanced5v5,
          '팀 불균형': c.teams.unbalanced,
          '경기내 닉네임 중복': c.duplicateNicknameInMatch,
          '경기내 참가자 중복': c.duplicatePlayerIdInMatch,
        },
      ])
      table([
        {
          '참가 행': c.participantRows,
          'player id 없음': c.rowsWithoutPlayerId,
          '닉네임 없음': c.rowsWithoutNickname,
          '클랜 있음': c.rowsWithClan,
          '클랜 없음': c.rowsWithoutClan,
        },
      ])
      table([
        {
          '라이플(0)': c.weapon.rifle,
          '스나이퍼(1)': c.weapon.sniper,
          '무기 미상': c.weapon.unknown,
          '그 외 값': JSON.stringify(c.weapon.other),
        },
      ])

      log('')
      log('[3] 기존 136경기와 원본 구조 비교 (같은 스냅샷 기준)')
      const e = audit.coverageExisting
      table([
        { 구분: '미수입', 경기: c.matches, '10명': c.roster.exactly10, '승패': c.withResult, '무기 미상': c.weapon.unknown },
        { 구분: '기존', 경기: e.matches, '10명': e.roster.exactly10, '승패': e.withResult, '무기 미상': e.weapon.unknown },
      ])

      log('')
      log('[4] 넥슨 저장 증거 대조 (새 API 호출 없음)')
      table([
        {
          'A 스냅샷+넥슨 10명↑': audit.nexon.aSnapshotAndNexonFull,
          'B 스냅샷+넥슨 일부': audit.nexon.bSnapshotAndNexonPartial,
          'C 스냅샷만': audit.nexon.cSnapshotOnly,
          'D 넥슨만': audit.nexon.dNexonOnly,
          '관측만': audit.nexon.observationOnly,
        },
      ])

      log('')
      log('[5] 투영 (DB 에 한 줄도 쓰지 않았다)')
      const p = audit.projection
      table([
        {
          '살펴본 경기': p.considered,
          '투영된 경기': p.projected.length,
          '충돌 제외': p.conflicts.length,
          '참가 행': p.participantRows,
          '재사용 Player': p.reusedPlayers.size,
          '새 Player': p.newPlayers.size,
        },
      ])
      if (Object.keys(p.skipped).length > 0) table([p.skipped])
      table([p.identity as unknown as Record<string, number>])
      table([
        {
          '공식리그 소속': p.affiliation.officialLeague,
          '외부 클랜': p.affiliation.external,
          '무소속': p.affiliation.none,
        },
      ])
      table([
        {
          '무기+KDA 있음': p.stats.weaponAndKdaKnown,
          '무기만': p.stats.weaponOnly,
          'KDA만': p.stats.kdaOnly,
          '둘 다 없음': p.stats.neither,
        },
      ])

      const conflictKinds = new Map<string, number>()
      for (const row of p.conflicts) {
        conflictKinds.set(row.reason, (conflictKinds.get(row.reason) ?? 0) + 1)
      }
      if (conflictKinds.size > 0) {
        log('')
        log('[6] 충돌 사유별')
        for (const [reason, count] of [...conflictKinds].sort((a, b) => b[1] - a[1])) {
          log(`  ${count.toString().padStart(4)}건  ${reason}`)
        }
        for (const row of p.conflicts.slice(0, 10)) {
          log(`    예) ${row.matchId} — ${row.reason}${row.detail ? ` (${row.detail})` : ''}`)
        }
      }

      log('')
      log('[7] 래더 하네스 검증')
      table([
        {
          '기준 dry-run 경기': audit.baseline.matchesConsidered,
          '기준 반영': audit.baseline.matchesRated,
          'DB 와 대조': audit.baselineMatchesDb.compared,
          '불일치': audit.baselineMatchesDb.mismatched,
          판정: audit.baselineMatchesDb.mismatched === 0 ? 'PASS' : 'FAIL',
        },
      ])
      for (const row of audit.baselineMatchesDb.sample) warn(`  ${row}`)

      log('')
      log('[8] 래더 투영 결과')
      const bands = [4000, 4100, 4300, 4500, 4700, 4800, 4900, 5000]
      const countAbove = (rows: { display: number }[], at: number) =>
        rows.filter((row) => row.display >= at).length
      table([
        {
          구분: '현재',
          '대상 경기': audit.baseline.matchesConsidered,
          '반영 경기': audit.baseline.matchesRated,
          선수: audit.baseline.players.length,
        },
        {
          구분: '투영',
          '대상 경기': audit.projected.matchesConsidered,
          '반영 경기': audit.projected.matchesRated,
          선수: audit.projected.players.length,
        },
      ])
      table([
        {
          구분: '현재',
          ...Object.fromEntries(bands.map((at) => [`${at}+`, countAbove(audit.baseline.players, at)])),
        },
        {
          구분: '투영',
          ...Object.fromEntries(bands.map((at) => [`${at}+`, countAbove(audit.projected.players, at)])),
        },
      ])

      log('  래더에서 빠진 사유 (투영 기준)')
      for (const [code, count] of Object.entries(audit.projected.skipped).sort(
        (a, b) => b[1] - a[1],
      )) {
        log(`    ${count.toString().padStart(4)}건  ${code}`)
      }

      log('')
      log('[9] 투영 개인 상위 20')
      for (const [index, row] of audit.projected.players.slice(0, 20).entries()) {
        log(
          `  ${(index + 1).toString().padStart(2)}. ${Math.round(row.display).toString().padStart(5)} ` +
            `(내부 ${Math.round(row.internal)}) ${row.games}전 ${row.win}승${row.lose}패 ` +
            `${row.winRate.toFixed(1)}% conf ${(row.confidence * 100).toFixed(0)}% ` +
            `상대평균 ${Math.round(row.opponentAvg)} 강팀 ${row.strongWins}/${row.strongGames} ` +
            `패널티 ${Math.round(row.penalty)}  ${row.playerId}`,
        )
      }

      log('')
      log('[10] 판수 분포')
      const games = audit.projected.players.map((row) => row.games).sort((a, b) => a - b)
      const median = games.length === 0 ? 0 : (games[Math.floor(games.length / 2)] ?? 0)
      const mean = games.length === 0 ? 0 : games.reduce((a, b) => a + b, 0) / games.length
      table([
        {
          '평균 판수': mean.toFixed(1),
          중앙값: median,
          '30판+': games.filter((n) => n >= 30).length,
          '60판+': games.filter((n) => n >= 60).length,
          '90판+': games.filter((n) => n >= 90).length,
          '120판+': games.filter((n) => n >= 120).length,
          '150판+(conf 100%)': games.filter((n) => n >= 150).length,
        },
      ])
      const confs = audit.projected.players.map((row) => row.confidence)
      table([
        {
          'confidence 평균': confs.length === 0 ? '0' : (confs.reduce((a, b) => a + b, 0) / confs.length).toFixed(3),
          'confidence 100%': confs.filter((v) => v >= 1).length,
          '상위10 평균 판수':
            audit.projected.players.slice(0, 10).reduce((a, b) => a + b.games, 0) / 10,
        },
      ])

      log('')
      log('[11] 클랜 상위 10')
      log(`  구성 보정 곡선: ${compositionCurveSample()}`)
      const composition = await projectComposition(leagueSlug, audit.projected)
      for (const [index, row] of audit.projected.clans.slice(0, 10).entries()) {
        log(
          `  ${(index + 1).toString().padStart(2)}. ${Math.round(row.display).toString().padStart(5)} ` +
            `(내부 ${Math.round(row.internal)} 구성 +${row.composition.toFixed(1)} 패널티 ${Math.round(row.penalty)}) ` +
            `${row.games}전 ${row.win}승${row.lose}패 평균클랜원 ${row.avgMembers.toFixed(2)}  ${row.leagueClanId}`,
        )
      }
      log('  구성 보정 변화 (현재 → 투영)')
      for (const row of composition
        .slice()
        .sort((a, b) => b.nextScore - a.nextScore)
        .slice(0, 10)) {
        log(
          `    ${row.name.padEnd(16)} +${row.currentScore.toFixed(1)} (${row.currentMembers.toFixed(2)}명)` +
            ` → +${row.nextScore.toFixed(1)} (${row.nextMembers.toFixed(2)}명)`,
        )
      }

      log('')
      log('[12] 무기별 집계 투영')
      {
        /* 투영 참가 행을 선수·무기로 묶어 본다. 실제 rebuild 와 같은 규칙 —
           K/D 를 아는 경기만 knownStatGames 에 들어간다 (D-149) */
        const sniper = new Map<string, number>()
        const rifle = new Map<string, number>()
        let known = 0
        for (const match of p.projected) {
          for (const row of match.participants) {
            if (row.weapon === null) continue
            const bucket = row.weapon === 1 ? sniper : rifle
            bucket.set(row.playerId, (bucket.get(row.playerId) ?? 0) + 1)
            if (row.kill !== null) known += 1
          }
        }
        const both = [...sniper.keys()].filter((id) => rifle.has(id)).length
        const current = await prisma.leaguePlayerWeaponStat.findMany({
          where: { leaguePlayer: { league: { slug: leagueSlug } } },
          select: { weapon: true, leaguePlayerId: true },
        })
        const curSniper = new Set(current.filter((r) => r.weapon === 1).map((r) => r.leaguePlayerId))
        const curRifle = new Set(current.filter((r) => r.weapon === 0).map((r) => r.leaguePlayerId))
        table([
          {
            구분: '현재',
            스나: curSniper.size,
            라플: curRifle.size,
            '둘 다': [...curSniper].filter((id) => curRifle.has(id)).length,
          },
          {
            구분: '투영 추가분',
            스나: sniper.size,
            라플: rifle.size,
            '둘 다': both,
          },
        ])
        log(`  투영 참가 행 ${p.participantRows} · 무기 있음 ${p.participantRows} · KDA 아는 행 ${known}`)
      }

      log('')
      log('[13] 기록실 페이지')
      {
        /* 목록 페이지 크기는 계약 상수와 같다 (`PAGE_SIZE.DEFAULT` = 20).
           worker 는 contract 를 의존하지 않으므로 값만 적고 출처를 남긴다 */
        const perPage = 20
        log(
          `  목록 ${perPage}건/페이지 — 신규 경기 ${p.projected.length}건 ≈ ` +
            `${Math.ceil(p.projected.length / perPage)}페이지 (리그 전체 기준)`,
        )
      }

      log('')
      log('[14] 안전 검사')
      table([
        {
          결정적: audit.deterministic ? 'PASS' : 'FAIL',
          'NaN/Inf': audit.projected.nonFinite === 0 ? 'PASS' : 'FAIL',
          '승률<48% 4000+': audit.projected.underMinWinRateAt4000 === 0 ? 'PASS' : 'FAIL',
          'DB 쓰기': '0건 (dry-run 전용)',
        },
      ])
      log('')
      log('감사 전용이다. 이 명령에는 --confirm 이 없다.')
      return 0
    }

    case 'lineup-complete': {
      const file =
        stringFlag(args, 'file') ??
        join(process.cwd(), '..', '..', 'packages/db/data/supply-official-matches.json')
      const snapshot = JSON.parse(readFileSync(file, 'utf8'))
      const confirm = boolFlag(args, 'confirm')
      const result = await completeLineupsFromSupply({
        snapshot,
        leagueSlug: stringFlag(args, 'league') ?? 'supply',
        dryRun: !confirm,
        onlyExisting: !boolFlag(args, 'include-new'),
        limit: numberFlag(args, 'limit') ?? undefined,
      })
      table([
        {
          '스냅샷 경기': result.considered,
          '우리 DB 에 있는 경기': result.targeted,
          '이미 10명': result.alreadyComplete,
          '10명이 된 경기': result.completed,
          '새 선수': result.createdPlayers,
          '신원 확정': result.identitiesResolved,
          '근거 갈림': result.identitiesAmbiguous,
          '저장된 연결 충돌': result.storedLinkConflicts,
          '인원 초과로 보류': result.overfilled,
          '추가된 참가 기록': result.createdStats,
          '무기 채움': result.weaponsBackfilled,
          '무기 충돌': result.weaponConflicts,
        },
      ])
      if (Object.keys(result.skipped).length > 0) table([result.skipped])
      if (!confirm) log('미리보기다. 실제로 쓰려면 --confirm 을 붙인다')
      return 0
    }

    case 'explain-matches': {
      const ids = (stringFlag(args, 'match-id') ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
      await explainMatches({
        leagueSlug: stringFlag(args, 'league') ?? 'supply',
        sourceMatchIds: ids,
        limit: numberFlag(args, 'limit') ?? 5,
      })
      return 0
    }

    case 'affiliation': {
      const result = await backfillMatchTimeAffiliation({
        leagueSlug: stringFlag(args, 'league') ?? 'supply',
        confirm: boolFlag(args, 'confirm'),
        redo: boolFlag(args, 'redo'),
        limit: ctx.limit,
      })
      table([result as unknown as Record<string, unknown>])
      log('현재 소속(Player.clanId · LeaguePlayer.clanId)은 건드리지 않았다')
      if (!boolFlag(args, 'confirm')) log('미리보기다. 실제로 쓰려면 --confirm 을 붙인다')
      return 0
    }

    case 'reresolve': {
      const result = await runReresolve(ctx)
      table([result as unknown as Record<string, unknown>])
      log('투영 상태와 운영 매치는 건드리지 않았다. 신원만 다시 붙였다')
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
      const result = await rebuildWeaponStats({ leagueSlug, confirm: boolFlag(args, 'confirm') })
      table([
        {
          '살펴본 참가행': result.scanned,
          '무기 있음': result.withWeapon,
          '무기 없음': result.withoutWeapon,
          '무기+KDA': result.withWeaponAndStats,
        },
      ])
      table([
        {
          선수: result.players,
          버킷: result.buckets,
          '라플 전': result.rifleGames,
          '라플 기록': result.rifleKnownGames,
          '스나 전': result.sniperGames,
          '스나 기록': result.sniperKnownGames,
        },
      ])
      if (!boolFlag(args, 'confirm')) log('미리보기다. 실제로 넣으려면 --confirm')
      return 0
    }

    /**
     * 병영수첩 BattleLog 원문 적재 (D-174).
     *
     *   pnpm --filter @sacloud/worker nexon battlelog-import --file ./barracks-battlelog.json
     *   pnpm --filter @sacloud/worker nexon battlelog-import --file ... --confirm
     *
     * 수집은 브라우저가 한다 (`packages/db/legacy/barracks-battlelog-snippet.js`).
     * **`--confirm` 없이는 한 줄도 쓰지 않는다.**
     */
    /**
     * 라운드 복원 집계 (D-194).
     *
     *   pnpm --filter @sacloud/worker nexon round-build
     *   pnpm --filter @sacloud/worker nexon round-build --confirm
     *
     * 세이브 · 소수싸움 · 매치의 사나이의 재료를 `PlayerRoundProfile` 에 쌓는다.
     * **`--confirm` 없이는 한 줄도 쓰지 않는다.** 멱등이다.
     */
    /**
     * 병영수첩 클랜 번호 ↔ 우리 클랜 잇기 (D-200).
     *
     *   pnpm --filter @sacloud/worker nexon clan-number
     *   pnpm --filter @sacloud/worker nexon clan-number --confirm
     *
     * **`--confirm` 없이는 한 줄도 쓰지 않는다.** 멱등이다.
     */
    case 'clan-number': {
      const result = await linkClanNumbers({ confirm: boolFlag(args, 'confirm') })
      table([
        {
          응답: result.responses,
          '본 클랜번호': result.seen,
          '짝지음': result.matched,
          '이음(8할+)': result.linked,
        },
      ])
      if (!result.written) log('미리보기다. 실제로 넣으려면 --confirm')
      return 0
    }

    case 'round-build': {
      const result = await buildRoundProfiles({ confirm: boolFlag(args, 'confirm') })
      table([
        {
          '클랜응답 경기': result.matches,
          '복원 성공': result.restored,
          '긴 경기': result.longMatches,
          '매치의사나이 확정': result.matchManDecided,
          '스나 확인': result.sniperEntries,
          '원어택 잼': result.oneAttackEntries,
          '기회창출 라운드': result.openingRounds,
          '첫킬 불명': result.openingTiedRounds,
          '연속킬 잼': result.burstEntries,
          '계정 불명': result.unknownAccounts,
          프로필: result.profiles,
          '선수 연결': result.linked,
        },
      ])
      if (!result.written) log('미리보기다. 실제로 넣으려면 --confirm')
      return 0
    }

    /**
     * 클랜 라운드 지표 집계 (`docs/SITE_SPEC_V2.md` 5-5절).
     *
     *   pnpm --filter @sacloud/worker nexon clan-round-build
     *   pnpm --filter @sacloud/worker nexon clan-round-build --confirm
     *
     * 블루방어율 · 어택성공률 · 조직력 · 폭발력 · 게임템포 · 클린시트의 재료를
     * `ClanRoundProfile` 에 쌓는다. **`--confirm` 없이는 한 줄도 쓰지 않는다.** 멱등이다.
     */
    case 'clan-round-build': {
      const result = await buildClanRoundProfiles({ confirm: boolFlag(args, 'confirm') })
      table([
        {
          '원문 줄': result.rows,
          '클랜번호 미연결': result.unlinkedClanNo,
          '모집단 밖': result.outOfScope,
          '진영 불일치': result.sideMismatch,
          '읽기 실패': result.unreadable + result.unknownTeamNo,
          집계: result.tallied,
          '교대 확인': result.sided,
          '근거 모순': result.conflicts,
          프로필: result.profiles,
        },
      ])
      table([
        {
          '본 라운드': result.roundsTotal,
          '진영 아는 라운드': result.roundsKnown,
          비율:
            result.roundsTotal === 0
              ? '-'
              : `${((result.roundsKnown / result.roundsTotal) * 100).toFixed(1)}%`,
        },
      ])
      if (result.tallied > 0 && result.sided === 0) {
        warn('진영 교대를 확인한 경기가 없다. 다섯 지표는 전부 측정중으로 나간다')
      }
      if (!result.written) log('미리보기다. 실제로 넣으려면 --confirm')
      return 0
    }

    /**
     * 클랜 육각형 V2 재료 (D-217 · D-235 · `docs/CLAN_HEXAGON_V2_SPEC.md`).
     *
     *   pnpm --filter @sacloud/worker nexon clan-hex-v2-build
     *   pnpm --filter @sacloud/worker nexon clan-hex-v2-build --limit 20 --confirm
     *   pnpm --filter @sacloud/worker nexon clan-hex-v2-build --league sanply
     *   pnpm --filter @sacloud/worker nexon clan-hex-v2-build --rebuild --confirm
     *
     * 여섯 축의 **분자/분모**를 경기 × 클랜 단위로 `MatchClanHexV2` 에 쌓는다.
     * **`--confirm` 없이는 한 줄도 쓰지 않는다.** 멱등이고, 다시 돌리면 이어서 돈다.
     * **옛 판(`clan-round-build`)과 따로 산다 — 둘을 한 화면에 섞지 않는다.**
     */
    case 'clan-hex-v2-build': {
      const result = await buildClanHexV2({
        confirm: boolFlag(args, 'confirm'),
        limit: numberFlag(args, 'limit'),
        leagueSlug: stringFlag(args, 'league'),
        rebuild: boolFlag(args, 'rebuild'),
        /* 기본은 이어서 접는다. `--no-summary` 를 줘야 안 접는다 (D-238 후속) */
        skipSummary: boolFlag(args, 'no-summary'),
      })
      table([
        {
          '원문 줄': result.rows,
          '집계한 경기': result.matches,
          '쓴 행': result.planned,
          '구역 파일': result.zones.file === null ? '(없음 · 자리 축 null)' : '있음',
        },
      ])
      if (result.zones.file !== null) table([result.zones.cells])
      table([
        {
          '클랜번호 미연결': result.skips.unlinkedClanNo,
          'Match 없음': result.skips.noMatch,
          '중복 응답': result.skips.duplicateResponse,
          '이미 만듦': result.skips.alreadyBuilt,
          '읽기 실패': result.skips.unreadable,
          '팀번호 불명': result.skips.unknownTeamNo,
          '상대팀 없음': result.skips.noFoeTeam,
          '팀↔클랜 불명': result.skips.teamClanUnknown,
          '진영 불일치': result.skips.clanSideMismatch,
        },
      ])
      table([
        Object.fromEntries(result.axesHistogram.map((n, axes) => [`${axes}축`, n])),
      ])
      table([result.axisRows])
      if (result.planned > 0 && result.axesHistogram[0] === result.planned) {
        warn('여섯 축을 하나도 못 잰 행뿐이다. 원문·구역 파일을 확인해라')
      }
      /* 이어서 접은 클랜별 요약 — 화면이 실제로 읽는 것이다 (D-238 후속) */
      if (result.summary !== null) {
        log('── 클랜 요약 (화면이 읽는 것)')
        printClanHexV2Summary(result.summary)
      } else if (result.planned > 0) {
        warn('요약을 안 접었다. 화면은 옛 요약을 계속 읽는다 — clan-hex-v2-summary 를 돌려라')
      }
      if (!result.written) log('미리보기다. 실제로 넣으려면 --confirm')
      return 0
    }

    /**
     * 클랜 육각형 V2 **요약 접기** (D-238 후속).
     *
     *   pnpm --filter @sacloud/worker nexon clan-hex-v2-summary
     *   pnpm --filter @sacloud/worker nexon clan-hex-v2-summary --confirm
     *   pnpm --filter @sacloud/worker nexon clan-hex-v2-summary --league sanply --confirm
     *   pnpm --filter @sacloud/worker nexon clan-hex-v2-summary --rebuild --confirm
     *   pnpm --filter @sacloud/worker nexon clan-hex-v2-summary --prune --confirm
     *
     * `MatchClanHexV2`(경기 × 클랜)를 **클랜 하나에 한 행**으로 접어 `ClanHexV2Summary`
     * 에 넣는다. 클랜 페이지 육각형이 읽는 것은 이 표뿐이다 — 리그 전체 경기 행을 읽던
     * 옛 경로가 운영을 500 으로 만들었다 (D-238).
     *
     * **원재료는 안 건드린다.** `--rebuild` 는 원재료에서 다시 접어 대조하는 길이고,
     * 어긋나면 **언제나 원재료 쪽이 옳다.**
     * `clan-hex-v2-build` 가 끝에 이걸 자동으로 잇는다 — 이 명령은 **경기 행이 이미
     * 있을 때 요약만 다시 만드는** 용도다.
     */
    case 'clan-hex-v2-summary': {
      const result = await buildClanHexV2Summary({
        confirm: boolFlag(args, 'confirm'),
        leagueSlug: stringFlag(args, 'league'),
        limit: numberFlag(args, 'limit'),
        rebuild: boolFlag(args, 'rebuild'),
        prune: boolFlag(args, 'prune'),
      })
      printClanHexV2Summary(result)
      if (result.noLeagueClan > 0) {
        warn('LeagueClan 을 못 찾은 원재료가 있다. 그 행들은 화면에 안 나온다')
      }
      if (result.stale > 0 && result.pruned === 0) {
        warn('원재료가 사라진 요약이 남아 있다. 지우려면 --prune --confirm')
      }
      if (!result.written) log('미리보기다. 실제로 넣으려면 --confirm')
      return 0
    }

    /**
     * 병영수첩 클랜전 목록 원문 적재 — IPL 기록 이관.
     *
     *   pnpm --filter @sacloud/worker nexon iplmatch-import --dir <폴더>
     *   pnpm --filter @sacloud/worker nexon iplmatch-import --dir <폴더> --confirm
     *
     * 수집은 브라우저가 한다 (Node 로 병영수첩을 부르면 403 · `docs/IPL_SPEC.md` 7장).
     * **`--confirm` 없이는 한 줄도 쓰지 않는다.** 멱등이다.
     * **`Match` 로 투영하지 않는다** — 원문 보존까지만 한다.
     */
    case 'iplmatch-import': {
      const dir = stringFlag(args, 'dir')
      const file = stringFlag(args, 'file')
      if (!dir && !file) {
        fail('--dir <폴더> (또는 --file <한 파일>) 이 필요하다')
        return 1
      }
      const sinceText = stringFlag(args, 'since')
      const since = sinceText ? new Date(sinceText) : undefined
      if (since && Number.isNaN(since.getTime())) {
        fail(`--since 를 날짜로 읽지 못했다: ${sinceText}`)
        return 1
      }
      const files = file ? [file] : await findClanMatchFiles(dir as string, since)
      if (files.length === 0) {
        warn(`${dir} 에서 클랜전 목록 파일을 하나도 못 찾았다`)
        return 1
      }
      const confirm = boolFlag(args, 'confirm')
      const result = await importIplMatches({ files, confirm })
      table([
        {
          파일: result.files,
          '실패 파일': result.failedFiles,
          줄: result.rows,
          [confirm ? '신규' : '넣을 것']: result.stored,
          중복: result.duplicate,
          '주인 불명': result.skipped,
          '고유 경기': result.uniqueMatches,
          '고유 (경기,주체)': result.uniquePairs,
        },
      ])
      log(
        `기간 ${formatMatchStamp(result.earliestMatchKey)} ~ ` +
          `${formatMatchStamp(result.latestMatchKey)} (match_key 앞 12자리 · KST)`,
      )
      const otherMaps = Object.entries(result.otherMaps)
      if (otherMaps.length > 0) {
        warn('제3보급창고가 아닌 줄이 섞였다')
        table([Object.fromEntries(otherMaps)])
      }
      for (const failed of result.perFile.filter((item) => item.error)) {
        warn(`읽지 못한 파일: ${failed.file} — ${failed.error}`)
      }
      if (!confirm) log('미리보기다. 실제로 넣으려면 --confirm')
      return 0
    }

    /**
     * IPL 목록 원문 숫자 대조.
     *
     *   pnpm --filter @sacloud/worker nexon iplmatch-check [--dir <폴더>]
     *
     * `--dir` 을 주면 파일 쪽 숫자와 DB 를 맞대 본다. 안 주면 DB 쪽만 본다.
     */
    case 'iplmatch-check': {
      const checkSinceText = stringFlag(args, 'since')
      const checkSince = checkSinceText ? new Date(checkSinceText) : undefined
      if (checkSince && Number.isNaN(checkSince.getTime())) {
        fail(`--since 를 날짜로 읽지 못했다: ${checkSinceText}`)
        return 1
      }
      const result = await checkIplMatches({
        dir: stringFlag(args, 'dir') ?? undefined,
        since: checkSince,
      })
      table([
        {
          '파일 줄': result.fileRows ?? '(안 봄)',
          '파일 고유 경기': result.fileUniqueMatches ?? '(안 봄)',
          '파일 (경기,주체)': result.fileUniquePairs ?? '(안 봄)',
          'DB 행': result.dbRows,
          'DB 고유 경기': result.dbUniqueMatches,
          'DB 주체': result.dbSubjects,
        },
      ])
      log(
        `기간 ${formatMatchStamp(result.earliestMatchKey)} ~ ` +
          `${formatMatchStamp(result.latestMatchKey)} (KST)`,
      )
      table([
        {
          '제3보급창고 아닌 행': Object.values(result.otherMaps).reduce((a, b) => a + b, 0),
          '2026-04-01 이전 경기': result.beforeApril,
          '2026-01-01 이전 경기': result.beforeYear,
          '양쪽 다 등록클랜': result.bothRegistered,
          '한쪽만 등록클랜': result.oneRegistered,
        },
      ])
      const other = Object.entries(result.otherMaps)
      if (other.length > 0) table([Object.fromEntries(other)])
      const subjects = new Set(result.registered.map((item) => item.subject))
      log(
        `등록 클랜(데이터에서 도출) ${subjects.size}곳 · 클랜명 ${result.registered.length}개 ` +
          `(개명한 클랜은 이름이 여러 개다)`,
      )
      for (const item of result.registered) {
        log(
          `  ${item.subject} = ${item.clanName} (${item.rows}줄 · ${(item.ratio * 100).toFixed(1)}%)`,
        )
      }
      for (const failure of result.failures) fail(`FAIL ${failure}`)
      if (result.passed) log('통과')
      return result.passed ? 0 : 1
    }

    /**
     * **IPL 클랜끼리의 경기는 열산 기록이 아니다** — 대조 (D-210).
     *
     *   pnpm --filter @sacloud/worker nexon ipl-sanply-check
     *
     * 막는 일은 적재(`supply-import`)가 한다. 이건 **새는지** 보는 것이다.
     * 0 이 아니면 exit 1 — 5분마다 도는 동기화가 규칙을 빠져나갔다는 뜻이다.
     */
    case 'ipl-sanply-check': {
      const scope = await runIplSanplyCheck({
        targetLeagueSlug: stringFlag(args, 'league') ?? undefined,
        iplLeagueSlug: stringFlag(args, 'ipl-league') ?? undefined,
      })
      /* 경기 수만 보지 않는다. **명단이 마지막 청소 뒤로 바뀌었으면 그것도 실패다**
         (D-210 후속) — 새 클랜의 과거 경기가 소급해서 「IPL끼리」가 됐는데
         아직 안 치웠다는 뜻이라, 지금 0건인 것은 통과가 아니다 */
      return scope.matchIds.length === 0 && !scope.rosterDrift.drifted ? 0 : 1
    }

    /**
     * 이미 들어온 IPL끼리의 경기를 치운다 (D-210).
     *
     *   pnpm --filter @sacloud/worker nexon ipl-sanply-purge
     *   pnpm --filter @sacloud/worker nexon ipl-sanply-purge --confirm
     *
     * **지우기 전에 백업 JSON 을 뜬다** (`CLAUDE.md` 3-A 1번 · 7번).
     * 원문(수집 JSONL)은 건드리지 않는다 — 지우는 것은 `Match` 행뿐이다.
     */
    case 'ipl-sanply-purge': {
      const result = await runIplSanplyPurge({
        confirm: boolFlag(args, 'confirm'),
        targetLeagueSlug: stringFlag(args, 'league') ?? undefined,
        iplLeagueSlug: stringFlag(args, 'ipl-league') ?? undefined,
        backupDir: stringFlag(args, 'backup-dir') ?? undefined,
      })
      /* 백업을 못 떠서 아무것도 안 지운 경우를 성공으로 보고하지 않는다 */
      if (result.notes.length > 0 && boolFlag(args, 'confirm')) return 1
      return 0
    }

    case 'battlelog-import': {
      const file = stringFlag(args, 'file')
      if (!file) {
        fail('--file <수집.json> 이 필요하다')
        return 1
      }
      const result = await importBattleLogs({ file, confirm: boolFlag(args, 'confirm') })
      table([
        {
          줄: result.rows,
          '원문 신규': result.stored,
          '원문 중복': result.duplicate,
          '주인 불명': result.skipped,
          '수집 실패': result.failures,
          이벤트: result.events,
          좌표: result.points,
        },
      ])
      if (result.rows > 0 && result.points === 0) {
        warn('좌표가 하나도 없다. 이 파일로는 포지션 판정을 할 수 없다')
      }
      const labelled = Object.entries(result.labels)
      if (labelled.length > 0) {
        log(`파일에 포지션 정답이 ${labelled.length}명분 들어 있다`)
        const byPosition: Record<string, number> = {}
        for (const [, position] of labelled) byPosition[position] = (byPosition[position] ?? 0) + 1
        table([byPosition])
        const out = stringFlag(args, 'labels-out')
        if (out) {
          writeFileSync(
            out,
            JSON.stringify(
              {
                note: `수집 파일에서 뽑은 포지션 정답 (${file})`,
                labels: labelled.map(([userNexonSn, position]) => ({ userNexonSn, position })),
              },
              null,
              2,
            ),
            'utf8',
          )
          log(`정답 라벨을 저장했다 — ${out}`)
        }
      }
      if (!boolFlag(args, 'confirm')) log('미리보기다. 실제로 넣으려면 --confirm')
      return 0
    }

    /**
     * 배틀로그 전수수집 **대조** (D-218).
     *
     *   pnpm --filter @sacloud/worker nexon battlelog-check
     *
     * **"수집 완료" 로그가 아니라 숫자로 판정한다** (`CLAUDE.md` 3-A 6번).
     * 읽기 전용이다 — 한 줄도 쓰지 않는다.
     */
    case 'battlelog-check': {
      const r = await checkBattleLogs()
      table([
        {
          '아는 경기': r.matchesKnown,
          '받음': r.matchesFetched,
          '안 받음': r.matchesMissing,
          '클랜응답 행': r.clanRows,
          '좌표 라운드': r.roundsWithPoints,
          '좌표 이벤트': r.points,
          '빈 응답': r.emptyResponses,
        },
      ])
      /* **숫자가 바뀐 이유를 남긴다** — 예전 판에는 `양 팀 / 한 팀만` 칸이 있었다 (D-218) */
      log(
        `판정 기준이 바뀌었다 (D-218): 응답 하나에 양 팀 10명이 다 온다 — ` +
          `옛 '한 팀만 받음 ${r.legacy.oneResponse.toLocaleString()}건' 은 결손이 아니라 ` +
          `완전한 경기다. 지금은 받음/안 받음으로만 센다 (응답 두 벌 ${r.legacy.twoResponses.toLocaleString()}건)`,
      )
      if (r.worklistPairs !== null) {
        log(`작업목록에 남은 짝 ${r.worklistPairs.toLocaleString()}개`)
        if (r.worklistByPriority.length > 0) table(r.worklistByPriority)
      } else {
        warn('작업목록이 없다 — src/dev/battlelogWorklist.ts 를 먼저 돌려라')
      }
      /* **여기가 진짜 성과 지표다.** 경기 수가 아니라 "누구를 볼 수 있게 됐나" 다 */
      table(
        r.aces.map((a) => ({
          '1티어': a.name,
          클랜: a.clan ?? (a.found ? '소속없음' : 'DB 에 없음'),
          경기: a.matches,
        })),
      )
      log(`배틀로그가 있는 1티어 ${r.aces.filter((a) => a.matches > 0).length}/${r.aces.length}명`)
      log(
        `배틀로그가 있는 개인랭킹 상위 ${r.top30.filter((t) => t.matches > 0).length}/${r.top30.length}명`,
      )
      return 0
    }

    /**
     * 좌표 → 격자 분포 → 포지션 판정 (D-174).
     *
     *   pnpm --filter @sacloud/worker nexon position-build
     *   pnpm --filter @sacloud/worker nexon position-build --labels data/barracks/position-labels.json --confirm
     *
     * 라벨(정답)이 없으면 **분포만** 만들고 포지션은 비운다. 중심 없이 찍지 않는다.
     */
    case 'position-build': {
      const result = await buildPositionProfiles({
        zonemapFile: stringFlag(args, 'zonemap') ?? join(REPO_ROOT, 'data/barracks/zonemap.json'),
        labelsFile: stringFlag(args, 'labels'),
        minGames: numberFlag(args, 'min-games') ?? 10,
        cell: numberFlag(args, 'cell') ?? 20,
        confirm: boolFlag(args, 'confirm'),
      })
      table([
        {
          사람: result.subjects,
          '분포 만듦': result.profiled,
          '표본 부족': result.tooFewGames,
          '스나 판 제외': result.sniperGamesExcluded,
          라벨: result.labeled,
          정확도: result.accuracy === null ? '(라벨 없음)' : `${(result.accuracy * 100).toFixed(1)}%`,
          저장: result.written,
        },
      ])
      if (Object.keys(result.zoneCounts).length > 0) table([result.zoneCounts])
      if (result.misses.length > 0) table(result.misses.slice(0, 20))
      if (result.labeled === 0) {
        log('정답 라벨이 없다. `data/barracks/position-labels.json` 을 만들면 포지션까지 정한다')
      }
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
      /* 같은 경기·같은 닉네임 근거로 기존 선수와 잇는다. 없으면 새로 만든다 (D-134) */
      const lineupFlag = args.flags.get('lineup')
      const lineupPath =
        typeof lineupFlag === 'string'
          ? lineupFlag
          : lineupFlag === false
            ? null
            : join(process.cwd(), '..', '..', 'packages/db/data/supply-official-matches.json')

      const result = await linkIdentitiesByEvidence({
        leagueSlug,
        minEvidence: numberFlag(args, 'min-evidence') ?? 1,
        lineupPath,
        confirm: boolFlag(args, 'confirm'),
      })
      table([
        {
          검토: result.considered,
          '기존 선수와 연결': result.linked,
          '새 선수 생성': result.created,
          충돌: result.conflicts,
          보류: result.skipped,
        },
      ])
      for (const candidate of result.candidates.filter((row) => row.verdict !== 'created').slice(0, 30)) {
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

    /**
     * 무소속리그 만들기 · 티어 편성 (D-165).
     *
     * 스키마 변경이 없다. 필요한 컬럼(`League.category` · `divisionCount` ·
     * `Clan.category` · `Clan.tier` · `LeagueClan.division`)은 전부 이미 있다.
     *
     * **재실행해도 중복이 생기지 않는다.** `--confirm` 없이는 한 줄도 쓰지 않는다.
     */
    case 'independent-league': {
      const leagueSlug = stringFlag(args, 'league') ?? INDEPENDENT_LEAGUE_SLUG
      const confirm = boolFlag(args, 'confirm')
      const write = confirm && !dryRun

      if (boolFlag(args, 'sync')) {
        const synced = await syncIndependentTiers({ leagueSlug, dryRun: !write })
        log(`${leagueSlug} — 검사 ${synced.checked}건 · 어긋남 ${synced.fixed.length}건`)
        if (synced.fixed.length > 0) table(synced.fixed)
        if (!write) log('--confirm 이 없어 한 줄도 쓰지 않았다')
        return 0
      }

      const clanSlug = stringFlag(args, 'register')
      if (clanSlug) {
        const tier = numberFlag(args, 'tier')
        if (tier === null) {
          fail(`--tier <1~${INDEPENDENT_TIER_COUNT}> 가 필요하다`)
          return 1
        }
        const result = await registerClanTier({ leagueSlug, clanSlug, tier, dryRun: !write })
        for (const warning of result.warnings) warn(warning)
        if (!result.ok) {
          fail(`등록하지 못했다: ${result.reason}`)
          return 1
        }
        log(
          `${clanSlug} → ${leagueSlug} ${tier}티어 ` +
            `(${result.created ? '신규 등록' : `이동 ${result.fromTier ?? '-'} → ${tier}`})`,
        )
        if (!write) log('--confirm 이 없어 한 줄도 쓰지 않았다')
        return 0
      }

      const ensured = await ensureIndependentLeague({ dryRun: !write })
      table([
        {
          slug: ensured.league.slug,
          이름: ensured.league.name,
          구분: ensured.league.category,
          티어수: ensured.league.divisionCount,
          origin: ensured.league.origin,
          신규: ensured.created,
        },
      ])
      for (const fixedItem of ensured.fixed) log(`고침: ${fixedItem}`)
      if (!write) log('--confirm 이 없어 한 줄도 쓰지 않았다')
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
