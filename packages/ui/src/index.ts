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
