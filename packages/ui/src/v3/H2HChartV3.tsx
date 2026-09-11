'use client'

/**
 * ★상대전적 세트 승률 추이 (시즌 시간축)★ — 2026-09-11 사장님 (sleeper 참고)
 *
 *   X축   9/3 06:00 → 10/1 06:00 (4주 · 매일). 눈금은 9/3 · 9/17 · 10/1 셋.
 *   Y축   0~100% (우리 세트 승률 · 상대는 100-우리)
 *   선    경기가 없는 날은 전날 값을 잇고, 꼭짓점은 짧은 수평 구간, 오르내리는 구간은 불규칙한 흔들림(모양만 · 값 불변)
 *   출발  0% (우리) — 첫 판 전에는 아무것도 없다. 지어내지 않는다
 *
 * 옛 판(판 순서 X축 · ClanDetailV3.H2HChartLegacy)은 지우지 않았다.
 */
import { useMemo } from 'react'
import { V3 } from './tokens'
import { fitMarkUrl, hasFitMark, type ClanTheme } from './primitives'

export interface H2HGame {
  /** 경기 시작 (ISO) */
  at: string
  /** 우리가 이겼나. 모르면 뺀다 */
  won: boolean
}

/* 시즌 창 — 추이 그래프(TrendChartV3)와 같은 날짜 (9/3 06:00 KST 출발 · 28일) */
const ORIGIN_MS = Date.parse('2026-09-02T21:00:00Z')
const SPAN_DAYS = 28
const DAY_MS = 86400000
const TICKS: readonly [number, string][] = [[0, '9/3'], [14, '9/17'], [28, '10/1']]

const W = 700
const H = 330
const X0 = 46
const X1 = 560
const Y_TOP = 26
const Y_BOTTOM = 268
const WIGGLE = 1.4
const HOLD = 0.3

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

const xOf = (t: number) => X0 + ((X1 - X0) * t) / SPAN_DAYS
const yOf = (v: number) => Y_BOTTOM - (Math.max(0, Math.min(100, v)) / 100) * (Y_BOTTOM - Y_TOP)

interface Pt { t: number; v: number }

/** 꼭짓점은 짧은 수평 · 이동 구간은 흔들림 — 값은 안 바꾼다 (표시 모양만) */
function shaped(pts: readonly Pt[], salt: number): string {
  if (pts.length === 0) return ''
  const out: string[] = []
  let k = 0
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i] as Pt
    const b = pts[i + 1]
    const xa = xOf(a.t)
    if (!b) { out.push(`${xa.toFixed(1)},${yOf(a.v).toFixed(1)}`); break }
    const xb = xOf(b.t)
    const n = Math.max(2, Math.round((xb - xa) / 5))
    for (let j = 0; j < n; j += 1) {
      const f = j / n
      const x = xa + (xb - xa) * f
      const g = f < HOLD ? 0 : (f - HOLD) / (1 - HOLD)
      const base = a.v + (b.v - a.v) * g
      const wig = j === 0 ? 0 : noise(salt, k) * WIGGLE
      k += 1
      out.push(`${x.toFixed(1)},${yOf(base + wig).toFixed(1)}`)
    }
  }
  return out.join(' ')
}

