/**
 * 원본 내용 해시.
 *
 * 같은 응답을 다시 받았는지, 내용이 **달라졌는지**를 구분하는 데 쓴다.
 * 같으면 `RawImport`에 새 행을 만들지 않고 `fetchCount`만 올리고,
 * 다르면 새 행을 추가한다(append-only). 원본을 덮어쓰지 않기 위한 장치다.
 */
import { createHash } from 'node:crypto'

/**
 * 키 순서에 의존하지 않는 JSON 직렬화.
 * JSON.stringify는 객체 키 순서를 그대로 쓰므로, 같은 내용이 다른 순서로 오면
 * 해시가 달라져 "내용이 바뀌었다"고 오판한다.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
  return `{${entries.join(',')}}`
}

export function contentHash(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex')
}
