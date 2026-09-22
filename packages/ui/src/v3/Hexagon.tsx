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

/**
 * 겹쳐 그리는 선 색 — 주인은 보라 그라데이션, 상대는 ★청록 한 색★ 이라 헷갈리지 않는다.
 * ⚠ 2026-09-22 흰 카드용으로 진하게. 옛 값(다크 카드용 옅은 하늘빛) '#8ff0ff' — 지우지 않는다 (1-4)
 */
const OVERLAY_INK = '#0891b2'

export function Hexagon({
  axes,
  id = 'hex',
  overlay = null,
  size,
}: {
  axes: readonly HexAxisView[]
  id?: string
  overlay?: HexOverlay | null
  /**
   * ★가로 폭★ (2026-09-21 사장님: 「★왼쪽에 더 크게 육각그래프★」).
   *
   *   없으면 지금까지와 같은 300px 다. 주면 그 폭에 맞춰 ★통째로★ 늘어난다 —
   *   `viewBox` 가 함께 늘어나므로 ★글자도 같은 비율로 커진다.★
   *   ⚠ ★줄이지는 마라★ — 파일 머리에 적힌 대로 8px 글자가 안 읽히게 된다.
   */
  size?: number
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
    <svg
      ref={svgRef}
      viewBox={`0 0 ${HEX.w} ${HEX.h}`}
      style={{
        width: size ?? HEX.w,
        height: (size ?? HEX.w) * (HEX.h / HEX.w),
        flex: `0 0 ${size ?? HEX.w}px`,
        display: 'block',
      }}
    >
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
      {/* ⚠ 2026-09-22 흰 카드용 옅은 회색 눈금. 옛 값(다크): major #4a5c88 · minor/spoke #2c3a5c — 1-4 */}
      {RINGS.map((v) => (
        <polygon
          key={v}
          points={Array.from({ length: 6 }, (_, i) => hexPoint(i, v / 100).join(',')).join(' ')}
          fill="none"
          stroke={v % 50 === 0 ? '#c4cbdd' : '#e3e6ee'}
          strokeWidth={v % 50 === 0 ? 1.2 : 0.9}
        />
      ))}
      {HEX_SPOKES.map(([x, y], i) => (
        <line key={i} x1={HEX.cx} y1={HEX.cy} x2={x} y2={y} stroke="#e3e6ee" strokeWidth={0.9} />
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
          <text key={v} x={x + 5} y={y + 3} fontSize="7.5" fontWeight="700" fill={V3.textFaint} textAnchor="start">{/* ⚠ 2026-09-22 흰 카드용. 옛 값(다크) #c7d0e6 — 1-4 */}
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
        /*
         * ★긴 이름은 괄호 앞에서 두 줄로★ (2026-09-16 새벽).
         *
         * 사장님이 «교환율» 을 «백어택성공률(2턴)» 로 바꾸셨다 — 10글자다.
         * ★좌우 축★ 은 쓸 수 있는 폭이 ★68px★ 뿐이라(x=68/232, 바깥이 0/300)
         * 12px 글자 열 개가 안 들어간다. SVG `text` 는 줄바꿈도 말줄임도 없어서
         * ★그냥 밖으로 나가 잘렸다★ — 화면에 «액성공률(2턴)» 로 찍혔다.
         *
         * 12시(i=0)·6시(i=3) 는 가운데 맞춤이라 280px 이 남는다 — 안 건드린다.
         * 괄호가 없으면 아무 일도 안 일어난다.
         */
        const side = i !== 0 && i !== 3
        const cut = side ? a.label.indexOf('(') : -1
        const two = cut > 0 ? [a.label.slice(0, cut), a.label.slice(cut)] : null
        /* 두 줄이면 아래 줄들을 그만큼 내린다 */
        const drop = two ? 12 : 0
        return (
          <g key={`${a.label}-${i}`}>
            {/* ⚠ 2026-09-22 흰 카드용. strong 옛 값(다크) #e8eeff — 1-4 */}
            <text x={x} y={y} textAnchor={anchor} fontSize={a.strong ? 13 : 12} fontWeight="700" fill={a.strong ? V3.textStrong : V3.textMuted}>
              {two ? (
                <>
                  {/* 첫 줄은 한 글자만큼 줄여 68px 안에 들인다 */}
                  <tspan x={x} fontSize={a.strong ? 12 : 11}>{two[0]}</tspan>
                  <tspan x={x} dy={12} fontSize={a.strong ? 11 : 10}>{two[1]}</tspan>
                </>
              ) : (
                a.label
              )}
            </text>
            <text x={x} y={y + 14 + drop} textAnchor={anchor} fontSize={a.strong ? 14 : 11.5} fontWeight={a.strong ? 900 : 700} fill={a.noteColor} className={a.strong ? 'v3-hex-note-strong' : undefined}>
              {a.note}
              {/*
                ★12시 축만 모집단을 «등수 옆»★ 에 붙인다 (2026-09-15 · 무한 QA).

                ⚠ 옛 자리는 `y - 11`(=15) 이라 ★이름 위★ 였다. 그 자리가 그림 맨 위
                  14px 안이라 ★카드 테두리에 반쯤 잘려★ 안 읽혔다 (폰 390px 실측 —
                  스나싸움만 «42개중» 이 선에 먹혔다).
                  아래(`y + 24`)로 못 내리는 까닭은 눈금 «100» 이 (155, 49) 라 겹치기 때문이다.
                  그래서 ★같은 줄 오른쪽★ 으로 보낸다 — 가운데 맞춤이라 둘이 한 덩어리로 선다.
                  눈금은 9px 아래 줄이고 글자가 더 작아 닿지 않는다.
              */}
              {i === 0 && a.note2 ? (
                /*
                 * ★12시만 한 단계 진하게★ — 클랜 카드 맨 위에는 ★구름 배경 띠★ 가 깔려 있어
                 *   `textGhost2` 로는 묻힌다. 나머지 다섯은 어두운 바탕 위라 그대로 둔다.
                 */
                <tspan dx="4" fontSize="8.5" fontWeight="700" fill={V3.textMuted}>
                  {a.note2}
                </tspan>
              ) : null}
            </text>
            {/* ★모집단 줄★ (2026-09-12 사장님: «스나수 n명중 n위») — 12시 축은 위에서 이미 그렸다 */}
            {a.note2 && i !== 0 ? (
              <text x={x} y={y + 24 + drop} textAnchor={anchor} fontSize="8.5" fontWeight="700" fill={V3.textGhost2}>
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
