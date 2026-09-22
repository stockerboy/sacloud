'use client'

/**
 * ★상대전적 세트 승률 추이 (시즌 시간축)★ — 2026-09-11 사장님 (sleeper 참고)
 *
 *   X축   9/3 06:00 → 10/1 06:00 (4주 · 매일). 눈금은 9/3 · 9/17 · 10/1 셋.
 *   Y축   0~100% (우리 세트 승률 · 상대는 100 − 우리)
 *   출발  ★우리는 아래(0%)에서, 상대는 위(100%)에서 시작한다★ (사장님 2026-09-11 · sleeper 와 같다)
 *   선    경기 없는 날은 전날 값을 잇고, 꼭짓점은 짧은 수평 구간, 오르내리는 구간은 불규칙한 흔들림(모양만 · 값 불변)
 *
 * ★판 크기·선 두께·마커는 선수 추이 그래프(`TrendChartV3`)와 같은 값을 쓴다★
 * (사장님: «개인랭킹에도 같은 크기와 같은 시스템의 그래프를 똑같은 걸 사용한다»).
 * 두 파일이 같은 상수를 봐야 어긋나지 않는다 → `seasonPlot.ts` 한 곳에 있다.
 *
 * 옛 판(판 순서 X축)은 `ClanDetailV3` 의 `H2HChartLegacy` 로 남아 있다.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { V3, type V3Tone } from './tokens'
import { fitMarkUrl, hasFitMark, type ClanTheme } from './primitives'
import { DAY_MS, PLOT, SEASON_AXIS, type PlotAxis, noise, penDash, plotBox, pointAtLength, pointsToStr, seedOf, shapePoints, useDrawIn, valueAt } from './seasonPlot'

export interface H2HGame {
  /** 경기 시작 (ISO) */
  at: string
  /** 우리가 이겼나 */
  won: boolean
}

