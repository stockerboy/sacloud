/**
 * `nexon ipl-sanply-purge` · `nexon ipl-sanply-check` (D-210).
 *
 * **IPL 클랜끼리의 경기는 열산(`sanply`) 기록이 아니다.**
 *
 * 규칙 자체와 DB 로직은 `packages/db/ops/iplSanplyGuard.ts` 에 있다.
 * 여기는 CLI 표면(플래그·로그·백업 파일 쓰기)만 맡는다 —
 * 화면과 CLI 가 같은 코드를 쓰게 하려는 `packages/db/ops` 의 원칙 그대로다.
 *
 * ```
 *   nexon ipl-sanply-check                     # 남은 건수. **0 이어야 한다**
 *   nexon ipl-sanply-purge                     # 미리보기 (한 줄도 안 지운다)
 *   nexon ipl-sanply-purge --confirm           # 백업 뜨고 지운다
 * ```
 *
 * 예전에는 `src/dev/iplSanplyPurge.ts` 였다. dev 스크립트로 두면 다음 사람이 못 찾는다.
 * 되풀이되는 일이라 정식 명령으로 올렸다.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  countIplOnlyMatches,
  nextPurgeRecordSnippet,
  purgeIplOnlyMatches,
  type IplOnlyMatchScope,
  type PurgeIplOnlyMatchesResult,
} from '@sacloud/db/ops'
import { REPO_ROOT } from '../lib/env.js'
import { log, table, warn } from '../lib/log.js'

/** 지우기 전 원본을 뜨는 곳. `.gitignore` 에 들어 있다 */
export const IPL_PURGE_BACKUP_DIR = path.join(REPO_ROOT, 'apps', 'worker', 'backups', 'iplSanply')

export interface IplSanplyPurgeInput {
  confirm?: boolean
  /** 기본 `sanply` */
  targetLeagueSlug?: string
  /** 기본 `nolink` */
  iplLeagueSlug?: string
  /** 백업 폴더. 기본 `apps/worker/backups/iplSanply` */
  backupDir?: string
}

function reportScope(scope: IplOnlyMatchScope): void {
  table([
    {
      대상리그: `${scope.targetLeagueSlug}${scope.targetLeagueExists ? '' : '(없음)'}`,
      IPL리그: `${scope.iplLeagueSlug}${scope.iplLeagueExists ? '' : '(없음)'}`,
      'IPL 클랜': scope.iplClanCount,
      '그중 명단으로만 찾은 곳': scope.iplFromRoster,
      '그중 대상리그에도 등록행이 있는 곳': scope.registeredInTarget,
      'IPL끼리의 경기': scope.matchIds.length,
    },
  ])
  /* 지어내지 않는다 — 후보가 둘 이상인 명단 항목은 **고르지 않고 여기 찍는다** (3-A 8번) */
  for (const item of scope.iplAmbiguous) {
    warn(`  명단을 클랜 행으로 잇지 못했다 (사람이 판단한다): ${item}`)
  }
  reportRosterDrift(scope)
}

/**
 * **명단이 마지막 청소 뒤로 바뀌었는가.** 조용히 넘어가지 않는다 (3-A 6번).
 *
 * 경기 수가 0 이어도 여기가 걸리면 통과가 아니다 — 새로 들어온 클랜의 **과거** 경기가
 * 소급해서 「IPL끼리」가 됐을 수 있는데 아직 안 치웠다는 뜻이다. 2026-08-31 에
 * 정확히 그 일로 63건이 남았고, 그때는 **사람이 기억해야 하는 절차**뿐이었다.
 */
function reportRosterDrift(scope: IplOnlyMatchScope): void {
  const drift = scope.rosterDrift
  if (!drift.drifted) return
  warn('')
  warn('  ################################################################')
  warn('  #  IPL 명단이 마지막 청소 뒤로 바뀌었다 — 청소를 다시 돌려야 한다')
  if (drift.added.length > 0) warn(`  #  들어온 클랜 ${drift.added.length}곳: ${drift.added.join(', ')}`)
  if (drift.removed.length > 0) warn(`  #  빠진 클랜 ${drift.removed.length}곳: ${drift.removed.join(', ')}`)
  warn('  #')
  warn('  #  명단에 클랜이 들어오면 그 클랜의 **과거** 열산 경기가 소급해서')
  warn('  #  「IPL끼리」가 된다. 지금 0건이어도 통과가 아니다.')
  warn('  #')
  warn('  #    node scripts/prod-run.mjs ipl-sanply-purge --confirm')
  warn('  #')
  warn('  #  치운 뒤 packages/db/ops/iplSanplyPurgeLog.ts 를 갱신한다')
  warn('  #  (그 명령이 붙여 넣을 블록을 그대로 찍어 준다)')
  warn('  ################################################################')
}

