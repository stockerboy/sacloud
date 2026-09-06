/**
 * ★★v2 구역 머리★★ — 리본 + 제목 + 설명 + 가는 줄.
 * (2026-09-06 · Part 10 ②단계 · 사장님 승인)
 *
 * ── 시안에서 관찰한 것
 *   ```
 *   ▬ 지난시즌 기록   종료된 시즌의 최종 성적입니다  ────────────────
 *   ↑22×2px 리본     ↑16px 700           ↑12px 흐림   ↑1px 가는 줄이 끝까지
 *   ```
 *   카드 안 머리(차트·시즌별 기록)에서는 ★줄 없이★ 리본 + 제목만 쓴다 — `hairline={false}`.
 *
 * ── ★설명은 없으면 안 그린다★
 *   빈 `<span>` 을 남기면 `gap` 때문에 ★제목과 줄 사이가 벌어진다.★
 */
import type { CSSProperties, ReactNode } from 'react'

export interface SectionHeadProps {
  title: ReactNode
  /** 제목 옆 작은 설명. 없으면 ★요소를 안 만든다★ */
  note?: ReactNode
  /** 오른쪽 끝까지 가는 1px 줄. 카드 안에서는 보통 `false` */
  hairline?: boolean
  /** 리본 색. 안 주면 리그 강조색 */
  ribbon?: string
  /** 제목 오른쪽 끝에 붙는 것 (필터 칩 · 시즌 선택기 등) */
  right?: ReactNode
  className?: string
  style?: CSSProperties
}

const wrap: CSSProperties = { display: 'flex', alignItems: 'center', gap: 12 }
const ribbonStyle: CSSProperties = { width: 22, height: 2, flex: 'none' }
const titleStyle: CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  color: 'var(--v2-text-strong)',
  whiteSpace: 'nowrap',
}
const noteStyle: CSSProperties = {
  fontSize: 12,
  color: 'var(--v2-text-ghost)',
  whiteSpace: 'nowrap',
}
const lineStyle: CSSProperties = { flex: 1, height: 1, background: 'var(--v2-head-divider)' }

export function SectionHead({
  title,
  note,
  hairline = true,
  ribbon,
  right,
  className = '',
  style,
}: SectionHeadProps) {
  return (
    <div className={className} style={{ ...wrap, ...style }}>
      <span
        style={{ ...ribbonStyle, background: ribbon ?? 'var(--v2-accent)' }}
        aria-hidden="true"
      />
      <span style={titleStyle}>{title}</span>
      {note ? <span style={noteStyle}>{note}</span> : null}
      {hairline ? <span style={lineStyle} aria-hidden="true" /> : null}
      {right ? (
        <>
          {hairline ? null : <span style={{ flex: 1 }} />}
          {right}
        </>
      ) : null}
    </div>
  )
}
