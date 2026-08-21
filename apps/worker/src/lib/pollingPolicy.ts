/**
 * 활동량 기반 폴링 정책 — **순수 함수**.
 *
 * 왜 필요한가
 *   운영 대상이 5,000명이라고 해서 5,000명을 같은 주기로 계속 조회하지 않는다.
 *   한 명을 한 번 확인하는 데 모드 4개 = **호출 4회**다. 고정 전수 조회는
 *   활동하지 않는 사람에게도 같은 비용을 쓴다.
 *
 * 규칙
 *   - 새 경기가 나오면 → 자주 본다 (승급)
 *   - 새 경기가 없으면 → 점점 뜸하게 본다 (강등)
 *   - 오래 조용하면 → 아주 가끔 본다
 *   - 사용자가 `전적갱신`을 누르면 → **최우선**
 *
 * **주기 숫자를 코드에 고정하지 않는다.** 넥슨 호출 한도를 아직 모르기 때문에
 * "몇 분마다 반드시"를 영구 규칙으로 박으면 나중에 전부 고쳐야 한다 (D-049).
 */

export type PollTier = 'hot' | 'warm' | 'cold' | 'dormant'

export const POLL_TIERS: readonly PollTier[] = ['hot', 'warm', 'cold', 'dormant']

export interface PollingConfig {
  /** 티어별 조회 주기(분) */
  intervalMinutes: Record<PollTier, number>
  /** 연속 빈 조회가 이 횟수를 넘으면 강등한다 */
  emptyPollsToWarm: number
  emptyPollsToCold: number
  emptyPollsToDormant: number
  /** 마지막 새 경기가 이 일수보다 오래되면 dormant로 본다 */
  dormantAfterDays: number
  /** 실패했을 때 다음 조회를 미루는 배수 */
  failureBackoffFactor: number
  /** 예정보다 이만큼(분) 넘게 밀린 대상은 우선순위를 끌어올린다 (starvation 방지) */
  starvationMinutes: number
  /**
   * 공식리그 등록 선수를 같은 티어의 일반 유저보다 먼저 본다 (Phase 8.2 · D-053).
   * 우리가 완성해야 하는 것은 리그 경기이고, 리그 경기의 완전성은 **등록 선수 전원의
   * 관측**에 달려 있기 때문이다.
   */
  leaguePriorityBoost: number
  /** 동료에게서 새 클랜전이 발견됐을 때 앞당길 대상 수 상한 (호출 폭주 방지) */
  propagationFanout: number
}

export const DEFAULT_POLLING_CONFIG: PollingConfig = {
  // 임시값이다. 실제 호출 한도를 확인하면 조정한다 (D-049)
  intervalMinutes: { hot: 30, warm: 180, cold: 1440, dormant: 10_080 },
  emptyPollsToWarm: 2,
  emptyPollsToCold: 5,
  emptyPollsToDormant: 10,
  dormantAfterDays: 30,
  failureBackoffFactor: 2,
  starvationMinutes: 1440,
  leaguePriorityBoost: 0.5,
  propagationFanout: 20,
}

function positiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback
}

