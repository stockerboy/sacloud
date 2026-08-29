/**
 * 진영 클랜 판정의 **우선순위를 정하는 단 한 곳** (D-180).
 *
 * ── 왜 이 파일이 있나
 *
 * `Match` 에는 이미 진영별 클랜(`redLeagueClanId` / `blueLeagueClanId`)이 적혀 있다.
 * 그런데 래더 엔진(`evaluateEligibility`)은 그것을 **참가자 원소속 다수결로 덮어썼다**
 * (D-133). 그 다수결의 입력은 미러 참가행의 **41%가 비어 있고**, 어긋난 쪽의 절반은
 * **한 명**이 팀 이름을 정하고 있었다. 결과로 시즌0 창에서 supply 1,390 · sanply 2,671 경기가
 * `side_clan_mismatch` 로 **클랜 래더에서만** 빠졌다 (개인 래더에는 이미 들어간 뒤였다).
 * 조사는 `docs/SIDE_CLAN_MISMATCH_AUDIT.md`, 결정은 `docs/DECISIONS.md` D-180.
 *
 * ── 규칙
 *
 *   미러(`3rd.supply`)   저장된 진영 클랜이 **정본**이다 (`authority: 'primary'`).
 *                        3rd.supply 가 자기 화면에 "A vs B" 로 적어 둔 값이다.
 *                        추론이 아니라 **원본의 판정**이므로 다수결이 이길 수 없다
 *   그 밖(`nexon` 등)     예전 그대로 `fallback` 이다 (D-133).
 *                        넥슨 재구성 경기의 진영 클랜은 애초에 라인업 근거로 정해진 값이라
 *                        성격이 다르다. 그쪽 규칙은 **건드리지 않는다**
 *
 * ── 이 파일만 고치면 되게
 *
 * 판정이 갈리는 조건을 여기 하나로 모은다. `rate.ts` · 백테스트 · 조사 도구가 전부
 * 이 함수를 부르므로, 규칙을 바꾸려면 이 파일만 보면 된다.
 * 조건을 여러 파일에 흩어 두면 replay 와 조사가 조용히 갈라진다.
 */
import type { SideEvidence } from '@sacloud/rating'

/** 3rd.supply 미러 수집이 남기는 `Match.origin` */
export const MIRROR_ORIGIN = '3rd.supply'

/** `Match` 에 저장된 진영 클랜을 근거로 쓸 때의 출처 표시 */
export const STORED_MATCH_EVIDENCE_SOURCE = 'stored-match'

/** 진영 판정에 필요한 `Match` 의 최소 모양 */
export interface StoredSideRow {
  /** 없으면 `fallback` 으로 본다 — 출처를 모르는 경기를 정본으로 올리지 않는다 */
  origin?: string | null
  redLeagueClanId: string
  blueLeagueClanId: string
  winnerSide: string
}

/**
 * 저장된 진영 클랜이 **정본인가**.
 *
 * 여기가 미러와 넥슨이 갈리는 유일한 지점이다.
 */
export function storedSidesAreCanonical(origin: string | null | undefined): boolean {
  return origin === MIRROR_ORIGIN
}

/**
 * `Match` 한 건 → 래더 엔진에 넘길 진영 근거.
 *
 * 승/패 그룹 자체는 참가자 `outcome` 이 정한다. 이 값은 **팀의 이름표**일 뿐이다.
 */
export function storedSideEvidence(match: StoredSideRow): SideEvidence {
  return {
    winnerLeagueClanId:
      match.winnerSide === 'red' ? match.redLeagueClanId : match.blueLeagueClanId,
    loserLeagueClanId:
      match.winnerSide === 'red' ? match.blueLeagueClanId : match.redLeagueClanId,
    source: STORED_MATCH_EVIDENCE_SOURCE,
    authority: storedSidesAreCanonical(match.origin) ? 'primary' : 'fallback',
  }
}
