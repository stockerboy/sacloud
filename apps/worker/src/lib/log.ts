/**
 * 로그.
 *
 * **API 키는 어떤 경로로도 찍히지 않는다.** 모든 출력이 `redactSecrets`를 거친다.
 * 키가 실수로 메시지에 섞여도 밖으로 나가지 않게 하는 마지막 방어선이다.
 */
import { redactSecrets } from '@sacloud/nexon'

let secrets: (string | null)[] = []

export function registerSecret(secret: string | null | undefined): void {
  if (secret) secrets = [...secrets, secret]
}

function clean(parts: unknown[]): string {
  const text = parts
    .map((part) => (typeof part === 'string' ? part : JSON.stringify(part)))
    .join(' ')
  return redactSecrets(text, secrets)
}

export function log(...parts: unknown[]): void {
  console.info(clean(parts))
}

export function warn(...parts: unknown[]): void {
  console.warn(clean(parts))
}

export function fail(...parts: unknown[]): void {
  console.error(clean(parts))
}

/** 표 형태 출력 — 검증 결과를 숫자로 보여줄 때 쓴다 */
export function table(rows: readonly Record<string, unknown>[]): void {
  for (const row of rows) {
    log(
      Object.entries(row)
        .map(([key, value]) => `${key}=${String(value)}`)
        .join('  '),
    )
  }
}
