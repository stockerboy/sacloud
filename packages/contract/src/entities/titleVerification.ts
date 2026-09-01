/**
 * 서든어택 계정 **소유권 증명** — 게임 칭호로 한다 (2026-09-01).
 *
 * ── 흐름 (사용자 확정)
 * ```
 * ① 마이페이지에서 자기 서든 닉네임을 넣는다
 * ② 게임에서 칭호를 `[용병]` 으로 바꾼다
 * ③ 「확인」을 누른다 → 우리가 넥슨 Open API 로 그 닉네임의 칭호를 읽는다
 * ④ `[용병]` 이면 **바로 승인**. 그 계정이 그 사람 것이 된다
 * ⑤ 칭호는 다시 바꿔도 된다
 * ```
 *
 * ── ⚠ `docs/TITLE_VERIFICATION_SPEC.md` 와 다른 점
 *   SPEC 은 **사람마다 다른 1회용 문구**를 발급하는 설계였다. 사용자가
 *   **고정 칭호 `[용병]`** 으로 바꿨다(2026-09-01). 발급 API 가 사라져 훨씬 단순하다.
 *   SPEC 문서는 지우지 않고 「⚠ 정정」 절을 덧붙여 두었다 (CLAUDE.md 10-4).
 *
 * ── ⚠ 이 방식의 알려진 약점
 *   고정 문구라서, **어쩌다 `[용병]` 을 달고 있는 남의 닉네임**을 다른 사람이 자기 것이라고
 *   주장할 수 있다. 1회용 문구라면 없는 문제다. 줄이는 장치는 셋이다.
 *   ① **먼저 인증한 사람이 임자** — 이미 인증된 계정은 다른 회원이 못 가져간다
 *   ② 인증 시각과 **그때 읽은 칭호**를 남긴다 — 나중에 다툼이 생기면 근거가 된다
 *   ③ 시도 제한 — 남의 닉네임을 계속 찔러볼 수 없다
 */
import { z } from 'zod'
import { Count, IsoDateTime } from '../common'
import { PlayerSummary } from './summaries'

/**
 * 우리가 요구하는 칭호. **고정값이다** (사용자 결정, 2026-09-01).
 *
 * 화면과 서버가 같은 값을 봐야 하므로 계약에 둔다. 문자열을 화면에 다시 적지 않는다.
 */
export const REQUIRED_TITLE = '[용병]'

/**
 * 도전의 상태.
 *
 * `none`      아직 아무것도 신청하지 않았다
 * `pending`   닉네임을 넣었고 칭호가 바뀌기를 기다린다
 * `verified`  통과했다
 * `expired`   유효기간이 지났다 — 다시 신청하면 된다
 * `exhausted` 확인을 너무 많이 눌렀다
 * `cancelled` 사람이 접었다
 */
export const TitleVerificationStatus = z.enum([
  'none',
  'pending',
  'verified',
  'expired',
  'exhausted',
  'cancelled',
])
export type TitleVerificationStatus = z.infer<typeof TitleVerificationStatus>

/**
 * 직전 「확인」이 무엇을 봤나. **화면이 실패 이유를 그대로 보여 줄 수 있게** 남긴다.
 *
 * `verified`          칭호가 맞았다
 * `wrong-title`       다른 칭호를 달고 있다 (`last_seen_title` 에 무엇인지 들어 있다)
 * `no-title`          넥슨이 칭호를 주지 않았다 → **`알수없음`. 인증 실패다** (지어내지 않는다)
 * `unknown-nickname`  그 닉네임을 쓰는 계정이 없다
 * `taken`             그 계정은 이미 **다른 회원**이 인증했다
 * `closed`            만료·소진·취소된 도전이다
 * `unavailable`       넥슨 조회를 할 수 없다 (키 없음 · 넥슨 장애)
 */
export const TitleVerificationOutcome = z.enum([
  'verified',
  'wrong-title',
  'no-title',
  'unknown-nickname',
  'taken',
  'closed',
  'unavailable',
])
export type TitleVerificationOutcome = z.infer<typeof TitleVerificationOutcome>

/** `POST /me/title-verification` 요청 본문 */
export const TitleVerificationInput = z.object({
  /** 인증하려는 서든어택 닉네임 */
  nickname: z.string().min(1).max(40),
})
export type TitleVerificationInput = z.infer<typeof TitleVerificationInput>

