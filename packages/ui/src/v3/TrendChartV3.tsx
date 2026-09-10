'use client'

/**
 * ★승률 및 킬뎃 추이★ — sleeper 방식 (2026-09-10 · 사장님 지시서 + 참고 캡처)
 *
 *   - X: 9/3 06:00 (출발점 · 0%) → 10/1 06:00. 하루 한 칸(28칸). 글자는 9/3 · 9/7 · 9/11 … 10/1
 *   - Y: 0~100 고정
 *   - 출발점은 무조건 0%. 경기 없는 날은 전날 값이 이어진다. 하루 안에서는 경기마다 값이 움직인다
 *     (서버가 준 `points` — 경기 직후의 실제 값. 지어낸 흔들림이 아니다)
 *   - 미래(지금 이후)는 안 그린다. 선 끝 = 지금
 *   - 선 두 개 (승률 파랑 · 킬뎃 빨강) — 헤일로 → 중간 → 코어 세 겹 네온
 *   - 끝 마커: 승률 = 클랜마크 원 · 킬뎃 = K/D 원 + 값
 *   - 탐색: 마우스 이동/드래그 · 손가락 드래그 → 세로선 + 그 날짜의 값
 *   - 폰에서는 카드 폭에 맞춰 그린다 (2026-09-11 사장님: «너무 작아»)
 */
import { useEffect, useRef, useState } from 'react'
import type { PlayerTrendDay } from '@sacloud/contract'
import { fitMarkUrl, hasFitMark } from './primitives'
import { V3 } from './tokens'

const X0 = 44
const LABEL_W = 132
const Y_TOP = 26
const Y_BOTTOM = 236
const H = 300
const yOf = (v: number) => Y_BOTTOM - (Math.max(0, Math.min(100, v)) / 100) * (Y_BOTTOM - Y_TOP)

export type TrendMode = 'day' | 'cum'

interface Pt {
  t: number /* 0 = 9/3 06:00 · 28 = 10/1 06:00 */
  wr: number
  kd: number
}

/** 그릴 점들 — 출발점(0,0) + 날마다 경기 직후 값 + 하루 끝 값(전날 값 잇기) · 지금까지만 */
function buildSeries(days: readonly PlayerTrendDay[], mode: TrendMode): { pts: Pt[]; nowT: number } {
  const pts: Pt[] = [{ t: 0, wr: 0, kd: 0 }]
  let nowT = 0
  days.forEach((d, i) => {
    if (d.future) return
    for (const p of d.points) {
      pts.push({ t: i + p.at, wr: mode === 'day' ? p.win_rate : p.cum_win_rate, kd: mode === 'day' ? p.kd : p.cum_kd })
    }
    const close = { t: i + 1, wr: mode === 'day' ? d.win_rate : d.cum_win_rate, kd: mode === 'day' ? d.kd : d.cum_kd }
    if (d.today) {
      /* 오늘은 지금 위치까지만 — 마지막 경기 뒤로는 그 값이 이어진다 */
      const last = pts[pts.length - 1] as Pt
      const nowFrac = Math.max(last.t - i, Math.min(1, (Date.now() - dayStartMs(i)) / 86_400_000))
      nowT = i + nowFrac
      if (nowT > last.t) pts.push({ t: nowT, wr: last.wr, kd: last.kd })
    } else {
      pts.push(close)
      nowT = i + 1
    }
  })
  return { pts, nowT }
}
const TREND_FROM_MS = Date.parse('2026-09-02T21:00:00.000Z')
const dayStartMs = (i: number) => TREND_FROM_MS + i * 86_400_000

