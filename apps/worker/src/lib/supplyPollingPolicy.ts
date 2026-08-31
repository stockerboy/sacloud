/**
 * 3rd.supply 증분 동기화의 **클랜별 적응형 폴링** — 순수 함수만 있다.
 *
 * ── 무엇을 고치는 작업인가
 *   증분 사이클은 등록 클랜 **190개 전부**의 경기목록 첫 페이지를 훑었다.
 *   5분 주기로 바꾸면 새 경기는 회당 0.6건뿐인데(실측: 최근 30일 161경기/일)
 *   요청은 회당 190건 그대로다. **덜 훑어야 한다.**
 *
 * ── 개념은 새로 만들지 않았다
 *   넥슨 수집의 적응형 폴링(`pollingPolicy.ts` · Phase 8.1 · D-049)과 **같은 개념**이다 —
 *   활동량으로 티어를 나누고 티어마다 주기를 다르게 준다. 이름(`hot`/`warm`/`cold`/`dormant`)도
 *   그대로 쓴다. 다른 점은 둘뿐이다.
 *
 *   1. **활동량을 조회 결과에서 배우지 않는다.** 클랜의 마지막 경기 시각을 우리 DB 가
 *      이미 알고 있다(`Match.startAt`). 외부 요청이 필요 없다.
 *   2. **상태를 저장하지 않는다.** 넥슨 쪽은 `NexonPollState` 행에 `nextPollAt` 을 적어 두지만,
 *      이 파이프라인은 GitHub Actions 의 **빈 작업공간**에서 돈다 — 체크포인트 파일은
 *      `.gitignore` 대상이고(D-153) 러너 사이에 남는 것이 없다. 그래서 "다음에 언제 볼지"를
 *      기록하는 대신 **시계에서 계산한다.**
 *
 * ── 시계에서 계산한다 (stateless phase scheduling)
 *   사이클 번호 = `floor(epoch분 / 사이클분)` 이고, 클랜마다 slug 해시로 **고정 위상**을 준다.
 *
 *       볼 차례인가  =  사이클번호 % (주기/사이클) == 해시(slug) % (주기/사이클)
 *
 *   - 상태가 없으니 러너가 매번 새로 떠도 같은 답이 나온다
 *   - 위상이 흩어지므로 같은 사이클에 몰리지 않는다
 *   - **굶는 클랜이 생길 수 없다.** 어떤 클랜이든 자기 주기마다 정확히 한 번 차례가 온다.
 *     `dormant` 조차 하루에 한 번은 반드시 본다 (실측 시뮬레이션에서 최장 미조회 24.0시간)
 *
 * ── 주기 값을 코드에 흩뿌리지 않는다
 *   `CLAUDE.md` 3-B 6번(래더 상수를 하드코딩하지 않는다)과 같은 취지다.
 *   숫자는 전부 `SUPPLY_POLLING_DEFAULTS` 한 곳에 있고 `SUPPLY_POLL_*` 환경변수로 덮어쓴다.
 */

export type SupplyPollTier = 'hot' | 'warm' | 'cold' | 'dormant'

/** 우선순위 순서 — 상한에 걸렸을 때 뒤쪽부터 미룬다 */
export const SUPPLY_POLL_TIERS: readonly SupplyPollTier[] = ['hot', 'warm', 'cold', 'dormant']

