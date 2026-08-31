/**
 * 칭호 인증의 **판정 로직** — 순수 함수만 둔다 (`lib/identityWatch.ts` 와 같은 이유).
 *
 * 왜 분리하나
 *   DB·API 를 섞으면 테스트가 5초 타임아웃(D-187)에 걸려 조용히 skip 된다.
 *   판정은 여기서 하고, 저장과 호출은 `jobs/titleChallenge.ts` 가 한다.
 *
 * 무엇을 판정하나
 *   ① 이 관측이 도전을 **통과시키는가**
 *   ② 도전이 아직 **살아 있는가** (만료 · 시도 소진)
 *   ③ 어떤 칭호를 **지정할 것인가** (결정적으로 고른다)
 *   ④ 다음에 **언제 다시 볼 것인가**
 *
 * ── 인증의 기준은 `ouid` 다 (D-220)
 *   닉네임으로 잇지 않는다. 닉은 식별자가 아니고, 옛 닉은 남이 물려받는다.
 *
 * ── ⚠ 이 파일의 핵심 — **「지금 그 칭호다」로는 인증하지 않는다**
 *   사양 4장은 지정 칭호가 **누구나 가진 흔한 칭호**여야 한다고 적어 두었다.
 *   사용자가 **보유한 칭호 중에서만** 바꿀 수 있기 때문이다. 그런데 흔하다는 것은
 *   **아무 관계 없는 사람도 이미 그 칭호를 달고 있을 수 있다**는 뜻이다.
 *
 *   그래서 "지금 칭호가 『○○』 인가" 만 보면, 남의 `ouid` 로 도전을 열어 두고
 *   **가만히 앉아 있다가** 그 사람이 우연히 그 칭호를 달면 인증이 뚫린다.
 *
 *   판정을 **상태가 아니라 사건**으로 바꿔서 막는다:
 *   ```
 *   발급 시각에 현재 칭호를 기록한다          baselineTitle
 *   그 칭호와 다른 것을 지정한다               expectedTitle !== baselineTitle
 *   발급 이후에 baseline → expected 로 **바뀐 것을 관측**해야 통과한다
 *   ```
 *   발급 시점에 이미 그 칭호였다면 그 도전은 **처음부터 무효**다 (`issueChallenge` 가 거부).
 */

/* -------------------------------------------------------------------- 상수 --- */

/**
 * 도전 유효기간(분). 넉넉하게 잡는다.
 *
 * 칭호 변경이 `user/basic` 에 반영되는 데 걸리는 시간은 아직 `[미확인]` 이다
 * (사양 4장). 닉 변경은 몇 분이었으므로(D-220) 비슷할 가능성이 높지만 **재보지 않았다.**
 * 그래서 설계를 **지연에 둔감하게** 만든다 — 30분이면 반영이 열 배 느려도 견딘다.
 */
export const CHALLENGE_TTL_MINUTES = 30

/**
 * 한 도전에서 허용하는 확인 횟수.
 *
 * 사람이 「확인」 버튼을 누르는 것과 폴링이 도는 것을 **합쳐서** 센다.
 * 이 수를 넘으면 도전을 닫는다 — 넥슨 API 를 무한히 두드리지 않는다.
 */
export const MAX_ATTEMPTS = 40

/** 사람이 「확인」을 연타하지 못하게 하는 최소 간격(초) */
export const MIN_MANUAL_INTERVAL_SECONDS = 10

/* ------------------------------------------------------------- 문자열 정규화 --- */

/**
 * 칭호 문자열을 견주기 좋게 다듬는다.
 *
 * 넥슨은 무소속을 빈 문자열로 줄 때가 있다(`identityWatch.norm` 과 같은 사정).
 * 칭호도 **미착용이면 빈 문자열**일 수 있으므로 `null` 과 `''` 를 같은 것으로 본다.
 *
 * **대소문자를 접지 않는다.** 칭호는 한글이 대부분이고, 라틴 문자가 섞인 칭호에서
 * 대소문자를 접으면 서로 다른 칭호가 같아질 수 있다. 지어내지 않는다.
 */
export function normalizeTitle(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null
  /* NFC 로 모은다 — 한글은 조합형/완성형이 섞여 들어올 수 있다 */
  const t = value.normalize('NFC').trim()
  return t === '' ? null : t
}

/** 두 칭호가 같은 것인가 */
export function sameTitle(a: string | null | undefined, b: string | null | undefined): boolean {
  return normalizeTitle(a) === normalizeTitle(b)
}

/* ---------------------------------------------------------------- 도전 상태 --- */

