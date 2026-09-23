'use client'

/**
 * ★라운드 흐름 그래프★ — 경기 하나를 라운드·인원 단위로 쪼개 「이 라운드를 딸 확률」 로 그린다
 * (2026-09-23 사장님 · 회의 답 5개로 확정 · `docs/ORDERS.md`).
 *
 *   세로   이 라운드를 딸 확률 (이긴 클랜 기준 · 진 클랜은 100 − 그것)
 *   가로   ★실제 진행 시각★. 판 크기는 모든 경기가 같다 — 전반을 왼쪽 반, 후반을 오른쪽 반에 펴고
 *          가운데 굵은 선이 전후반 경계다. 후반이 없는 경기(5:0)는 전체를 한 판에 편다
 *   선     라운드가 열리면 인원 5:5 의 확률에서 시작 → 누가 죽을 때마다 빈도표 값으로 계단 →
 *          라운드가 끝나면 딴 쪽이 100 · 진 쪽이 0 → 다음 라운드가 열리면 다시 5:5 로
 *   출발   경기 시작(0초)에는 ★한 줄은 위(100) 한 줄은 아래(0)★ 에서 나온다 — 상대전적 그래프와 같다
 *          (사장님: 「상단과 하단에서 시작하는 우리가 원래 만든 그 그래프였으면 좋겠어」)
 *   점선   빈도표 표본이 모자라 공식(a/(a+b))으로 메운 구간 (`roundOdds` · D-106 — 잰 것과 어림한 것을 같은 선으로 안 그린다)
 *
 * 판·선 두께·마커·흔들림은 상대전적 그래프(`H2HChartV3` · `seasonPlot`)와 같은 값을 쓴다.
 * 흔들림은 ★모양만★ 이다 — 두 선이 50 에서 정확히 포개지지 않게 하는 용도. 값은 안 바뀐다.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { RoundFlow } from '@sacloud/contract'
import { roundOddsPlain, roundOddsSided } from '@sacloud/contract'
import { V3, type V3Tone } from './tokens'
import { fitMarkUrl, hasFitMark, type ClanTheme } from './primitives'
import { PLOT, noise, penDash, plotBox, pointsToStr, seedOf, useDrawIn } from './seasonPlot'

export interface RoundFlowTeam {
  side: 'red' | 'blue'
  name: string
  slug: string | null
  theme: ClanTheme
}

interface Pt {
  x: number
  /** 이긴 클랜이 이 라운드를 딸 확률 (0~100) */
  v: number
  round: number
  aliveW: number
  aliveL: number
  est: boolean
}

/** 흔들림 폭 — 상대전적보다 작다. 계단이 보여야 해서 */
const WIGGLE = 0.8

