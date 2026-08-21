/**
 * 환경변수 로딩.
 *
 * `.env.local`은 저장소에 없다(gitignore). 워커는 그 파일을 **읽기만** 하고
 * 값을 화면에 찍지 않는다. 키가 있는지 없는지만 보고한다.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
/** apps/worker/src/lib → 저장소 루트 */
export const REPO_ROOT = path.resolve(HERE, '..', '..', '..', '..')

/** 앞에 있는 파일이 우선한다. 이미 설정된 `process.env` 값은 덮어쓰지 않는다. */
const ENV_FILES = [
  path.join(REPO_ROOT, 'apps', 'web', '.env.local'),
  path.join(REPO_ROOT, 'packages', 'db', '.env'),
  path.join(REPO_ROOT, '.env.local'),
]

/** 아주 작은 .env 파서. 의존성을 추가하지 않는다. */
export function parseEnvFile(text: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const equals = line.indexOf('=')
    if (equals === -1) continue
    const key = line.slice(0, equals).trim()
    let value = line.slice(equals + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (key) result[key] = value
  }
  return result
}

/** 파일에서 읽은 값을 `process.env`에 채운다. 이미 있는 값은 그대로 둔다. */
export function loadEnvFiles(files: readonly string[] = ENV_FILES): string[] {
  const loaded: string[] = []
  for (const file of files) {
    if (!existsSync(file)) continue
    const values = parseEnvFile(readFileSync(file, 'utf8'))
    for (const [key, value] of Object.entries(values)) {
      if (process.env[key] === undefined) process.env[key] = value
    }
    loaded.push(file)
  }
  return loaded
}
