/**
 * "래더에 반영된 경기" 를 고르는 조건 (D-164).
 *
 * ── 왜 한 곳에 모으는가
 *   여러 화면이 각자 `redRatingUpdate: { not: null }` 을 적어 두고 있었다.
 *   그 값은 **우리 공식(D-145)이 계산해 넣는 칸**이라, 3rd.supply 에서 미러링해
 *   들여온 경기에는 들어 있지 않다 (D-153 — 원본 점수는 `redSourceRatingUpdate` 에 있다).
 *
 *   그래서 미러 적재 뒤에 세 군데가 한꺼번에 틀어졌다. 실측:
 *
 *     supply 리그 경기 130,022건 중 `redRatingUpdate` 가 있는 것 98건
 *
 *   결과로 화면에 이렇게 나왔다 —
 *     · 개인랭킹 평균킬이 전부 `0.0킬`
 *     · 선수·클랜 상세정보의 평균킬이 `0킬`   (869킬을 기록한 선수가 판당 0킬)
 *     · 최근매치 요약(`20전 10승 10패`)과 연승/연패가 비어 보임
 *
 *   같은 조건을 세 번 적어 두었기 때문에 한 번 고쳐도 나머지가 남았다.
 *   한 곳에서 정의하고 셋이 같이 쓴다.
 *
 * ── 미러 경기를 왜 래더 경기로 보는가
 *   원본은 **래더 경기만** 준다. 그래서 `origin='3rd.supply'` 이면 래더 경기다.
 *   추측이 아니라 수집 범위에서 나오는 사실이다 (`docs/NEXON_INGEST_SPEC.md`).
 *
 * ── 배치고사는 여기서 거르지 않는다
 *   배치고사 경기는 `rating_update` 가 0이지 `null` 이 아니다 (3-B 7번).
 *   "래더에 반영됐는가" 와 "점수가 움직였는가" 는 다른 질문이다.
 */
import type { Prisma } from '@sacloud/db'
import { MIRROR_ORIGIN } from './publicScope'

/**
 * 래더에 반영된 경기인가 — `Match` 에 바로 거는 조건.
 *
 * ```ts
 * prisma.match.findMany({ where: { ...base, ...ladderMatchWhere() } })
 * ```
 *
 * `OR` 를 쓰므로 **다른 `OR` 와 같은 객체에 펼치면 덮어쓴다.** 그럴 때는
 * `AND: [ladderMatchWhere(), ...]` 로 감싸라.
 */
export function ladderMatchWhere(): Prisma.MatchWhereInput {
  return {
    OR: [
      /* 우리 공식이 계산한 경기 (D-145) */
      { redRatingUpdate: { not: null } },
      /* 3rd.supply 에서 미러링한 경기 — 원본이 래더 경기만 준다 (D-153) */
      { origin: MIRROR_ORIGIN },
    ],
  }
}

/** 이미 다른 조건이 있는 `Match` where 에 안전하게 덧붙인다 (`OR` 충돌을 피한다) */
export function withLadderMatch(where: Prisma.MatchWhereInput): Prisma.MatchWhereInput {
  return { AND: [where, ladderMatchWhere()] }
}
