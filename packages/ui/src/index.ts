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
/*
 * 리그 상단 (검정 띠 + 탭 둘 + 버건디 히어로) — D-251.
 * 옛 판 `LeagueSubNav`(탭 3개 · 리그홈 포함)는 아래 league 묶음에 **그대로 남아 있다**.
 */
export {
  LeagueTopBar,
  LeagueHeroBand,
  leagueTabs,
  type LeagueTopBarProps,
  type LeagueHeroBandProps,
} from './layout/LeagueTopBar'

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
/* SPL(왼쪽) · IPL(오른쪽) 두 칸 랭킹 (2026-09-01). 부리그 탭 화면은 그대로 살아 있다 */
export { RankSplit, RankSplitColumn, type RankSplitColumnProps } from './league/RankSplit'
export { divisionLabel, divisionUnit } from './league/divisionLabel'
/* 「고용가능 클랜」 검색창 (2026-09-02 · D-260). 이 화면에만 붙는다 */
export { ClanSearchBox, type ClanSearchBoxProps } from './league/ClanSearchBox'
export {
  RankHeader,
  RankBox,
  ClanRankTable,
  PlayerRankTable,
  type ClanRankTableProps,
  type ClanRankTableRow,
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
/** 기록카드 재질 (D-250). 기본 `holo` · 옛 검정 카드는 `legacy` */
export type { MatchCardLook } from './record/MatchCard'
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
export { WeeklyTrendCard, type WeeklyTrendCardProps } from './record/WeeklyTrendCard'
export { PlayerHeadCard, type PlayerHeadCardProps } from './record/PlayerHeadCard'
export { ClanHeadCard, type ClanHeadCardProps } from './record/ClanHeadCard'
export { positionLine, rankColor, mainWeaponFromStats } from './record/playerHeadCopy'
export {
  weeklyPercentDomain,
  weeklyRankDomain,
  weeklyRankY,
  weeklySegments,
  weeklyShowsLabel,
  weeklyTail,
  weeklyX,
  weeklyY,
  type ChartDomain,
  type ChartSeries,
} from './record/weeklyChart'
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
/* ⚠ 2026-09-02 — 게시판을 **다시 열었다** (사용자 지시 · D-260).
   닫혀 있는 동안에도 아래 export 를 하나도 끊지 않았기 때문에 여기서 고칠 것이 없었다.
   `BoardPreparing` · `BOARD_PREPARING_*` 도 **그대로 둔다** — 다시 닫을 때 쓴다
   (`CLAUDE.md` 10-4). 지금 `app/board/layout.tsx` 는 `BoardLayoutLegacy` 를 그린다. */
export { BoardPreparing } from './board/BoardPreparing'
export {
  BOARD_PREPARING_HEADLINE,
  BOARD_PREPARING_MESSAGE,
} from './board/boardPreparingText'
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
/* 관리자 글 상단 고정 (2026-09-02 · D-261). 서버는 `@sacloud/ui/adminPost` 로 따로 가져간다 */
export {
  ADMIN_BADGE_LABEL,
  ADMIN_PIN_LIMIT,
  isAdminPost,
  isAdminWriter,
} from './board/adminPost'

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
   기록을 지우는 것이 아니라 가려 두는 장치다. 판수와 경기 상세기록은 가리지 않는다.

   ⚠ **2026-09-01 — 화면에서 껐다** (사용자 지시: *"애초에 알시스템은 걍 버려 필요없어"*).
      스위치는 `EGG_SYSTEM_ENABLED` 하나다 (`./egg/eggState.ts` 의 주석 참조).
      **export 는 하나도 끊지 않았다** — 화면들이 여전히 이것들을 부르고, 답이 늘
      «깨짐» 일 뿐이다. 되돌리려면 그 상수만 `true` 로 바꾼다 (`CLAUDE.md` 10-4). */
export {
  CLAN_EGG_GUIDE,
  CLAN_EGG_THRESHOLD,
  EGG_BREAK_GUIDE,
  EGG_SYSTEM_ENABLED,
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

/* --- 가챠샵 — **2026-09-01 사용자 지시로 통째로 삭제했다** ---
 *
 *   ```
 *   "파일 찾기 가챠샵 전부 삭제하고 심플이즈 더 베스트다 op.gg 스타일 Ui로 걍 깔끔하게 간다"
 *   ```
 *
 *   아침에 만들었다가 저녁에 지운 판이다. 어느 화면에도 붙지 않은 채였다 —
 *   지운 시점에 `Capsule` · `CapsulePile` · `GachaShelf` 를 부르는 곳은 하나도 없었다.
 *   지운 것: `./gacha/*` 3개 · `apps/web/scripts/gachaPreview.mts` · `styles.css` 의 가챠 절.
 *
 *   「알」(`./egg/*`)은 **그대로 살아 있다.** 지우라는 지시가 없었고, 가챠샵은 알을
 *   대체하러 온 것이지 알이 가챠샵에 얹힌 것이 아니었다.
 *
 *   ⚠ `CLAUDE.md` 10-4(옛 버전을 남긴다)의 예외다. 「전부 삭제」가 명시 지시였다.
 *      모양은 `design/gacha-guide.html` 에 남아 있다 (design/ 은 손대지 않는다).
 */