export function readPollingConfig(
  env: Record<string, string | undefined> = process.env,
): PollingConfig {
  const base = DEFAULT_POLLING_CONFIG
  return {
    intervalMinutes: {
      hot: positiveInt(env.NEXON_POLL_HOT_MINUTES, base.intervalMinutes.hot),
      warm: positiveInt(env.NEXON_POLL_WARM_MINUTES, base.intervalMinutes.warm),
      cold: positiveInt(env.NEXON_POLL_COLD_MINUTES, base.intervalMinutes.cold),
      dormant: positiveInt(env.NEXON_POLL_DORMANT_MINUTES, base.intervalMinutes.dormant),
    },
    emptyPollsToWarm: positiveInt(env.NEXON_POLL_EMPTY_TO_WARM, base.emptyPollsToWarm),
    emptyPollsToCold: positiveInt(env.NEXON_POLL_EMPTY_TO_COLD, base.emptyPollsToCold),
    emptyPollsToDormant: positiveInt(env.NEXON_POLL_EMPTY_TO_DORMANT, base.emptyPollsToDormant),
    dormantAfterDays: positiveInt(env.NEXON_POLL_DORMANT_DAYS, base.dormantAfterDays),
    failureBackoffFactor: positiveInt(
      env.NEXON_POLL_FAILURE_BACKOFF,
      base.failureBackoffFactor,
    ),
    starvationMinutes: positiveInt(env.NEXON_POLL_STARVATION_MINUTES, base.starvationMinutes),
    leaguePriorityBoost: positiveNumber(
      env.NEXON_POLL_LEAGUE_BOOST,
      base.leaguePriorityBoost,
    ),
    propagationFanout: positiveInt(env.NEXON_POLL_PROPAGATION_FANOUT, base.propagationFanout),
  }
}