export interface SupplyPollingConfig {
  /** 스케줄러가 도는 간격(분). 워크플로 `cron` 과 같은 값이어야 한다 */
  cycleMinutes: number
  /** 마지막 경기가 이 시간 안이면 `hot` */
  hotWithinHours: number
  /** `warm` 상한 */
  warmWithinHours: number
  /** `cold` 상한. 이보다 오래됐거나 경기가 아예 없으면 `dormant` */
  coldWithinHours: number
  /** 티어별 조회 주기(분) */
  intervalMinutes: Record<SupplyPollTier, number>
  /**
   * 한 사이클에 훑을 클랜 수 상한. **안전판이다** — 평상시에는 걸리지 않는다
   * (실측 시뮬레이션 평균 27.7 · 최대 58). 걸리면 낮은 티어부터 다음 차례로 미룬다.
   */
  maxClansPerCycle: number
  /**
   * 한 사이클에 **적어도** 이만큼은 훑는다 — 하한이다 (2026-09-01 · D-225).
   *
   * ── 왜 하한이 필요한가
   *   티어는 **우리 DB 가 아는 마지막 경기 시각**으로 정해진다. 그런데 그 값은
   *   우리가 수집을 해야 갱신된다. 그래서 수집이 멈추면 티어가 스스로 내려간다.
   *
   *     수집이 뜸해진다 → `lastMatchAt` 이 낡는다 → 티어가 내려간다
   *       → 더 뜸하게 본다 → 더 낡는다 …
   *
   *   **되먹임 고리다.** 조용한 리그일수록 빨리 빠진다.
   *   실측(2026-09-01 운영): 대룰리그 45곳 중 38곳이 `dormant` 가 되어 사이클당
   *   **1곳**만 훑었고, 최신 경기가 **49시간** 밀렸다. 같은 시각 supply 는 7.8시간이었다.
   *
   *   하한은 그 고리를 끊는다. 볼 차례가 아닌 클랜이라도 `cycleIndex` 로 **돌아가며**
   *   채워 넣어, 어떤 리그도 「사이클당 1곳」으로 굶지 않게 한다.
   *
   * 비용은 리그당 이 값이 상한이다. 0 이면 하한을 끄는 것이고, 예전 동작과 같다.
   */
  minClansPerCycle: number
  /**
   * 경기목록을 몇 페이지까지 확인하고 멈추는가.
   *
   * 목록은 **최신순**이라 이미 아는 경기를 한 건이라도 만나면 그 아래는 전부 과거다.
   * 그래서 기본은 1페이지다. 원본 정렬을 의심할 일이 생기면 이 값만 올린다.
   */
  knownPagesToStop: number
}

/**
 * 실측으로 정한 기본값 (2026-08-28).
 *
 * 최근 30일 · 등록 클랜 190개 · 실제 경기 4,839건으로 5분 사이클 8,640회를 시뮬레이션했다.
 * 평균 27.7클랜/사이클 · 새벽 한산한 시간대 16.6 · 자정 전후 42.8 · 최대 58.
 * 어떤 클랜도 24시간을 넘겨 방치되지 않았다.
 */
export const SUPPLY_POLLING_DEFAULTS: SupplyPollingConfig = {
  cycleMinutes: 5,
  hotWithinHours: 6,
  warmWithinHours: 72,
  coldWithinHours: 504,
  intervalMinutes: { hot: 5, warm: 30, cold: 360, dormant: 1440 },
  maxClansPerCycle: 120,
  /* 리그당 사이클 6곳 = 30분에 최대 36곳. 대룰(45곳)·열산(111곳)도 굶지 않는다 */
  minClansPerCycle: 6,
  knownPagesToStop: 1,
}

function nonNegativeInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback
}

function positiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback
}

export function readSupplyPollingConfig(
  env: Record<string, string | undefined> = process.env,
): SupplyPollingConfig {
  const base = SUPPLY_POLLING_DEFAULTS
  return {
    cycleMinutes: positiveInt(env['SUPPLY_POLL_CYCLE_MINUTES'], base.cycleMinutes),
    hotWithinHours: positiveInt(env['SUPPLY_POLL_HOT_HOURS'], base.hotWithinHours),
    warmWithinHours: positiveInt(env['SUPPLY_POLL_WARM_HOURS'], base.warmWithinHours),
    coldWithinHours: positiveInt(env['SUPPLY_POLL_COLD_HOURS'], base.coldWithinHours),
    intervalMinutes: {
      hot: positiveInt(env['SUPPLY_POLL_HOT_MINUTES'], base.intervalMinutes.hot),
      warm: positiveInt(env['SUPPLY_POLL_WARM_MINUTES'], base.intervalMinutes.warm),
      cold: positiveInt(env['SUPPLY_POLL_COLD_MINUTES'], base.intervalMinutes.cold),
      dormant: positiveInt(env['SUPPLY_POLL_DORMANT_MINUTES'], base.intervalMinutes.dormant),
    },
    maxClansPerCycle: positiveInt(env['SUPPLY_POLL_MAX_CLANS'], base.maxClansPerCycle),
    /* 하한만 0 을 허용한다 — 0 은 「하한을 끈다」는 뜻이라 유효한 값이다 */
    minClansPerCycle: nonNegativeInt(env['SUPPLY_POLL_MIN_CLANS'], base.minClansPerCycle),
    knownPagesToStop: positiveInt(env['SUPPLY_POLL_KNOWN_PAGES'], base.knownPagesToStop),
  }
}

