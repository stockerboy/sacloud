import { prisma } from '@sacloud/db'
import { NEXON_SOURCE } from '@sacloud/nexon'

/**
 * ★★「정보갱신」 이 끝났나★★ (2026-09-22 · 사장님 지시)
 *
 * > 「정보갱신 안된다 또 ★되는척만하고★ … 왜 바로바로 안돼 진짜 열받게」
 *
 * ── 무엇이 「되는 척」 이었나 (실측 2026-09-22)
 *
 *   ```
 *   14:46:57  사장님이 단추를 누름 → 큐에 들어감 · 화면에 「방금 전」
 *   14:47:08  일꾼이 병영을 읽고 ★닉을 애망. 으로 고침★ (11초)
 *   ```
 *   ★DB 는 11초 만에 제대로 바뀌었다.★ 그런데 화면은 —
 *   ```
 *   단추 → POST → 「갱신중…」 → 답이 오면 「정보갱신」 으로 되돌림
 *   ```
 *   ★그것으로 끝이었다.★ 페이지를 다시 읽지 않으니 옛 닉이 그대로 남았다.
 *   사장님이 보신 「되는 척」 이 바로 이것이다.
 *
 * ── 이 파일이 하는 일
 *
 *   큐에 넣은 그 일이 ★정말 끝났는지★ 를 한 줄로 알려 준다.
 *   화면은 이것이 `done` 이 될 때까지 기다렸다가 ★그때 페이지를 다시 읽는다.★
 *
 * ⚠ ★큐에 없으면 `done` 이다★ — 일꾼이 이미 치우고 지운 경우다.
 *   「모른다」 로 답해 화면을 영영 「갱신중」 에 두지 않는다.
 */

export type RenewPhase = 'pending' | 'running' | 'done' | 'failed'

export interface RenewStatus {
  phase: RenewPhase
  /** 몇 번째 시도인가 — 실패가 쌓이면 화면이 사실대로 말할 수 있다 */
  attempts: number
  /** 왜 못 했나 (있을 때만) */
  why: string | null
}

export async function renewStatus(input: {
  kind: 'player' | 'clan'
  id: string
}): Promise<RenewStatus> {
  const jobKey = `nexon:renew:${input.kind}:${input.id}`
  const row = await prisma.importJob.findFirst({
    where: { source: NEXON_SOURCE, jobKey },
    orderBy: { updatedAt: 'desc' },
    select: { status: true, attempts: true, lastError: true },
  })
  /* ★큐에 없으면 끝난 것으로 본다★ — 화면을 영영 기다리게 두지 않는다 */
  if (row === null) return { phase: 'done', attempts: 0, why: null }

  const phase: RenewPhase =
    row.status === 'pending' ? 'pending'
      : row.status === 'running' ? 'running'
      : row.status === 'failed' ? 'failed'
      : 'done'

  return { phase, attempts: row.attempts, why: row.lastError }
}
