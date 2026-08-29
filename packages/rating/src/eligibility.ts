/**
 * 경기 인정 기준과 참가자 처리 — **순수 함수**.
 *
 * ── 공식 통계 반영 기준 (D-079 — 2026-08-22 정책 변경)
 *   **양 팀 중 한쪽이라도** 같은 클랜 본클랜원 3명 이상이 확인되면 **공식 경기**다.
 *
 *     클3+용2 vs 클3+용2  → 공식
 *     클3+용2 vs 클2+용3  → 공식
 *     클3+용2 vs 클0+용5  → 공식
 *     클2+용3 vs 클2+용3  → **비공식 경기**
 *     클1+용4 vs 클1+용4  → **비공식 경기**
 *
 *   조건은 `home >= 3 OR away >= 3` 다. **AND가 아니다.**
 *   (기존 D-071의 AND 기준은 폐기한다.)
 *
 * ── 비공식 경기도 지우지 않는다 (D-080)
 *   양쪽 다 3명 미만이어도 **경기 자체는 남긴다.** 기록실에서 참가자·K/D/A·맵·결과를 볼 수 있다.
 *   다만 시즌 승패·킬뎃·평균킬·MVP·개인 래더·클랜 래더·랭킹에는 **전혀 반영하지 않는다.**
 *
 * ── 어느 팀으로 뛰었는가 (D-072 유지 · 우선순위는 D-180)
 *   승자가 하나뿐이므로 **승패가 곧 팀**이다. 추측하지 않는다.
 *   팀을 대표하는 클랜은 다음 순서로 정한다.
 *     0. `sideEvidence.authority === 'primary'` 면 **그 값이 정본**이다 (D-180).
 *        출처가 자기 기록에 "A vs B" 로 적어 둔 경기(미러)에만 붙는다
 *     1. 매치 상세의 `guild_name`이 리그 클랜과 **정확히** 일치하는 것의 다수 (D-043 근거)
 *     2. 없으면 그 팀 참가자들의 **등록 클랜 다수**
 *     3. 둘 다 없으면 `sideEvidence`(fallback), 그것도 없으면 팀을 식별하지 못한 것이다
 *
 * ── 클랜 래더 반영률 (D-081)
 *   같은 공식 경기라도 팀마다 다르다. 자기 본클랜원을 몇 명 냈는지로 정한다.
 *     3명 이상 100% · 2명 70% · 1명 40% · 0명 0%
 *   개인 래더에는 이 차등을 적용하지 않는다 (D-082).
 */
import type { RatingConstants } from './constants.js'

/** 확인 근거 */
export type EvidenceSource = 'player_match_list' | 'match_detail'

/** 이 경기에서의 역할 — 소속이 아니라 **이 경기 기준**이다 */
export type ParticipantRole = 'member' | 'mercenary'

export interface ConfirmedParticipant {
  playerId: string
  /**
   * 경기 시점 **등록 클랜** (`LeagueRosterMembership`). 없으면 `null`(무소속·타 리그).
   * 이 값은 "원래 소속"이고, 실제로 어느 팀으로 뛰었는지와는 다르다.
   */
  rosterLeagueClanId: string | null
  /**
   * 매치 상세의 `guild_name`이 리그 클랜과 **정확히** 일치할 때 그 클랜.
   * 팀 식별의 1차 근거다. 이름이 비슷하다는 이유로 넣으면 안 된다 (D-036 · 정책 20).
   */
  detailLeagueClanId?: string | null
  outcome: 'win' | 'lose'
  /** KDA 는 래더 계산에 **쓰지 않는다** (CLAUDE.md 3-B 3번). 모르면 null 이다 (D-148) */
  kill: number | null
  death: number | null
  assist: number | null
  /** 이 선수를 확인한 근거 (하나 이상) */
  sources: EvidenceSource[]
  /** 경기 시점 개인 래더 — 라인업 전력 계산에 쓴다 */
  ratingBefore?: number
}

/** 팀 배정까지 끝난 참가자 */
export interface AssignedParticipant extends ConfirmedParticipant {
  /** 이 경기에서 **뛴 팀** */
  leagueClanId: string
  role: ParticipantRole
}

export type ReconstructionStatus =
  /** 공식 경기 — 시즌 통계·래더에 반영한다 */
  | 'official'
  /** 비공식 경기 — 기록실에는 남기지만 공식 통계에 반영하지 않는다 */
  | 'reference'
  | 'unidentified_side'
  | 'single_clan'
  | 'no_winner'
  | 'inconsistent_outcome'
  | 'conflict_with_detail'

