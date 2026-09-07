import type { ReactNode } from 'react'
import { ClanMark, type ClanMarkSource } from '../common/ClanMark'
import { Panel } from './Panel'

/**
 * ★★v2 기록실 머리 카드 — 뼈대★★ (2026-09-07 · Part 10 ⑥·⑦)
 *
 * ```
 * ┌───────────────────────────────────────────── CLOUD 0 ←워터마크
 * │ [마크]  ★이름★  [칩]                        [단추들]
 * │  78px   메타 한 줄
 * ├──────────┬──────────┬──────────┬──────────────
 * │ 래더      │ 승률      │ …        │
 * └──────────┴──────────┴──────────┴──────────────
 * ```
 *
 * ── ★왜 공통인가★
 *   선수 상세와 클랜 상세가 ★같은 모양★ 을 쓴다 (시안도 그렇다).
 *   두 곳에 같은 마크업을 두면 한쪽만 고쳐져 갈라진다.
 *   ⚠ ★뼈대만 공통이다.★ 무엇을 쓸지(메타 문구 · KPI 목록)는 부르는 쪽이 정한다 —
 *     그래야 「선수는 포지션, 클랜은 부리그」 같은 차이가 여기로 새지 않는다.
 *
 * ── ★없으면 안 그린다★
 *   워터마크 · 칩 · 단추 · KPI 줄 전부 없으면 요소 자체를 안 만든다.
 */

/** KPI 한 칸 */
export interface RecordKpi {
  label: string
  value: string
  /** 숫자 뒤 작은 글자 */
  sub?: string
  /** 숫자에 줄 색 클래스 (`rateClass()` 결과 등) */
  toneClass?: string
  /** 숫자에 직접 줄 색 */
  color?: string
}

export interface RecordIdentityCardProps {
  /** 마크로 쓸 클랜. `null` 이면 fallback 마크가 그려진다 (D-146) */
  mark: { name: string; mark: ClanMarkSource } | null
  markAlt?: string
  name: string
  /** 이름 색 (등급 색). 안 주면 기본 흰색 */
  nameColor?: string
  /** 이름 오른쪽 칩·배지. ★데이터가 없으면 넘기지 않는다★ */
  badges?: ReactNode
  /** 이름 아래 한 줄 */
  meta?: ReactNode
  /** 오른쪽 끝 단추들 */
  action?: ReactNode
  /** 카드 안 큰 흐린 글자 (지금 시즌) */
  watermark?: string | null
  kpis?: readonly RecordKpi[]
  /** KPI 줄에 같이 적을 한마디 — ★0 을 찍는 대신 왜 비었는지 말한다★ */
  kpiNote?: string | null
  className?: string
}

export function RecordIdentityCard({
  mark,
  markAlt,
  name,
  nameColor,
  badges,
  meta,
  action,
  watermark,
  kpis = [],
  kpiNote,
  className = 'mt-[30px]',
}: RecordIdentityCardProps) {
  const columns = kpis.length + (kpiNote ? 1 : 0)

  return (
    <Panel
      noEdge
      watermark={watermark ?? null}
      watermarkStyle={{ right: 210, top: '26%', bottom: 'auto', fontSize: 56 }}
      className={className}
    >
      <div className="relative flex items-center gap-5 p-[24px_24px_22px] max-md:flex-wrap">
        <span className="flex h-[78px] w-[78px] shrink-0 items-center justify-center border border-[var(--v2-emblem-border)]">
          <ClanMark clan={mark} size="max" alt={markAlt ?? mark?.name ?? ''} />
        </span>

        <div className="flex min-w-0 flex-col gap-[9px]">
          <div className="flex flex-wrap items-center gap-[11px]">
            <span
              className="truncate text-[30px] font-bold tracking-[-.01em]"
              style={nameColor ? { color: nameColor } : { color: 'var(--v2-text-strong)' }}
              title={name}
            >
              {name}
            </span>
            {badges ?? null}
          </div>
          {meta ? (
            <div className="flex flex-wrap items-center gap-[9px] text-[12.5px] text-[var(--v2-text-faint)]">
              {meta}
            </div>
          ) : null}
        </div>

        <span className="flex-1" />
        {action ?? null}
      </div>

      {/* ★칸도 없고 할 말도 없으면 줄 자체를 안 만든다★ */}
      {columns === 0 ? null : (
        <div
          className="relative grid border-t border-[var(--v2-card-divider)] max-md:grid-cols-2"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0,1fr))` }}
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
                <span
                  className={`num text-[26px] font-extralight leading-none ${kpi.toneClass ?? ''}`}
                  style={kpi.color ? { color: kpi.color } : undefined}
                >
                  {kpi.value}
                </span>
                {kpi.sub ? (
                  <span className="text-[11px] text-[var(--v2-text-ghost)]">{kpi.sub}</span>
                ) : null}
              </span>
            </div>
          ))}
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

/** 메타 줄의 가운뎃점 — 세 화면이 같은 색을 쓴다 */
export function MetaDotV2() {
  return (
    <span className="text-[var(--v2-text-ghost2)]" aria-hidden>
      ·
    </span>
  )
}