export const TitleVerificationState = z.object({
  status: TitleVerificationStatus,
  /** 바꿔야 하는 칭호. 비밀이 아니다 — 통과하려면 **그 계정에 실제로 로그인**해야 한다 */
  required_title: z.string(),
  /** 신청한 닉네임 */
  nickname: z.string().nullable(),
  /**
   * 마지막으로 읽은 칭호. 넥슨이 주지 않았으면 `null` 이고 화면은 `알수없음` 으로 쓴다.
   * **인증 시각의 근거로 남는 값이다** (위 약점 ②).
   */
  last_seen_title: z.string().nullable(),
  /** 직전 확인의 결과. 아직 눌러 본 적이 없으면 `null` */
  outcome: TitleVerificationOutcome.nullable(),
  /** 남은 확인 횟수 */
  attempts_left: Count.nullable(),
  expires_at: IsoDateTime.nullable(),
  verified_at: IsoDateTime.nullable(),
  /** 인증으로 연결된 선수. 여기 값이 있으면 **프로필 관리가 열린다** */
  player: PlayerSummary.nullable(),
  /**
   * 지금 인증을 할 수 있나. 넥슨 조회 수단이 없으면 `false` 이고
   * 화면은 「본인 인증은 준비 중입니다」로 막는다. **없는 것을 있는 척하지 않는다.**
   */
  available: z.boolean(),
})
export type TitleVerificationState = z.infer<typeof TitleVerificationState>

/* -------------------------------------------------------------------- 규칙 --- */
/*
  아래는 **순수 규칙**이다. 서버(`apps/web`)와 화면이 같은 값을 봐야 해서 계약에 둔다.

  ⚠ 같은 뜻의 함수가 `apps/worker/src/lib/titleChallenge.ts` 에도 있다. 그쪽은
  **1회용 문구 방식**을 위해 먼저 만든 것이고, 테스트 32건이 그것을 지킨다.
  **지우지 않는다** (CLAUDE.md 10-4). 고정 칭호 방식으로 되돌아갈 때 그대로 쓴다.
*/

/**
 * 도전 유효기간(분).
 *
 * 칭호 변경이 `user/basic` 에 반영되는 데 걸리는 시간은 아직 `[미확인]` 이다.
 * 닉 변경은 몇 분이었으므로(D-220) 비슷할 가능성이 높지만 **재보지 않았다.**
 * 그래서 설계를 지연에 둔감하게 만든다 — 30분이면 반영이 열 배 느려도 견딘다.
 */
export const TITLE_CHALLENGE_TTL_MINUTES = 30

/**
 * 한 도전에서 허용하는 확인 횟수.
 *
 * 이 수를 넘으면 도전을 닫는다 — 넥슨 API 를 무한히 두드리지 않는다.
 * 사람이 손으로 누르는 것만 세므로 SPEC 의 40(폴링 포함)보다 작게 잡았다.
 */
export const TITLE_CHALLENGE_MAX_ATTEMPTS = 20

/** 사람이 「확인」을 연타하지 못하게 하는 최소 간격(초) */
export const TITLE_CHALLENGE_MIN_INTERVAL_SECONDS = 10

/**
 * 칭호 문자열을 견주기 좋게 다듬는다.
 *
 * 넥슨은 미착용을 빈 문자열로 줄 수 있으므로 `null` 과 `''` 를 같은 것으로 본다.
 * **대소문자를 접지 않는다** — 칭호는 한글이 대부분이고, 라틴 문자가 섞인 칭호에서
 * 대소문자를 접으면 서로 다른 칭호가 같아진다.
 */
export function normalizeTitleName(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null
  /* NFC 로 모은다 — 한글은 조합형/완성형이 섞여 들어올 수 있다 */
  const trimmed = value.normalize('NFC').trim()
  return trimmed === '' ? null : trimmed
}

/** 관측한 칭호가 우리가 요구한 칭호인가 */
export function matchesRequiredTitle(observed: string | null | undefined): boolean {
  const value = normalizeTitleName(observed)
  return value !== null && value === normalizeTitleName(REQUIRED_TITLE)
}

/**
 * 저장된 `status` 를 그대로 믿지 않는다 — 만료는 **시각이 지나면 일어나는 일**이고,
 * 그 순간에 아무도 표를 고쳐 주지 않는다. 읽을 때 계산한다.
 */
export function effectiveChallengeStatus(
  challenge: { status: string; expiresAt: Date; attempts: number },
  now: Date,
): TitleVerificationStatus {
  if (challenge.status !== 'pending') {
    const parsed = TitleVerificationStatus.safeParse(challenge.status)
    return parsed.success ? parsed.data : 'expired'
  }
  if (now.getTime() >= challenge.expiresAt.getTime()) return 'expired'
  if (challenge.attempts >= TITLE_CHALLENGE_MAX_ATTEMPTS) return 'exhausted'
  return 'pending'
}

/** 사람이 누른 「확인」을 받아 줄 것인가. 폴링과 달리 사람은 1초에 열 번도 누른다 */
export function canManualTitleCheck(lastCheckedAt: Date | null, now: Date): boolean {
  if (lastCheckedAt === null) return true
  return now.getTime() - lastCheckedAt.getTime() >= TITLE_CHALLENGE_MIN_INTERVAL_SECONDS * 1000
}
