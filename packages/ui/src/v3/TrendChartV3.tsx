'use client'

/**
 * ★승률 및 킬뎃 추이★ — sleeper 방식 (2026-09-10 · 사장님 지시서 + 참고 캡처 · 2026-09-11 손질)
 *
 *   - X: 9/3 06:00 (출발점 · 0%) → 10/1 06:00. 하루 한 칸(28칸). 글자는 9/3 · 9/17 · 10/1 셋만
 *   - Y: 0~100 고정
 *   - 출발점은 무조건 0%. 경기 없는 날은 전날 값이 이어진다. 하루 안에서는 경기마다 값이 움직인다
 *     (서버가 준 `points` — 경기 직후의 실제 값)
 *   - 선 모양: 점마다 짧은 수평 구간(각짐) + 잔잔한 흔들림. ★흔들림은 모양만이다★ — 값을 바꾸지 않는다.
 *     폭은 ±1.2% 안쪽, 선수마다 정해진 패턴(새로고침해도 같다). 마커·탐색 값은 진짜 값이다
 *   - 미래(지금 이후)는 안 그린다. 선 끝 = 지금
 *   - 선 두 개 (승률 파랑 · 킬뎃 빨강) — 헤일로 → 중간 → 코어 세 겹 네온
 *   - 끝 마커: 승률 = 클랜마크 원 · 킬뎃 = K/D 원 + 값. 바를 옮기면 그 날짜 값으로 따라온다
 *   - 탐색: 마우스 이동/드래그 · 손가락 드래그
 *   - 판은 카드 폭을 다 쓰고, 높이도 크게 (PC 520 · 폰은 폭에 맞춰)
 */
import { useEffect, useRef, useState } from 'react'
import type { PlayerTrendDay } from '@sacloud/contract'
import { fitMarkUrl, hasFitMark } from './primitives'
import { V3 } from './tokens'