function positiveNumber(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

/** 정책이 읽고 쓰는 상태 (DB 모델의 부분집합) */
export type PollPriorityClass = 'league' | 'general'

export interface PollState {
  ouid: string
  tier: PollTier
  /** 공식리그 등록 선수인가 — 같은 티어면 먼저 본다 */
  priorityClass: PollPriorityClass
  intervalMinutes: number
  nextPollAt: Date
  lastPolledAt: Date | null
  lastNewMatchAt: Date | null
  consecutiveEmptyPolls: number
  recentNewMatchCount: number
  manualRefreshRequestedAt: Date | null
  lastPollStatus: string | null
}

export interface PollOutcome {
  /** 이번 조회에서 **처음 본** 경기 수 */
  newMatches: number
  /** 조회 자체가 성공했는가 (실패는 티어를 내리지 않는다 — 활동량과 무관하다) */
  success: boolean
  /** 접근이 막혔는가 (403/429). 이때는 뒤로 더 미룬다 */
  blocked?: boolean
}

export interface PollStatePatch {
  tier: PollTier
  intervalMinutes: number
  nextPollAt: Date
  lastPolledAt: Date
  lastSuccessfulPollAt?: Date
  lastNewMatchAt?: Date
  consecutiveEmptyPolls: number
  recentNewMatchCount: number
  manualRefreshRequestedAt: null
  lastPollStatus: 'success' | 'empty' | 'failed' | 'blocked'
}

const MINUTE_MS = 60 * 1000
const DAY_MS = 24 * 60 * MINUTE_MS

/** 연속 빈 조회 횟수 → 티어 */
export function tierForEmptyPolls(emptyPolls: number, config: PollingConfig): PollTier {
  if (emptyPolls >= config.emptyPollsToDormant) return 'dormant'
  if (emptyPolls >= config.emptyPollsToCold) return 'cold'
  if (emptyPolls >= config.emptyPollsToWarm) return 'warm'
  return 'hot'
}

/**
 * 조회 결과를 반영해 다음 상태를 만든다.
 *
 * - 새 경기 발견 → `hot`, 주기 **감소**, 연속 빈 조회 초기화
 * - 빈 조회 → 연속 횟수 증가, 기준을 넘으면 강등(주기 증가)
 * - 오래 조용함 → `dormant`
 * - 실패/차단 → 티어는 그대로 두고 다음 조회만 미룬다
 */
export function nextPollState(
  state: PollState,
  outcome: PollOutcome,
  now: Date,
  config: PollingConfig = DEFAULT_POLLING_CONFIG,
): PollStatePatch {
  if (!outcome.success) {
    const interval = state.intervalMinutes * config.failureBackoffFactor
    return {
      tier: state.tier,
      intervalMinutes: interval,
      nextPollAt: new Date(now.getTime() + interval * MINUTE_MS),
      lastPolledAt: now,
      consecutiveEmptyPolls: state.consecutiveEmptyPolls,
      recentNewMatchCount: state.recentNewMatchCount,
      manualRefreshRequestedAt: null,
      lastPollStatus: outcome.blocked ? 'blocked' : 'failed',
    }
  }

  if (outcome.newMatches > 0) {
    const interval = config.intervalMinutes.hot
    return {
      tier: 'hot',
      intervalMinutes: interval,
      nextPollAt: new Date(now.getTime() + interval * MINUTE_MS),
      lastPolledAt: now,
      lastSuccessfulPollAt: now,
      lastNewMatchAt: now,
      consecutiveEmptyPolls: 0,
      recentNewMatchCount: state.recentNewMatchCount + outcome.newMatches,
      manualRefreshRequestedAt: null,
      lastPollStatus: 'success',
    }
  }

  const emptyPolls = state.consecutiveEmptyPolls + 1
  let tier = tierForEmptyPolls(emptyPolls, config)

  // 오래 조용하면 연속 횟수와 무관하게 dormant로 본다
  const quietSince = state.lastNewMatchAt ?? state.lastPolledAt
  if (
    quietSince !== null &&
    now.getTime() - quietSince.getTime() >= config.dormantAfterDays * DAY_MS
  ) {
    tier = 'dormant'
  }

  const interval = config.intervalMinutes[tier]
  return {
    tier,
    intervalMinutes: interval,
    nextPollAt: new Date(now.getTime() + interval * MINUTE_MS),
    lastPolledAt: now,
    lastSuccessfulPollAt: now,
    consecutiveEmptyPolls: emptyPolls,
    recentNewMatchCount: state.recentNewMatchCount,
    manualRefreshRequestedAt: null,
    lastPollStatus: 'empty',
  }
}

const TIER_PRIORITY: Record<PollTier, number> = { hot: 1, warm: 2, cold: 3, dormant: 4 }

/**
 * 우선순위 — 낮을수록 먼저.
 *
 * 0 사용자 수동 갱신 · 1 hot · 2 warm · 3 cold · 4 dormant
 *
 * **starvation 방지**: 예정 시각을 크게 넘겨 밀린 대상은 티어와 무관하게 1순위로 올린다.
 * 그렇지 않으면 hot이 계속 채워질 때 dormant는 영원히 조회되지 않는다.
 */
export function effectivePriority(
  state: Pick<PollState, 'tier' | 'nextPollAt' | 'manualRefreshRequestedAt' | 'priorityClass'>,
  now: Date,
  config: PollingConfig = DEFAULT_POLLING_CONFIG,
): number {
  if (state.manualRefreshRequestedAt !== null) return 0

  const leagueBonus = state.priorityClass === 'league' ? config.leaguePriorityBoost : 0
  const overdueMinutes = (now.getTime() - state.nextPollAt.getTime()) / MINUTE_MS
  if (overdueMinutes >= config.starvationMinutes) return 1 - leagueBonus

  return TIER_PRIORITY[state.tier] - leagueBonus
}

/** 큐 정렬 — 우선순위 → 오래 기다린 순 */
export function comparePollTargets<
  T extends Pick<PollState, 'tier' | 'nextPollAt' | 'manualRefreshRequestedAt' | 'priorityClass'>,
>(left: T, right: T, now: Date, config: PollingConfig = DEFAULT_POLLING_CONFIG): number {
  const byPriority =
    effectivePriority(left, now, config) - effectivePriority(right, now, config)
  if (byPriority !== 0) return byPriority
  return left.nextPollAt.getTime() - right.nextPollAt.getTime()
}

/** 조회 대상 선택 — 예정 시각이 지났거나 수동 요청이 걸린 대상만 */
export function selectPollTargets<
  T extends Pick<PollState, 'tier' | 'nextPollAt' | 'manualRefreshRequestedAt' | 'priorityClass'>,
>(candidates: readonly T[], now: Date, limit: number, config: PollingConfig = DEFAULT_POLLING_CONFIG): T[] {
  return candidates
    .filter(
      (candidate) =>
        candidate.manualRefreshRequestedAt !== null ||
        candidate.nextPollAt.getTime() <= now.getTime(),
    )
    .sort((left, right) => comparePollTargets(left, right, now, config))
    .slice(0, limit)
}

/* ------------------------------------------------------------ 상세 재조회 --- */

export interface DetailFetchDecision {
  fetch: boolean
  reason: 'new' | 'refresh_due' | 'forced' | 'already_have' | 'not_due'
}

/**
 * 상세를 다시 받아야 하는가.
 *
 * **이미 저장한 경기의 상세를 또 받지 않는다** (C-4). 다른 사람의 목록에서 같은
 * `match_id`가 나와도 마찬가지다 — `/match-detail`의 파라미터는 `match_id` 하나뿐이라
 * 누가 부르든 같은 응답이 온다(A-1 실측, D-044).
 *
 * 예외는 신선도 정책(기본 30일)에 따른 재검증뿐이다.
 */
export function decideDetailFetch(input: {
  hasDetail: boolean
  refreshDueAt: Date | null
  now: Date
  force?: boolean
}): DetailFetchDecision {
  if (input.force) return { fetch: true, reason: 'forced' }
  if (!input.hasDetail) return { fetch: true, reason: 'new' }
  if (input.refreshDueAt !== null && input.refreshDueAt.getTime() <= input.now.getTime()) {
    return { fetch: true, reason: 'refresh_due' }
  }
  return { fetch: false, reason: 'already_have' }
}

/* ------------------------------------------------------------- 전파(propagation) --- */

export interface PropagationInput {
  /** 새 클랜전을 발견한 선수 */
  discoveredBy: string
  /** 그 선수와 같은 로스터(같은 클랜)에 등록된 동료 ouid */
  rosterPeers: readonly string[]
  /**
   * 상대 클랜이 **증거로 확정된 경우에만** 넘긴다.
   * 확정되지 않았으면 추측하지 않는다 (사용자 지시 H-2).
   */
  opponentPeers?: readonly string[]
  config?: PollingConfig
}

/**
 * 한 선수에게서 새 클랜전이 나오면, **같은 경기를 봤을 사람들**을 앞당겨 조회한다.
 *
 * 목적은 호출을 늘리는 것이 아니라 **완전성 확보 시점을 앞당기는 것**이다.
 * 어차피 조회할 사람을 먼저 조회할 뿐이다.
 */
export function propagationTargets(input: PropagationInput): string[] {
  const config = input.config ?? DEFAULT_POLLING_CONFIG
  const targets = [...input.rosterPeers, ...(input.opponentPeers ?? [])].filter(
    (ouid) => ouid !== input.discoveredBy,
  )
  return [...new Set(targets)].slice(0, config.propagationFanout)
}

/* --------------------------------------------------------------- 호출량 모델 --- */

export interface CallVolumeModel {
  /** 티어별 대상 수 */
  distribution: Record<PollTier, number>
  /** 대상 1명을 볼 때 부르는 모드 수 */
  modesPerPoll: number
  config?: PollingConfig
}

/**
 * 하루 호출 수 추정.
 *
 * ```
 * Σ (티어 대상 수 × 모드 수 × (1440 / 티어 주기(분)))
 * ```
 *
 * **분포는 가정이다.** 실제 값은 `NexonPollRun` 기록으로 바꿔 계산한다 (D-051).
 */
export function estimateDailyCalls(model: CallVolumeModel): number {
  const config = model.config ?? DEFAULT_POLLING_CONFIG
  return POLL_TIERS.reduce((total, tier) => {
    const users = model.distribution[tier] ?? 0
    const pollsPerDay = (24 * 60) / config.intervalMinutes[tier]
    return total + users * model.modesPerPoll * pollsPerDay
  }, 0)
}

/** 고정 주기로 전원을 도는 경우 (비교 기준) */
export function estimateFixedDailyCalls(input: {
  users: number
  modesPerPoll: number
  intervalMinutes: number
}): number {
  return input.users * input.modesPerPoll * ((24 * 60) / input.intervalMinutes)
}
