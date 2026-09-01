export { WeaponStatPanel, type PlayerWeaponStatRow } from './record/RecordPanels'
export { FallbackClanMark, type FallbackClanMarkProps } from './common/FallbackClanMark'

export { SiteShell } from './layout/SiteShell'
export { SiteHeader, type SiteHeaderProps } from './layout/SiteHeader'
export { SiteFooter } from './layout/SiteFooter'
export { MainLogo, NavLogo } from './layout/BrandLogo'
export {
  LeagueLabel,
  MountainMark,
  MOUNTAIN_LEAGUE_NAME,
  type LeagueLabelProps,
} from './layout/LeagueLabel'

export { SearchBar, type SearchBarProps, type SearchType } from './home/SearchBar'
export { HotPostList, HOT_POST_COUNT, type HotPostListProps } from './home/HotPostList'
/*
 * `LeagueTop3`(리그별 개인랭킹 TOP3)는 2026-08-30 사용자 지시로 **메인에서 뺐다.**
 * 다른 화면에서 쓰던 곳이 없어 파일째 지웠다. 리그 화면의 랭킹은 그대로 있다.
 * 데이터를 주던 `GET /api/home/top` 라우트는 살아 있다 — 화면만 안 부른다.
 */
export { SiteIntro } from './home/SiteIntro'

/* 메인 최상단 신전 히어로 (2026-09-01 사용자 지시) */
export {
  TempleHero,
  type TempleHeroProps,
  type TempleHeroTop,
} from './hero/TempleHero'

export { RelativeTime } from './common/RelativeTime'
export { formatRelativeTime, JUST_NOW } from './common/relative-time'
export { Skeleton } from './common/Skeleton'
export { EmptyState } from './common/EmptyState'
export { ErrorState } from './common/ErrorState'

export {
  FEATURED_LEAGUES,
  MOBILE_NAV_GROUPS,
  PRIMARY_NAV,
  PREPARING_LEAGUE_SLUGS,
  SITE_BRAND,
  isLeaguePreparing,
  type NavGroup,
  type NavLink,
} from './site-config'

/* --- Phase 3: 리그 · 랭킹 --- */
export {
  ClanMark,
  type ClanMarkProps,
  type ClanMarkSize,
  type ClanMarkSource,
} from './common/ClanMark'
export { Label } from './common/Label'
export { LoadMoreButton } from './common/LoadMoreButton'
export {
  formatCount,
  formatRate,
  formatAverage,
  formatRating,
  formatRatingDelta,
  formatDate,
} from './common/format'
export { rateClass, rateTone, RATE_THRESHOLDS, type RateTone } from './common/rate'
export { BetaBadge, LeagueSubNav } from './league/LeagueSubNav'
export { BetaNotice } from './league/BetaNotice'
export { LeaguePreparing } from './league/LeaguePreparing'
export { PREPARING_HEADLINE, PREPARING_MESSAGE } from './league/preparingText'
export {
  betaNoticeFor,
  BETA_NOTICE,
  BETA_NOTICE_HEADLINE,
  BETA_NOTICE_PURPOSE,
  BETA_NOTICE_CARRYOVER,
  type BetaNoticeContent,
} from './league/betaNoticeText'
export { DivisionTabs } from './league/DivisionTabs'
export { divisionLabel, divisionUnit } from './league/divisionLabel'
export {
  RankHeader,
  RankBox,
  ClanRankTable,
  PlayerRankTable,
  type ClanRankTableProps,
  type PlayerRankTableProps,
} from './league/RankTable'
/* 개인랭킹 무기 축 · 폼 TOP3 (D-169 — 원본에 없는 신규 기능) */
export { RankWeaponTabs } from './league/RankWeaponTabs'
export { FormTop3 } from './league/FormTop3'
export { LeagueListTable } from './league/LeagueListTable'
export {
  LeagueHeader,
  LeagueHomeTabs,
  LeagueInfoPanel,
  StarIcon,
  LEAGUE_HOME_TABS,
} from './league/LeagueHome'
export { NAV_TAB, NAV_TAB_ACTIVE, NAV_TAB_IDLE } from './common/navTab'
export { LeagueDescription } from './league/LeagueDescription'
export { sanitizeLeagueDescription } from './league/sanitize'