const X0 = 40
const LABEL_W = 128
const Y_TOP = 28
/** 흔들림 폭 (% 단위) — 모양만 */
const WIGGLE = 1.2
/** 수평 구간 비율 — 한 구간의 앞 30% 는 값을 유지한다 (각짐) */
const HOLD = 0.3

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
    /* 경기별 점은 누적에서만 — DAY 는 그날 첫 판이 0%/100% 로 튀어 선이 벽처럼 서 버린다 (2026-09-11 회차 1 발견) */
    if (mode !== 'day') {
      for (const p of d.points) pts.push({ t: i + p.at, wr: p.cum_win_rate, kd: p.cum_kd })
    }
    const close = { t: i + 1, wr: mode === 'day' ? d.win_rate : d.cum_win_rate, kd: mode === 'day' ? d.kd : d.cum_kd }
    if (d.today) {
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

/** 정해진 흔들림 — 같은 선수·같은 자리면 언제나 같은 값 (-1 ~ 1) */
function noise(seed: number, k: number): number {
  let h = (seed ^ Math.imul(k + 1, 0x9e3779b1)) >>> 0
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295 * 2 - 1
}
function seedOf(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0
  return h
}

export function TrendChartV3({ days, mode, markSlug, winLabel, kdLabel, seed = '' }: { days: readonly PlayerTrendDay[]; mode: TrendMode; markSlug: string | null; winLabel: string; kdLabel: string; seed?: string }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [width, setWidth] = useState(900)
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const update = () => setWidth(Math.max(340, Math.round(el.getBoundingClientRect().width)))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const H = width < 700 ? Math.round(width * 1.05) : 520
  const Y_BOTTOM = H - 64
  const yOf = (v: number) => Y_BOTTOM - (Math.max(0, Math.min(100, v)) / 100) * (Y_BOTTOM - Y_TOP)
  const X1 = width - LABEL_W
  const span = Math.max(1, days.length - 1) /* 28 */
  const xOf = (t: number) => X0 + ((X1 - X0) * t) / span
  const { pts, nowT } = buildSeries(days, mode)
  const s0 = seedOf(seed)

  /* 구간마다 잘게 쪼개 «수평 유지 → 이동» 으로 각지게 그리고, 잔잔한 흔들림을 얹는다 (모양만) */
  const shaped = (pick: (p: Pt) => number, salt: number): string => {
    const out: string[] = []
    let k = 0
    for (let i = 0; i < pts.length - 1; i += 1) {
      const a = pts[i] as Pt
      const b = pts[i + 1] as Pt
      const xa = xOf(a.t)
      const xb = xOf(b.t)
      const va = pick(a)
      const vb = pick(b)
      const steps = Math.max(1, Math.round((xb - xa) / 5))
      for (let s = 0; s < steps; s += 1) {
        const f = s / steps
        const base = f < HOLD ? va : va + ((vb - va) * (f - HOLD)) / (1 - HOLD)
        const w = s === 0 && i === 0 ? 0 : noise(s0 + salt, k) * WIGGLE
        out.push(`${(xa + (xb - xa) * f).toFixed(1)},${yOf(base + w).toFixed(1)}`)
        k += 1
      }
    }
    const end = pts[pts.length - 1] as Pt
    out.push(`${xOf(end.t).toFixed(1)},${yOf(pick(end)).toFixed(1)}`)
    return out.join(' ')
  }
  const wrLine = shaped((p) => p.wr, 11)
  const kdLine = shaped((p) => p.kd, 23)
  const end = pts[pts.length - 1] as Pt

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
  /* 바를 옮기면 선 끝의 원 표시가 그 날짜의 값으로 따라온다 */
  const last: Pt = hover === null
    ? end
    : hover === 0
      ? { t: 0, wr: 0, kd: 0 }
      : hoverDay
        ? { t: Math.min(hover, end.t), wr: mode === 'day' ? hoverDay.win_rate : hoverDay.cum_win_rate, kd: mode === 'day' ? hoverDay.kd : hoverDay.cum_kd }
        : end
  const ticks = days.length > 0 ? [0, Math.floor(span / 2), span] : []

  return (
    <div ref={boxRef} style={{ padding: '6px 6px 8px', background: V3.plot, touchAction: 'pan-y' }}>
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
        <text x={(X0 + X1) / 2} y={H / 2} textAnchor="middle" fontSize="62" fontWeight="900" fill="#dff2ff" opacity="0.05" letterSpacing="6">CLOUD 0</text>
        {[0, 20, 40, 60, 80, 100].map((g) => (
          <g key={g}>
            <line x1={X0} y1={yOf(g)} x2={X1} y2={yOf(g)} stroke="#111826" />
            <text x={X0 - 8} y={yOf(g) + 4} textAnchor="end" fill={V3.textDim} fontSize="11">{g}</text>
          </g>
        ))}
        {ticks.map((i, k) => (
          <g key={i}>
            {k === 1 ? <line x1={xOf(i)} y1={Y_TOP} x2={xOf(i)} y2={Y_BOTTOM} stroke="#111826" strokeDasharray="3 5" /> : null}
            <text x={xOf(i)} y={Y_BOTTOM + 26} textAnchor={k === 0 ? 'start' : k === 2 ? 'end' : 'middle'} fill={V3.textDim} fontSize="12">{days[i]?.label ?? ''}</text>
          </g>
        ))}
        {days.length > 0 ? (
          <>
            <line x1={xOf(nowT)} y1={Y_TOP - 8} x2={xOf(nowT)} y2={Y_BOTTOM + 6} stroke="#2b3a58" />
            <text x={xOf(nowT)} y={Y_TOP - 12} textAnchor="middle" fill="#8f9bb5" fontSize="13" fontWeight="700">today</text>
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
        {hover !== null && hoverX !== null ? (
          <line x1={hoverX} y1={Y_TOP - 6} x2={hoverX} y2={Y_BOTTOM + 6} stroke="#8ff0ff" strokeWidth={1} opacity={0.7} pointerEvents="none" />
        ) : null}
        {days.length > 0 ? (
          <g pointerEvents="none">
            {markSlug && hasFitMark(markSlug) ? (
              <image href={fitMarkUrl(markSlug)} x={xOf(last.t) - 11} y={yOf(last.wr) - 11} width="22" height="22" clipPath="circle(11px at 11px 11px)" />
            ) : (
              <circle cx={xOf(last.t)} cy={yOf(last.wr)} r={11} fill={V3.chip} stroke="#7fa9ff" strokeWidth={1.6} />
            )}
            <text x={xOf(last.t) + 17} y={yOf(last.wr) + 5} textAnchor="start" fill="#dbe8ff" fontSize="16" fontWeight="700">{last.wr.toFixed(1)}%</text>
            <text x={xOf(last.t) + 17} y={yOf(last.wr) + 20} textAnchor="start" fill="#8fa9d8" fontSize="10" fontWeight="700">{hover === null ? winLabel : hoverDay ? `${hoverDay.label} 마감 · ${mode === 'day' ? `${hoverDay.win}승 ${hoverDay.lose}패` : `누적 ${hoverDay.cum_games}판`}` : '9/3 출발'}</text>
            <circle cx={xOf(last.t)} cy={yOf(last.kd)} r={11} fill={V3.chip} stroke="#ff5a63" strokeWidth={1.6} />
            <text x={xOf(last.t)} y={yOf(last.kd) + 3} textAnchor="middle" fill="#ffd7da" fontSize="8.5" fontWeight="700">K/D</text>
            <text x={xOf(last.t) + 17} y={yOf(last.kd) + 5} textAnchor="start" fill="#ffd7da" fontSize="16" fontWeight="700">{last.kd.toFixed(1)}%</text>
            <text x={xOf(last.t) + 17} y={yOf(last.kd) + 20} textAnchor="start" fill="#c98f95" fontSize="10" fontWeight="700">{hover === null ? kdLabel : hoverDay ? `${hoverDay.label} 마감 · ${mode === 'day' ? `${hoverDay.kill}킬 ${hoverDay.death}데스` : ''}` : '9/3 출발'}</text>
          </g>
        ) : null}
      </svg>
    </div>
  )
}
