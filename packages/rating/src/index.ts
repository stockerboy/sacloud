/**
 * `@sacloud/rating` — 래더 엔진.
 *
 * **순수 함수만 있다.** DB·네트워크·시각·난수를 쓰지 않는다.
 * 그래서 같은 경기를 다시 계산해도 같은 값이 나오고(결정적 replay),
 * 시뮬레이션과 운영이 **같은 코드**를 쓴다.
 *
 * 정책 근거: `docs/DECISIONS.md` D-057 ~ D-068 · 상수 근거: `docs/LADDER_TUNING_REPORT.md`
 */
export {
  DEFAULT_RATING_CONSTANTS,
  V2_RATING_CONSTANTS,
  clanCompositionWeight,
  personalKFor,
  PERSONAL_FORMULA_VERSION,
  CLAN_FORMULA_VERSION,
  FORMULA_VERSION,
  CONFIDENCE_FULL_AT,
  roundHalfUp,
  constantsForSeason,
  DEFAULT_SEASON_POLICY,
  type DecayTier,
  type RatingConstants,
  type RatingV2Flags,
  type SeasonPolicyFlags,
  type SuppressionRange,
  type WinRateBand,
} from './constants.js'

export {
  applyRating,
  applyWinRateBands,
  averageMembers,
  clanDailyDecay,
  clanRatingUpdate,
  compositionScore,
  confidenceFor,
  dailyDecay,
  displayScore,
  expectedScore,
  personalRatingUpdate,
  seasonStartRating,
  suppressionFactor,
  type DisplayInput,
  type DisplayResult,
  type Outcome,
  type RatingUpdateInput,
  type RatingUpdateResult,
} from './formula.js'

export {
  OFFICIAL_LABEL_MIN_MEMBERS,
  SQUAD_SIZE,
  evaluateEligibility,
  lineupConfidence,
  type AssignedParticipant,
  type ConfirmedParticipant,
  type EligibilityInput,
  type SideEvidence,
  type EligibilityResult,
  type EvidenceSource,
  type LineupConfidence,
  type ParticipantRole,
  type ReconstructionStatus,
  type SideSummary,
} from './eligibility.js'

export {
  rateMatch,
  type ClanRatingResult,
  type MatchRatingInput,
  type MatchRatingResult,
  type PlayerRatingResult,
} from './match.js'