const HOUR_MS = 3_600_000
const MINUTE_MS = 60_000

/**
 * 클랜의 티어 — **마지막 경기 시각 하나로** 정한다.
 *
 * 경기가 한 건도 없으면(`null`) `dormant` 다. 새로 등록해 아직 안 뛴 클랜도 여기에 들어가지만
 * 하루에 한 번은 반드시 보므로 놓치지 않는다.
 */
export function supplyClanTier(
  lastMatchAt: Date | null,
  now: Date,
  config: SupplyPollingConfig = SUPPLY_POLLING_DEFAULTS,
): SupplyPollTier {
  if (lastMatchAt === null) return 'dormant'
  const hours = (now.getTime() - lastMatchAt.getTime()) / HOUR_MS
  /* 미래 시각(시계 어긋남)도 "방금 뛰었다"로 본다 — 놓치는 쪽보다 낫다 */
  if (hours < config.hotWithinHours) return 'hot'
  if (hours < config.warmWithinHours) return 'warm'
  if (hours < config.coldWithinHours) return 'cold'
  return 'dormant'
}

/**
 * 사이클 번호 — **epoch 기준**이라 러너가 바뀌어도 같은 값이 나온다.
 * 저장하지 않는 대신 시계에서 읽는 값이므로, 이 함수가 스케줄의 유일한 기억이다.
 */
export function supplyCycleIndex(
  now: Date,
  config: SupplyPollingConfig = SUPPLY_POLLING_DEFAULTS,
): number {
  return Math.floor(now.getTime() / (config.cycleMinutes * MINUTE_MS))
}

