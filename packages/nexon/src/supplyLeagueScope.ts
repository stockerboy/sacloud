/**
 * SACLOUD 서플라이 공식리그 **기록 대상 판정** — 순수 함수 (D-122).
 *
 * ── 확정된 정책
 *   SACLOUD Supply 리그는 **제3보급창고 5vs5만** 인정한다.
 *
 *   원본 3rd.supply의 리그홈 실측값은 `리그맵: 제3보급창고` / `대전인원: 5 vs 5, 6 vs 6`이다.
 *   즉 원본에는 6vs6이 정식으로 존재한다. 그러나 **SACLOUD는 6vs6을 기록 대상에서 제외한다**
 *   (사용자 확정 정책. 이 결정이 이전 해석보다 우선한다).
 *
 * ── 6vs6은 "비공식 경기"가 아니다
 *   비공식(`unofficial`)은 **리그 경기이지만 래더에 반영하지 않는** 상태다.
 *   6vs6은 애초에 **리그 대상이 아니다**. 둘을 섞으면 기록실에 6vs6이 남고
 *   "왜 이 경기는 점수가 없나"라는 질문이 생긴다. 그래서 상태를 따로 둔다.
 *
 *     out_of_scope   리그 대상 아님   (맵이 다르거나 6vs6)  → 투영하지 않는다
 *     incomplete     리그 대상이지만 참가자가 덜 복원됨      → 보류
 *     eligible       리그 대상        → official/unofficial 판정으로 넘어간다
 *
 * ── raw는 버리지 않는다
 *   대상이 아니어도 원본·스테이징에는 그대로 남는다 (`CLAUDE.md` 3-A 1번).
 *   여기서 정하는 것은 **리그 도메인에 넣는가** 하나다.
 */

/** 공식리그 기록 대상 맵. 원본 리그홈 `리그맵` 실측값이다 */
export const SUPPLY_LEAGUE_MAP = '제3보급창고'

/**
 * 넥슨 응답에서 이 맵이 어떤 문자열로 오는지는 **아직 관측되지 않았다**.
 *
 * 수집된 클랜전 15,879건에 제3보급창고가 한 건도 없었다 —
 * 관측된 클랜전 맵은 올드타운 · 데저트2 · 드래곤로드 · 크로스포트 · 시티캣 · 프로방스뿐이고,
 * "보급"이 들어간 것은 `3보급-개인전`(일반전) 1건뿐이었다.
 *
 * 그래서 별칭을 **추측해서 넣지 않는다.** 실제 표기가 관측되면 그때 여기에 근거와 함께 더한다.
 * `contains('보급')` 같은 느슨한 매칭은 쓰지 않는다 — `3보급-개인전`처럼
 * 전혀 다른 모드가 통과해 버린다.
 */
export const SUPPLY_LEAGUE_MAP_ALIASES: readonly string[] = [SUPPLY_LEAGUE_MAP]

/** 리그가 인정하는 팀 인원. **5명 고정**이다 (6vs6 제외 — 확정 정책) */
export const SUPPLY_TEAM_SIZE = 5

/** 리그가 인정하는 총 참가 인원 */
export const SUPPLY_TOTAL_PARTICIPANTS = SUPPLY_TEAM_SIZE * 2

export type LeagueScope = 'eligible' | 'incomplete' | 'out_of_scope'

export interface ScopeVerdict {
  scope: LeagueScope
  /** 기계가 읽는 사유 코드 */
  code: string
  /** 사람이 읽는 사유 */
  reason: string
}

/**
 * 맵 이름이 기록 대상인가.
 *
 * **정확히 일치**할 때만 참이다. 부분 문자열·정규화·유사도를 쓰지 않는다.
 * 앞뒤 공백만 다듬는다 — 그것까지 막으면 원본의 사소한 표기 차이에 걸려 넘어진다.
 */
export function isSupplyLeagueMap(mapName: string | null | undefined): boolean {
  if (!mapName) return false
  const trimmed = mapName.trim()
  return SUPPLY_LEAGUE_MAP_ALIASES.some((alias) => alias === trimmed)
}

export interface ScopeInput {
  mapName: string | null | undefined
  /** 원본에서 확인된 A팀 인원 */
  teamASize: number
  /** 원본에서 확인된 B팀 인원 */
  teamBSize: number
  /**
   * 원본이 알려 주는 **총 참가 인원**. 우리가 아직 복원하지 못한 사람도 포함한다.
   * 이 값이 팀 합계보다 크면 "복원이 덜 됐다"는 뜻이고, 6vs6 판정도 이 값으로 한다.
   */
  sourceParticipantCount?: number
}

/**
 * 리그 기록 대상인지 판정한다.
 *
 * 순서가 중요하다.
 *  1. **맵** — 대상 맵이 아니면 인원을 볼 필요가 없다
 *  2. **6vs6** — 대상 맵이어도 6인전이면 대상 아님 (비공식이 아니라 out_of_scope)
 *  3. **복원 완성도** — 5vs5가 되어야 기록한다. 덜 됐으면 보류
 */
export function evaluateLeagueScope(input: ScopeInput): ScopeVerdict {
  if (!isSupplyLeagueMap(input.mapName)) {
    return {
      scope: 'out_of_scope',
      code: 'map_not_in_scope',
      reason: `기록 대상 맵이 아니다: ${input.mapName ?? '(없음)'} (대상: ${SUPPLY_LEAGUE_MAP})`,
    }
  }

  const source = input.sourceParticipantCount ?? input.teamASize + input.teamBSize
  const larger = Math.max(input.teamASize, input.teamBSize)

  /* 6vs6은 **비공식이 아니라 대상 외**다. 원본에 정식으로 존재하지만
     SACLOUD는 5vs5만 인정한다 (확정 정책). */
  if (source > SUPPLY_TOTAL_PARTICIPANTS || larger > SUPPLY_TEAM_SIZE) {
    return {
      scope: 'out_of_scope',
      code: 'team_size_not_in_scope',
      reason: `5vs5가 아니다 (원본 ${source}명). SACLOUD는 6vs6을 기록하지 않는다`,
    }
  }

  if (input.teamASize !== SUPPLY_TEAM_SIZE || input.teamBSize !== SUPPLY_TEAM_SIZE) {
    return {
      scope: 'incomplete',
      code: 'participant_incomplete',
      reason:
        `참가자가 덜 복원됐다 (${input.teamASize}vs${input.teamBSize}). ` +
        '원본에 있는 사람을 우리가 아직 못 붙인 것이지 경기가 이상한 것이 아니다',
    }
  }

  return { scope: 'eligible', code: 'eligible', reason: '제3보급창고 5vs5' }
}

/** 리그 도메인에 투영해도 되는가 */
export function isProjectable(verdict: ScopeVerdict): boolean {
  return verdict.scope === 'eligible'
}
