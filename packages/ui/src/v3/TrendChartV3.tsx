'use client'

/**
 * ★승률 및 킬뎃 추이★ — sleeper 방식 (2026-09-10 · 사장님 지시서 + 참고 캡처)
 *
 *   - X: 9/3 → 10/1, 하루 한 칸 (29칸). 글자는 9/3 · 9/7 · 9/11 … 10/1 만
 *   - Y: 0~100 고정
 *   - 시작 9/3 = 0%. 게임 없는 날은 0% 로 바닥. 미래 날짜는 안 그린다
 *   - 선 두 개 (승률 파랑 · 킬뎃 빨강) — 헤일로 → 중간 → 코어 세 겹 네온
 *   - 끝 마커: 승률 = 클랜마크 원 · 킬뎃 = K/D 원 + 값
 *   - 탐색: 마우스 이동/드래그 · 손가락 드래그 → 세로선 + 그 날짜의 값
 *   - DAY / 누적 은 부모가 고른다 (`mode`)
 *
 * 디자인(색·굵기·배경)은 시안의 추이 카드 그대로다. 데이터 방식만 지시서대로.
 */
import { useRef, useState } from 'react'
import type { PlayerTrendDay } from '@sacloud/contract'
import { fitMarkUrl, hasFitMark } from './primitives'
import { V3 } from './tokens'

const X0 = 44
const X1 = 500
const Y_TOP = 26
const Y_BOTTOM = 236
const yOf = (v: number) => Y_BOTTOM - (Math.max(0, Math.min(100, v)) / 100) * (Y_BOTTOM - Y_TOP)

export type TrendMode = 'day' | 'cum'