/** FNV-1a. 암호용이 아니라 **위상을 고르게 흩기 위한** 해시다 */
export function supplyClanHash(slug: string): number {
  let hash = 2166136261
  for (let index = 0; index < slug.length; index += 1) {
    hash ^= slug.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/** 티어 주기를 사이클 수로 바꾼다. 최소 1 — 주기가 사이클보다 짧으면 매번 본다 */
export function ticksForTier(tier: SupplyPollTier, config: SupplyPollingConfig): number {
  return Math.max(1, Math.round(config.intervalMinutes[tier] / config.cycleMinutes))
}

/** 이번 사이클에 이 클랜을 볼 차례인가 */
export function isSupplyClanDue(input: {
  slug: string
  tier: SupplyPollTier
  cycleIndex: number
  config?: SupplyPollingConfig
}): boolean {
  const config = input.config ?? SUPPLY_POLLING_DEFAULTS
  const ticks = ticksForTier(input.tier, config)
  if (ticks === 1) return true
  return input.cycleIndex % ticks === supplyClanHash(input.slug) % ticks
}

export interface SupplyClanActivity {
  slug: string
  /** 우리 DB 가 아는 그 클랜의 마지막 경기. 없으면 `null` */
  lastMatchAt: Date | null
}

export interface SupplyPollSelection {
  /** 이번 사이클에 훑을 클랜 slug (정렬 고정) */
  scan: string[]
  cycleIndex: number
  /** 티어별 [등록 수, 이번에 볼 수] */
  byTier: Record<SupplyPollTier, { total: number; due: number }>
  /** 상한에 걸려 다음 차례로 미룬 클랜 수. 평상시 0 */
  deferred: number
  /** 하한을 채우려고 **차례가 아닌데도** 넣은 클랜 수 (D-225). 바쁜 리그에서는 0 */
  toppedUp: number
}

/**
 * 이번 사이클에 훑을 클랜 목록. **순수 함수다** — 같은 입력이면 언제나 같은 답이다.
 *
 * 상한(`maxClansPerCycle`)에 걸리면 **높은 티어부터** 채우고 나머지는 미룬다.
 * 미룬 클랜은 자기 주기의 다음 차례에 다시 온다 — 영원히 빠지지 않는다.
 */
export function selectSupplyClansToScan(input: {
  clans: readonly SupplyClanActivity[]
  now: Date
  config?: SupplyPollingConfig
}): SupplyPollSelection {
  const config = input.config ?? SUPPLY_POLLING_DEFAULTS
  const cycleIndex = supplyCycleIndex(input.now, config)

  const byTier: Record<SupplyPollTier, { total: number; due: number }> = {
    hot: { total: 0, due: 0 },
    warm: { total: 0, due: 0 },
    cold: { total: 0, due: 0 },
    dormant: { total: 0, due: 0 },
  }

  const due: { slug: string; tier: SupplyPollTier }[] = []
  for (const clan of input.clans) {
    const tier = supplyClanTier(clan.lastMatchAt, input.now, config)
    byTier[tier].total += 1
    if (!isSupplyClanDue({ slug: clan.slug, tier, cycleIndex, config })) continue
    byTier[tier].due += 1
    due.push({ slug: clan.slug, tier })
  }

  /* 티어 우선 → slug 순. slug 로 마무리해야 같은 입력에 같은 순서가 나온다 */
  due.sort((left, right) => {
    const byRank =
      SUPPLY_POLL_TIERS.indexOf(left.tier) - SUPPLY_POLL_TIERS.indexOf(right.tier)
    return byRank !== 0 ? byRank : left.slug.localeCompare(right.slug)
  })

  const scan = due.slice(0, config.maxClansPerCycle).map((row) => row.slug)

  /* ── 하한을 채운다 (D-225).
     차례가 아닌 클랜을 `cycleIndex` 로 **돌아가며** 넣는다. 창을 굴리므로 특정 클랜만
     계속 뽑히지 않고, 순수 함수라 같은 입력이면 언제나 같은 답이 나온다.
     상한을 넘기지는 않는다 — 하한이 상한보다 크면 상한이 이긴다. */
  const floor = Math.min(config.minClansPerCycle, config.maxClansPerCycle)
  let toppedUp = 0
  if (scan.length < floor) {
    const chosen = new Set(scan)
    const rest = input.clans
      .filter((clan) => !chosen.has(clan.slug))
      .map((clan) => clan.slug)
      .sort((left, right) => left.localeCompare(right))
    const need = Math.min(floor - scan.length, rest.length)
    /* 창을 **소비한 만큼** 민다. `cycleIndex` 하나로 밀면 사이클마다 1칸만 움직여
       6곳 중 5곳이 직전과 겹치고, 한 바퀴 도는 데 클랜 수만큼의 사이클이 걸린다.
       `floor` 를 곱하면 창이 이어 붙어 `클랜수/floor` 사이클이면 한 바퀴가 돈다.
       음수 방지 — `cycleIndex` 는 epoch 기준 양수지만 설정이 바뀌면 0 일 수 있다 */
    const start =
      rest.length === 0 ? 0 : (((cycleIndex * floor) % rest.length) + rest.length) % rest.length
    for (let step = 0; step < need; step += 1) {
      scan.push(rest[(start + step) % rest.length] as string)
      toppedUp += 1
    }
  }

  return { scan, cycleIndex, byTier, deferred: due.length - (scan.length - toppedUp), toppedUp }
}

/* ------------------------------------------------------------- 요청량 모델 --- */

export interface SupplyCycleCostInput {
  /** 리그 수 — 리그 숫자 id 를 DB 에서 못 찾을 때만 1건씩 든다 */
  leagueLookups: number
  /** 클랜랭킹 페이지 수 (D-157 클랜 점수 갱신) */
  rankPages: number
  /** 이번 사이클에 훑을 클랜 수 */
  clansScanned: number
  /** 클랜당 경기목록 페이지 수 */
  pagesPerClan: number
  /** 새로 발견해 상세를 받을 경기 수 */
  newMatchDetails: number
}

/**
 * 사이클 하나의 요청 수. 워크플로 주석의 계산과 **같은 식**을 코드로 남긴다 —
 * 주석만 있으면 값이 바뀌었을 때 조용히 거짓말이 된다.
 */
export function estimateSupplyCycleRequests(input: SupplyCycleCostInput): number {
  return (
    input.leagueLookups +
    input.rankPages +
    input.clansScanned * input.pagesPerClan +
    input.newMatchDetails
  )
}