export function H2HChartV3({ games, theme, oppTheme, mineName, mineSlug, oppName, oppSlug }: {
  games: readonly H2HGame[]
  theme: ClanTheme
  oppTheme: ClanTheme
  mineName: string
  mineSlug: string | null
  oppName: string
  oppSlug: string | null
}) {
  const nowT = Math.max(0, Math.min(SPAN_DAYS, (Date.now() - ORIGIN_MS) / DAY_MS))
  const { mine, opp, last } = useMemo(() => {
    const sorted = [...games]
      .map((g) => ({ t: (Date.parse(g.at) - ORIGIN_MS) / DAY_MS, won: g.won }))
      .filter((g) => Number.isFinite(g.t))
      .sort((a, b) => a.t - b.t)
    let w = 0
    let n = 0
    const pts: Pt[] = [{ t: 0, v: 0 }]
    for (const g of sorted) {
      n += 1
      if (g.won) w += 1
      const t = Math.max(0, Math.min(SPAN_DAYS, g.t))
      pts.push({ t, v: (w / n) * 100 })
    }
    const endV = pts[pts.length - 1]?.v ?? 0
    if ((pts[pts.length - 1]?.t ?? 0) < nowT) pts.push({ t: nowT, v: endV })
    const oppPts = pts.map((p) => ({ t: p.t, v: n === 0 && p.t === 0 ? 0 : 100 - p.v }))
    /* 첫 판 전에는 둘 다 0 에서 출발 — 상대 100% 로 지어내지 않는다 */
    if (oppPts.length > 0) (oppPts[0] as Pt).v = 0
    return { mine: pts, opp: oppPts, last: { t: nowT, v: endV, played: n } }
  }, [games, nowT])
  const salt = seedOf(`${mineSlug ?? mineName}|${oppSlug ?? oppName}`)
  const mineLine = shaped(mine, salt)
  const oppLine = shaped(opp, salt + 7)
  const endY = yOf(last.v)
  const oppEndY = yOf(last.played === 0 ? 0 : 100 - last.v)
  const close = Math.abs(endY - oppEndY) < 44
  const nowX = xOf(last.t)
  return (
    <div style={{ padding: '6px 12px 10px', background: V3.plot }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="v3-h2h-svg" style={{ width: '100%', height: 330, display: 'block' }}>
        <defs>
          <filter id="h2hGlowB" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="7" result="b1" /><feGaussianBlur stdDeviation="16" result="b2" /><feMerge><feMergeNode in="b2" /><feMergeNode in="b1" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          <filter id="h2hGlowR" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="7" result="r1" /><feGaussianBlur stdDeviation="16" result="r2" /><feMerge><feMergeNode in="r2" /><feMergeNode in="r1" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        <rect x="0" y="0" width={W} height={H} fill={V3.plot} />
        {[0, 25, 50, 75, 100].map((g) => (
          <g key={g}>
            <line x1={X0} y1={yOf(g)} x2={X1} y2={yOf(g)} stroke="#111826" />
            <text x={X0 - 8} y={yOf(g) + 4} textAnchor="end" fill="#7c88a4" fontSize="13">{g}%</text>
          </g>
        ))}
        {TICKS.map(([t, label], i) => (
          <g key={label}>
            <line x1={xOf(t)} y1={Y_TOP} x2={xOf(t)} y2={Y_BOTTOM} stroke="#111826" strokeDasharray="3 5" />
            <text x={xOf(t)} y={Y_BOTTOM + 32} textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'} fill="#7c88a4" fontSize="13">{label}</text>
          </g>
        ))}
        <line x1={nowX} y1={Y_TOP - 6} x2={nowX} y2={Y_BOTTOM} stroke="#2b3a58" />
        <text x={nowX} y={Y_TOP - 10} textAnchor="middle" fill="#8f9bb5" fontSize="14" fontWeight="700">now</text>
        {last.played === 0 ? <text x={(X0 + X1) / 2} y="150" textAnchor="middle" fill={V3.textGhost} fontSize="13">승패를 아는 맞대결이 없습니다</text> : null}
        <polyline points={oppLine} fill="none" stroke={oppTheme.deep} strokeWidth={13} strokeLinejoin="round" strokeLinecap="round" filter="url(#h2hGlowR)" opacity={0.5} />
        <polyline points={mineLine} fill="none" stroke={V3.blue} strokeWidth={13} strokeLinejoin="round" strokeLinecap="round" filter="url(#h2hGlowB)" opacity={0.55} />
        <polyline points={oppLine} fill="none" stroke={oppTheme.deep} strokeWidth={7} strokeLinejoin="round" strokeLinecap="round" opacity={0.42} />
        <polyline points={mineLine} fill="none" stroke="#7fa9ff" strokeWidth={7} strokeLinejoin="round" strokeLinecap="round" opacity={0.45} />
        <polyline points={oppLine} fill="none" stroke={oppTheme.main} strokeWidth={3.4} strokeLinejoin="round" strokeLinecap="round" opacity={0.95} />
        <polyline points={mineLine} fill="none" stroke="#dbe8ff" strokeWidth={3.4} strokeLinejoin="round" strokeLinecap="round" opacity={0.95} />
        {last.played > 0 ? (
          <>
            <circle cx={nowX} cy={endY} r={26} fill="none" stroke={V3.blue} strokeWidth={7} filter="url(#h2hGlowB)" opacity={0.55} />
            <circle cx={nowX} cy={endY} r={22} fill={V3.chip} stroke="#7fa9ff" strokeWidth={2} />
            {mineSlug && hasFitMark(mineSlug) ? <image href={fitMarkUrl(mineSlug)} x={nowX - 18} y={endY - 18} width="36" height="36" clipPath="circle(18px at 18px 18px)" /> : null}
            <text x={nowX + 30} y={endY + (close ? -26 : 10)} fill="#ffffff" fontSize="20" fontWeight="700">{last.v.toFixed(1)}%</text>
            <circle cx={nowX - (close ? 34 : 0)} cy={oppEndY} r={26} fill="none" stroke={oppTheme.deep} strokeWidth={7} filter="url(#h2hGlowR)" opacity={0.55} />
            <circle cx={nowX - (close ? 34 : 0)} cy={oppEndY} r={22} fill={V3.chip} stroke={oppTheme.main} strokeWidth={2} />
            {oppSlug && hasFitMark(oppSlug) ? <image href={fitMarkUrl(oppSlug)} x={nowX - 18 - (close ? 34 : 0)} y={oppEndY - 18} width="36" height="36" clipPath="circle(18px at 18px 18px)" /> : null}
            <text x={nowX + 30} y={oppEndY + (close ? 38 : 10)} fill="#ffffff" fontSize="20" fontWeight="700">{(100 - last.v).toFixed(1)}%</text>
          </>
        ) : null}
        <g>
          <line x1={X0} y1={318} x2={X0 + 16} y2={318} stroke="#7fa9ff" strokeWidth={3} filter="url(#h2hGlowB)" />
          <line x1={X0} y1={318} x2={X0 + 16} y2={318} stroke="#dbe8ff" strokeWidth={1.6} />
          <text x={X0 + 22} y={323} fill={theme.ink} fontSize="15">{mineName}</text>
          <line x1={X0 + 170} y1={318} x2={X0 + 186} y2={318} stroke={oppTheme.deep} strokeWidth={3} filter="url(#h2hGlowR)" />
          <line x1={X0 + 170} y1={318} x2={X0 + 186} y2={318} stroke={oppTheme.main} strokeWidth={1.6} />
          <text x={X0 + 192} y={323} fill={oppTheme.ink} fontSize="15">{oppName}</text>
        </g>
      </svg>
    </div>
  )
}
