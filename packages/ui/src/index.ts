export { WeaponStatPanel, type PlayerWeaponStatRow } from './record/RecordPanels'
export { FallbackClanMark, type FallbackClanMarkProps } from './common/FallbackClanMark'

export { SiteShell } from './layout/SiteShell'
export { SiteHeader, type SiteHeaderProps } from './layout/SiteHeader'
export { SiteFooter } from './layout/SiteFooter'
export { MainLogo, NavLogo } from './layout/BrandLogo'

export { SearchBar, type SearchBarProps, type SearchType } from './home/SearchBar'
export { HotPostList, HOT_POST_COUNT, type HotPostListProps } from './home/HotPostList'

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
export { FORM_TREND_TEXT, FORM_TREND_CLASS, formMonthLabel } from './record/formCopy'
export {
  formChartDomain,
  formChartSegments,
  formChartX,
  formChartY,
  type FormChartDomain,
  type FormChartSegment,
} from './record/formChart'
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
  boardAllowsWriteAndSearch,
  DEFAULT_BOARD_SLUG,
} from './board/boardCopy'
export { sanitizePostContent } from './board/sanitize'

/* --- Phase 6: 인증 · 마이페이지 · 관리 --- */
export { AuthCard, AuthField, AuthInput, AuthSubmit } from './auth/AuthCard'
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
