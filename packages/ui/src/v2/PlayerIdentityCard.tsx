import Link from 'next/link'
import type { ReactNode } from 'react'
import { ClanMark, type ClanMarkSource } from '../common/ClanMark'
import { formatAverage, formatCount, formatRate, formatRating } from '../common/format'
import { rateClass } from '../common/rate'
import { rankColor } from '../record/playerHeadCopy'
import { Panel } from './Panel'

/**
 * ★★v2 선수 카드★★ (2026-09-07 · Part 10 ⑥ · 시안)
 *
 * ```
 * ┌───────────────────────────────────────────── CLOUD 0 ←워터마크
 * │ [마크]  ★닉네임★  [스나]                        [기본정보]
 * │  78px   Valiant · SPL 개인랭킹 ★26위★ / 171명 · 포지션 스나수
 * ├──────────┬──────────┬──────────┬──────────────
 * │ 래더      │ 승률      │ 킬뎃      │ 판킬
 * │ 3,175점   │ 62.5% ·   │ 57.4% ·   │ 8.5킬
 * └──────────┴──────────┴──────────┴──────────────
 * ```
 * 닉네임과 순위는 ★등급 색★ (`rankColor` — 3 / 20 / 40 / 100).
 * 수치는 ★`rateClass`★. ★경계값을 여기서 다시 적지 않는다.★
 *
 * ── ★없는 것은 그리지 않는다★ (사장님 지시)
 *   ```
 *   순위가 없다 (배치고사 · 비공식 리그)   → 「N위 / M명」 조각을 안 만든다
 *   포지션 판정이 없다                    → 그 줄을 안 만든다
 *   래더가 없는 리그 (10mountain)          → ★래더 칸 자체를 안 만든다★
 *   킬뎃을 안 주는 리그 (IPL 100위 밖)     → ★킬뎃 칸 자체를 안 만든다★
 *   ```
 *   ★캐리머신 배지 · ★★★ · 심장/오른팔/왼팔은 데이터가 없다 — 안 그린다.★
 *
 * ── ★옛 머리띠를 지우지 않았다★
 *   `packages/ui/src/profile/LeagueRecordHeader.tsx` 의 `LeaguePlayerRecordHeader`
 *   가 그대로 있다. 되돌리려면 선수 layout 의 import 한 줄만 되돌린다.
 */

/** KPI 한 칸. `value` 가 `null` 이면 ★칸 자체를 안 만든다★ */
export interface PlayerKpi {
  label: string
  value: string
  /** 숫자 뒤 작은 글자 */
  sub?: string
  /** 숫자에 줄 색 클래스 (`rateClass()` 결과) */
  toneClass?: string
}

export interface PlayerIdentityCardProps {
  name: string
  /** 소속 클랜. 무소속이어도 `null` 을 그대로 넘긴다 — fallback 마크가 그려진다 (D-146) */
  clan: { name: string; mark: ClanMarkSource } | null
  leagueName: string
  /** 개인랭킹 순위. 없으면 순위 조각을 안 그린다 */
  rank: number | null
  /** 순위 모수. 없으면 `/ N명` 을 안 그린다 */
  rankCount: number | null
  /** 포지션 — 판정이 없으면 그 조각을 안 그린다 (D-199) */
  position?: string | null
  /** 주무기 한 단어 (`스나` · `라플`). 모르면 칩을 안 그린다 */
  mainWeapon?: string | null
  /** 카드 안 큰 흐린 글자 (지금 시즌). 없으면 안 그린다 */
  watermark?: string | null
  /** `기본정보` 가 가는 곳 */
  infoHref: string
  kpis: readonly PlayerKpi[]
  /**
   * KPI 줄에 같이 적을 한마디. 없으면 안 그린다.
   *
   * ★쓰는 자리★ — 이번 시즌 경기가 아직 없을 때. 그때 승률·킬뎃·판킬 칸은
   * ★만들지 않는다★(0 을 찍으면 거짓말이다). 대신 ★왜 비었는지★ 를 한 줄로 말한다.
   */
  kpiNote?: string | null
  /** 이름 오른쪽에 더 붙일 것 (지금은 없다 — 배지를 지어내지 않는다) */
  badges?: ReactNode
}

