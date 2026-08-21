/**
 * 날짜 직렬화.
 *
 * 계약의 `IsoDateTime`은 `2026-06-05T00:06:24+09:00` 형태를 요구하고,
 * Mock 픽스처도 전부 **KST 고정 오프셋**으로 만들어져 있다.
 * DB에서 꺼낸 `Date`를 그대로 `toISOString()`하면 `...Z`(UTC)가 되어 문자열이 달라진다.
 * 값은 같아도 mock↔live 응답 비교가 어긋나므로 여기서 KST 문자열로 맞춘다.
 */

const pad = (value: number, length = 2): string => String(value).padStart(length, '0')

const KST_OFFSET_MS = 9 * 60 * 60 * 1000

/** `Date` → `YYYY-MM-DDTHH:mm:ss+09:00` */
export function toKstIso(value: Date): string {
  const shifted = new Date(value.getTime() + KST_OFFSET_MS)
  return (
    `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}` +
    `T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}+09:00`
  )
}

export function toKstIsoOrNull(value: Date | null | undefined): string | null {
  return value ? toKstIso(value) : null
}

/** `Date` → `YYYY-MM-DD` (KST 기준). 클랜 설립일 등. */
export function toKstDate(value: Date): string {
  return toKstIso(value).slice(0, 10)
}

export function toKstDateOrNull(value: Date | null | undefined): string | null {
  return value ? toKstDate(value) : null
}
