import type { CSSProperties, ReactNode } from 'react'

/**
 * ★★v2 화면 머리★★ — 리본 + 작은 글자 + 큰 제목 + 설명 + 오른쪽 자리.
 * (2026-09-07 · Part 10 ⑤~ · 사장님 승인)
 *
 * ── 시안 실측 (개인랭킹 · 선수 상세 · 경기 상세가 ★같은 머리★ 를 쓴다)
 *   ```
 *   ▬▬▬▬  INDEPENDENT PREMIER LEAGUE          ┌────────┐┌────────┐
 *   개인랭킹  1시간마다 갱신 · 43개 클랜         │ TIER ▼ ││WEAPON ▼│
 *   ───────────────────────────────────────────────────────────────
 *   ↑리본 38×2   ↑11px .14em   ↑34px 700  ↑12.5px    ↑오른쪽 끝
 *   위 38 · 아래 26 · 밑줄 1px
 *   ```
 *
 * ── ★`SectionHead` 와 다른 것★
 *   `SectionHead`(②단계)는 ★카드 안 구역 머리★ 다 (16px 제목 · 리본 22).
 *   이쪽은 ★화면 전체의 머리★ 다 (34px 제목 · 리본 38 · 밑줄).
 *   둘을 한 컴포넌트로 합치지 않는다 — 크기가 아니라 역할이 다르다.
 *
 * ── ★없으면 안 그린다★
 *   `kicker` · `subtitle` · `right` 는 없으면 요소 자체를 안 만든다.
 *   빈 `<span>` 을 남기면 `gap` 때문에 자리가 뜬다.
 */
export interface PageHeadProps {
  /** 리본 옆 작은 글자 (리그 이름 등). 없으면 리본 줄 자체를 안 그린다 */
  kicker?: ReactNode
  title: ReactNode
  /** 제목 옆 설명 한 줄 */
  subtitle?: ReactNode
  /** 오른쪽 끝 (필터 칩 등) */
  right?: ReactNode
  /** 아래 1px 줄. 카드 안에 넣을 때는 `false` */
  divider?: boolean
  className?: string
  style?: CSSProperties
}

const wrap: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-end',
  gap: 20,
  padding: '38px 0 26px',
}
const left: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }
const ribbonRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: 9 }
const ribbon: CSSProperties = { width: 38, height: 2, flex: 'none', background: 'var(--v2-accent)' }
const kickerStyle: CSSProperties = {
  fontSize: 11,
  letterSpacing: '.14em',
  color: 'var(--v2-text-faint)',
  whiteSpace: 'nowrap',
}
const titleRow: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 16,
  flexWrap: 'wrap',
  minWidth: 0,
}
const titleStyle: CSSProperties = {
  fontSize: 34,
  fontWeight: 700,
  lineHeight: 1.1,
  color: 'var(--v2-text-strong)',
  letterSpacing: '-.01em',
}
const subtitleStyle: CSSProperties = { fontSize: 12.5, color: 'var(--v2-text-faint)' }

export function PageHead({
  kicker,
  title,
  subtitle,
  right,
  divider = true,
  className = '',
  style,
}: PageHeadProps) {
  return (
    <div
      className={className}
      style={{
        ...wrap,
        ...(divider ? { borderBottom: '1px solid var(--v2-head-divider)' } : {}),
        ...style,
      }}
    >
      <div style={left}>
        {kicker ? (
          <div style={ribbonRow}>
            <span style={ribbon} aria-hidden="true" />
            <span style={kickerStyle}>{kicker}</span>
          </div>
        ) : null}
        <div style={titleRow}>
          <h1 style={titleStyle}>{title}</h1>
          {subtitle ? <span style={subtitleStyle}>{subtitle}</span> : null}
        </div>
      </div>
      <span style={{ flex: 1 }} />
      {right ?? null}
    </div>
  )
}
