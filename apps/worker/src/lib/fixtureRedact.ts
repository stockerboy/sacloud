/**
 * 실제 응답을 픽스처로 남길 때 쓰는 가명화.
 *
 * 왜 필요한가
 *   `RawImport`에 저장된 실제 응답에는 **실존 인물의 닉네임 · 클랜명 · 계정 식별자(ouid)** 가 들어 있다.
 *   그대로 저장소에 커밋하면 제3자의 개인 식별 정보를 배포하는 것이 된다.
 *   반면 스키마 검증에 필요한 것은 **필드 구성 · 타입 · 형식**이지 값 자체가 아니다.
 *
 * 규칙
 *   - 신원 값(`ouid` · `match_id`)은 **글자 종류를 유지한 채** 다른 값으로 바꾼다.
 *     (자릿수·구분자·문자/숫자 구성이 남아야 형식 근거가 된다)
 *   - 사람이 읽는 이름(`user_name` · `clan_name`)은 `유저01` / `클랜A` 같은 표기로 바꾼다.
 *   - 나머지 필드(시각·수치·모드·맵 등)는 **손대지 않는다.** 그게 검증 대상이다.
 *   - 같은 원본 값은 항상 같은 가명으로 바뀐다(관계가 유지돼야 팀 구성을 볼 수 있다).
 */

/** 가명화 대상 — 값을 형태만 남기고 바꾼다 */
const SHAPE_KEYS = new Set(['ouid', 'match_id'])
/** 가명화 대상 — 읽기 쉬운 이름으로 바꾼다 */
const NAME_KEYS = new Set(['user_name', 'clan_name'])

function shiftDigit(char: string, offset: number): string {
  return String((Number(char) + offset) % 10)
}

function shiftLetter(char: string, offset: number, base: number): string {
  return String.fromCharCode(base + ((char.charCodeAt(0) - base + offset) % 26))
}

/**
 * 글자 종류를 유지한 채 값을 바꾼다.
 * `AAAA-1111` → `BBBB-2222` 처럼 길이·구분자·문자종류가 남는다.
 */
export function maskPreservingShape(value: string, offset = 1): string {
  let out = ''
  for (const char of value) {
    if (char >= '0' && char <= '9') out += shiftDigit(char, offset)
    else if (char >= 'a' && char <= 'z') out += shiftLetter(char, offset, 97)
    else if (char >= 'A' && char <= 'Z') out += shiftLetter(char, offset, 65)
    else if (/[가-힣]/.test(char)) out += '가'
    else out += char
  }
  return out
}

export interface RedactionReport {
  /** 바뀐 값의 개수 (키별) */
  replaced: Record<string, number>
}

/**
 * 응답 JSON을 가명화한다. 구조는 그대로 두고 값만 바꾼다.
 *
 * `secrets`에 API 키를 넘기면, 혹시라도 값 안에 섞여 있을 때 `[REDACTED]`로 지운다.
 */
export function pseudonymizeResponse(
  input: unknown,
  options: { secrets?: readonly (string | null | undefined)[] } = {},
): { value: unknown; report: RedactionReport } {
  const nameMap = new Map<string, string>()
  const report: RedactionReport = { replaced: {} }
  const secrets = (options.secrets ?? []).filter(
    (secret): secret is string => typeof secret === 'string' && secret.length >= 8,
  )

  const count = (key: string) => {
    report.replaced[key] = (report.replaced[key] ?? 0) + 1
  }

  const nameFor = (key: string, original: string): string => {
    const mapKey = `${key}:${original}`
    const existing = nameMap.get(mapKey)
    if (existing) return existing
    const index = [...nameMap.keys()].filter((entry) => entry.startsWith(`${key}:`)).length + 1
    const label = key === 'clan_name' ? `클랜${index}` : `유저${String(index).padStart(2, '0')}`
    nameMap.set(mapKey, label)
    return label
  }

  const stripSecrets = (text: string): string => {
    let output = text
    for (const secret of secrets) output = output.split(secret).join('[REDACTED]')
    return output
  }

  const walk = (node: unknown, key: string | null): unknown => {
    if (Array.isArray(node)) return node.map((item) => walk(item, key))
    if (node !== null && typeof node === 'object') {
      const result: Record<string, unknown> = {}
      for (const [childKey, childValue] of Object.entries(node as Record<string, unknown>)) {
        result[childKey] = walk(childValue, childKey)
      }
      return result
    }
    if (typeof node === 'string') {
      if (key && SHAPE_KEYS.has(key)) {
        count(key)
        return maskPreservingShape(stripSecrets(node))
      }
      if (key && NAME_KEYS.has(key)) {
        count(key)
        return nameFor(key, node)
      }
      return stripSecrets(node)
    }
    return node
  }

  return { value: walk(input, null), report }
}

/** 픽스처로 내보내기 전 마지막 확인 — 비밀값이 남아 있으면 저장하지 않는다 */
export function containsSecret(
  serialized: string,
  secrets: readonly (string | null | undefined)[],
): boolean {
  return secrets.some(
    (secret) => typeof secret === 'string' && secret.length >= 8 && serialized.includes(secret),
  )
}
