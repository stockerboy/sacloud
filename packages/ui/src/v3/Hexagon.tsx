/**
 * ★v3 육각형★ — 선수 STRENGTH POINT 와 클랜 성향이 같이 쓴다 (2026-09-10 시안)
 *
 * viewBox 300×262 를 표시 300px 와 1:1 로 둔다. 축소하면 안의 글자가 8px 아래로 내려간다
 * (시안 함정). 폭이 모자라면 부모가 `flex-wrap` 으로 아래에 쌓는다.
 *
 * `value` 는 면적만 정한다 (0~100). 화면에 보이는 글자는 `note`(등수·설명) 다.
 * 값이 없는 축(`null`)은 중심(0)에 둔다 — 지어내지 않는다.
 */
import { HEX, HEX_LABELS, HEX_RINGS, HEX_SPOKES, V3, hexPoint } from './tokens'

export interface HexAxisView {
  label: string
  /** 0~100 · null = 못 잼 */
  value: number | null
  note: string
  noteColor: string
}

export function Hexagon({ axes, id = 'hex' }: { axes: readonly HexAxisView[]; id?: string }) {
  const six = axes.slice(0, 6)
  const area = six.map((a, i) => hexPoint(i, Math.max(0, Math.min(100, a.value ?? 0)) / 100).join(',')).join(' ')
  return (
    <svg viewBox={`0 0 ${HEX.w} ${HEX.h}`} style={{ width: HEX.w, height: HEX.h, flex: `0 0 ${HEX.w}px`, display: 'block' }}>
      <defs>
        <radialGradient id={`${id}Fill`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ff6a6a" stopOpacity=".22" />
          <stop offset="100%" stopColor="#e01b24" stopOpacity=".04" />
        </radialGradient>
        <filter id={`${id}Glow`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="5" result="b1" />
          <feGaussianBlur stdDeviation="13" result="b2" />
          <feMerge>
            <feMergeNode in="b2" />
            <feMergeNode in="b1" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {HEX_RINGS.map((p, i) => (
        <polygon key={i} points={p} fill="none" stroke="#41527a" strokeWidth={1.1} />
      ))}
      {HEX_SPOKES.map(([x, y], i) => (
        <line key={i} x1={HEX.cx} y1={HEX.cy} x2={x} y2={y} stroke="#41527a" strokeWidth={1.1} />
      ))}
      <polygon
        points={area}
        fill={`url(#${id}Fill)`}
        stroke="#ff5c5c"
        strokeWidth={1.8}
        strokeOpacity={0.85}
        strokeLinejoin="round"
        filter={`url(#${id}Glow)`}
      />
      {six.map((a, i) => {
        const [x, y, anchor] = HEX_LABELS[i] as (typeof HEX_LABELS)[number]
        return (
          <g key={`${a.label}-${i}`}>
            <text x={x} y={y} textAnchor={anchor} fontSize="12" fontWeight="700" fill={V3.textMuted}>
              {a.label}
            </text>
            <text x={x} y={y + 14} textAnchor={anchor} fontSize="11.5" fontWeight="700" fill={a.noteColor}>
              {a.note}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