export function RoundFlowChartV3({ flow, winner, loser, tone = V3 }: {
  flow: RoundFlow
  /** 이긴 클랜 — 파란 선. 무승부·미상이면 red 슬롯을 넣는다 */
  winner: RoundFlowTeam
  loser: RoundFlowTeam
  tone?: V3Tone
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(900)
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const update = () => setWidth(Math.max(320, Math.round(el.getBoundingClientRect().width)))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const draw = useDrawIn(3600, `${winner.slug ?? winner.name}|${flow.rounds.length}`, boxRef)
  const box = plotBox(width)
  const { H, X0, X1, Y_TOP, Y_BOTTOM, phone } = box
  const yOf = (v: number) => Y_BOTTOM - (Math.max(0, Math.min(100, v)) / 100) * (Y_BOTTOM - Y_TOP)

  const model = useMemo(() => {
    const rounds = [...flow.rounds].sort((a, b) => a.round - b.round)
    const s = flow.second_half_from
    const first = s === null ? rounds : rounds.filter((r) => r.round < s)
    const second = s === null ? [] : rounds.filter((r) => r.round >= s)
    const twoHalves = first.length > 0 && second.length > 0
    const XM = (X0 + X1) / 2
    /* 전반은 0초(경기 시작)부터 · 후반은 첫 후반 라운드 시작부터 */
    const spanA: [number, number] = [0, Math.max(1, (first[first.length - 1] ?? rounds[rounds.length - 1])?.end ?? 1)]
    const spanB: [number, number] = twoHalves ? [(second[0] as (typeof second)[number]).start, Math.max((second[0] as (typeof second)[number]).start + 1, (second[second.length - 1] as (typeof second)[number]).end)] : [0, 1]
    const xOf = (t: number, half: 'A' | 'B'): number => {
      if (!twoHalves) return X0 + ((X1 - X0) * (t - spanA[0])) / (spanA[1] - spanA[0])
      if (half === 'A') return X0 + ((XM - X0) * (t - spanA[0])) / (spanA[1] - spanA[0])
      return XM + ((X1 - XM) * (t - spanB[0])) / (spanB[1] - spanB[0])
    }
    const W = winner.side
    const L = loser.side
    const sizeW = flow.team_size[W]
    const sizeL = flow.team_size[L]
    const pts: Pt[] = []
    const ticks: { x: number; round: number }[] = []
    let anyEst = false
    /* 출발 — 이긴 클랜은 아래(0)에서 (상대전적 그래프와 같다) */
    pts.push({ x: xOf(0, 'A'), v: 0, round: 0, aliveW: sizeW, aliveL: sizeL, est: false })
    for (const r of rounds) {
      const half: 'A' | 'B' = s !== null && r.round >= s ? 'B' : 'A'
      let aliveW = sizeW
      let aliveL = sizeL
      const odds = (): { p: number; est: boolean } => {
        if (r.defence === null) {
          const o = roundOddsPlain(aliveW, aliveL)
          return { p: o.p, est: o.estimated }
        }
        const wAttacks = r.defence !== W
        const att = wAttacks ? aliveW : aliveL
        const def = wAttacks ? aliveL : aliveW
        const o = roundOddsSided(att, def)
        return { p: wAttacks ? o.p : 1 - o.p, est: o.estimated }
      }
      ticks.push({ x: xOf(r.start, half), round: r.round })
      let o = odds()
      anyEst = anyEst || o.est
      pts.push({ x: xOf(r.start, half), v: o.p * 100, round: r.round, aliveW, aliveL, est: o.est })
      for (const d of r.deaths) {
        if (d.side === W) aliveW = Math.max(0, aliveW - 1)
        else aliveL = Math.max(0, aliveL - 1)
        o = odds()
        anyEst = anyEst || o.est
        const x = xOf(Math.min(d.at, r.end), half)
        /* 계단 — 죽기 직전까지는 앞 값 그대로 */
        const prev = pts[pts.length - 1] as Pt
        pts.push({ ...prev, x: Math.max(prev.x, x - 0.01) })
        pts.push({ x, v: o.p * 100, round: r.round, aliveW, aliveL, est: o.est })
      }
      if (r.winner !== null) {
        const prev = pts[pts.length - 1] as Pt
        const x = xOf(r.end, half)
        pts.push({ ...prev, x: Math.max(prev.x, x - 0.01) })
        pts.push({ x, v: r.winner === W ? 100 : 0, round: r.round, aliveW, aliveL, est: false })
      }
    }
    return { pts, ticks, twoHalves, XM, anyEst, rounds }
  }, [flow, winner.side, loser.side, X0, X1])

  const salt = seedOf(`${winner.slug ?? winner.name}|${loser.slug ?? loser.name}`)
  const wig = (k: number, s: number) => (k === 0 ? 0 : noise(salt + s, k) * WIGGLE)
  const winPts: [number, number][] = model.pts.map((p, k) => [p.x, yOf(p.v + wig(k, 0))])
  const losePts: [number, number][] = model.pts.map((p, k) => [p.x, yOf(100 - p.v + wig(k, 7))])
  /* 점선 구간 — 어림한 점으로 들어가는 조각만 */
  const estSegs: [number, number, number, number][] = []
  const estSegsL: [number, number, number, number][] = []
  for (let i = 1; i < model.pts.length; i += 1) {
    if (!(model.pts[i] as Pt).est) continue
    const a = winPts[i - 1] as [number, number]
    const b = winPts[i] as [number, number]
    estSegs.push([a[0], a[1], b[0], b[1]])
    const c = losePts[i - 1] as [number, number]
    const d = losePts[i] as [number, number]
    estSegsL.push([c[0], c[1], d[0], d[1]])
  }
  const winLine = pointsToStr(winPts)
  const loseLine = pointsToStr(losePts)

  const svgRef = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const pickAt = (clientX: number) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const x = ((clientX - rect.left) / rect.width) * width
    setHover(Math.max(X0, Math.min(X1, x)))
  }
  const hoverPt: Pt | null = hover === null ? null : (model.pts.filter((p) => p.x <= hover).pop() ?? model.pts[0] ?? null)
  const last = model.pts[model.pts.length - 1] as Pt | undefined
  const endW = last ? last.v : 50
  const R = PLOT.markerR
  const nowX = last ? last.x : X1
  const close = Math.abs(yOf(endW) - yOf(100 - endW)) < 52
  const wAbove = yOf(endW) <= yOf(100 - endW)
  const wDy = close ? (wAbove ? -14 : 22) : 6
  const lDy = close ? (wAbove ? 22 : -14) : 6
  const labelX = nowX - R - 8
  const winInk = tone === V3 ? '#1c2f6b' : '#bcd2ff'
  const every = phone && model.ticks.length > 10 ? 2 : 1

  return (
    <div ref={boxRef} style={{ padding: '6px 8px 8px', background: tone.plot }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${H}`}
        style={{ width: '100%', height: H, display: 'block', cursor: 'crosshair' }}
        onMouseMove={(e) => pickAt(e.clientX)}
        onMouseLeave={() => setHover(null)}
        onTouchStart={(e) => { const t = e.touches[0]; if (t) pickAt(t.clientX) }}
        onTouchMove={(e) => { const t = e.touches[0]; if (t) pickAt(t.clientX) }}
        onTouchEnd={() => setHover(null)}
      >
        <defs>
          <filter id="rfGlowB" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="7" result="b1" /><feGaussianBlur stdDeviation="16" result="b2" /><feMerge><feMergeNode in="b2" /><feMergeNode in="b1" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          <filter id="rfGlowR" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="7" result="r1" /><feGaussianBlur stdDeviation="16" result="r2" /><feMerge><feMergeNode in="r2" /><feMergeNode in="r1" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        <rect x="0" y="0" width={width} height={H} fill={tone.plot} />
        {[0, 25, 50, 75, 100].map((g) => (
          <g key={g}>
            <line x1={X0} y1={yOf(g)} x2={X1} y2={yOf(g)} stroke={tone.cardBorder} />
            <text x={X0 - 7} y={yOf(g) + 4} textAnchor="end" fill={tone.textDim} fontSize={PLOT.axisFont}>{g}%</text>
          </g>
        ))}
        {/* 라운드 경계 — 점선 · 아래 숫자 */}
        {model.ticks.map((t, k) => (
          <g key={t.round}>
            <line x1={t.x} y1={Y_TOP} x2={t.x} y2={Y_BOTTOM} stroke={tone.cardBorder} strokeDasharray="3 5" />
            {k % every === 0 ? <text x={t.x + 3} y={Y_BOTTOM + 26} textAnchor="start" fill={tone.textDim} fontSize={PLOT.axisFont}>{t.round}</text> : null}
          </g>
        ))}
        {/* 전후반 경계 — 가운데 굵은 선 하나 (사장님) */}
        {model.twoHalves ? (
          <g>
            <line x1={model.XM} y1={Y_TOP - 8} x2={model.XM} y2={Y_BOTTOM + 6} stroke={tone.textMuted} strokeWidth={2} />
            <text x={(X0 + model.XM) / 2} y={Y_TOP - 12} textAnchor="middle" fill={tone.textMuted} fontSize={PLOT.tickFont} fontWeight="700">전반</text>
            <text x={(model.XM + X1) / 2} y={Y_TOP - 12} textAnchor="middle" fill={tone.textMuted} fontSize={PLOT.tickFont} fontWeight="700">후반</text>
          </g>
        ) : (
          <text x={(X0 + X1) / 2} y={Y_TOP - 12} textAnchor="middle" fill={tone.textMuted} fontSize={PLOT.tickFont} fontWeight="700">전반</text>
        )}
        <text x={X0 - 7} y={Y_BOTTOM + 26} textAnchor="end" fill={tone.textDim} fontSize={PLOT.axisFont}>라운드</text>
        {model.pts.length > 1 ? (
          <g>
            <polyline points={loseLine} fill="none" stroke={loser.theme.deep} strokeWidth={PLOT.glowW} strokeLinejoin="round" strokeLinecap="round" filter={draw < 1 ? undefined : 'url(#rfGlowR)'} opacity={0.5} {...penDash(draw)} />
            <polyline points={winLine} fill="none" stroke={V3.blue} strokeWidth={PLOT.glowW} strokeLinejoin="round" strokeLinecap="round" filter={draw < 1 ? undefined : 'url(#rfGlowB)'} opacity={0.5} {...penDash(draw)} />
            <polyline points={loseLine} fill="none" stroke={loser.theme.deep} strokeWidth={PLOT.midW} strokeLinejoin="round" strokeLinecap="round" opacity={0.42} {...penDash(draw)} />
            <polyline points={winLine} fill="none" stroke="#7fa9ff" strokeWidth={PLOT.midW} strokeLinejoin="round" strokeLinecap="round" opacity={0.45} {...penDash(draw)} />
            <polyline points={loseLine} fill="none" stroke={loser.theme.main} strokeWidth={PLOT.coreW} strokeLinejoin="round" strokeLinecap="round" opacity={0.95} {...penDash(draw)} />
            <polyline points={winLine} fill="none" stroke={winInk} strokeWidth={PLOT.coreW} strokeLinejoin="round" strokeLinecap="round" opacity={0.95} {...penDash(draw)} />
            {/* 어림한 구간 — 심지 위에 점선을 덧그린다 */}
            {estSegsL.map(([x1, y1, x2, y2], k) => <line key={`l${k}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={tone.plot} strokeWidth={PLOT.coreW} strokeDasharray="4 4" opacity={0.85} />)}
            {estSegs.map(([x1, y1, x2, y2], k) => <line key={`w${k}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={tone.plot} strokeWidth={PLOT.coreW} strokeDasharray="4 4" opacity={0.85} />)}
          </g>
        ) : null}
        {hoverPt !== null && hover !== null ? (
          <g pointerEvents="none">
            <line x1={hover} y1={Y_TOP - 6} x2={hover} y2={Y_BOTTOM + 6} stroke="#0891b2" strokeWidth={1} opacity={0.7} />
            <text x={Math.max(X0 + 160, Math.min(X1 - 160, hover))} y={Y_BOTTOM + 44} textAnchor="middle" fill="#0891b2" fontSize={PLOT.tickFont}>
              {hoverPt.round === 0 ? '시작' : `${hoverPt.round}라운드 · ${winner.name} ${hoverPt.aliveW} : ${hoverPt.aliveL} ${loser.name} · ${hoverPt.v.toFixed(0)}%${hoverPt.est ? ' [추정]' : ''}`}
            </text>
          </g>
        ) : null}
        {last ? (
          <g pointerEvents="none">
            <circle cx={nowX} cy={yOf(100 - endW)} r={R + 4} fill="none" stroke={loser.theme.deep} strokeWidth={6} filter={draw < 1 ? undefined : 'url(#rfGlowR)'} opacity={0.55} />
            <circle cx={nowX} cy={yOf(100 - endW)} r={R} fill={tone.chip} stroke={loser.theme.main} strokeWidth={2} />
            {loser.slug && hasFitMark(loser.slug) ? <image href={fitMarkUrl(loser.slug)} x={nowX - R} y={yOf(100 - endW) - R} width={R * 2} height={R * 2} clipPath={`circle(${R}px at ${R}px ${R}px)`} /> : null}
            <text x={labelX} y={yOf(100 - endW) + lDy} textAnchor="end" fill={tone.textStrong} fontSize={PLOT.valueFont} fontWeight="700">{(100 - endW).toFixed(0)}%</text>
            <circle cx={nowX} cy={yOf(endW)} r={R + 4} fill="none" stroke={V3.blue} strokeWidth={6} filter={draw < 1 ? undefined : 'url(#rfGlowB)'} opacity={0.55} />
            <circle cx={nowX} cy={yOf(endW)} r={R} fill={tone.chip} stroke="#7fa9ff" strokeWidth={2} />
            {winner.slug && hasFitMark(winner.slug) ? <image href={fitMarkUrl(winner.slug)} x={nowX - R} y={yOf(endW) - R} width={R * 2} height={R * 2} clipPath={`circle(${R}px at ${R}px ${R}px)`} /> : null}
            <text x={labelX} y={yOf(endW) + wDy} textAnchor="end" fill={tone.textStrong} fontSize={PLOT.valueFont} fontWeight="700">{endW.toFixed(0)}%</text>
          </g>
        ) : null}
        <g>
          <line x1={X0} y1={H - 8} x2={X0 + 16} y2={H - 8} stroke="#7fa9ff" strokeWidth={3} filter={draw < 1 ? undefined : 'url(#rfGlowB)'} />
          <line x1={X0} y1={H - 8} x2={X0 + 16} y2={H - 8} stroke={winInk} strokeWidth={1.6} />
          <text x={X0 + 22} y={H - 3} fill={winner.theme.deep} fontSize={PLOT.tickFont}>{winner.name} 승</text>
          <line x1={X0 + (phone ? 130 : 190)} y1={H - 8} x2={X0 + (phone ? 146 : 206)} y2={H - 8} stroke={loser.theme.deep} strokeWidth={3} filter={draw < 1 ? undefined : 'url(#rfGlowR)'} />
          <line x1={X0 + (phone ? 130 : 190)} y1={H - 8} x2={X0 + (phone ? 146 : 206)} y2={H - 8} stroke={loser.theme.main} strokeWidth={1.6} />
          <text x={X0 + (phone ? 152 : 212)} y={H - 3} fill={loser.theme.deep} fontSize={PLOT.tickFont}>{loser.name} 패</text>
          {model.anyEst ? <text x={X1} y={H - 3} textAnchor="end" fill={tone.textGhost} fontSize={PLOT.axisFont}>점선 = 표본 부족 · 어림</text> : null}
        </g>
      </svg>
    </div>
  )
}
