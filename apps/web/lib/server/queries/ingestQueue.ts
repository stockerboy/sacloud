/**
 * 수집 요청 큐 등록.
 *
 * `정보갱신` / `전적갱신` 버튼은 **넥슨 API를 인라인으로 호출하지 않는다** (E 결정).
 * 사용자 요청 하나가 곧바로 외부 호출이 되면 호출 한도를 순식간에 소진하고,
 * 응답 시간도 외부 API에 묶인다.
 *
 * 대신 `ImportJob`에 `pending`으로 등록만 하고, 실제 수집은 워커가 한다.
 *   pnpm nexon:poll --targets N
 *
 * 폴링 상태가 있는 플레이어면 `manualRefreshRequestedAt`을 찍어 **우선순위를 최상**으로 올린다
 * (`apps/worker/src/lib/pollingPolicy.ts`).
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

  // 폴링 대상이면 **최우선**으로 올린다 (Phase 8.1 적응형 폴링)
  if (input.kind === 'player') {
    const now = new Date()
    await prisma.nexonPollState.updateMany({
      where: { playerId: input.id },
      data: { manualRefreshRequestedAt: now, nextPollAt: now },
    })
  }

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

  /* ★큐에 넣자마자 바로 치워 달라고 부탁한다★ — 실패해도 예약이 뒤에서 한다 */
  await pokeRenewServer()
}

/**
 * ★★VPS 수신구를 콕 찔러 본다★★ (2026-09-21 사장님: 「정보갱신하면 좀 ★바로바로★
 * 정보 바꿔줘 병영대로 한참뒤에 바뀌니까 짜증나네」)
 *
 * ── 왜 이 길인가
 *   병영수첩은 ★여기(Vercel)에서 부르면 403★ 이다. VPS 안에서만 열린다.
 *   그래서 ★VPS 에 작은 수신구★ 를 두고 여기서 한 번 찔러 준다 —
 *   그 자리에서 병영을 읽고 고치므로 ★누르면 2~3초★ 다.
 *
 * ── ★실패해도 조용히 넘어간다★
 *   수신구가 꺼져 있거나 느려도 ★큐는 이미 들어가 있다★ — 1분 예약이 뒤에서 한다.
 *   빠른 길이 막혔다고 ★사용자에게 오류를 보이지 않는다.★
 *
 * ⚠ 주소·암호가 없으면 ★아무것도 안 한다★ (`RENEW_HOOK_URL` · `RENEW_TOKEN`).
 */
async function pokeRenewServer(): Promise<void> {
  const url = process.env.RENEW_HOOK_URL?.trim()
  const token = process.env.RENEW_TOKEN?.trim()
  if (!url || !token) return
  try {
    /* ★오래 기다리지 않는다★ — 화면이 단추 하나에 묶이면 안 된다 */
    const stop = AbortSignal.timeout(2500)
    await fetch(url, { method: 'POST', headers: { 'x-renew-token': token }, signal: stop })
  } catch {
    /* 조용히 넘어간다 — 예약이 뒤에서 한다 */
  }
}