export function PlayerIdentityCard({
  name,
  clan,
  leagueName,
  rank,
  rankCount,
  position,
  mainWeapon,
  watermark,
  infoHref,
  kpis,
  kpiNote,
  badges,
}: PlayerIdentityCardProps) {
  const ink = rankColor(rank) ?? 'var(--v2-text-strong)'

  return (
    <Panel
      noEdge
      watermark={watermark ?? null}
      watermarkStyle={{ right: 210, top: '26%', bottom: 'auto', fontSize: 56 }}
      className="mt-[30px]"
    >
      <div className="relative flex items-center gap-5 p-[24px_24px_22px] max-md:flex-wrap">
        <span className="flex h-[78px] w-[78px] shrink-0 items-center justify-center border border-[var(--v2-emblem-border)]">
          <ClanMark clan={clan} size="max" alt={clan?.name ?? ''} />
        </span>

        <div className="flex min-w-0 flex-col gap-[9px]">
          <div className="flex flex-wrap items-center gap-[11px]">
            <span
              className="truncate text-[30px] font-bold tracking-[-.01em]"
              style={{ color: ink }}
              title={name}
            >
              {name}
            </span>
            {/* 주무기를 모르면 ★칩 자체를 안 만든다★ */}
            {mainWeapon ? (
              <span className="border border-[var(--v2-chip-border)] bg-[var(--v2-chip)] px-[9px] py-[4px] text-[11px] text-[var(--v2-text-muted)]">
                {mainWeapon}
              </span>
            ) : null}
            {badges ?? null}
          </div>

          <div className="flex flex-wrap items-center gap-[9px] text-[12.5px] text-[var(--v2-text-faint)]">
            {/* 계약이 `null` 을 「무소속」으로 정해 뒀다 — `-` 로 감추지 않는다 */}
            <span className="text-[var(--v2-text)]">{clan ? clan.name : '무소속'}</span>
            <Dot />
            <span>{leagueName} 개인랭킹</span>
            {rank === null ? (
              /* ★순위가 없으면 숫자를 지어내지 않는다★ — 0위를 만들지 않는다 */
              <span className="text-[var(--v2-text-ghost)]">순위 없음</span>
            ) : (
              <>
                <span className="flex items-baseline gap-[2px]" style={{ color: ink }}>
                  <span className="num text-[22px] font-black leading-none tracking-[-.02em]">
                    {rank}
                  </span>
                  <span className="text-[12px] font-bold">위</span>
                </span>
                {rankCount === null ? null : (
                  <span className="text-[var(--v2-text-ghost2)]">
                    / {formatCount(rankCount)}명
                  </span>
                )}
              </>
            )}
            {position ? (
              <>
                <Dot />
                <span>
                  포지션 <span className="text-[var(--v2-text)]">{position}</span>
                </span>
              </>
            ) : null}
          </div>
        </div>

        <span className="flex-1" />

        <Link
          href={infoHref}
          className="shrink-0 border border-[var(--v2-chip-border)] bg-[var(--v2-chip)] px-[18px] py-[9px] text-[12.5px]"
        >
          <span className="text-[var(--v2-text-muted)]">기본정보</span>
        </Link>
      </div>

      {/* ★칸도 없고 할 말도 없으면 줄 자체를 안 만든다★ */}
      {kpis.length === 0 && !kpiNote ? null : (
        <div
          className="relative grid border-t border-[var(--v2-card-divider)] max-md:grid-cols-2"
          style={{
            gridTemplateColumns: `repeat(${kpis.length + (kpiNote ? 1 : 0)}, minmax(0,1fr))`,
          }}
        >
          {kpis.map((kpi) => (
            <div
              key={kpi.label}
              className="flex flex-col gap-[6px] border-r border-[var(--v2-row-divider)] px-[24px] py-[15px] last:border-r-0"
            >
              <span className="text-[10.5px] tracking-[.06em] text-[var(--v2-text-ghost)]">
                {kpi.label}
              </span>
              <span className="flex items-baseline gap-[7px]">
                <span className={`num text-[26px] font-extralight leading-none ${kpi.toneClass ?? ''}`}>
                  {kpi.value}
                </span>
                {kpi.sub ? (
                  <span className="text-[11px] text-[var(--v2-text-ghost)]">{kpi.sub}</span>
                ) : null}
              </span>
            </div>
          ))}
          {/* 왜 칸이 비었는지 한 줄. ★0 을 찍는 대신 말로 한다★ */}
          {kpiNote ? (
            <div className="flex items-center px-[24px] py-[15px] text-[12.5px] text-[var(--v2-text-ghost)]">
              {kpiNote}
            </div>
          ) : null}
        </div>
      )}
    </Panel>
  )
}

function Dot() {
  return (
    <span className="text-[var(--v2-text-ghost2)]" aria-hidden>
      ·
    </span>
  )
}

/**
 * 화면이 넘길 KPI 를 ★실제 값에서만★ 만든다.
 *
 * ★없는 값은 칸을 만들지 않는다★ — 0 이나 `-` 로 채우면 「기록이 있다」고 거짓말한다.
 * 무엇이 없을 수 있는지는 리그가 정한다 (`leagueScreen`) — 여기서 slug 를 보지 않는다.
 */
export function playerKpis(input: {
  rating: number
  win: number
  lose: number
  winRate: number
  kdRate: number | null
  killPerMatch: number
  /** 래더를 쓰는 리그인가 (`leagueScreen(...).playerColumns.rating`) */
  showsRating: boolean
}): PlayerKpi[] {
  const played = input.win + input.lose > 0
  const kpis: PlayerKpi[] = []

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
  /* 누적 킬뎃을 안 주는 리그가 있다 (D-107) — `null` 이면 칸을 안 만든다 */
  if (input.kdRate !== null) {
    kpis.push({
      label: '킬뎃',
      value: formatRate(input.kdRate),
      sub: '%',
      toneClass: rateClass(input.kdRate),
    })
  }
  if (played) {
    kpis.push({ label: '판킬', value: formatAverage(input.killPerMatch), sub: '킬' })
  }
  return kpis
}
