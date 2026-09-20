import { prisma } from '@sacloud/db'

/**
 * ★★지난 rate-limit 기록을 쓸어낸다★★ (2026-09-20 비판 검수에서 잡았다)
 *
 * ── 무엇이 문제였나
 *
 *   `RateLimit` 은 「누가 · 언제까지 · 몇 번」 을 적어 두는 표다. 창이 닫히면
 *   그 줄은 ★아무도 다시 안 본다.★ 그런데 ★지우는 곳이 없었다.★
 *
 *   실측 (2026-09-20) — ★1,330줄 중 1,328줄이 이미 지난 것★ 이었다.
 *   대부분(1,305줄)이 로그인 기록이다. 즉 ★처음부터 안 지우고 있었다.★
 *
 *   여기에 게시판 조회수 셈이 올라탔다. 그 키는 ★글 하나 × 사람 하나★ 마다
 *   줄이 생긴다 — 글 1,000개에 방문자 5,000명이면 ★500만 줄★ 이고,
 *   그게 ★로그인 제한과 같은 표★ 라 로그인까지 같이 느려진다.
 *
 * ── 어떻게 지우나
 *
 *   ⚠ ★창이 닫힌 지 한참 된 것만★ 지운다. 방금 닫힌 줄을 지우면 사람이
 *     창 끝에서 한 번 더 시도할 수 있다 — 제한이 새는 셈이다.
 *   ⚠ ★한 번에 다 지우지 않는다.★ 큰 `DELETE` 는 표를 잠가 사이트를 세운다.
 *     `LIMIT` 으로 끊어 돌린다 (`@@index([windowEnd])` 를 탄다).
 */

/** 창이 닫히고 이만큼 지나야 지운다 — 경계에서 제한이 새지 않게 */
export const SWEEP_GRACE_MS = 24 * 60 * 60 * 1000

/** 한 판에 지우는 줄 수 — 표를 오래 잠그지 않는다 */
export const SWEEP_CHUNK = 5_000

/** 한 번 불렀을 때 도는 최대 판수 — 무한정 돌지 않는다 */
const MAX_ROUNDS = 40

export interface RateLimitSweepResult {
  /** 지운 줄 수 */
  deleted: number
  /** 아직 남은 지난 줄이 있나 (다음 판에 이어 지운다) */
  more: boolean
}

export async function rateLimitSweep(): Promise<RateLimitSweepResult> {
  const cutoff = new Date(Date.now() - SWEEP_GRACE_MS)
  let deleted = 0

  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    /*
     * ⚠ `deleteMany` 에는 `take` 가 없다 — 그래서 날질의로 끊는다.
     * ⚠ ★템플릿 안에서 값을 이어붙이지 않는다★ — `$executeRaw` 의 `${}` 는
     *   Prisma 가 매개변수로 넘긴다 (문자열 이어붙이기가 아니다).
     */
    const n = await prisma.$executeRaw`
      DELETE FROM "RateLimit"
      WHERE "key" IN (
        SELECT "key" FROM "RateLimit"
        WHERE "windowEnd" < ${cutoff}
        LIMIT ${SWEEP_CHUNK}
      )
    `
    deleted += n
    if (n < SWEEP_CHUNK) return { deleted, more: false }
  }

  return { deleted, more: true }
}
