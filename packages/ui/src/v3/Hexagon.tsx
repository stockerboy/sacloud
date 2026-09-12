'use client'

/**
 * ★v3 육각형★ — 선수 STRENGTH POINT 와 클랜 성향이 같이 쓴다 (2026-09-10 시안 · 2026-09-11 손질)
 *
 * viewBox 300×262 를 표시 300px 와 1:1 로 둔다. 축소하면 안의 글자가 8px 아래로 내려간다
 * (시안 함정). 폭이 모자라면 부모가 `flex-wrap` 으로 아래에 쌓는다.
 *
 * `value` 는 면적만 정한다 (0~100). 화면에 보이는 글자는 `note`(등수·설명) 다.
 * 값이 없는 축(`null`)은 중심(0)에 둔다 — 지어내지 않는다.
 *
 * 2026-09-11 사장님: 채움은 보라 → 파랑 → 분홍 «영롱한» 그라데이션 + 글로우.
 * 눈금은 10 단위 열 줄 (값이 0~100 백분위) — 위쪽 축 옆에 숫자.
 */
import { HEX, HEX_LABELS, HEX_SPOKES, V3, hexPoint } from './tokens'
import { useEffect, useRef, useState } from 'react'
import { penDash, useDrawIn } from './seasonPlot'

export interface HexAxisView {
  label: string
  /** 0~100 · null = 못 잼 */
  value: number | null
  note: string
  noteColor: string
  /**
   * ★모집단 한 줄★ — «통합 512명중» · «스나수 240명중» (2026-09-12 사장님).
   * 없으면 안 그린다. 등수만 있던 옛 판과 같아진다.
   */
  note2?: string | null
  /** 10위 안 같은 «자랑할 것» — 나타날 때 더 세게 (2026-09-11 사장님) */
  strong?: boolean
}

const RING_STEP = 10
const RINGS = Array.from({ length: 100 / RING_STEP }, (_, i) => (i + 1) * RING_STEP)

/**
 * ★겹쳐 그릴 두 번째 선★ (2026-09-12 사장님: «비교분석하기 버튼 만들고 (…) 검색 후
 * 클릭 누르면 그 선수 그래프 불러와서 여기에 겹쳐줘 색깔 다르게 해서 한눈에 보고 비교»).
 *
 * 값만 받는다 — 축 이름·등수 글자는 ★주인 것 하나만★ 그린다. 두 벌을 다 적으면
 * 글자가 서로 겹쳐 아무것도 안 읽힌다. 대신 그림 아래 범례에 이름을 적는다.
 *
 * 못 잰 축은 `null` 이고 중심(0)에 둔다 — 지어내지 않는다.
 */
export interface HexOverlay {
  values: readonly (number | null)[]
  label: string
}

/** 겹쳐 그리는 선 색 — 주인은 보라 그라데이션, 상대는 ★청록 한 색★ 이라 헷갈리지 않는다 */
const OVERLAY_INK = '#8ff0ff'

