/**
 * 시즌0 창 — **한 곳에서만 정의한다** (D-175).
 *
 * ── 시즌0 이 무엇인가
 *
 * 시즌1 이 열리기 전까지의 **테스트 시즌**이다. 사용자 지시(2026-08-29):
 *
 * > "현재 우리는 시즌0이야. … 2026년 4월부터 현재까지의 기록까지만 기록하고
 * >  그 외 남은 26년3월까지의 기록은 다른곳에 둬. 시즌0이란 시즌 시작전 테스트 시즌이야.
 * >  시즌1오픈 날은 내가 정한다. 그전까지는 계속 시즌0."
 *
 * ── 창
 *
 *   시작   2026-07-01 00:00 (KST) = 2026-06-30T15:00:00Z
 *   끝     **없다.** 시즌1 이 열릴 때까지 계속 늘어나는 열린 구간이다
 *
 * ⚠ **정정 (2026-08-31)** — 시작을 **4/1 → 7/1** 로 고쳤다.
 *   사용자가 4/1 로 말한 뒤 **7/1 로 수정해 다시 말했는데 그 수정이 문서에 반영되지 않았고**,
 *   그래서 세션이 바뀔 때마다 4/1 로 되돌아갔다.
 *   원문: *"우리 열산 ipl DPL 전부 7/1일 기록부터 기록하는거 알고 있지?"* ·
 *        *"시즌0은 7/1부터라고 내가 분명 수정해서 얘기했어"*
 *   옛 값(4/1)은 아래 `SEASON0_FROM_V1` 에 남겨 둔다 (`CLAUDE.md` 10-4).
 *
 * 끝을 고정값으로 박지 않는다. 예전에는 `2026-07-01` 로 박혀 있어서
 * 그 뒤 새 경기가 시즌0 집계에 **하나도 들어가지 않았다** — 7월 이후에만 뛴 선수는
 * 승률 0% · 0킬 0데스 · 래더 `배치고사` 로 보였다. 그것이 이 파일이 생긴 이유다.
 *
 * ── 창 밖 기록은 어떻게 되나
 *
 * **지우지 않는다.** `Match` · `MatchPlayerStat` 은 2024-05 부터 그대로 남아 있고
 * 기록실(`apps/web/lib/server/queries/records.ts`)은 창으로 거르지 않는다.
 * 창은 **래더·시즌 누적 집계에만** 걸린다.
 *
 * ── 대상 origin
 *
 * 미러(`3rd.supply`)와 넥슨(`nexon`) **둘 다**다. 예전에는 미러뿐이었다.
 * 같은 경기가 양쪽에 있을 수 있으므로 `sourceMatchId` 로 중복을 제거한다.
 *
 * 실측(2026-08-29 · 로컬 DB):
 *
 * | | |
 * |---|---|
 * | `supply` 리그 **안**에서 `sourceMatchId` 중복 | **0건** (전 리그 통틀어 0건) |
 * | 넥슨 136건 중 다른 리그(`sanply`) 미러와 같은 `sourceMatchId` | 30건 |
 *
 * 리그별로 계산하므로 지금은 이중 계산이 일어나지 않는다. 그래도 제거를 넣어 둔다 —
 * 미러 수집과 넥슨 수집이 같은 리그에서 만나는 순간 조용히 두 번 세게 되기 때문이다.
 * 남기는 쪽은 **미러**다. 미러는 라인업 10명·무기·원본 점수를 다 갖고 있고
 * 넥슨 재구성분은 무기가 전부 `null` 이다 (D-034).
 */

/**
 * **옛 시작값 (2026-04-01 KST).** 지우지 않는다 (`CLAUDE.md` 10-4).
 *
 * 2026-08-29 에 이 값으로 정했다가 사용자가 7/1 로 수정했다. 계산에 쓰지 않는다 —
 * 옛 집계 결과를 대조할 일이 생기면 이 값을 쓴다.
 */
export const SEASON0_FROM_V1 = new Date('2026-03-31T15:00:00.000Z')