/**
 * 진영별 클랜 근거 (D-133 · 우선순위는 D-180).
 *
 * 넥슨 상세만으로 어느 클랜의 팀인지 정하지 못하는 경기가 있다.
 * `guild_name`이 리그 클랜과 정확히 일치하지 않거나, 양쪽이 같은 클랜으로 판정되는 경우다.
 * 그때 **외부 출처가 알려 준 진영별 클랜**을 쓴다.
 *
 * 규칙
 *   · 이 값만으로 참가자를 만들지 않는다. 팀의 **이름표**일 뿐이다
 *   · 승/패 그룹은 여전히 참가자 `outcome` 으로 나눈다. 이 값이 그것을 바꾸지 않는다
 *   · 다수결과 어느 쪽이 이기는지는 `authority` 가 정한다 (아래)
 */
export interface SideEvidence {
  winnerLeagueClanId: string | null
  loserLeagueClanId: string | null
  /** 근거 출처 표시 — 저장해서 나중에 어디서 온 판단인지 알 수 있게 한다 */
  source: string
  /**
   * 이 근거의 **권한** (D-180). 기본은 `fallback` 이다 — 넣지 않으면 D-133 그대로다.
   *
   *   `fallback`  참가자 다수결이 먼저다. 다수결이 두 클랜을 서로 다르게 뽑아내면
   *               이 값은 **보지도 않는다**. 넥슨 재구성 경기가 여기에 해당한다 —
   *               그쪽 진영 클랜은 애초에 라인업 근거로 정해진 값이라 성격이 같다
   *   `primary`   이 값이 **정본**이다. 다수결은 이 값이 없을 때만 쓴다.
   *               외부 출처가 자기 화면에 "A vs B" 로 **적어 둔** 판정일 때만 쓴다
   *               (미러 = 3rd.supply 경기). 추론이 아니라 기록이기 때문이다
   *
   * `primary` 를 붙이는 판단은 **래더 패키지가 하지 않는다.** 이 패키지는 origin 을 모른다.
   * 어느 경기가 `primary` 인지는 `apps/worker/src/lib/sideEvidencePolicy.ts` 한 곳에서 정한다.
   */
  authority?: 'primary' | 'fallback'
}

/** 공식 라벨이 붙는 최소 본클랜원 수 — **래더 지급 조건이 아니다** (D-145) */
export const OFFICIAL_LABEL_MIN_MEMBERS = 3
/** 정상 경기 한 팀 인원 */
export const SQUAD_SIZE = 5

export interface EligibilityInput {
  participants: readonly ConfirmedParticipant[]
  constants?: RatingConstants
  /** 팀 식별 보조 증거. 넥슨으로 정해지면 쓰이지 않는다 */
  sideEvidence?: SideEvidence | null
}

export interface SideSummary {
  leagueClanId: string
  /** 본클랜원 확인 인원 — **공식 여부와 클랜 반영률이 이 값으로 정해진다** */
  members: number
  /** 용병 확인 인원 */
  mercenaries: number
  /** 실제 확인된 출전 인원 = members + mercenaries */
  confirmed: number
  outcome: 'win' | 'lose'
}

export interface EligibilityResult {
  status: ReconstructionStatus
  /** 경기를 기록으로 남길 수 있는가 (양 팀을 식별했는가) */
  recordable: boolean
  /**
   * 공식 라벨 (D-079 의 `본클랜원 3명` 판정).
   *
   * **D-145 부터 래더 지급 여부와 무관하다.** 통계·UI 라벨로만 남긴다.
   * 래더 대상 판정은 `ratingEligible` 이다.
   */
  official: boolean
  /**
   * 래더 대상인가 (D-145).
   *
   * 정상 5v5 + 실제 참가자 10명이면 대상이다.
   * `official` 여부는 보지 않는다 — "비공식이라 레이팅 0" 은 폐기됐다.
   */
  ratingEligible: boolean
  winnerSide: SideSummary | null
  loserSide: SideSummary | null
  /**
   * `5v5` 처럼 **실제 확인된 출전 인원** 기준 (D-074).
   * 본클랜원만 세지 않는다 — 용병도 그 경기에 실제로 뛴 사람이다.
   */
  completeness: string
  observationParticipantCount: number
  detailParticipantCount: number
  winnerLeagueClanId: string | null
  /** 팀 배정이 끝난 참가자 (기록 가능한 경기에서만 채워진다) */
  assigned: AssignedParticipant[]
  /** 팀 식별에 보조 증거를 썼는가. 썼으면 그 출처 (D-133). 넥슨으로 정해졌으면 null */
  sideEvidenceUsed: string | null
  reason: string
}

