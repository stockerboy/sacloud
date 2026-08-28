/**
 * 리그 집계 잡 — 미러 경기(`origin='3rd.supply'`) → `LeaguePlayer` · `LeagueClan`.
 *
 * 집계 규칙은 전부 `@sacloud/db/ops` 의 `supplyRollup` 에 있다. 여기서는
 * 리그를 고르고 · 수집 파일을 읽고 · 진행 상황을 찍고 · 실패를 사유별로 세는 일만 한다.
 *
 * 클랜 점수·승패·부리그는 **수집 파일 체크포인트의 클랜 목록**에서 온다 (D-157).
 * 그 목록이 원본 클랜랭킹 화면이 쓰는 값이자, 랭킹에 올라갈 클랜의 모집단이다.
 * `apps/worker/src/jobs/supplyMirror.ts` 의 `SupplyMirrorClan` 을 **읽기만** 한다.
 *
 * **기본은 미리보기다.** `--confirm` 없이는 한 줄도 쓰지 않는다.
 */
import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import {
  applySupplyPlayerClans,
  listSupplyMirrorLeagues,
  mergePlayerClanPicks,
  parseClanRegistry,
  rollupSupplyLeague,
  type PlayerClanPick,
  type SupplyClanRegistry,
  type SupplyPlayerClanResult,
  type SupplyRollupResult,
} from '@sacloud/db/ops'
import { REPO_ROOT } from '../lib/env.js'
import { log, warn } from '../lib/log.js'

export interface SupplyRollupRunResult {
  leagues: SupplyRollupResult[]
  /**
   * 전역 현재 소속 (`Player.clanId`) 결과 (D-160).
   * 리그별 근거를 합쳐 **한 번만** 쓴다 — 리그 순서에 값이 흔들리지 않게 하려는 것이다.
   */
  playerClans: SupplyPlayerClanResult
  /** 사유별 실패 — 삼키지 않고 그대로 올린다 */
  skipped: { reason: string; league: string }[]
}

/** 리그별 수집 체크포인트 경로. `supply-mirror` / `supply-import` 와 같은 규칙이다 */
export function mirrorCheckpointPath(leagueSlug: string, override?: string | null): string {
  if (override) return isAbsolute(override) ? override : join(REPO_ROOT, override)
  return join(REPO_ROOT, 'packages', 'db', 'data', `supply-mirror-${leagueSlug}.json`)
}

function readClanRegistry(
  leagueSlug: string,
  file: string,
): { registry: SupplyClanRegistry | undefined; reason: string | null } {
  if (!existsSync(file)) {
    return { registry: undefined, reason: `수집 파일 없음 (${file})` }
  }
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    /* 체크포인트가 깨졌으면 **클랜을 통째로 건너뛴다.** 반쪽 목록으로 쓰면
       멀쩡한 클랜이 랭킹에서 사라진다 */
    return { registry: undefined, reason: `수집 파일을 읽지 못했다: ${String(error)}` }
  }
  const { registry, dropped } = parseClanRegistry(raw)
  if (registry.size === 0) {
    return { registry: undefined, reason: '수집 파일에 클랜 목록이 없다' }
  }
  if (dropped > 0) {
    warn(`[${leagueSlug}] 모양이 다른 클랜 ${dropped} 건을 목록에서 버렸다`)
  }
  return { registry, reason: null }
}

/**
 * 증분 기준 창(시간). 이 시간 안에 **적재된** 경기가 건드린 선수만 다시 계산한다.
 *
 * 5분마다 도는데 24시간을 되돌아보는 이유는 **겹치기 위해서**다.
 * 사이클 하나가 실패하거나 건너뛰어도(GitHub Actions 예약은 자주 밀린다) 다음 사이클의
 * 창이 그 구간을 덮으므로 값이 조용히 낡지 않는다. 창을 넓혀도 비용은 그 안에 적재된
 * 경기 수에 비례할 뿐이라 싸다 (실측: 세 리그 하루 161경기).
 */
export const DEFAULT_ROLLUP_WINDOW_HOURS = 24