/** 2026-07-01 00:00 (KST). DB `startAt` 은 UTC 이므로 9시간 뺀 값이다 */
export const SEASON0_FROM = new Date('2026-06-30T15:00:00.000Z')

/**
 * 창의 끝. **열린 구간이라 `null` 이다** — 시즌1 오픈일은 사용자가 정한다.
 *
 * `new Date()` 를 쓰지 않는다. 돌릴 때마다 결과가 달라지면 결정적 replay 가 깨진다.
 * 상한이 없으면 "DB 에 있는 마지막 경기까지" 가 자연스럽게 끝이 되고, 같은 DB 에서는
 * 몇 번을 돌려도 같은 값이 나온다.
 */
export const SEASON0_TO: Date | null = null

/**
 * **옛 대상 origin (미러 + 넥슨).** 지우지 않는다 (`CLAUDE.md` 10-4).
 *
 * 2026-09-01 에 `nexon_barracks` 를 더했다. 그 전의 집계 결과를 대조할 일이 생기면 이 값을 쓴다.
 */
export const SEASON0_ORIGINS_V1 = ['3rd.supply', 'nexon'] as const

/**
 * 계산·집계 대상 origin. **앞에 있는 것이 우선한다** —
 * 같은 `sourceMatchId` 가 둘 다 있으면 앞쪽을 남기고 뒤쪽을 버린다.
 *
 * ── ⚠ `nexon_barracks` 를 더했다 (2026-09-01)
 *
 * IPL(`nolink`)의 경기는 병영수첩에서 왔고 `origin='nexon_barracks'` 다
 * (`jobs/iplProject.ts`). 그런데 이 목록에 없어서 **시즌0 집계에서 통째로 빠져 있었다** —
 * `season0 --leagues nolink` 가 선수 0명 · 클랜 0개를 돌려줬다 (2026-09-01 실측).
 * `jobs/iplClanRollup.ts` 머리말이 *"`season0Apply` 는 origin 필터에서 빠지고"* 라고
 * 적어 둔 것이 바로 이것이다.
 *
 * 다른 리그에는 영향이 없다. `nexon_barracks` 경기가 있는 리그는 `nolink` 뿐이다
 * (2026-09-01 로컬 실측: sanply·supply·daerule 은 전부 `3rd.supply`).
 * 맨 뒤에 둔 것은 중복 제거에서 **미러와 넥슨이 먼저 이기게** 하기 위해서다.
 */
export const SEASON0_ORIGINS = ['3rd.supply', 'nexon', 'nexon_barracks'] as const

/** 시즌0 은 리그 `Season` 표에서 번호 0 · `beta` 다 (D-098 · D-175) */
export const SEASON0_NUMBER = 0
export const SEASON0_TYPE = 'beta'

/** `runRate` 에 넘길 범위 */
export function season0Scope(): { origins: string[]; from: Date; to: Date | null } {
  return { origins: [...SEASON0_ORIGINS], from: SEASON0_FROM, to: SEASON0_TO }
}

/**
 * Prisma `Match` where 절 조각. 집계·검증 질의가 **같은 창**을 보게 한다.
 *
 * 여기서 중복(`sourceMatchId`)까지 걸러 주지는 못한다 — 그것은 replay 가 한다.
 * 중복까지 맞춰야 하는 질의는 replay 가 돌려준 `statKeys` 를 쓴다.
 */
export function season0MatchWhere(): {
  origin: { in: string[] }
  startAt: { gte: Date; lt?: Date }
} {
  return {
    origin: { in: [...SEASON0_ORIGINS] },
    startAt: { gte: SEASON0_FROM, ...(SEASON0_TO ? { lt: SEASON0_TO } : {}) },
  }
}

/** 로그용 표기 — 사람이 읽는 기준은 KST 다 */
export function season0WindowLabel(): string {
  const kst = (at: Date): string => new Date(at.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
  return `${kst(SEASON0_FROM)}(KST) ~ ${SEASON0_TO ? kst(SEASON0_TO) : '현재(열린 구간)'}`
}