/** 가장 많이 나온 값 (동률이면 null — 추측하지 않는다) */
function plurality(values: readonly (string | null | undefined)[]): string | null {
  const counts = new Map<string, number>()
  for (const value of values) {
    if (!value) continue
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  if (counts.size === 0) return null
  const sorted = [...counts.entries()].sort((left, right) => right[1] - left[1])
  if (sorted.length > 1 && sorted[0]![1] === sorted[1]![1]) return null
  return sorted[0]![0]
}

/**
 * 경기를 기록할 수 있는가, 공식인가, 그리고 누가 어느 팀이었는가.
 *
 * 참가자가 모자라도 **경기를 버리지 않는다.** 래더 대상이 아닐 뿐이다.
 */
export function evaluateEligibility(input: EligibilityInput): EligibilityResult {
  const observationParticipantCount = input.participants.filter((participant) =>
    participant.sources.includes('player_match_list'),
  ).length
  const detailParticipantCount = input.participants.filter((participant) =>
    participant.sources.includes('match_detail'),
  ).length

  const winners = input.participants.filter((participant) => participant.outcome === 'win')
  const losers = input.participants.filter((participant) => participant.outcome === 'lose')

  const base = {
    observationParticipantCount,
    detailParticipantCount,
    winnerSide: null as SideSummary | null,
    loserSide: null as SideSummary | null,
    completeness:
      winners.length >= losers.length
        ? `${winners.length}v${losers.length}`
        : `${losers.length}v${winners.length}`,
    winnerLeagueClanId: null as string | null,
    assigned: [] as AssignedParticipant[],
    sideEvidenceUsed: null as string | null,
    recordable: false,
    official: false,
    ratingEligible: false,
  }

  if (winners.length === 0 || losers.length === 0) {
    return {
      ...base,
      status: 'single_clan',
      reason: '한쪽 결과만 확인됐다. 상대 팀 선수의 관측이 없다',
    }
  }

  /* --- 팀을 대표하는 클랜 식별 — 추측하지 않는다 --- */
  const identify = (side: readonly ConfirmedParticipant[]): string | null =>
    plurality(side.map((participant) => participant.detailLeagueClanId)) ??
    plurality(side.map((participant) => participant.rosterLeagueClanId))

  const nexonWinnerClanId = identify(winners)
  const nexonLoserClanId = identify(losers)

  /* 넥슨 근거로 **두 클랜이 서로 다르게** 정해지면 그대로 쓴다 (넥슨 우선 · D-133).
     정하지 못했거나 양쪽이 같은 클랜으로 나온 경우에만 보조 증거를 본다. */
  const nexonDecided =
    nexonWinnerClanId !== null && nexonLoserClanId !== null && nexonWinnerClanId !== nexonLoserClanId

  /* ---- 우선순위가 뒤집히는 단 하나의 지점 (D-180) ----

     `authority === 'primary'` 이면 **적혀 있는 진영 클랜이 정본**이다.
     다수결(`identify`)은 이 값이 없거나 반쪽일 때만 쓴다.

     왜 뒤집나 — 다수결의 입력인 `rosterLeagueClanId` 는 미러 참가행의 **41%가 비어 있다**
     (클랜명 없음 31.6% + 이 리그에 등록되지 않은 클랜 9.2% · D-179 조사).
     `plurality()` 는 최다 득표가 동률만 아니면 그대로 반환하므로, 5명 중 4명이 소속 불명이면
     **남은 한 명이 팀 이름을 정한다.** 실측으로 어긋난 쪽의 절반(supply 721/1,630)이
     한 명이 정한 것이었고, **5명 전원이 기록과 다른 경기는 supply 에 0건**이었다.
     얇은 추론이 두꺼운 기록을 이기고 있었던 것이다.

     `primary` 조건은 **두 진영이 다 있고 서로 다를 때**로 한정한다. 반쪽짜리 이름표나
     같은 클랜 두 개는 정본이 될 수 없다 — 그때는 평소대로 다수결로 내려간다. */
  const evidencePrimary =
    input.sideEvidence?.authority === 'primary' &&
    input.sideEvidence.winnerLeagueClanId !== null &&
    input.sideEvidence.loserLeagueClanId !== null &&
    input.sideEvidence.winnerLeagueClanId !== input.sideEvidence.loserLeagueClanId

  const evidenceDecides = evidencePrimary || !nexonDecided

  const winnerClanId = evidencePrimary
    ? input.sideEvidence!.winnerLeagueClanId
    : nexonDecided
      ? nexonWinnerClanId
      : (input.sideEvidence?.winnerLeagueClanId ?? nexonWinnerClanId)
  const loserClanId = evidencePrimary
    ? input.sideEvidence!.loserLeagueClanId
    : nexonDecided
      ? nexonLoserClanId
      : (input.sideEvidence?.loserLeagueClanId ?? nexonLoserClanId)

  if (winnerClanId === null || loserClanId === null) {
    return {
      ...base,
      status: 'unidentified_side',
      reason: '어느 클랜의 팀인지 근거로 정할 수 없다 (상세 클랜명·등록 클랜·보조 증거 모두 불충분)',
    }
  }
  if (winnerClanId === loserClanId) {
    return {
      ...base,
      status: 'single_clan',
      reason: '양 팀이 같은 클랜으로 판정됐다. 클랜전으로 볼 수 없다',
    }
  }

  const assign = (
    side: readonly ConfirmedParticipant[],
    leagueClanId: string,
  ): AssignedParticipant[] =>
    side.map((participant) => ({
      ...participant,
      leagueClanId,
      // 뛴 팀이 자기 등록 클랜과 다르면 그 경기의 역할은 용병이다
      role: participant.rosterLeagueClanId === leagueClanId ? 'member' : 'mercenary',
    }))

  const assigned = [...assign(winners, winnerClanId), ...assign(losers, loserClanId)]

  const summarize = (leagueClanId: string, outcome: 'win' | 'lose'): SideSummary => {
    const side = assigned.filter((participant) => participant.leagueClanId === leagueClanId)
    const members = side.filter((participant) => participant.role === 'member').length
    return {
      leagueClanId,
      members,
      mercenaries: side.length - members,
      confirmed: side.length,
      outcome,
    }
  }

  const winnerSide = summarize(winnerClanId, 'win')
  const loserSide = summarize(loserClanId, 'lose')

  /* 공식 라벨은 그대로 계산한다 — **다만 래더 지급과는 무관하다** (D-145).
     OR 조건: 한쪽만 본클랜원 3명을 채워도 공식 라벨이 붙는다 (D-079) */
  const official =
    winnerSide.members >= OFFICIAL_LABEL_MIN_MEMBERS ||
    loserSide.members >= OFFICIAL_LABEL_MIN_MEMBERS

  /* **래더 대상 판정** (D-145).
     정상 5v5 + 실제 참가자 10명이면 대상이다. official 은 보지 않는다.
     클1용4 vs 클1용4 도 정상적으로 점수를 받는다. */
  const ratingEligible = winnerSide.confirmed === SQUAD_SIZE && loserSide.confirmed === SQUAD_SIZE

  return {
    observationParticipantCount,
    detailParticipantCount,
    status: official ? 'official' : 'reference',
    recordable: true,
    official,
    ratingEligible,
    winnerSide,
    loserSide,
    completeness:
      winnerSide.confirmed >= loserSide.confirmed
        ? `${winnerSide.confirmed}v${loserSide.confirmed}`
        : `${loserSide.confirmed}v${winnerSide.confirmed}`,
    winnerLeagueClanId: winnerClanId,
    assigned,
    sideEvidenceUsed: evidenceDecides ? (input.sideEvidence?.source ?? null) : null,
    reason: ratingEligible
      ? ''
      : `정상 5v5 가 아니다 (${winnerSide.confirmed} vs ${loserSide.confirmed}). 래더에 반영하지 않는다`,
  }
}

export type LineupConfidence = 'high' | 'medium' | 'low'

/**
 * 확인 수준을 등급으로.
 *
 * 화면에 "이 기록이 얼마나 확실한가"를 보여 주기 위한 값이다.
 * 숫자를 감추지 않는다 — 등급과 원본 인원 수를 함께 남긴다.
 */
export function lineupConfidence(
  winnerConfirmed: number,
  loserConfirmed: number,
  squadSize = 5,
): LineupConfidence {
  const smaller = Math.min(winnerConfirmed, loserConfirmed)
  if (smaller >= squadSize) return 'high'
  if (smaller >= squadSize - 1) return 'medium'
  return 'low'
}