export async function runSupplyRollup(input: {
  leagueSlug?: string | null
  file?: string | null
  confirm?: boolean
  /**
   * 전수 재계산. **없애지 않는다** — 증분 값이 어긋났을 때 되돌릴 길이다.
   * 기본은 증분(`sinceHours`)이다.
   */
  full?: boolean
  /** 증분 창(시간). 생략하면 `DEFAULT_ROLLUP_WINDOW_HOURS` */
  sinceHours?: number | null
  /**
   * 증분 기준 시각을 **그대로** 준다. 주면 `sinceHours` 보다 우선한다.
   *
   * 검증용이다. 시간 창은 호출 시각 기준이라 같은 명령을 두 번 돌려도 경계가 밀리는데,
   * 대조 실험에서는 그 밀림이 값 차이로 보인다 — 실제로 그렇게 거짓 FAIL 을 두 번 봤다.
   */
  since?: Date | null
}): Promise<SupplyRollupRunResult> {
  const since = input.full
    ? null
    : (input.since ??
      new Date(Date.now() - (input.sinceHours ?? DEFAULT_ROLLUP_WINDOW_HOURS) * 3_600_000))
  const result: SupplyRollupRunResult = {
    leagues: [],
    playerClans: {
      candidates: 0,
      withClan: 0,
      clanless: 0,
      clanNotInDb: 0,
      otherOrigin: 0,
      unchanged: 0,
      updated: 0,
    },
    skipped: [],
  }

  const all = await listSupplyMirrorLeagues()
  if (all.length === 0) {
    warn("origin='3rd.supply' 경기가 있는 리그가 없다. 먼저 supply-import 를 돌린다")
    return result
  }

  const targets = input.leagueSlug
    ? all.filter((league) => league.leagueSlug === input.leagueSlug)
    : all
  if (targets.length === 0) {
    /* 리그 이름을 잘못 적었을 때 조용히 0건으로 끝나면 성공처럼 보인다. 사유를 남긴다 */
    result.skipped.push({ reason: '미러 경기가 없는 리그', league: input.leagueSlug ?? '(전체)' })
    warn(
      `${input.leagueSlug} 에는 미러 경기가 없다. 대상: ${all.map((row) => row.leagueSlug).join(' · ')}`,
    )
    return result
  }

  /* 리그를 넘어 합치는 "현재 소속" 근거 (D-160). `Player.clanId` 는 전역 칸이라
     리그마다 따로 쓰면 마지막 리그가 이긴다 — 다 모은 뒤 한 번만 쓴다 */
  const playerClanPicks = new Map<string, PlayerClanPick>()

  for (const league of targets) {
    const file = mirrorCheckpointPath(league.leagueSlug, input.file)
    const { registry, reason } = readClanRegistry(league.leagueSlug, file)
    if (reason) {
      result.skipped.push({ reason: `클랜 건너뜀 — ${reason}`, league: league.leagueSlug })
      warn(`[${league.leagueSlug}] 클랜을 건너뛴다 — ${reason}`)
    } else {
      log(`[${league.leagueSlug}] 등록 클랜 ${registry?.size ?? 0} — ${file}`)
    }

    log(
      since
        ? `[${league.leagueSlug}] 증분 집계 — ${since.toISOString()} 이후 적재분이 건드린 선수만`
        : `[${league.leagueSlug}] 전수 집계 — 미러 경기 ${league.matches} 건`,
    )
    let lastLogged = 0
    const rolled = await rollupSupplyLeague({
      league,
      clanRegistry: registry,
      confirm: input.confirm,
      since,
      onProgress: (done, total) => {
        // 10% 단위로만 찍는다 — 13만 경기를 청크마다 찍으면 로그가 본문을 덮는다
        const step = Math.max(1, Math.floor(total / 10))
        if (done - lastLogged < step && done < total) return
        lastLogged = done
        log(`[${league.leagueSlug}] ${since ? '선수' : '경기'} ${done} / ${total}`)
      },
    })
    result.leagues.push(rolled)
    mergePlayerClanPicks(playerClanPicks, rolled.playerClans)

    /* 창에 리그의 상당 부분이 걸리면 증분이 전수보다 **느리고 무겁다** —
       고른 선수마다 그 리그 전 경기를 다시 읽기 때문이다. 오래 멈췄다가
       한꺼번에 따라잡을 때 그렇게 된다. 조용히 느려지지 않게 말해 준다 */
    if (rolled.mode === 'incremental' && (rolled.changedMatches ?? 0) > league.matches / 4) {
      warn(
        `[${league.leagueSlug}] 창에 걸린 경기 ${rolled.changedMatches} / ${league.matches} — ` +
          '증분이 전수보다 무겁다. 이런 규모라면 `--full` 이 낫다',
      )
    }

    if (rolled.players.clanNotInDb > 0) {
      /* 원본이 준 클랜인데 우리 `Clan` 표에 행이 없다. **만들지 않는다** — 지어내지 않기 위해서다 */
      result.skipped.push({
        reason: `클랜 slug 는 있는데 Clan 행이 없음(소속 미변경) ${rolled.players.clanNotInDb}`,
        league: league.leagueSlug,
      })
    }

    if (rolled.clans.conflicts > 0) {
      /* 같은 slug 인데 원본 클랜 id 가 다르다. 어느 쪽이 맞는지 우리가 모른다 — 사람이 본다 */
      result.skipped.push({
        reason: `원본 클랜 id 충돌 ${rolled.clans.conflicts}`,
        league: league.leagueSlug,
      })
      warn(`[${league.leagueSlug}] 같은 slug 인데 원본 클랜 id 가 달라 손대지 않은 클랜 ${rolled.clans.conflicts}`)
    }
    if (rolled.clans.leagueClansCreated > 0) {
      log(
        `[${league.leagueSlug}] 경기가 아직 없는 등록 클랜 ${rolled.clans.leagueClansCreated} 개를 랭킹에 올린다 ` +
          `(Clan 행 신규 ${rolled.clans.clansCreated})`,
      )
    }
    if (rolled.clans.unranked > 0) {
      result.skipped.push({
        reason: `미등록 클랜 랭킹 제외(경기는 남는다) ${rolled.clans.unranked}`,
        league: league.leagueSlug,
      })
    }
    if (rolled.players.withoutRating > 0) {
      result.skipped.push({
        reason: `원본 점수 근거 없음(rating 미변경) ${rolled.players.withoutRating}`,
        league: league.leagueSlug,
      })
    }
    if (rolled.players.withoutKnownStats > 0) {
      result.skipped.push({
        reason: `KDA 아는 경기 없음(킬뎃 미변경) ${rolled.players.withoutKnownStats}`,
        league: league.leagueSlug,
      })
    }
  }

  /* 전역 현재 소속. `origin='3rd.supply'` 인 선수만 건드린다 (D-160) */
  result.playerClans = await applySupplyPlayerClans({
    picks: playerClanPicks,
    confirm: input.confirm,
  })
  if (result.playerClans.clanNotInDb > 0) {
    result.skipped.push({
      reason: `Player.clanId — Clan 행이 없어 미변경 ${result.playerClans.clanNotInDb}`,
      league: '(전역)',
    })
  }
  if (result.playerClans.otherOrigin > 0) {
    result.skipped.push({
      reason: `Player.clanId — origin 이 3rd.supply 가 아니라 미변경 ${result.playerClans.otherOrigin}`,
      league: '(전역)',
    })
  }

  return result
}