export function TrendChartV3({ days, mode, markSlug, winLabel, kdLabel }: { days: readonly PlayerTrendDay[]; mode: TrendMode; markSlug: string | null; winLabel: string; kdLabel: string }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [width, setWidth] = useState(640)
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const update = () => setWidth(Math.max(340, Math.round(el.getBoundingClientRect().width)))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const X1 = width - LABEL_W
  const span = Math.max(1, days.length - 1) /* 28 */
  const xOf = (t: number) => X0 + ((X1 - X0) * t) / span
  const { pts, nowT } = buildSeries(days, mode)
  const wrLine = pts.map((p) => `${xOf(p.t).toFixed(1)},${yOf(p.wr).toFixed(1)}`).join(' ')
  const kdLine = pts.map((p) => `${xOf(p.t).toFixed(1)},${yOf(p.kd).toFixed(1)}`).join(' ')
  const last = pts[pts.length - 1] as Pt
  const [hover, setHover] = useState<number | null>(null)
  const pick = (clientX: number) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const x = ((clientX - rect.left) / rect.width) * width
    const t = ((x - X0) / (X1 - X0)) * span
    setHover(Math.max(0, Math.min(span, Math.round(t))))
  }
  const hoverDay = hover === null ? null : hover === 0 ? null : (days[hover - 1] ?? null) /* 눈금 i = i-1 일의 끝 */
  const hoverX = hover === null ? null : xOf(hover)
  const labelEvery = 4

  return (
    <div ref={boxRef} style={{ padding: '6px 12px 10px', background: V3.plot, touchAction: 'pan-y' }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${H}`}
        style={{ width: '100%', height: H, display: 'block', cursor: 'crosshair' }}
        onMouseMove={(e) => pick(e.clientX)}
        onMouseLeave={() => setHover(null)}
        onTouchStart={(e) => { const t = e.touches[0]; if (t) pick(t.clientX) }}
        onTouchMove={(e) => { const t = e.touches[0]; if (t) pick(t.clientX) }}
        onTouchEnd={() => setHover(null)}
      >
        <defs>
          <filter id="trendGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="7" result="g1" />
            <feGaussianBlur stdDeviation="16" result="g2" />
            <feMerge><feMergeNode in="g2" /><feMergeNode in="g1" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <rect x="0" y="0" width={width} height={H} fill={V3.plot} />
        <text x={(X0 + X1) / 2} y="150" textAnchor="middle" fontSize="62" fontWeight="900" fill="#dff2ff" opacity="0.05" letterSpacing="6">CLOUD 0</text>
        {[0, 20, 40, 60, 80, 100].map((g) => (
          <g key={g}>
            <line x1={X0} y1={yOf(g)} x2={X1} y2={yOf(g)} stroke="#111826" />
            <text x={X0 - 8} y={yOf(g) + 4} textAnchor="end" fill={V3.textDim} fontSize="11">{g}</text>
          </g>
        ))}
        {days.map((d, i) =>
          i % labelEvery === 0 || i === days.length - 1 ? (
            <g key={d.date}>
              {i > 0 && i < days.length - 1 ? <line x1={xOf(i)} y1={Y_TOP} x2={xOf(i)} y2={Y_BOTTOM} stroke="#111826" strokeDasharray="3 5" /> : null}
              <text x={xOf(i)} y={264} textAnchor={i === 0 ? 'start' : i === days.length - 1 ? 'end' : 'middle'} fill={V3.textDim} fontSize="11">{d.label}</text>
            </g>
          ) : null,
        )}
        {days.length > 0 ? (
          <>
            <line x1={xOf(nowT)} y1={20} x2={xOf(nowT)} y2={242} stroke="#2b3a58" />
            <text x={xOf(nowT)} y={16} textAnchor="middle" fill="#8f9bb5" fontSize="13" fontWeight="700">today</text>
          </>
        ) : null}
        {pts.length > 1 ? (
          <>
            <polyline points={wrLine} fill="none" stroke={V3.blue} strokeWidth={11} strokeLinejoin="round" strokeLinecap="round" filter="url(#trendGlow)" opacity={0.42} />
            <polyline points={wrLine} fill="none" stroke="#7fa9ff" strokeWidth={6} strokeLinejoin="round" strokeLinecap="round" opacity={0.45} />
            <polyline points={wrLine} fill="none" stroke="#dbe8ff" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" opacity={0.95} />
            <polyline points={kdLine} fill="none" stroke={V3.red} strokeWidth={12} strokeLinejoin="round" strokeLinecap="round" filter="url(#trendGlow)" opacity={0.5} />
            <polyline points={kdLine} fill="none" stroke="#ff5a63" strokeWidth={6.5} strokeLinejoin="round" strokeLinecap="round" opacity={0.45} />
            <polyline points={kdLine} fill="none" stroke="#ffd7da" strokeWidth={3.2} strokeLinejoin="round" strokeLinecap="round" opacity={0.95} />
          </>
        ) : null}
        {days.length > 0 ? (
          <>
            {markSlug && hasFitMark(markSlug) ? (
              <image href={fitMarkUrl(markSlug)} x={xOf(last.t) - 10} y={yOf(last.wr) - 10} width="20" height="20" clipPath="circle(10px at 10px 10px)" />
            ) : (
              <circle cx={xOf(last.t)} cy={yOf(last.wr)} r={10} fill={V3.chip} stroke="#7fa9ff" strokeWidth={1.6} />
            )}
            <text x={xOf(last.t) + 16} y={yOf(last.wr) + 5} textAnchor="start" fill="#dbe8ff" fontSize="15" fontWeight="700">{last.wr.toFixed(1)}%</text>
            <text x={xOf(last.t) + 16} y={yOf(last.wr) + 19} textAnchor="start" fill="#8fa9d8" fontSize="9.5" fontWeight="700">{winLabel}</text>
            <circle cx={xOf(last.t)} cy={yOf(last.kd)} r={10} fill={V3.chip} stroke="#ff5a63" strokeWidth={1.6} />
            <text x={xOf(last.t)} y={yOf(last.kd) + 3} textAnchor="middle" fill="#ffd7da" fontSize="8.5" fontWeight="700">K/D</text>
            <text x={xOf(last.t) + 16} y={yOf(last.kd) + 5} textAnchor="start" fill="#ffd7da" fontSize="15" fontWeight="700">{last.kd.toFixed(1)}%</text>
            <text x={xOf(last.t) + 16} y={yOf(last.kd) + 19} textAnchor="start" fill="#c98f95" fontSize="9.5" fontWeight="700">{kdLabel}</text>
          </>
        ) : null}
        {hover !== null && hoverX !== null ? (
          <g pointerEvents="none">
            <line x1={hoverX} y1={Y_TOP - 6} x2={hoverX} y2={Y_BOTTOM + 6} stroke="#8ff0ff" strokeWidth={1} opacity={0.7} />
            {(() => {
              const w = 124
              const bx = hoverX + w + 12 > X1 + LABEL_W ? hoverX - w - 12 : hoverX + 12
              if (hover === 0 || !hoverDay) {
                return (
                  <g transform={`translate(${bx}, ${Y_TOP + 4})`}>
                    <rect width={w} height={34} rx={7} fill="#0e1728" stroke="#24314c" />
                    <text x={10} y={16} fill="#e8eaf2" fontSize="11.5" fontWeight="700">9/3 06:00 출발</text>
                    <text x={10} y={29} fill={V3.textGhost} fontSize="10">승률 0% · 킬뎃 0%</text>
                  </g>
                )
              }
              const wr = mode === 'day' ? hoverDay.win_rate : hoverDay.cum_win_rate
              const kd = mode === 'day' ? hoverDay.kd : hoverDay.cum_kd
              return (
                <g transform={`translate(${bx}, ${Y_TOP + 4})`}>
                  <rect width={w} height={hoverDay.future ? 34 : 64} rx={7} fill="#0e1728" stroke="#24314c" />
                  <text x={10} y={16} fill="#e8eaf2" fontSize="11.5" fontWeight="700">{hoverDay.label} 마감 · {mode === 'day' ? `${hoverDay.games}판` : `누적 ${hoverDay.cum_games}판`}</text>
                  {hoverDay.future ? (
                    <text x={10} y={29} fill={V3.textGhost} fontSize="10">아직 안 온 날</text>
                  ) : (
                    <>
                      <text x={10} y={33} fill="#7fa9ff" fontSize="11">승률 <tspan fill="#dbe8ff" fontWeight="700">{wr.toFixed(1)}%</tspan>{mode === 'day' && hoverDay.games > 0 ? ` (${hoverDay.win}승 ${hoverDay.lose}패)` : ''}</text>
                      <text x={10} y={50} fill="#ff5a63" fontSize="11">킬뎃 <tspan fill="#ffd7da" fontWeight="700">{kd.toFixed(1)}%</tspan>{mode === 'day' && hoverDay.games > 0 ? ` (${hoverDay.kill}/${hoverDay.death})` : ''}</text>
                    </>
                  )}
                </g>
              )
            })()}
          </g>
        ) : null}
      </svg>
    </div>
  )
}
