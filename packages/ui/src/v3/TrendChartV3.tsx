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
 *   - 끝 마커: 승률 = 클랜마크 원 · 킬뎃 = K/D 원 + 값. 바를 옮기면 그 날짜 값으로 따라온다.
 *     ★동그라미는 늘 제 선 위에 앉는다★ — 킬뎃 원은 빨간 선의 펜 끝을, 승률 원은 파란 선의
 *     펜 끝을 따른다 (2026-09-19 · 아래 «동그라미 자리» 주석에 실측값이 있다)
 *   - 탐색: 마우스 이동/드래그 · 손가락 드래그
 *   - 판은 카드 폭을 다 쓰고, 높이도 크게 (PC 520 · 폰은 폭에 맞춰)
 */
import { useEffect, useRef, useState } from 'react'
import type { PlayerTrendDay } from '@sacloud/contract'
import { fitMarkUrl, hasFitMark } from './primitives'
import { V3 } from './tokens'
import { PLOT, penDash, plotBox, pointAtLength, pointsToStr, useDrawIn } from './seasonPlot'

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

/** 그릴 점들 — 출발점(승률 100 · 킬뎃 0) + 날마다 경기 직후 값 + 하루 끝 값(전날 값 잇기) · 지금까지만 */
function buildSeries(days: readonly PlayerTrendDay[], mode: TrendMode): { pts: Pt[]; nowT: number } {
  /* ★킬뎃은 0 에서, 승률은 100 에서 출발★ (사장님 2026-09-11 · 상대전적 그래프와 같은 규칙) */
  const pts: Pt[] = [{ t: 0, wr: 100, kd: 0 }]
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

/**
 * ★그 x 에서 선이 지나는 y★ — 동그라미를 선 위에 앉히려고 잰다. 밖이면 `null`.
 *
 * 2026-09-19 사장님: «킬뎃뱃지가 그래프보다 더 앞서 나가거나 더 느리거나 이래»
 * 선은 흔들림(WIGGLE)이 얹힌 자리에 그려지는데 동그라미는 ★진짜 값★ 자리에 놓여서
 * 판 세로 304px 기준 최대 3.6px 어긋났다. 여기서 읽은 y 로 끌어당긴다.
 */
function yOnLine(pts: readonly (readonly [number, number])[], x: number): number | null {
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = pts[i] as readonly [number, number]
    const b = pts[i + 1] as readonly [number, number]
    const lo = Math.min(a[0], b[0])
    const hi = Math.max(a[0], b[0])
    if (x < lo - 1e-6 || x > hi + 1e-6) continue
    const f = b[0] === a[0] ? 0 : (x - a[0]) / (b[0] - a[0])
    return a[1] + (b[1] - a[1]) * f
  }
  return null
}

/**
 * ★킬데스를 안 주는 리그에서는 붉은 K/D 선을 안 그린다★ (2026-09-14 사장님).
 *   `showsKd` 기본값이 `true` 라 다른 리그 그래프는 한 픽셀도 안 바뀐다 (`CLAUDE.md` 1-4).
 *   값 계산(`kdPts`)은 그대로 돈다 — 지우면 두 선을 떼어 놓는 눈금(`lblGap`)이 어긋난다.
 */
