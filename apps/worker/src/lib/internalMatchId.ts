/**
 * 내부 매치 ID 생성.
 *
 * **외부 공급자의 ID를 내부 도메인 ID로 쓰지 않는다** (B 결정).
 *   Match.id            = SACLOUD 내부 식별자 (18자리 숫자 — 계약 `MatchId`)
 *   Match.sourceMatchId = 넥슨 원본 match_id (문자열 원형)
 *
 * 내부 ID 규칙은 우리 것이다: `YYMMDDHHmmss`(경기 시작 시각, KST) + 6자리 일련번호.
 * 이 값은 **원본 데이터가 아니라 식별자**다. 원본 대조는 언제나 `sourceMatchId`로 한다.
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const SEQUENCE_MAX = 999_999

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0')
}

/** 경기 시작 시각(KST) → `YYMMDDHHmmss` */
export function internalMatchIdPrefix(startAt: Date): string {
  const kst = new Date(startAt.getTime() + KST_OFFSET_MS)
  return (
    pad(kst.getUTCFullYear() % 100, 2) +
    pad(kst.getUTCMonth() + 1, 2) +
    pad(kst.getUTCDate(), 2) +
    pad(kst.getUTCHours(), 2) +
    pad(kst.getUTCMinutes(), 2) +
    pad(kst.getUTCSeconds(), 2)
  )
}

export function buildInternalMatchId(prefix: string, sequence: number): string {
  if (sequence < 0 || sequence > SEQUENCE_MAX) {
    throw new Error(`일련번호 범위를 벗어났다: ${sequence}`)
  }
  return `${prefix}${pad(sequence, 6)}`
}

/**
 * 충돌하지 않는 내부 ID를 고른다.
 *
 * 같은 초에 시작된 경기가 여러 건이면 일련번호를 올린다.
 * `exists`는 DB 조회를 주입받는다(테스트에서 네트워크·DB 없이 검증하기 위함).
 */
export async function allocateInternalMatchId(
  startAt: Date,
  exists: (id: string) => Promise<boolean>,
): Promise<string> {
  const prefix = internalMatchIdPrefix(startAt)
  for (let sequence = 1; sequence <= SEQUENCE_MAX; sequence += 1) {
    const candidate = buildInternalMatchId(prefix, sequence)
    if (!(await exists(candidate))) return candidate
  }
  throw new Error(`같은 시각(${prefix})의 내부 ID를 더 만들 수 없다`)
}
