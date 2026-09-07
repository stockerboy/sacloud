import Link from 'next/link'
import type { ReactNode } from 'react'
import type { ClanMarkSource } from '../common/ClanMark'
import { formatCount, formatRate, formatRating } from '../common/format'
import { rateClass } from '../common/rate'
import { rankColor } from '../record/playerHeadCopy'
import { divisionLabel } from '../league/divisionLabel'
import { MetaDotV2, RecordIdentityCard, type RecordKpi } from './RecordIdentityCard'

/**
 * ★★v2 클랜 카드★★ (2026-09-07 · Part 10 ⑦)
 *
 * ```
 * ┌───────────────────────────────────────────── CLOUD 0 ←워터마크
 * │ [마크]  ★클랜명★                     [전적갱신][기본정보]
 * │  78px   SPL · 2부리그 · 클랜랭킹 ★1위★ · 최근갱신 …
 * ├──────────┬──────────┬──────────
 * │ 래더      │ 승률      │ 순위
 * └──────────┴──────────┴──────────
 * ```
 *
 * ── ★시안 코드가 없는 화면이다★
 *   사장님이 주신 시안 파일 다섯 개(홈 · 개인랭킹 · 선수상세 · 지난시즌 · LIVE)에
 *   ★클랜 상세는 없다.★ 그래서 ★선수 상세와 같은 말투★ 로 짰다 —
 *   같은 뼈대(`RecordIdentityCard`) · 같은 KPI 줄 · 같은 색 규칙.
 *   새 모양을 지어내는 것보다 ★이미 승인된 모양을 그대로 쓰는 것★ 이 안전하다.
 *
 * ── ★없으면 안 그린다★
 *   순위가 없으면 「순위 없음」 · 부리그를 안 쓰는 리그면 그 조각을 안 만든다 ·
 *   한 판도 안 뛰었으면 승률 칸을 안 만든다.
 *
 * ── ★옛 머리띠를 지우지 않았다★
 *   `LeagueClanRecordHeader` (`profile/LeagueRecordHeader.tsx`) 가 그대로 있다.
 */

export interface ClanIdentityCardProps {
  name: string
  clan: { name: string; mark: ClanMarkSource } | null
  leagueName: string
  /** 부리그 번호. 리그가 부리그를 안 쓰면 `divisionCount` 를 1 로 넘긴다 */
  division: number
  divisionCount: number
  /** 클랜랭킹 순위. 없으면 「순위 없음」 */
  rank: number | null
  /** 오른쪽 단추들 (전적갱신 등). 없으면 안 그린다 */
  action?: ReactNode
  /** `기본정보` 가 가는 곳 */
  infoHref: string
  /** 카드 안 큰 흐린 글자 (지금 시즌) */
  watermark?: string | null
  kpis: readonly RecordKpi[]
  kpiNote?: string | null
  /** 최근갱신 표시. 없으면 안 그린다 */
  renewedNote?: ReactNode
}

export function ClanIdentityCard({
  name,
  clan,
  leagueName,
  division,
  divisionCount,
  rank,
  action,
  infoHref,
  watermark,
  kpis,
  kpiNote,
  renewedNote,
}: ClanIdentityCardProps) {
  const ink = rankColor(rank) ?? 'var(--v2-text-strong)'

  return (
    <RecordIdentityCard
      mark={clan}
      name={name}
      nameColor={ink}
      watermark={watermark}
      kpis={kpis}
      kpiNote={kpiNote}
      meta={
        <>
          <span className="text-[var(--v2-text)]">{leagueName}</span>
          {/* 티어를 화면에 안 쓰는 리그는 `divisionCount === 1` 로 온다 — 그때는 안 그린다.
              옛 머리띠와 ★같은 규칙★ 이다 (`LeagueClanRecordHeader`) */}
          {divisionCount > 1 ? (
            <>
              <MetaDotV2 />
              <span>{divisionLabel(division)}</span>
            </>
          ) : null}
          <MetaDotV2 />
          <span>클랜랭킹</span>
          {rank === null ? (
            <span className="text-[var(--v2-text-ghost)]">순위 없음</span>
          ) : (
            <span className="flex items-baseline gap-[2px]" style={{ color: ink }}>
              <span className="num text-[22px] font-black leading-none tracking-[-.02em]">
                {rank}
              </span>
              <span className="text-[12px] font-bold">위</span>
            </span>
          )}
          {renewedNote ? (
            <>
              <MetaDotV2 />
              <span>{renewedNote}</span>
            </>
          ) : null}
        </>
      }
      action={
        <div className="flex shrink-0 items-center gap-2">
          {action ?? null}
          <Link
            href={infoHref}
            className="border border-[var(--v2-chip-border)] bg-[var(--v2-chip)] px-[18px] py-[9px] text-[12.5px]"
          >
            <span className="text-[var(--v2-text-muted)]">기본정보</span>
          </Link>
        </div>
      }
    />
  )
}

/**
 * 클랜 KPI 를 ★실제 값에서만★ 만든다.
 * ★없는 값은 칸을 만들지 않는다★ — 0 이나 `-` 로 채우면 「기록이 있다」고 거짓말한다.
 */
export function clanKpis(input: {
  rating: number
  win: number
  lose: number
  winRate: number
  rank: number | null
  rankCount: number | null
  /** 래더를 쓰는 리그인가 (`leagueScreen(...).clanColumns.rating`) */
  showsRating: boolean
}): RecordKpi[] {
  const played = input.win + input.lose > 0
  const kpis: RecordKpi[] = []

  if (input.showsRating) {
    kpis.push({ label: '래더', value: formatRating(input.rating) })
  }
  if (played) {
    kpis.push({
      label: '승률',
      value: formatRate(input.winRate),
      sub: `% · ${formatCount(input.win)}승 ${formatCount(input.lose)}패`,
      toneClass: rateClass(input.winRate),
    })
  }
  if (input.rank !== null) {
    kpis.push({
      label: '순위',
      value: `${formatCount(input.rank)}위`,
      sub: input.rankCount === null ? undefined : `/ ${formatCount(input.rankCount)}팀`,
      color: rankColor(input.rank) ?? undefined,
    })
  }
  return kpis
}
