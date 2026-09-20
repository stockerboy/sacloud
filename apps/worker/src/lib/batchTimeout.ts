import { prisma } from '@sacloud/db'

/**
 * ★배치 잡에 2분은 너무 짧다★ (2026-09-20 · 이 한 줄이 파이프라인을 세웠다)
 *
 * ── 무슨 일이 있었나 (실측)
 *
 *   Postgres 의 `statement_timeout` 기본값이 ★2분★ 이다. 그런데 우리 배치 잡들은
 *   그보다 오래 걸리는 질의를 ★정상적으로★ 가지고 있다 —
 *   ```
 *     배틀로그 대기열 (pendingPairs)   428초   ← 11시간 동안 한 번도 못 끝냈다
 *     개인 육각 접기   (gapRows)        43초    ← 겹치면 120초를 넘겨 하루 15번 죽었다
 *     이름표 채우기 한 판              133초
 *   ```
 *   전부 ★57014★ 로 잘렸고, 그 예외가 프로세스를 끝내 ★잡이 통째로 날아갔다.★
 *   그래서 배틀로그 · 명단 · 경기분석이 다 같이 멈췄다
 *   (사장님: 「기록이 자꾸 멈추는거 이것도 치명적이야」).
 *
 * ── ⚠ 주소에 붙이는 길은 막혔다
 *   `?options=-c statement_timeout=…` 을 붙여 봤는데 ★풀러가 무시했다★ —
 *   붙인 뒤에도 `SHOW statement_timeout` 이 2min 이었다. 그래서 ★여기서 직접 건다.★
 *
 * ── ⚠ 사이트는 한 톨도 안 바뀐다
 *   이 함수는 ★워커만★ 부른다. 사이트는 트랜잭션 풀러(6543)로 따로 붙고
 *   이 코드를 지나가지 않는다.
 *
 * ⚠ ★무한정은 아니다★ — 10분이다. 그보다 오래 걸리는 질의는 ★고쳐야 할 질의★ 다.
 *   0(무제한)으로 두면 잘못 짠 질의가 DB 를 영영 붙들 수 있다.
 * ⚠ ★실패해도 조용히 간다★ — 이 설정 때문에 잡이 못 뜨면 본말이 뒤집힌다.
 */
export const BATCH_STATEMENT_TIMEOUT_MS = 600_000

export async function applyBatchTimeout(): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`SET statement_timeout = ${BATCH_STATEMENT_TIMEOUT_MS}`)
  } catch {
    /* 못 걸어도 그냥 간다 — 옛날처럼 2분으로 돌 뿐이다 */
  }
}
