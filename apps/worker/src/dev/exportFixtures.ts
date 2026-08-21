/**
 * 실제 응답 → 픽스처 내보내기.
 *
 *   pnpm --filter @sacloud/worker exec tsx src/dev/exportFixtures.ts [--version <migrationVersion>] [--out <dir>]
 *
 * `RawImport`에 저장된 **실제 넥슨 응답**을 가명화해 파일로 남긴다.
 * 스펙에서 조립한 `packages/nexon/src/fixtures/sample.ts`를 실제 형태로 대체하기 위한 도구다.
 *
 * 반드시 지키는 것
 *   - 실존 인물의 닉네임·클랜명·계정 식별자를 그대로 커밋하지 않는다 (`lib/fixtureRedact.ts`).
 *   - 저장 직전에 **API 키 포함 여부를 다시 검사**하고, 하나라도 걸리면 파일을 쓰지 않는다.
 *   - 엔드포인트별로 **가장 최근 원본 1건씩만** 내보낸다. 대량 덤프가 아니다.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { prisma } from '@sacloud/db'
import { ENDPOINT, NEXON_SOURCE, readNexonConfig } from '@sacloud/nexon'
import { loadEnvFiles, REPO_ROOT } from '../lib/env.js'
import { containsSecret, pseudonymizeResponse } from '../lib/fixtureRedact.js'
import { fail, log, registerSecret } from '../lib/log.js'

const FILE_NAME: Record<string, string> = {
  [ENDPOINT.id]: 'id.json',
  [ENDPOINT.userBasic]: 'user-basic.json',
  [ENDPOINT.match]: 'match-list.json',
  [ENDPOINT.matchDetail]: 'match-detail.json',
}

function flagValue(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`)
  const value = index === -1 ? undefined : process.argv[index + 1]
  return value && !value.startsWith('--') ? value : null
}

async function main(): Promise<number> {
  loadEnvFiles()
  const config = readNexonConfig()
  registerSecret(config.apiKey)

  const version = flagValue('version') ?? config.migrationVersion
  const outDir =
    flagValue('out') ?? path.join(REPO_ROOT, 'packages', 'nexon', 'src', 'fixtures', 'real')

  const secrets = [config.apiKey]
  let written = 0

  for (const [endpoint, fileName] of Object.entries(FILE_NAME)) {
    const raw = await prisma.rawImport.findFirst({
      where: { source: NEXON_SOURCE, endpoint, migrationVersion: version },
      orderBy: { lastFetchedAt: 'desc' },
      select: { raw: true, httpStatus: true, endpoint: true, lastFetchedAt: true },
    })

    if (!raw) {
      log(`건너뜀: ${endpoint} — 저장된 원본이 없다 (version=${version})`)
      continue
    }

    const { value, report } = pseudonymizeResponse(raw.raw, { secrets })
    const payload = {
      _note:
        '실제 넥슨 응답을 가명화한 픽스처다. 닉네임·클랜명·ouid·match_id는 실제 값이 아니다. ' +
        '시각·수치·모드·맵 등 형식 검증에 쓰이는 값은 원본 그대로다.',
      _endpoint: raw.endpoint,
      _httpStatus: raw.httpStatus,
      _capturedAt: raw.lastFetchedAt.toISOString(),
      _pseudonymized: report.replaced,
      response: value,
    }

    const serialized = JSON.stringify(payload, null, 2)
    if (containsSecret(serialized, secrets)) {
      fail(`중단: ${fileName} 에 비밀값이 남아 있다. 파일을 쓰지 않는다`)
      return 1
    }

    mkdirSync(outDir, { recursive: true })
    writeFileSync(path.join(outDir, fileName), `${serialized}\n`, 'utf8')
    written += 1
    log(`저장: ${path.relative(REPO_ROOT, path.join(outDir, fileName))}`)
  }

  log(written === 0 ? '내보낸 픽스처가 없다 (먼저 수집을 실행한다)' : `픽스처 ${written}건 저장`)
  return 0
}

main()
  .then(async (code) => {
    await prisma.$disconnect()
    process.exit(code)
  })
  .catch(async (error: unknown) => {
    fail(error instanceof Error ? error.message : String(error))
    await prisma.$disconnect()
    process.exit(1)
  })
