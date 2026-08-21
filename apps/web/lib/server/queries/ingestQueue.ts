/**
 * 수집 요청 큐 등록.
 *
 * `정보갱신` / `전적갱신` 버튼은 **넥슨 API를 인라인으로 호출하지 않는다** (E 결정).
 * 사용자 요청 하나가 곧바로 외부 호출이 되면 호출 한도를 순식간에 소진하고,
 * 응답 시간도 외부 API에 묶인다.
 *
 * 대신 `ImportJob`에 `pending`으로 등록만 하고, 실제 수집은 워커가 한다.
 *   pnpm nexon:collect --all-identities
 *
 * 큐 인프라(Redis/BullMQ)는 쓰지 않는다. 체크포인트는 DB에 있다 (C 결정).
 */
import { prisma } from '@sacloud/db'
import { DEFAULT_MIGRATION_VERSION, NEXON_SOURCE } from '@sacloud/nexon'

function migrationVersion(): string {
  return process.env.NEXON_MIGRATION_VERSION?.trim() || DEFAULT_MIGRATION_VERSION
}

/**
 * 갱신 요청을 큐에 넣는다.
 *
 * 같은 대상의 요청이 이미 대기 중이면 **행을 늘리지 않는다**(멱등).
 * 이미 처리 중(`running`)이면 건드리지 않는다.
 */
export async function enqueueRenewJob(input: {
  kind: 'player' | 'clan'
  id: string
}): Promise<void> {
  const jobKey = `nexon:renew:${input.kind}:${input.id}`
  const version = migrationVersion()

  const existing = await prisma.importJob.findUnique({
    where: { source_jobKey_migrationVersion: { source: NEXON_SOURCE, jobKey, migrationVersion: version } },
    select: { id: true, status: true },
  })

  if (existing?.status === 'running') return

  await prisma.importJob.upsert({
    where: {
      source_jobKey_migrationVersion: { source: NEXON_SOURCE, jobKey, migrationVersion: version },
    },
    create: {
      source: NEXON_SOURCE,
      jobKey,
      migrationVersion: version,
      status: 'pending',
    },
    update: {
      status: 'pending',
      finishedAt: null,
      lastError: null,
      nextRetryAt: null,
    },
  })
}