export function H2HChartV3({ games, theme, oppTheme, mineName, mineSlug, oppName, oppSlug, axis = SEASON_AXIS, tone = V3 }: {
  games: readonly H2HGame[]
  theme: ClanTheme
  oppTheme: ClanTheme
  mineName: string
  mineSlug: string | null
  oppName: string
  oppSlug: string | null
  /**
   * ★시간축★ — 안 넘기면 지금까지 쓰던 시즌 28일 축이다.
   * 「오늘의 상대전적」만 `dayAxis(from)` 을 넘겨 ★하루 창★ 을 그린다 (2026-09-22).
   * ★기본값이 옛 값이라 다른 화면은 한 픽셀도 안 바뀐다★ (`CLAUDE.md` 1-4).
   */
  axis?: PlotAxis
  /**
   * ★색판★ — 안 넘기면 지금 쓰는 흰 카드용이다.
   * 「오늘의 상대전적」만 `V3_DARK` 를 넘겨 ★옛 남색 판★ 으로 그린다 (2026-09-22 사장님:
   * 「흰색 UI로 변경되기 전 사용했던 기존 상대전적 그래프 카드의 디자인을 최대한 그대로」).
   * ★기본값이 지금 값이라 다른 화면은 한 픽셀도 안 바뀐다★ (`CLAUDE.md` 1-4).
   */
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
  const draw = useDrawIn(3600, oppSlug ?? oppName, boxRef)
  const box = plotBox(width)
  const { H, X0, X1, Y_TOP, Y_BOTTOM, phone } = box
  const yOf = (v: number) => Y_BOTTOM - (Math.max(0, Math.min(100, v)) / 100) * (Y_BOTTOM - Y_TOP)
  /* 축의 0 지점과 길이는 `axis` 가 정한다 — 기본값은 시즌 28일 */
  const span = axis.spanDays
  const dayOfAxis = (ms: number): number => (ms - axis.originMs) / DAY_MS
  const xOf = (t: number) => X0 + ((X1 - X0) * Math.max(0, Math.min(span, t))) / span

  const nowT = Math.max(0, Math.min(span, dayOfAxis(Date.now())))
  const { mine, played, endShare } = useMemo(() => {
    const sorted = [...games]
      .map((g) => ({ t: dayOfAxis(Date.parse(g.at)), won: g.won }))
      .filter((g) => Number.isFinite(g.t))
      .sort((a, b) => a.t - b.t)
    let w = 0
    let n = 0
    /* ★우리 선은 0% 에서 출발★ — 상대는 100 − 우리라 저절로 위에서 출발한다 */
    const pts: { t: number; v: number; w: number; n: number }[] = [{ t: 0, v: 0, w: 0, n: 0 }]
    for (const g of sorted) {
      n += 1
      if (g.won) w += 1
      pts.push({ t: Math.max(0, Math.min(span, g.t)), v: (w / n) * 100, w, n })
    }
    const last = pts[pts.length - 1]
    if (last && last.t < nowT) pts.push({ t: nowT, v: last.v, w: last.w, n: last.n })
    return { mine: pts, played: n, endShare: last?.v ?? 0 }
  }, [games, nowT, span, axis.originMs])

  const salt = seedOf(`${mineSlug ?? mineName}|${oppSlug ?? oppName}`)
  const minePts = shapePoints(mine, (p) => p.v, xOf, yOf, salt, noise)
  const oppPts = shapePoints(mine, (p) => 100 - p.v, xOf, yOf, salt + 7, noise)
  const mineLine = pointsToStr(minePts)
  const oppLine = pointsToStr(oppPts)
  /* 펜 끝 — 선 길이의 draw 지점 (2026-09-11 사장님) */
  const svgRef = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  /* 바를 잡아 옮기면 그 날짜의 값으로 마커가 따라온다 (2026-09-11 사장님: «클랜페이지에서 축 이동이 안 된다») */
  const pickAt = (clientX: number) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const x = ((clientX - rect.left) / rect.width) * width
    const t = ((x - X0) / (X1 - X0)) * span
    setHover(Math.max(0, Math.min(nowT, t)))
  }
  const drawing = draw < 1 && hover === null
  const mineTip = pointAtLength(minePts, draw)
  const oppTip = pointAtLength(oppPts, draw)
  const vOf = (y: number) => ((Y_BOTTOM - y) / (Y_BOTTOM - Y_TOP)) * 100
  const hoverShare = hover === null ? null : valueAt(mine, (p) => p.v, hover)
  const shownShare = hover !== null ? (hoverShare as number) : drawing ? vOf(mineTip[1]) : endShare
  const tipX = hover !== null ? xOf(hover) : drawing ? mineTip[0] : xOf(nowT)
  const endY = hover !== null ? yOf(shownShare) : drawing ? mineTip[1] : yOf(endShare)
  const oppEndY = hover !== null ? yOf(100 - shownShare) : drawing ? oppTip[1] : yOf(100 - endShare)
  const close = Math.abs(endY - oppEndY) < 52
  const nowX = tipX
  const R = PLOT.markerR
  const labelX = nowX + R + 10

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
          <filter id="h2hGlowB" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="7" result="b1" /><feGaussianBlur stdDeviation="16" result="b2" /><feMerge><feMergeNode in="b2" /><feMergeNode in="b1" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          <filter id="h2hGlowR" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="7" result="r1" /><feGaussianBlur stdDeviation="16" result="r2" /><feMerge><feMergeNode in="r2" /><feMergeNode in="r1" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        <rect x="0" y="0" width={width} height={H} fill={tone.plot} />
        {[0, 25, 50, 75, 100].map((g) => (
          <g key={g}>
            <line x1={X0} y1={yOf(g)} x2={X1} y2={yOf(g)} stroke={tone.cardBorder} />
            <text x={X0 - 7} y={yOf(g) + 4} textAnchor="end" fill={tone.textDim} fontSize={PLOT.axisFont}>{g}%</text>
          </g>
        ))}
        {axis.tickLabels.map(([t, label], k) => (
          <g key={label}>
            {k === 1 ? <line x1={xOf(t)} y1={Y_TOP} x2={xOf(t)} y2={Y_BOTTOM} stroke={tone.cardBorder} strokeDasharray="3 5" /> : null}
            <text x={xOf(t)} y={Y_BOTTOM + 26} textAnchor={k === 0 ? 'start' : k === 2 ? 'end' : 'middle'} fill={tone.textDim} fontSize={PLOT.tickFont}>{label}</text>
          </g>
        ))}
        <line x1={xOf(nowT)} y1={Y_TOP - 8} x2={xOf(nowT)} y2={Y_BOTTOM + 6} stroke={tone.cardBorder} />
        <text x={xOf(nowT)} y={Y_TOP - 12} textAnchor="middle" fill={tone.textMuted} fontSize={PLOT.tickFont} fontWeight="700">now</text>
        {played === 0 ? <text x={(X0 + X1) / 2} y={(Y_TOP + Y_BOTTOM) / 2} textAnchor="middle" fill={tone.textGhost} fontSize="13">승패를 아는 맞대결이 없습니다</text> : null}
        {mine.length > 1 ? (
          <g>
            <polyline points={oppLine} fill="none" stroke={oppTheme.deep} strokeWidth={PLOT.glowW} strokeLinejoin="round" strokeLinecap="round" filter={draw < 1 ? undefined : 'url(#h2hGlowR)'} opacity={0.5} {...penDash(draw)} />
            <polyline points={mineLine} fill="none" stroke={V3.blue} strokeWidth={PLOT.glowW} strokeLinejoin="round" strokeLinecap="round" filter={draw < 1 ? undefined : 'url(#h2hGlowB)'} opacity={0.55} {...penDash(draw)} />
            <polyline points={oppLine} fill="none" stroke={oppTheme.deep} strokeWidth={PLOT.midW} strokeLinejoin="round" strokeLinecap="round" opacity={0.42} {...penDash(draw)} />
            <polyline points={mineLine} fill="none" stroke="#7fa9ff" strokeWidth={PLOT.midW} strokeLinejoin="round" strokeLinecap="round" opacity={0.45} {...penDash(draw)} />
            <polyline points={oppLine} fill="none" stroke={oppTheme.main} strokeWidth={PLOT.coreW} strokeLinejoin="round" strokeLinecap="round" opacity={0.95} {...penDash(draw)} />
            <polyline points={mineLine} fill="none" stroke={tone === V3 ? "#1c2f6b" : "#bcd2ff"} strokeWidth={PLOT.coreW} strokeLinejoin="round" strokeLinecap="round" opacity={0.95} {...penDash(draw)} />
          </g>
        ) : null}
        {hover !== null ? (
          <g pointerEvents="none">
            <line x1={xOf(hover)} y1={Y_TOP - 6} x2={xOf(hover)} y2={Y_BOTTOM + 6} stroke="#0891b2" strokeWidth={1} opacity={0.7} />
            <text x={xOf(hover)} y={Y_BOTTOM + 26} textAnchor="middle" fill="#0891b2" fontSize={PLOT.tickFont}>
              {axis.formatAt(axis.originMs + hover * DAY_MS)}
            </text>
          </g>
        ) : null}
        {played > 0 ? (
          <g pointerEvents="none">
            <circle cx={nowX} cy={oppEndY} r={R + 4} fill="none" stroke={oppTheme.deep} strokeWidth={6} filter={draw < 1 ? undefined : 'url(#h2hGlowR)'} opacity={0.55} />
            <circle cx={nowX} cy={oppEndY} r={R} fill={tone.chip} stroke={oppTheme.main} strokeWidth={2} />
            {oppSlug && hasFitMark(oppSlug) ? <image href={fitMarkUrl(oppSlug)} x={nowX - R} y={oppEndY - R} width={R * 2} height={R * 2} clipPath={`circle(${R}px at ${R}px ${R}px)`} /> : null}
            <text x={labelX} y={oppEndY + (close ? 22 : 6)} fill={tone.textStrong} fontSize={PLOT.valueFont} fontWeight="700">{(100 - shownShare).toFixed(1)}%</text>
            <circle cx={nowX} cy={endY} r={R + 4} fill="none" stroke={V3.blue} strokeWidth={6} filter={draw < 1 ? undefined : 'url(#h2hGlowB)'} opacity={0.55} />
            <circle cx={nowX} cy={endY} r={R} fill={tone.chip} stroke="#7fa9ff" strokeWidth={2} />
            {mineSlug && hasFitMark(mineSlug) ? <image href={fitMarkUrl(mineSlug)} x={nowX - R} y={endY - R} width={R * 2} height={R * 2} clipPath={`circle(${R}px at ${R}px ${R}px)`} /> : null}
            <text x={labelX} y={endY + (close ? -14 : 6)} fill={tone.textStrong} fontSize={PLOT.valueFont} fontWeight="700">{shownShare.toFixed(1)}%</text>
          </g>
        ) : null}
        <g>
          <line x1={X0} y1={H - 8} x2={X0 + 16} y2={H - 8} stroke="#7fa9ff" strokeWidth={3} filter={draw < 1 ? undefined : 'url(#h2hGlowB)'} />
          <line x1={X0} y1={H - 8} x2={X0 + 16} y2={H - 8} stroke={tone === V3 ? "#1c2f6b" : "#bcd2ff"} strokeWidth={1.6} />
          <text x={X0 + 22} y={H - 3} fill={theme.deep} fontSize={PLOT.tickFont}>{mineName}</text>
          <line x1={X0 + (phone ? 130 : 190)} y1={H - 8} x2={X0 + (phone ? 146 : 206)} y2={H - 8} stroke={oppTheme.deep} strokeWidth={3} filter={draw < 1 ? undefined : 'url(#h2hGlowR)'} />
          <line x1={X0 + (phone ? 130 : 190)} y1={H - 8} x2={X0 + (phone ? 146 : 206)} y2={H - 8} stroke={oppTheme.main} strokeWidth={1.6} />
          <text x={X0 + (phone ? 152 : 212)} y={H - 3} fill={oppTheme.deep} fontSize={PLOT.tickFont}>{oppName}</text>
        </g>
      </svg>
    </div>
  )
}