/**
 * 대조 — 열산에 남은 IPL끼리의 경기 건수. **읽기만 한다.**
 *
 * 0 이 아니면 호출부가 `exit 1` 로 끝내야 한다. 막는 규칙이 샜다는 뜻이다.
 */
export async function runIplSanplyCheck(
  input: { targetLeagueSlug?: string; iplLeagueSlug?: string } = {},
): Promise<IplOnlyMatchScope> {
  const scope = await countIplOnlyMatches(input)
  log('')
  log('[대조] IPL 클랜끼리의 경기가 열산에 남아 있는가 (D-210)')
  reportScope(scope)
  if (scope.matchIds.length === 0 && !scope.rosterDrift.drifted) {
    log('  남은 IPL끼리의 경기 0건 · 명단도 마지막 청소 때 그대로 — 통과')
  } else if (scope.matchIds.length === 0) {
    warn('  남은 경기는 0건이지만 **명단이 바뀌었다** — 위 안내대로 청소를 돌려라')
  } else {
    warn(`  남은 IPL끼리의 경기 ${scope.matchIds.length}건 (목표 0)`)
    warn(`  예시 id: ${scope.matchIds.slice(0, 5).join(', ')}`)
    warn('  `nexon ipl-sanply-purge --confirm` 으로 치운다')
  }
  return scope
}

/** 치우기 — 백업을 뜬 뒤에만 지운다 */
export async function runIplSanplyPurge(
  input: IplSanplyPurgeInput = {},
): Promise<PurgeIplOnlyMatchesResult> {
  const backupDir = input.backupDir ?? IPL_PURGE_BACKUP_DIR

  const result = await purgeIplOnlyMatches({
    targetLeagueSlug: input.targetLeagueSlug,
    iplLeagueSlug: input.iplLeagueSlug,
    confirm: input.confirm,
    backupDir,
    /* 지우는 행 전부를 JSON 으로 먼저 떠 둔다 (`CLAUDE.md` 3-A 1번 · 7번).
       ops 쪽은 파일 시스템을 모른다 — 쓰기만 여기서 한다 */
    writeBackup: (fileName, json) => {
      mkdirSync(backupDir, { recursive: true })
      const file = path.join(backupDir, fileName)
      writeFileSync(file, json, 'utf8')
      return file
    },
  })

  log('')
  log(`[1] 범위 ${input.confirm ? '(실제 삭제)' : '(미리보기 — 한 줄도 지우지 않았다)'}`)
  reportScope(result.scope)
  table([
    {
      '지울 경기': result.matches,
      '함께 사라지는 참가 기록': result.stats,
      '이번에 추방표시할 등록행': result.toExpel,
      '지운 뒤에도 남는 열산 경기(그 클랜들의 다른 상대전)': result.stillReferenced,
    },
  ])

  if (input.confirm) {
    log('')
    log('[2] 실제로 한 것')
    table([
      {
        '경기 삭제': result.written.matchesDeleted,
        '등록행 추방표시': result.written.leagueClansExpelled,
        백업: result.written.backupPath ?? '(지울 것이 없어 만들지 않음)',
      },
    ])
    log('  원문(수집 JSONL)은 그대로다 — 지운 것은 Match 행뿐이다 (3-A 1번)')
    log('  등록행은 지우지 않는다 — 지우면 supply-rollup 이 다시 만들어 등록이 되살아난다')

    /* **사람에게 기억하라고 말하지 않는다.** 고칠 것을 그대로 준다 (D-210 후속) */
    log('')
    log('[3] 마지막으로 — 청소 기록을 갱신해라. 안 하면 대조가 계속 빨갛다')
    log('')
    log(
      nextPurgeRecordSnippet({
        targetLeagueSlug: result.scope.targetLeagueSlug,
        matchesDeleted: result.written.matchesDeleted,
        leagueClansExpelled: result.written.leagueClansExpelled,
        backupPath: result.written.backupPath,
      }),
    )
  } else {
    log('')
    log('미리보기다. 실제로 지우려면 --confirm 을 붙인다')
  }

  for (const note of result.notes) warn(`  ${note}`)
  return result
}
