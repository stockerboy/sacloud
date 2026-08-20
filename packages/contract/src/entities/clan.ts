import { z } from 'zod'
import { ClanMark, Count, Id, IsoDate, IsoDateTime, Percent, Rating, Slug } from '../common'
import { Division, LeagueClanStatus } from '../codes'
import { ClanSummary, LeagueSummary, PlayerSummary } from './summaries'

/** GET /clans/{clanSlug} */
export const Clan = z.object({
  id: Id,
  /** 원본은 넥슨 병영수첩 slug를 그대로 식별자로 사용한다 */
  slug: Slug,
  name: z.string(),
  mark: ClanMark,
  master: PlayerSummary.nullable(),
  established_at: IsoDate.nullable(),
  notice: z.string().nullable(),
  /** 마지막 `전적갱신` 시각 */
  renewed_at: IsoDateTime.nullable(),
  member_count: Count,
})
export type Clan = z.infer<typeof Clan>

/** GET /clans/{clanSlug}/players — 클랜원 (커서) */
export const ClanPlayer = PlayerSummary.extend({
  /** 포지션 메모 (예: "B 사이트") */
  position: z.string().nullable(),
  /** 클랜마스터 여부 */
  master: z.boolean(),
})
export type ClanPlayer = z.infer<typeof ClanPlayer>

/** GET /clans/{clanSlug}/leagues — 클랜의 리그별 성적 */
export const ClanLeagueEntry = z.object({
  league: LeagueSummary,
  league_clan_id: Id,
  rating: Rating,
  division: Division,
  win: Count,
  lose: Count,
  win_rate: Percent,
  placement: z.boolean(),
  status: LeagueClanStatus,
  joined_at: IsoDateTime,
  rank: Count.nullable(),
  rank_count: Count.nullable(),
})
export type ClanLeagueEntry = z.infer<typeof ClanLeagueEntry>

/** GET /clans/search/{q} */
export const ClanSearchItem = ClanSummary
export type ClanSearchItem = z.infer<typeof ClanSearchItem>
