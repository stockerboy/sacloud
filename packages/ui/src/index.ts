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

export { FEATURED_LEAGUES, PRIMARY_NAV, SITE_BRAND, type NavLink } from './site-config'

/* --- Phase 3: 리그 · 랭킹 --- */
export {
  ClanMark,
  type ClanMarkProps,
  type ClanMarkSize,
  type ClanMarkSource,
} from './common/ClanMark'
export { Label } from './common/Label'
export { LoadMoreButton } from './common/LoadMoreButton'
export { formatCount, formatRate, formatAverage, formatRating, formatDate } from './common/format'
export { rateClass, rateTone, RATE_THRESHOLDS, type RateTone } from './common/rate'
export { LeagueSubNav } from './league/LeagueSubNav'
export { DivisionTabs } from './league/DivisionTabs'
export {
  RankHeader,
  RankBox,
  ClanRankTable,
  PlayerRankTable,
  type ClanRankTableProps,
  type PlayerRankTableProps,
} from './league/RankTable'
export { LeagueListTable } from './league/LeagueListTable'
export {
  LeagueHeader,
  LeagueHomeTabs,
  LeagueInfoPanel,
  LEAGUE_HOME_TABS,
} from './league/LeagueHome'
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
export { ClanMemberList } from './profile/ClanMemberList'

/* --- Phase 4: 기록실 · 매치 상세 --- */
export { MatchCard, formatPlayTime, formatRatingUpdate } from './record/MatchCard'
export {
  RecentMatchSummary,
  PlayerStatSidebar,
  TeammateTable,
  type PlayerStatSidebarProps,
} from './record/RecordPanels'
export { ratingClass, RATING_THRESHOLDS } from './common/rating'
export { SeasonTable } from './record/SeasonTable'

/* --- Phase 5: 게시판 --- */
export { BoardNav } from './board/BoardNav'
export { BoardTable, BoardPager } from './board/BoardTable'
export { PostView, formatPostDate } from './board/PostView'
export { CommentList, CommentForm } from './board/CommentList'
export { BoardSearch, type BoardSearchType } from './board/BoardSearch'
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