/* --- Phase 2: 플레이어 · 클랜 프로필 --- */
export {
  PlayerHeader,
  ClanHeader,
  RefreshButton,
  type RefreshState,
} from './profile/ProfileHeader'
export { PlayerLeagueCards, ClanLeagueCards, ProfileTabs } from './profile/LeagueEntryCards'
export {
  LeaguePlayerRecordHeader,
  LeagueClanRecordHeader,
} from './profile/LeagueRecordHeader'
export { ClanMemberList } from './profile/ClanMemberList'

/* --- 프로필 재설계 (`적진` 팔레트) — 최상위 `/player/*` · `/clan/*` 전용 ---
   리그 안의 기록실(`/league/{slug}/player|clan/*`)은 아직 위의 컴포넌트를 쓴다 */
export {
  IdentityBand,
  MetaDot,
  OfficialTag,
  ProfileEmpty,
  ProfileLoadMore,
  ProfileNav,
  ProfileSkeleton,
  SectionTitle,
  Stat,
  WinBar,
  PANEL as PROFILE_PANEL,
} from './player/profileKit'
export { PlayerIdentity, PlayerLeagueList, RenewControl } from './player/PlayerProfile'
export {
  ClanIdentity,
  ClanLeagueList,
  ClanProfileNav,
  ClanRosterByPosition,
  groupByPosition,
} from './clan/ClanProfile'

/* --- Phase 4: 기록실 · 매치 상세 --- */
export { MatchCard, formatPlayTime, formatRatingUpdate } from './record/MatchCard'
export {
  NOT_RATED_BADGE,
  NOT_RATED_BADGE_TITLE,
  NOT_RATED_INLINE_TITLE,
  isRated,
} from './record/officialCopy'
export { weaponStatView, type WeaponStatView } from './record/weaponCopy'
export {
  RecentMatchSummary,
  PlayerStatSidebar,
  ClanStatSidebar,
  TeammateTable,
  type PlayerStatSidebarProps,
} from './record/RecordPanels'
/* 최근 폼 (D-167) — 원본에 없는 화면이다. 사용자 요구로 승률 도넛 자리를 대신한다 */
export { PlayerFormPanel } from './record/PlayerFormPanel'
/* 클랜 지표 (SITE_SPEC_V2 5절) — 이것도 원본에 없는 신규 화면이다 */
export { ClanMetrics } from './record/ClanMetrics'
export { ClanHexagon } from './record/ClanHexagon'
/* 클랜 육각형 **V2** (D-217 · D-235) — 새 여섯 축.
   위의 옛 `ClanHexagon` 은 **지우지 않는다**. 옛 축은 줄 표기로 남는다 (D-235 Q9) */
export {
  ClanHexagonV2,
  type ClanHexagonV2Props,
  type ClanHexV2,
  type ClanHexV2Axis,
  type ClanHexV2AxisKey,
  type ClanHexV2PendingReason,
} from './record/ClanHexagonV2'
/* 배틀로그 지표 (SITE_SPEC_V2 5-5절) — 클랜 지표 바로 아래에 붙는다 */
export { ClanRoundMetrics } from './record/ClanRoundMetrics'
export { ClanRoster } from './record/ClanRoster'
export { FORM_TREND_TEXT, FORM_TREND_CLASS, formMonthLabel } from './record/formCopy'
export {
  formChartDomain,
  formChartSegments,
  formChartX,
  formChartY,
  type FormChartDomain,
  type FormChartSegment,
} from './record/formChart'
/* 전투력 육각형 · 플레이스타일 바 · 오늘 퍼포먼스 (PLAYER_TRAITS_SPEC 4·8·10절 · D-185).
   전부 **원본에 없는 화면**이다 — 사용자 지시로 만든 신규 기능이다 */