export function TrendChartV3({ days, mode, markSlug, winLabel, kdLabel, seed = '', showsKd = true }: { days: readonly PlayerTrendDay[]; mode: TrendMode; markSlug: string | null; winLabel: string; kdLabel: string; seed?: string; showsKd?: boolean }) {
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
  /* 판 크기·선 두께·마커는 상대전적 그래프와 ★같은 자★ 를 쓴다 (seasonPlot.ts · 2026-09-11 사장님) */
  const { H, X0, X1, Y_TOP, Y_BOTTOM } = plotBox(width)
  /* DAY/누적을 누를 때마다, 화면에 다시 들어올 때마다 다시 그린다 (2026-09-11 사장님) */
  const draw = useDrawIn(3600, mode, boxRef)
  const yOf = (v: number) => Y_BOTTOM - (Math.max(0, Math.min(100, v)) / 100) * (Y_BOTTOM - Y_TOP)
  const span = Math.max(1, days.length - 1) /* 28 */
  const xOf = (t: number) => X0 + ((X1 - X0) * t) / span
  const { pts, nowT } = buildSeries(days, mode)
  const s0 = seedOf(seed)

  /* 구간마다 잘게 쪼개 «수평 유지 → 이동» 으로 각지게 그리고, 잔잔한 흔들림을 얹는다 (모양만) */
  const shapedPts = (pick: (p: Pt) => number, salt: number): [number, number][] => {
    const out: [number, number][] = []
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
        out.push([xa + (xb - xa) * f, yOf(base + w)])
        k += 1
      }
    }
    const end = pts[pts.length - 1] as Pt
    out.push([xOf(end.t), yOf(pick(end))])
    return out
  }
  const wrPts = shapedPts((p) => p.wr, 11)
  const kdPts = shapedPts((p) => p.kd, 23)
  const wrLine = pointsToStr(wrPts)
  const kdLine = pointsToStr(kdPts)
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
      ? { t: 0, wr: 100, kd: 0 }
      : hoverDay
        ? { t: Math.min(hover, end.t), wr: mode === 'day' ? hoverDay.win_rate : hoverDay.cum_win_rate, kd: mode === 'day' ? hoverDay.kd : hoverDay.cum_kd }
        : end
  /* 두 끝 마커 글자가 가까우면(승률·킬뎃 비슷) 위·아래로 벌린다 — 폰에서 «66.7%»«60.3%» 가 겹쳤다 (QA 회차 7) */
  /* 그리는 중에는 마커가 ★선 끝★ 에 붙어 같이 간다 (2026-09-11 사장님 영상) */
  const drawing = draw < 1 && hover === null
  /* 펜 끝 — 선 길이의 draw 지점. 화면 좌표라 값으로 되돌려 읽는다 */
  const vOf = (y: number) => ((Y_BOTTOM - y) / (Y_BOTTOM - Y_TOP)) * 100
  const wrTip = pointAtLength(wrPts, draw)
  const kdTip = pointAtLength(kdPts, draw)
  const shown = drawing
    ? { t: 0, wr: vOf(wrTip[1]), kd: vOf(kdTip[1]) }
    : last

  /*
   * ★동그라미 자리★ — 2026-09-19 사장님: «킬뎃뱃지가 그래프보다 더 앞서 나가거나 더 느리거나 이래»
   *
   * ── 무엇이 어긋났나 (실측 · PC 폭 1088 · 판 세로 304px)
   *   ① ★그리는 중★ — 킬뎃 동그라미의 x 를 ★승률 선★ 의 펜 끝(`wrTip[0]`)에서 가져왔다.
   *      두 선은 ★길이가 다르다.★ `penDash` 는 길이 비율로 선을 내보내므로 같은 `draw` 에서도
   *      파란 펜 끝과 빨간 펜 끝의 x 가 다르다. 재 보니 draw=0.40 에서 ★Δx = 152px★ —
   *      배지가 빨간 선 끝보다 그만큼 뒤처져 있었다 (draw 0.20 → 93px · 0.60 → 101px · 0.95 → 15px).
   *      그래서 «앞서 나가거나 느리거나» 로 보인다.
   *   ② ★탐색(hover)★ — 동그라미는 진짜 값 자리인데 선에는 흔들림(WIGGLE 1.2%)이 얹혀 있어
   *      최대 3.6px 떴다 (측정: 승률 3.6px · 킬뎃 2.9px).
   *
   * ── 지금 규칙
   *   ① 킬뎃 동그라미는 ★제 선(kdPts)의 펜 끝★ 을 쓴다
   *   ② 다 그린 뒤에는 ★그 x 에서 선이 지나는 y★ 로 끌어당긴다. 단 ★흔들림 폭 안에서만★ —
   *      그보다 멀면 값이 진짜로 다른 것이니 건드리지 않는다 (값을 지어내지 않는다)
   *
   * ⚠ ★옛 판★ 은 지우지 않는다 (`CLAUDE.md` 1-4). 아래 `V1` 주석이 그때 쓰던 식이다.
   *     const kdCxV1 = drawing ? wrTip[0] : xOf(shown.t)   // 킬뎃 x 를 ★승률★ 펜 끝에서 가져왔다
   *     const wrCyV1 = drawing ? wrTip[1] : yOf(shown.wr)  // 선이 아니라 값 자리에 두었다
   *     const kdCyV1 = drawing ? kdTip[1] : yOf(shown.kd)
   */
  /** 흔들림이 만드는 세로 흔들림 폭(px) — 이 안쪽이면 «같은 자리» 로 본다 */
  const wiggleY = (WIGGLE / 100) * (Y_BOTTOM - Y_TOP)
  const snapY = (pts: readonly (readonly [number, number])[], x: number, trueY: number): number => {
    const onLine = yOnLine(pts, x)
    return onLine !== null && Math.abs(onLine - trueY) <= wiggleY + 0.5 ? onLine : trueY
  }
  const wrCx = drawing ? wrTip[0] : xOf(shown.t)
  const wrCy = drawing ? wrTip[1] : snapY(wrPts, wrCx, yOf(shown.wr))
  const kdCx = drawing ? kdTip[0] : xOf(shown.t)
  const kdCy = drawing ? kdTip[1] : snapY(kdPts, kdCx, yOf(shown.kd))

  const lblGap = kdCy - wrCy
  const lblNeed = 46
  /* 두 배지가 ★가로로도 겹칠 때만★ 위·아래로 벌린다 — 이제 그리는 중엔 x 가 서로 다를 수 있다.
     (옛 판은 x 가 늘 같다고 보고 세로 간격만 봤다 — 그래서 멀리 떨어진 배지도 덩달아 밀렸다) */
  const lblOverlapX = Math.abs(kdCx - wrCx) < PLOT.markerR * 2 + 60
  const wrShift = lblOverlapX && Math.abs(lblGap) < lblNeed ? (lblGap >= 0 ? -(lblNeed - lblGap) / 2 : (lblNeed + lblGap) / 2) : 0
  const kdShift = -wrShift
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
        <text x={(X0 + X1) / 2} y={H / 2} textAnchor="middle" fontSize="62" fontWeight="900" fill="#124a56" opacity="0.05" letterSpacing="6">CLOUD 0</text>
        {[0, 20, 40, 60, 80, 100].map((g) => (
          <g key={g}>
            <line x1={X0} y1={yOf(g)} x2={X1} y2={yOf(g)} stroke="#eef0f5" />
            <text x={X0 - 8} y={yOf(g) + 4} textAnchor="end" fill={V3.textDim} fontSize={PLOT.axisFont}>{g}</text>
          </g>
        ))}
        {ticks.map((i, k) => (
          <g key={i}>
            {k === 1 ? <line x1={xOf(i)} y1={Y_TOP} x2={xOf(i)} y2={Y_BOTTOM} stroke="#eef0f5" strokeDasharray="3 5" /> : null}
            <text x={xOf(i)} y={Y_BOTTOM + 26} textAnchor={k === 0 ? 'start' : k === 2 ? 'end' : 'middle'} fill={V3.textDim} fontSize={PLOT.tickFont}>{days[i]?.label ?? ''}</text>
          </g>
        ))}
        {days.length > 0 ? (
          <>
            <line x1={xOf(nowT)} y1={Y_TOP - 8} x2={xOf(nowT)} y2={Y_BOTTOM + 6} stroke="#e3e6ee" />
            <text x={xOf(nowT)} y={Y_TOP - 12} textAnchor="middle" fill="#5c6479" fontSize={PLOT.tickFont} fontWeight="700">today</text>
          </>
        ) : null}
        {pts.length > 1 ? (
          <g>
            <polyline points={wrLine} fill="none" stroke={V3.blue} strokeWidth={PLOT.glowW} strokeLinejoin="round" strokeLinecap="round" filter={draw < 1 ? undefined : 'url(#trendGlow)'} {...penDash(draw)} opacity={0.42} />
            <polyline points={wrLine} fill="none" stroke="#7fa9ff" strokeWidth={PLOT.midW} strokeLinejoin="round" strokeLinecap="round" opacity={0.45} {...penDash(draw)} />
            <polyline points={wrLine} fill="none" stroke="#1c2f6b" strokeWidth={PLOT.coreW} strokeLinejoin="round" strokeLinecap="round" opacity={0.95} {...penDash(draw)} />
            {showsKd ? (<>
            <polyline points={kdLine} fill="none" stroke={V3.red} strokeWidth={PLOT.glowW} strokeLinejoin="round" strokeLinecap="round" filter={draw < 1 ? undefined : 'url(#trendGlow)'} {...penDash(draw)} opacity={0.5} />
            <polyline points={kdLine} fill="none" stroke="#ff5a63" strokeWidth={PLOT.midW} strokeLinejoin="round" strokeLinecap="round" opacity={0.45} {...penDash(draw)} />
            <polyline points={kdLine} fill="none" stroke="#c81e28" strokeWidth={PLOT.coreW} strokeLinejoin="round" strokeLinecap="round" opacity={0.95} {...penDash(draw)} />
            </>) : null}
          </g>
        ) : null}
        {hover !== null && hoverX !== null ? (
          <line x1={hoverX} y1={Y_TOP - 6} x2={hoverX} y2={Y_BOTTOM + 6} stroke="#0891b2" strokeWidth={1} opacity={0.7} pointerEvents="none" />
        ) : null}
        {days.length > 0 ? (
          <g pointerEvents="none">
            <circle cx={wrCx} cy={wrCy} r={PLOT.markerR + 4} fill="none" stroke={V3.blue} strokeWidth={6} filter="url(#trendGlow)" opacity={0.55} />
            <circle cx={wrCx} cy={wrCy} r={PLOT.markerR} fill={V3.chip} stroke="#7fa9ff" strokeWidth={2} />
            {markSlug && hasFitMark(markSlug) ? (
              <image href={fitMarkUrl(markSlug)} x={wrCx - PLOT.markerR} y={wrCy - PLOT.markerR} width={PLOT.markerR * 2} height={PLOT.markerR * 2} clipPath={`circle(${PLOT.markerR}px at ${PLOT.markerR}px ${PLOT.markerR}px)`} />
            ) : null}
            <text x={wrCx + PLOT.markerR + 8} y={wrCy + 5 + wrShift} textAnchor="start" fill="#1c2f6b" fontSize={PLOT.valueFont} fontWeight="700">{shown.wr.toFixed(1)}%</text>
            <text x={wrCx + PLOT.markerR + 8} y={wrCy + 20 + wrShift} textAnchor="start" fill="#5c6479" fontSize="10" fontWeight="700">{drawing ? '' : hover === null ? winLabel : hoverDay ? `${hoverDay.label} 마감 · ${mode === 'day' ? `${hoverDay.win}승 ${hoverDay.lose}패` : `누적 ${hoverDay.cum_games}판`}` : '9/3 출발'}</text>
            {showsKd ? (<>
            <circle cx={kdCx} cy={kdCy} r={PLOT.markerR + 4} fill="none" stroke={V3.red} strokeWidth={6} filter="url(#trendGlow)" opacity={0.5} />
            <circle cx={kdCx} cy={kdCy} r={PLOT.markerR} fill={V3.chip} stroke="#ff5a63" strokeWidth={2} />
            <text x={kdCx} y={kdCy + 4} textAnchor="middle" fill="#c81e28" fontSize="10" fontWeight="700">K/D</text>
            <text x={kdCx + PLOT.markerR + 8} y={kdCy + 5 + kdShift} textAnchor="start" fill="#c81e28" fontSize={PLOT.valueFont} fontWeight="700">{shown.kd.toFixed(1)}%</text>
            <text x={kdCx + PLOT.markerR + 8} y={kdCy + 20 + kdShift} textAnchor="start" fill="#b3555c" fontSize="10" fontWeight="700">{drawing ? '' : hover === null ? kdLabel : hoverDay ? `${hoverDay.label} 마감 · ${mode === 'day' ? `${hoverDay.kill}킬 ${hoverDay.death}데스` : ''}` : '9/3 출발'}</text>
            </>) : null}
          </g>
        ) : null}
      </svg>
    </div>
  )
}
