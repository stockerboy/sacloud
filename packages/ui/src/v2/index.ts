/**
 * ★★v2 — Claude Design 이식용 공통 조각★★ (2026-09-06 · Part 10 · 사장님 승인)
 *
 * ⚠ ②단계 조각 4개(Panel · SectionHead · StatRow · FilterChip)는 ★아직 안 붙었다★.
 *   ③단계 껍데기 둘(`SiteHeaderV2` · `LeagueTopBarV2`)은 붙어 있다.
 *   붙이려면 바깥을 `<div className="sac-v2 sac-ipl">` 로 감싼다 —
 *   그 안에서만 v2 토큰이 산다. ★밖은 한 픽셀도 안 바뀐다.★
 */
export { Panel, type PanelProps } from './Panel'
export { SectionHead, type SectionHeadProps } from './SectionHead'
export { StatRow, type StatRowProps } from './StatRow'
export { FilterChip, type FilterChipProps } from './FilterChip'
export { PageHead, type PageHeadProps } from './PageHead'
export { useSeasonLabel } from './useSeasonLabel'
export {
  PlayerIdentityCard,
  playerKpis,
  type PlayerIdentityCardProps,
  type PlayerKpi,
} from './PlayerIdentityCard'

/* ── ③단계 껍데기 (2026-09-07) — ★붙었다★. 옛 판은 지우지 않았다 */
export { leagueAccentClass, v2Class } from './leagueAccent'
export { SiteHeaderV2, leagueSlugOf, type SiteHeaderV2Props } from './SiteHeaderV2'
export { LeagueTopBarV2, type LeagueTopBarV2Props } from './LeagueTopBarV2'

/* ── ④단계 (2026-09-07) — 어느 화면이 v2 로 옮겨졌는지 한 곳에서 판단한다 */
export { isV2Route } from './migrated'