/**
 * 도전의 상태.
 *
 * `pending`  아직 기다리는 중
 * `verified` 통과했다 — 알을 깬다
 * `expired`  유효기간이 지났다
 * `exhausted` 확인 횟수를 다 썼다
 * `cancelled` 사람이 접었다
 */
export type ChallengeStatus = 'pending' | 'verified' | 'expired' | 'exhausted' | 'cancelled'

/** 판정에 필요한 도전의 값들 — DB 모델 전체를 끌고 오지 않는다 */
export interface ChallengeView {
  /** 인증 대상 계정. **판정의 유일한 기준이다** (D-220) */
  ouid: string
  /** 발급 시점에 그 계정이 달고 있던 칭호. 미착용이면 `null` */
  baselineTitle: string | null
  /** 우리가 지정한 칭호 */
  expectedTitle: string
  status: ChallengeStatus
  issuedAt: Date
  expiresAt: Date
  attempts: number
}

/**
 * 지금 이 도전이 살아 있는가.
 *
 * 저장된 `status` 를 그대로 믿지 않는다 — 만료는 **시각이 지나면 일어나는 일**이고,
 * 그 순간에 아무도 표를 고쳐 주지 않기 때문이다. 읽을 때 계산한다.
 */
export function effectiveStatus(challenge: ChallengeView, now: Date): ChallengeStatus {
  if (challenge.status !== 'pending') return challenge.status
  if (now.getTime() >= challenge.expiresAt.getTime()) return 'expired'
  if (challenge.attempts >= MAX_ATTEMPTS) return 'exhausted'
  return 'pending'
}

/** 아직 확인을 시도해도 되는가 */
export function isOpen(challenge: ChallengeView, now: Date): boolean {
  return effectiveStatus(challenge, now) === 'pending'
}

/* ------------------------------------------------------------------ 발급 --- */

/** 발급이 거부된 이유. 통과면 `null` */
export type IssueRejection =
  | 'no-pool'
  /** 지정할 수 있는 칭호가 남지 않았다 — 보유 칭호가 하나뿐인 계정 */
  | 'pool-exhausted'
  /** 이미 열린 도전이 있다. `ouid` 당 하나만 연다 */
  | 'already-open'

export interface IssueInput {
  ouid: string
  /** 발급 시점의 현재 칭호 (`user/basic.title_name`). 미착용이면 `null` */
  currentTitle: string | null
  /** 지정 후보 — 흔한 칭호 목록 (사양 4장) */
  pool: readonly string[]
  /** 이 `ouid` 에 이미 열린 도전이 있는가 */
  hasOpenChallenge: boolean
  now: Date
}

export interface IssuedChallenge {
  expectedTitle: string
  baselineTitle: string | null
  issuedAt: Date
  expiresAt: Date
}

/**
 * 도전을 발급한다.
 *
 * **현재 칭호와 같은 것은 절대 지정하지 않는다** — 그러면 아무것도 안 하고 통과한다.
 * 후보에서 현재 칭호를 빼고 고른다. 뺐더니 남는 게 없으면 발급하지 않는다
 * (보유 칭호가 하나뿐인 계정. 지어내서 통과시키지 않는다).
 */
export function issueChallenge(
  input: IssueInput,
): { ok: true; challenge: IssuedChallenge } | { ok: false; reason: IssueRejection } {
  if (input.hasOpenChallenge) return { ok: false, reason: 'already-open' }

  const pool = input.pool.map((t) => normalizeTitle(t)).filter((t): t is string => t !== null)
  if (pool.length === 0) return { ok: false, reason: 'no-pool' }

  const current = normalizeTitle(input.currentTitle)
  const candidates = pool.filter((t) => t !== current)
  if (candidates.length === 0) return { ok: false, reason: 'pool-exhausted' }

  const expectedTitle = pickTitle(candidates, input.ouid, input.now)

  return {
    ok: true,
    challenge: {
      expectedTitle,
      baselineTitle: current,
      issuedAt: input.now,
      expiresAt: new Date(input.now.getTime() + CHALLENGE_TTL_MINUTES * 60_000),
    },
  }
}

/**
 * 후보 중 하나를 고른다 — **결정적으로** 고른다.
 *
 * `Math.random()` 을 쓰지 않는다. 같은 입력이면 같은 결과라야 테스트가 성립하고,
 * 재발급 때 **직전과 다른 칭호가 나오도록** 시각을 섞을 수 있다.
 *
 * 암호학적 강도는 필요 없다 — 이 값을 **맞히는 것이 공격이 아니기 때문**이다.
 * 공격자가 지정 칭호를 미리 알아도, 통과하려면 **그 계정에 실제로 로그인해서**
 * 칭호를 바꿔야 한다. 그것이 이 인증이 증명하려는 바로 그 사실이다.
 */