export { TraitHexagon } from './record/TraitHexagon'
export { PlaystyleBars } from './record/PlaystyleBars'
export { TodayPerformance } from './record/TodayPerformance'
/* 티어별 게임빈도 + 천적 (`docs/SITE_SPEC_V2.md` 4절) — 이것도 원본에 없는 신규 카드다 */
export { TierBreakdown } from './record/TierBreakdown'
export {
  HEX_CENTER,
  /* 미리보기 스크립트(`apps/web/scripts/clanHexV2Preview.mts`)가 컴포넌트와 **같은**
     점 크기·눈금으로 그리려고 쓴다. 여기서 값을 흉내내면 그림과 화면이 갈린다 */
  HEX_DOT_RADIUS,
  HEX_LABEL_RADIUS,
  HEX_RADIUS,
  HEX_RING_SCALES,
  axisLabelAnchor,
  axisValueText,
  hexPoint,
  hexPolygon,
  hexRing,
  pendingSummary,
  pendingText,
  topPercentText,
} from './record/traitCopy'
export { ratingClass, RATING_THRESHOLDS } from './common/rating'
export { SeasonTable } from './record/SeasonTable'

/* --- Phase 5: 게시판 --- */
export { BoardNav } from './board/BoardNav'
export { BoardTable, BoardPager } from './board/BoardTable'
export { PostView, formatPostDate } from './board/PostView'
export { CommentList, CommentForm } from './board/CommentList'
export { BoardSearch, type BoardSearchType } from './board/BoardSearch'
export {
  boardHeading,
  boardDisplayName,
  boardAllowsWriteAndSearch,
  DEFAULT_BOARD_SLUG,
} from './board/boardCopy'
export { sanitizePostContent } from './board/sanitize'

/* --- Phase 6: 인증 · 마이페이지 · 관리 --- */
export {
  AuthCard,
  AuthError,
  AuthField,
  AuthInput,
  AuthNotice,
  AuthSubmit,
  AuthTitle,
} from './auth/AuthCard'
export { SIGNUP_ALLOWED_EMAIL_DOMAINS } from '@sacloud/contract'
export {
  validateLeagueName,
  validateLeagueSlug,
  validateLeagueDraft,
  LEAGUE_AGREEMENTS,
  LEAGUE_NAME_PATTERN,
  LEAGUE_SLUG_PATTERN,
  type LeagueCreateDraft,
} from './league/leagueCreate'
export { ConfirmTypeToProceed } from './league/ConfirmTypeToProceed'
export {
  isAllowedSignupEmail,
  validateSignupPassword,
  validateSignupNickname,
  canSubmitSignup,
  type SignupDraft,
} from './auth/signupRules'
export * from './common/paths'

/* --- 「알」 시스템 (`docs/EGG_SYSTEM_SPEC.md`) ---
   기록을 지우는 것이 아니라 가려 두는 장치다. 판수와 경기 상세기록은 가리지 않는다. */
export {
  CLAN_EGG_GUIDE,
  CLAN_EGG_THRESHOLD,
  EGG_BREAK_GUIDE,
  EGG_VEIL_MARK,
  EGG_VEIL_MESSAGE,
  clanEggState,
  eggRows,
  type ClanEggInput,
  type ClanEggResult,
  type EggState,
} from './egg/eggState'
export {
  EggProvider,
  isSealed,
  useClanEgg,
  useEggKnowledge,
  usePlayerEgg,
  type EggKnowledge,
} from './egg/EggContext'
export { Egg, type EggProps, type EggSize } from './egg/Egg'
export { EggVeil, EggVeilLegend, EggVeilPanel } from './egg/EggVeil'
export { EggGallery, type EggGalleryItem, type EggGalleryProps } from './egg/EggGallery'

/* --- 가챠샵 (2026-09-01 사용자 지시) ---
   「알」(`./egg/*`)을 **대체하지 않는다.** 같은 뜻(가려 두고 궁금하게 만든다)을 다른
   연출로 옮긴 새 판이고, 옛 판은 그대로 남아 있다 (`CLAUDE.md` 10-4). */
export {
  Capsule,
  type CapsuleProps,
  type CapsuleSize,
  type CapsuleState,
} from './gacha/Capsule'
export {
  CapsulePile,
  capsuleJitter,
  capsuleJitterHash,
  type CapsuleJitter,
  type CapsulePileItem,
  type CapsulePileProps,
} from './gacha/CapsulePile'
export {
  BELT_SECONDS_PER_ITEM,
  GachaShelf,
  type GachaShelfItem,
  type GachaShelfProps,
} from './gacha/GachaShelf'