export function Hexagon({
  axes,
  id = 'hex',
  overlay = null,
}: {
  axes: readonly HexAxisView[]
  id?: string
  overlay?: HexOverlay | null
}) {
  /* ★가운데에서 바깥으로 자라난다★ (2026-09-11 사장님: «비슷한 느낌으로 육각그래프도 그려지게») */
  const svgRef = useRef<SVGSVGElement>(null)
  const grow = useDrawIn(1800, id, svgRef)
  const labelIn = grow > 0.92 ? 1 : 0
  /* 다 그려지면 한 번 번쩍 (2026-09-11 사장님). 다시 그릴 때마다 새로 번쩍이게 열쇠를 바꾼다 */
  const done = grow >= 1
  const [flash, setFlash] = useState(0)
  useEffect(() => { if (done) setFlash((f) => f + 1) }, [done])
  const six = axes.slice(0, 6)
  const vertices = six.map((a, i) => hexPoint(i, Math.max(0, Math.min(100, a.value ?? 0)) / 100))
  const area = vertices.map((v) => v.join(',')).join(' ')
  /* ★겹쳐 그리는 선★ (2026-09-12 사장님) — 여섯 자리에 맞춰 자르고 모자라면 중심에 둔다 */
  const overlayArea =
    overlay === null
      ? null
      : Array.from({ length: 6 }, (_, i) =>
          hexPoint(i, Math.max(0, Math.min(100, overlay.values[i] ?? 0)) / 100).join(','),
        ).join(' ')
  return (
    <svg ref={svgRef} viewBox={`0 0 ${HEX.w} ${HEX.h}`} style={{ width: HEX.w, height: HEX.h, flex: `0 0 ${HEX.w}px`, display: 'block' }}>
      <defs>
        {/* 보라 → 파랑 → 분홍 (사장님 참고 «Dual Tone») */}
        <linearGradient id={`${id}Fill`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#5b8dff" stopOpacity="0.55" />
          <stop offset="50%" stopColor="#8b5cf6" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#ff5fb0" stopOpacity="0.55" />
        </linearGradient>
        <linearGradient id={`${id}Line`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#7fa9ff" />
          <stop offset="50%" stopColor="#b48cff" />
          <stop offset="100%" stopColor="#ff7ac8" />
        </linearGradient>
        <filter id={`${id}Glow`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="b1" />
          <feGaussianBlur stdDeviation="10" result="b2" />
          <feMerge>
            <feMergeNode in="b2" />
            <feMergeNode in="b1" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {RINGS.map((v) => (
        <polygon
          key={v}
          points={Array.from({ length: 6 }, (_, i) => hexPoint(i, v / 100).join(',')).join(' ')}
          fill="none"
          stroke={v % 50 === 0 ? '#4a5c88' : '#2c3a5c'}
          strokeWidth={v % 50 === 0 ? 1.2 : 0.9}
        />
      ))}
      {HEX_SPOKES.map(([x, y], i) => (
        <line key={i} x1={HEX.cx} y1={HEX.cy} x2={x} y2={y} stroke="#2c3a5c" strokeWidth={0.9} />
      ))}
      {/* 채움은 테두리가 한 바퀴 돈 뒤에 스며든다 */}
      <polygon points={area} fill={`url(#${id}Fill)`} stroke="none" opacity={Math.max(0, (grow - 0.45) / 0.55)} />
      <polygon
        points={area}
        fill="none"
        stroke={`url(#${id}Line)`}
        strokeWidth={2}
        strokeOpacity={0.95}
        strokeLinejoin="round"
        filter={grow < 1 ? undefined : `url(#${id}Glow)`}
        {...penDash(grow)}
      />
      {/* 2026-09-11 사장님: 꼭짓점 점은 없앤다 */}
      {/* 눈금 숫자 — 채움·글로우 위에 그려야 보인다 (QA 교차검토 9-18) — 위쪽 축을 따라 10 단위 (짝수 눈금만 글자, 홀수는 선만 — 겹침 방지) */}
      {RINGS.filter((v) => v % 20 === 0).map((v) => {
        const [x, y] = hexPoint(0, v / 100)
        return (
          <text key={v} x={x + 5} y={y + 3} fontSize="7.5" fontWeight="700" fill="#c7d0e6" textAnchor="start">
            {v}
          </text>
        )
      })}
      {/* ★상대 선은 주인 위에★ — 아래에 두면 채움에 묻힌다 (2026-09-12 사장님) */}
      {overlayArea !== null ? (
        <>
          <polygon points={overlayArea} fill={OVERLAY_INK} fillOpacity={0.1} stroke="none" opacity={labelIn} />
          <polygon
            points={overlayArea}
            fill="none"
            stroke={OVERLAY_INK}
            strokeWidth={2}
            strokeOpacity={0.95}
            strokeLinejoin="round"
            {...penDash(grow)}
          />
        </>
      ) : null}
      {done ? <polygon key={flash} className="v3-hex-flash" points={area} fill={`url(#${id}Line)`} pointerEvents="none" /> : null}
      {/* 축 이름·등수는 ★다 그려진 뒤에 스며든다★ (2026-09-11 사장님) */}
      <g opacity={labelIn} style={{ transition: 'opacity .45s ease' }}>
      {six.map((a, i) => {
        const [x, y, anchor] = HEX_LABELS[i] as (typeof HEX_LABELS)[number]
        return (
          <g key={`${a.label}-${i}`}>
            <text x={x} y={y} textAnchor={anchor} fontSize={a.strong ? 13 : 12} fontWeight="700" fill={a.strong ? '#e8eeff' : V3.textMuted}>
              {a.label}
            </text>
            <text x={x} y={y + 14} textAnchor={anchor} fontSize={a.strong ? 14 : 11.5} fontWeight={a.strong ? 900 : 700} fill={a.noteColor} className={a.strong ? 'v3-hex-note-strong' : undefined}>
              {a.note}
            </text>
            {/*
              ★모집단 줄★ (2026-09-12 사장님: «스나수 n명중 n위»).
              12시 축만 ★이름 위★ 에 붙인다 — 아래에 두면 눈금 숫자(100·80…)와 겹친다.
              눈금은 위쪽 살을 따라 그려지고 맨 위 «100» 이 (155, 49) 라 y+24 자리가 겹친다.
            */}
            {a.note2 ? (
              <text x={x} y={i === 0 ? y - 11 : y + 24} textAnchor={anchor} fontSize="8.5" fontWeight="700" fill={V3.textGhost2}>
                {a.note2}
              </text>
            ) : null}
          </g>
        )
      })}
      </g>
    </svg>
  )
}