export function pickTitle(candidates: readonly string[], ouid: string, now: Date): string {
  const seed = `${ouid}:${Math.floor(now.getTime() / 1000)}`
  let hash = 2166136261
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  const index = Math.abs(hash) % candidates.length
  return candidates[index]!
}

/* ------------------------------------------------------------------ 판정 --- */

/** 이번 관측이 도전에 대해 무엇을 뜻하나 */
export type VerifyOutcome =
  /** 통과 — 알을 깬다 */
  | 'verified'
  /** 아직 안 바뀌었다. 계속 기다린다 */
  | 'waiting'
  /**
   * 지정한 것과 **다른** 칭호로 바뀌었다.
   * 실패로 닫지 않는다 — 사람이 잘못 골랐을 수 있고, 되돌리면 그만이다.
   */
  | 'wrong-title'
  /** 도전이 이미 끝났다 (만료 · 소진 · 취소 · 이미 통과) */
  | 'closed'

export interface VerifyInput {
  challenge: ChallengeView
  /** 이번에 `user/basic` 이 준 칭호 */
  observedTitle: string | null
  /** 관측 시각. **발급 시각보다 뒤여야 한다** */
  observedAt: Date
}

/**
 * 관측 하나로 도전을 판정한다.
 *
 * 통과 조건은 **셋 다** 만족해야 한다:
 * ```
 * ① 도전이 아직 열려 있다
 * ② 관측이 발급 이후다             — 발급 전의 값으로 통과시키지 않는다
 * ③ 관측 칭호 === 지정 칭호
 * ```
 *
 * ②가 없으면 무슨 일이 생기나 — 폴링이 캐시된 옛 응답을 들고 오거나, 발급 직전에
 * 찍힌 관측이 뒤늦게 처리되면 **아무것도 안 한 계정이 통과한다.**
 * `baselineTitle !== expectedTitle` 은 발급 때 이미 보장했으므로(`issueChallenge`),
 * 여기서는 **시각만** 지키면 "발급 후에 바뀌었다"가 성립한다.
 */
export function verifyObservation(input: VerifyInput): VerifyOutcome {
  const { challenge, observedTitle, observedAt } = input

  if (effectiveStatus(challenge, observedAt) !== 'pending') return 'closed'
  if (observedAt.getTime() < challenge.issuedAt.getTime()) return 'waiting'

  const observed = normalizeTitle(observedTitle)
  if (observed === null) return 'waiting'

  if (observed === normalizeTitle(challenge.expectedTitle)) return 'verified'
  if (observed === normalizeTitle(challenge.baselineTitle)) return 'waiting'
  return 'wrong-title'
}

/* -------------------------------------------------------------- 폴링 주기 --- */

/**
 * 다음 확인까지 기다릴 시간(초).
 *
 * 처음엔 촘촘히 보고 점점 늦춘다 — 사람은 안내를 읽자마자 바꾸거나, 한참 뒤에 바꾼다.
 * 그 사이를 매초 두드릴 이유가 없다.
 *
 * ```
 * 시도 0~4    15초    막 발급했다. 곧 바꿀 사람이다
 * 시도 5~11   30초
 * 시도 12~23  60초
 * 그 이상     120초
 * ```
 * 폴링만 돌아서는 `MAX_ATTEMPTS(40)` 을 다 쓰는 데 약 49분이 걸린다 — **TTL(30분)이 먼저 온다.**
 * 그게 의도다. `MAX_ATTEMPTS` 는 정상 종료 경로가 아니라 **안전망**이다 —
 * 사람이 「확인」을 연타해 호출이 불어날 때만 이 쪽이 먼저 걸린다.
 */
export function nextCheckSeconds(attempts: number): number {
  if (attempts < 5) return 15
  if (attempts < 12) return 30
  if (attempts < 24) return 60
  return 120
}

/** 다음 확인 시각 */
export function nextCheckAt(attempts: number, now: Date): Date {
  return new Date(now.getTime() + nextCheckSeconds(attempts) * 1000)
}

/**
 * 사람이 누른 「확인」을 받아 줄 것인가.
 *
 * 연타를 막는다. 폴링과 달리 사람은 1초에 열 번도 누른다.
 */
export function canManualCheck(lastCheckedAt: Date | null, now: Date): boolean {
  if (lastCheckedAt === null) return true
  return now.getTime() - lastCheckedAt.getTime() >= MIN_MANUAL_INTERVAL_SECONDS * 1000
}
