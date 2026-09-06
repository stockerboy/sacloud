'use client'

/**
 * ★★v2 필터 칩★★ — TIER / WEAPON 같은 드롭다운.
 * (2026-09-06 · Part 10 ②단계 · 사장님 승인)
 *
 * ── 시안에서 관찰한 것
 *   ```
 *   ┌──────────────────────┐
 *   │ TIER   1티어      ▼ │   높이 38 · 종류(작고 흐림) + 값 + 화살표
 *   └──────────────────────┘
 *   열리면 아래로 목록. ★두 칩이 동시에 열리지 않는다★
 *   ```
 *
 * ── ★열림 상태를 여기서 갖지 않는다★
 *   시안 코드도 그렇게 했다 — 부모가 «지금 어느 칩이 열렸나» 를 하나로 들고 있어야
 *   ★두 개가 동시에 열리는 일이 구조적으로 없다.★
 *
 * ── 키보드
 *   `Esc` 로 닫고, 목록은 `role="listbox"` 다. 시안은 마우스만 생각했지만
 *   ★열고 못 닫는 화면은 만들지 않는다.★
 */
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'

export interface FilterChipProps<T extends string> {
  /** 왼쪽 작은 글자 (`TIER` · `WEAPON`). 없으면 안 그린다 */
  kind?: ReactNode
  value: T
  options: readonly T[]
  open: boolean
  onToggle: () => void
  onSelect: (value: T) => void
  /** 옵션을 사람 말로 바꿔 그린다 */
  labelOf?: (value: T) => ReactNode
  className?: string
  style?: CSSProperties
}

const wrap: CSSProperties = { position: 'relative' }
const chip: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  height: 38,
  padding: '0 14px',
  fontSize: 13.5,
  color: 'var(--v2-text-strong)',
  fontFamily: 'inherit',
  cursor: 'pointer',
  borderRadius: 0,
}
const kindStyle: CSSProperties = {
  fontSize: 10.5,
  color: 'var(--v2-text-faint)',
  letterSpacing: '.08em',
}
const caret: CSSProperties = { fontSize: 9, color: 'var(--v2-text-faint)' }
const menu: CSSProperties = {
  position: 'absolute',
  top: 40,
  right: 0,
  minWidth: 118,
  background: 'var(--v2-chip)',
  border: '1px solid var(--v2-menu-border)',
  boxShadow: '0 10px 28px rgba(0,0,0,.6)',
  zIndex: 20,
}
const option: CSSProperties = {
  padding: '9px 14px',
  fontSize: 13.5,
  cursor: 'pointer',
  color: '#a4a8b8',
  background: 'none',
  border: 0,
  width: '100%',
  textAlign: 'left',
  fontFamily: 'inherit',
}
const optionOn: CSSProperties = { color: 'var(--v2-text-strong)', background: '#22242e' }

export function FilterChip<T extends string>({
  kind,
  value,
  options,
  open,
  onToggle,
  onSelect,
  labelOf,
  className = '',
  style,
}: FilterChipProps<T>) {
  const box = useRef<HTMLDivElement>(null)

  /* ★열고 못 닫는 화면은 만들지 않는다★ — Esc 와 바깥 클릭으로 닫는다 */
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onToggle()
    }
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) onToggle()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open, onToggle])

  const show = (v: T): ReactNode => (labelOf ? labelOf(v) : v)

  return (
    <div ref={box} className={className} style={{ ...wrap, ...style }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-haspopup="listbox"
        style={{
          ...chip,
          background: open ? 'var(--v2-chip-on)' : 'var(--v2-chip)',
          border: `1px solid ${open ? 'var(--v2-chip-border-on)' : 'var(--v2-chip-border)'}`,
        }}
      >
        {kind ? <span style={kindStyle}>{kind}</span> : null}
        <span>{show(value)}</span>
        <span style={caret} aria-hidden="true">
          {open ? '▲' : '▼'}
        </span>
      </button>

      {open ? (
        <div style={menu} role="listbox" aria-label={typeof kind === 'string' ? kind : undefined}>
          {options.map((o) => (
            <button
              key={o}
              type="button"
              role="option"
              aria-selected={o === value}
              onClick={() => onSelect(o)}
              style={o === value ? { ...option, ...optionOn } : option}
            >
              {show(o)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