export function TrendChartV3({ days, mode, markSlug, winLabel, kdLabel }: { days: readonly PlayerTrendDay[]; mode: TrendMode; markSlug: string | null; winLabel: string; kdLabel: string }) {
  const n = days.length
  const xOf = (i: number) => (n <= 1 ? X1 : X0 + ((X1 - X0) * i) / (n - 1))
  const wrOf = (d: PlayerTrendDay) => (mode === 'day' ? d.win_rate : d.cum_win_rate)
  const kdOf = (d: PlayerTrendDay) => (mode === 'day' ? d.kd : d.cum_kd)
  const drawn = days.filter((d) => !d.future)
  const wrPts = drawn.map((d, i) => `${xOf(i).toFixed(1)},${yOf(wrOf(d)).toFixed(1)}`).join(' ')
  const kdPts = drawn.map((d, i) => `${xOf(i).toFixed(1)},${yOf(kdOf(d)).toFixed(1)}`).join(' ')
  const last = drawn[drawn.length - 1] ?? null
  const lastI = drawn.length - 1
  const svgRef = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<number | null>(null)

  const pick = (clientX: number) => {
    const svg = svgRef.current
    if (!svg || n === 0) return
    const rect = svg.getBoundingClientRect()
    const x = ((clientX - rect.left) / rect.width) * 640
    const i = Math.round(((x - X0) / (X1 - X0)) * (n - 1))
    setHover(Math.max(0, Math.min(n - 1, i)))
  }
  const hoverDay = hover === null ? null : (days[hover] ?? null)
  const hoverX = hover === null ? null : xOf(hover)
  const labelEvery = 4

  return (
    <div style={{ padding: '6px 12px 10px', background: V3.plot, touchAction: 'pan-y' }}>
      <svg
        ref={svgRef}
        viewBox="0 0 640 300"
        style={{ width: '100%', height: 300, display: 'block', cursor: 'crosshair' }}
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
        <rect x="0" y="0" width="640" height="300" fill={V3.plot} />
        <text x="272" y="150" textAnchor="middle" fontSize="62" fontWeight="900" fill="#dff2ff" opacity="0.05" letterSpacing="6">CLOUD 0</text>
        {[0, 20, 40, 60, 80, 100].map((g) => (
          <g key={g}>
            <line x1={X0} y1={yOf(g)} x2={X1} y2={yOf(g)} stroke="#111826" />
            <text x={X0 - 8} y={yOf(g) + 4} textAnchor="end" fill={V3.textDim} fontSize="11">{g}</text>
          </g>
        ))}
        {days.map((d, i) =>
          i % labelEvery === 0 || i === n - 1 ? (
            <g key={d.date}>
              {i > 0 && i < n - 1 ? <line x1={xOf(i)} y1={Y_TOP} x2={xOf(i)} y2={Y_BOTTOM} stroke="#111826" strokeDasharray="3 5" /> : null}
              <text x={xOf(i)} y={264} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} fill={V3.textDim} fontSize="11">{d.label}</text>
            </g>
          ) : null,
        )}
        {last ? (
          <>
            <line x1={xOf(lastI)} y1={20} x2={xOf(lastI)} y2={242} stroke="#2b3a58" />
            <text x={xOf(lastI)} y={16} textAnchor="middle" fill="#8f9bb5" fontSize="13" fontWeight="700">today</text>
          </>
        ) : null}
        {drawn.length > 1 ? (
          <>
            <polyline points={wrPts} fill="none" stroke={V3.blue} strokeWidth={11} strokeLinejoin="round" strokeLinecap="round" filter="url(#trendGlow)" opacity={0.42} />
            <polyline points={wrPts} fill="none" stroke="#7fa9ff" strokeWidth={6} strokeLinejoin="round" strokeLinecap="round" opacity={0.45} />
            <polyline points={wrPts} fill="none" stroke="#dbe8ff" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" opacity={0.95} />
            <polyline points={kdPts} fill="none" stroke={V3.red} strokeWidth={12} strokeLinejoin="round" strokeLinecap="round" filter="url(#trendGlow)" opacity={0.5} />
            <polyline points={kdPts} fill="none" stroke="#ff5a63" strokeWidth={6.5} strokeLinejoin="round" strokeLinecap="round" opacity={0.45} />
            <polyline points={kdPts} fill="none" stroke="#ffd7da" strokeWidth={3.2} strokeLinejoin="round" strokeLinecap="round" opacity={0.95} />
          </>
        ) : null}
        {last ? (
          <>
            {markSlug && hasFitMark(markSlug) ? (
              <image href={fitMarkUrl(markSlug)} x={xOf(lastI) - 10} y={yOf(wrOf(last)) - 10} width="20" height="20" clipPath="circle(10px at 10px 10px)" />
            ) : (
              <circle cx={xOf(lastI)} cy={yOf(wrOf(last))} r={10} fill={V3.chip} stroke="#7fa9ff" strokeWidth={1.6} />
            )}
            <text x={xOf(lastI) + 16} y={yOf(wrOf(last)) + 5} textAnchor="start" fill="#dbe8ff" fontSize="15" fontWeight="700">{wrOf(last).toFixed(1)}%</text>
            <text x={xOf(lastI) + 16} y={yOf(wrOf(last)) + 19} textAnchor="start" fill="#8fa9d8" fontSize="9.5" fontWeight="700">{winLabel}</text>
            <circle cx={xOf(lastI)} cy={yOf(kdOf(last))} r={10} fill={V3.chip} stroke="#ff5a63" strokeWidth={1.6} />
            <text x={xOf(lastI)} y={yOf(kdOf(last)) + 3} textAnchor="middle" fill="#ffd7da" fontSize="8.5" fontWeight="700">K/D</text>
            <text x={xOf(lastI) + 16} y={yOf(kdOf(last)) + 5} textAnchor="start" fill="#ffd7da" fontSize="15" fontWeight="700">{kdOf(last).toFixed(1)}%</text>
            <text x={xOf(lastI) + 16} y={yOf(kdOf(last)) + 19} textAnchor="start" fill="#c98f95" fontSize="9.5" fontWeight="700">{kdLabel}</text>
          </>
        ) : null}
        {hoverDay && hoverX !== null ? (
          <g pointerEvents="none">
            <line x1={hoverX} y1={Y_TOP - 6} x2={hoverX} y2={Y_BOTTOM + 6} stroke="#8ff0ff" strokeWidth={1} opacity={0.7} />
            {!hoverDay.future ? (
              <>
                <circle cx={hoverX} cy={yOf(wrOf(hoverDay))} r={4} fill="#dbe8ff" />
                <circle cx={hoverX} cy={yOf(kdOf(hoverDay))} r={4} fill="#ffd7da" />
              </>
            ) : null}
            {(() => {
              const w = 118
              const bx = hoverX + w + 12 > 640 ? hoverX - w - 12 : hoverX + 12
              return (
                <g transform={`translate(${bx}, ${Y_TOP + 4})`}>
                  <rect width={w} height={hoverDay.future ? 34 : 64} rx={7} fill="#0e1728" stroke="#24314c" />
                  <text x={10} y={16} fill="#e8eaf2" fontSize="11.5" fontWeight="700">{hoverDay.label} · {mode === 'day' ? `${hoverDay.games}판` : `누적 ${hoverDay.cum_games}판`}</text>
                  {hoverDay.future ? (
                    <text x={10} y={29} fill={V3.textGhost} fontSize="10">아직 안 온 날</text>
                  ) : (
                    <>
                      <text x={10} y={33} fill="#7fa9ff" fontSize="11">승률 <tspan fill="#dbe8ff" fontWeight="700">{wrOf(hoverDay).toFixed(1)}%</tspan>{mode === 'day' && hoverDay.games > 0 ? ` (${hoverDay.win}승 ${hoverDay.lose}패)` : ''}</text>
                      <text x={10} y={50} fill="#ff5a63" fontSize="11">킬뎃 <tspan fill="#ffd7da" fontWeight="700">{kdOf(hoverDay).toFixed(1)}%</tspan>{mode === 'day' && hoverDay.games > 0 ? ` (${hoverDay.kill}/${hoverDay.death})` : ''}</text>
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
