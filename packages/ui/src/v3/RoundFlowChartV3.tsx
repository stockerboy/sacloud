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
import { matchOddsInRound, roundOddsPlain, roundOddsSided, scoreOdds } from '@sacloud/contract'
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
  /** 이긴 클랜의 값 (0~100) — AXIS 가 'match' 면 경기 승률 · 'round' 면 이 라운드를 딸 확률 */
  v: number
  round: number
  aliveW: number
  aliveL: number
  /** 이 시점의 라운드 스코어 (이긴 클랜 : 진 클랜) */
  scoreW: number
  scoreL: number
  /** 이 라운드에서 처음 죽은 사람 — 아직 아무도 안 죽었으면 null (사장님 「원 하나가 줄어들 때 띄워줘」) */
  first: { name: string | null; side: 'W' | 'L'; at: number } | null
  /** 이 시점까지 이 라운드에서 죽은 사람들 — 죽은 차례대로 (사장님 「선짤 준성 · haeil 다운 · …」) */
  fallen: { name: string | null; side: 'W' | 'L'; at: number }[]
  est: boolean
}

/*
 * ★가로축★ (2026-09-23 낮 · 사장님: 「A-1로 가자 확정」)
 *   'real'    경기 전체를 실제 시간 그대로 — 긴 라운드는 길게. 전후반 선은 실제 바뀐 자리
 *   'halves'  전반 왼쪽 반 · 후반 오른쪽 반 (반 안에서만 시간 비례) — 처음 판. 남긴다 (CLAUDE.md 1-4)
 */
const X_AXIS: 'real' | 'halves' = 'real'

/*
 * ★세로축★ (2026-09-23 낮 · 사장님: 시안 5개 중 「시안 2 가 좋은데」)
 *   'match'  이 경기를 이길 확률 — 스코어 빈도표 × 인원 빈도표 (`matchOddsInRound`). sleeper 와 같은 축
 *   'round'  이 라운드를 딸 확률 — 첫 답(회의 ①)이었다. 옛 판으로 남긴다 (CLAUDE.md 1-4)
 */
const AXIS: 'match' | 'round' = 'match'

/*
 * ★2026-09-23 낮 — 「깔끔하게」 (사장님: 「그래프 가독성이 너무 떨어져 오른쪽 사진(sleeper)처럼 깔끔하면 좋겠어」).
 *   1차는 상대전적 그래프의 굵은 광선·흔들림·점선을 그대로 썼고, 라운드가 끝날 때마다 100/0 으로 튀어
 *   빗살 무늬가 됐다 (사장님 폰 캡쳐). 옛 모양은 아래 스위치로 남긴다 (CLAUDE.md 1-4) — 지금은 전부 끔.
 *     START_AT_EDGES     경기 시작에 위/아래(100/0)에서 출발
 *     JUMP_ON_ROUND_END  라운드가 끝나면 딴 쪽 100 · 진 쪽 0 으로 튐 → 지금은 마지막 인원 상태 값을 그대로 둔다
 *                        (딴 쪽이 살아남은 쪽이라 저절로 위에 있다 — 사장님 「그래프가 블루팀보다 위에 있고」 는 그대로 참)
 *     GLOW               14px 광선 + 8px 중간선 (상대전적과 같은 세 겹)
 *     WIGGLE             흔들림 폭
 *     DASH_ESTIMATED     어림 구간 점선 → 지금은 아래 각주 한 줄로만 말한다
 */
const START_AT_EDGES = false
const JUMP_ON_ROUND_END = false
const GLOW = false
const WIGGLE = 0
const DASH_ESTIMATED = false
/** 3.6초 긋기 애니메이션 — 폰에서 중간에 멈춘 채 남아 껐다 (2026-09-23 사장님) */
const DRAW_IN = false
/** 진 팀 선을 클랜 테마 색으로 (지금은 빨강 고정) */
const LOSER_CLAN_COLOR = false
/** 깔끔한 판의 선 두께 (sleeper 참고) */
const CLEAN_W = 2.6

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
    /* ⚠ 폭이 0 으로 재지면(아직 안 보이는 순간) 값을 안 바꾼다 — 320 으로 떨어지면 ★폰 판★ 으로 그려져
       PC 에서 그래프가 한 뼘짜리가 됐다 (운영 캡쳐 · 라운드 홀수만 찍힌 것이 증거) */
    const update = () => {
      const w = Math.round(el.getBoundingClientRect().width)
      if (w > 0) setWidth(Math.max(320, w))
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  /*
   * ★그려지는 애니메이션을 끈다★ (2026-09-23 · 사장님 폰 캡쳐: 선이 3라운드에서 끊겨 보였다 —
   *   「몇 라운드를 했든 이 그래프 공간은 처음부터 끝까지 다 써라」).
   *   상대전적 그래프의 `useDrawIn` 은 화면에 보일 때 3.6초에 걸쳐 긋는데, 폰에서 접혀 있다 펼쳐지는
   *   이 자리에서는 중간에 멈춘 채 남았다. 경기는 끝난 것이니 처음부터 끝까지 한 번에 그린다.
   *   옛 판(애니메이션)은 DRAW_IN 을 true 로.
   */
  const drawIn = useDrawIn(3600, `${winner.slug ?? winner.name}|${flow.rounds.length}`, boxRef)
  const draw = DRAW_IN ? drawIn : 1
  const box = plotBox(width)
  /* ⚠ 2026-09-23 낮 — 사장님: 「이 공간을 남기지 말고 다 쓰라는거임」. 옛 판은 마커 옆 「94%」 자리로 오른쪽 58~66px 을 비웠다.
     이제 판을 오른쪽 끝까지 쓰고, 마커는 선 끝에 얹고 % 는 마커 ★위/아래★ 에 적는다. 옛 값: box.X1 - (phone ? 58 : 66) */
  const { H, X0, Y_TOP, Y_BOTTOM, phone } = box
  const X1 = box.X1 - (phone ? 16 : 18)
  const yOf = (v: number) => Y_BOTTOM - (Math.max(0, Math.min(100, v)) / 100) * (Y_BOTTOM - Y_TOP)

  const model = useMemo(() => {
    const rounds = [...flow.rounds].sort((a, b) => a.round - b.round)
    const s = flow.second_half_from
    const first = s === null ? rounds : rounds.filter((r) => r.round < s)
    const second = s === null ? [] : rounds.filter((r) => r.round >= s)
    const twoHalves = first.length > 0 && second.length > 0
    /* 전반은 0초(경기 시작)부터 · 후반은 첫 후반 라운드 시작부터 */
    const spanA: [number, number] = [0, Math.max(1, (first[first.length - 1] ?? rounds[rounds.length - 1])?.end ?? 1)]
    const spanB: [number, number] = twoHalves ? [(second[0] as (typeof second)[number]).start, Math.max((second[0] as (typeof second)[number]).start + 1, (second[second.length - 1] as (typeof second)[number]).end)] : [0, 1]
    /* 실제 시간 축 — 0초부터 마지막 라운드 끝까지 한 자로 */
    const tEnd = Math.max(1, (rounds[rounds.length - 1] as (typeof rounds)[number]).end)
    const xReal = (t: number): number => X0 + ((X1 - X0) * Math.max(0, Math.min(tEnd, t))) / tEnd
    /* 전후반 선 — 'real' 이면 마지막 전반 라운드 끝과 첫 후반 라운드 시작의 가운데(실제 자리) · 'halves' 면 판 가운데 */
    const XM = X_AXIS === 'real'
      ? (twoHalves ? xReal((spanA[1] + spanB[0]) / 2) : X1)
      : (X0 + X1) / 2
    const xOf = (t: number, half: 'A' | 'B'): number => {
      if (X_AXIS === 'real') return xReal(t)
      if (!twoHalves) return X0 + ((X1 - X0) * (t - spanA[0])) / (spanA[1] - spanA[0])
      if (half === 'A') return X0 + ((XM - X0) * (t - spanA[0])) / (spanA[1] - spanA[0])
      return XM + ((X1 - XM) * (t - spanB[0])) / (spanB[1] - spanB[0])
    }
    const W = winner.side
    const L = loser.side
    const sizeW = flow.team_size[W]
    const sizeL = flow.team_size[L]
    const pts: Pt[] = []
    /* 라운드 칸 — 시작·끝 x · 딴 팀 · 첫 희생 자리 (위 띠 · × 표 · 아래 번호에 쓴다) */
    const ticks: { x: number; x1: number; round: number; winner: 'W' | 'L' | null; firstX: number | null; firstSide: 'W' | 'L' | null }[] = []
    let anyEst = false
    let scoreW = 0
    let scoreL = 0
    /* 출발 — 옛 판은 이긴 클랜이 아래(0)에서 (상대전적 그래프와 같다). 지금은 1라운드 값에서 바로 시작 */
    if (START_AT_EDGES) pts.push({ x: xOf(0, 'A'), v: 0, round: 0, aliveW: sizeW, aliveL: sizeL, scoreW, scoreL, first: null, fallen: [], est: false })
    for (const r of rounds) {
      const half: 'A' | 'B' = s !== null && r.round >= s ? 'B' : 'A'
      const halfKey: 'first' | 'second' = half === 'A' ? 'first' : 'second'
      let aliveW = sizeW
      let aliveL = sizeL
      /* 이 라운드를 딸 확률 — 인원 빈도표 */
      const roundOdds = (): { p: number; est: boolean } => {
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
      /* 축이 정하는 값 — 경기 승률이면 스코어 빈도표와 섞는다 */
      const odds = (): { p: number; est: boolean } => {
        const ro = roundOdds()
        if (AXIS === 'round') return ro
        const mo = matchOddsInRound(scoreW, scoreL, ro.p, halfKey)
        return { p: mo.p, est: ro.est || mo.estimated }
      }
      const firstDeath = r.deaths[0]
      ticks.push({
        x: xOf(r.start, half),
        x1: xOf(r.end, half),
        round: r.round,
        winner: r.winner === W ? 'W' : r.winner === L ? 'L' : null,
        firstX: firstDeath ? xOf(Math.min(firstDeath.at, r.end), half) : null,
        firstSide: firstDeath ? (firstDeath.side === W ? 'W' : 'L') : null,
      })
      let o = odds()
      anyEst = anyEst || o.est
      let firstSeen: Pt['first'] = null
      let fallen: Pt['fallen'] = []
      pts.push({ x: xOf(r.start, half), v: o.p * 100, round: r.round, aliveW, aliveL, scoreW, scoreL, first: null, fallen, est: o.est })
      for (const d of r.deaths) {
        if (d.side === W) aliveW = Math.max(0, aliveW - 1)
        else aliveL = Math.max(0, aliveL - 1)
        if (firstSeen === null) firstSeen = { name: d.name, side: d.side === W ? 'W' : 'L', at: d.at }
        fallen = [...fallen, { name: d.name, side: d.side === W ? 'W' : 'L', at: d.at }]
        /* 한쪽이 0 이 되는 마지막 죽음은 안 찍는다 — 그 순간 확률이 100/0 으로 튀어 빗살이 된다 (운영 캡쳐).
           라운드가 끝난 것이라 「마지막 인원 상태 값」 을 그대로 끌고 간다 (JUMP_ON_ROUND_END 와 같은 뜻) */
        if (aliveW === 0 || aliveL === 0) break
        o = odds()
        anyEst = anyEst || o.est
        const x = xOf(Math.min(d.at, r.end), half)
        /* 계단 — 죽기 직전까지는 앞 값 그대로 */
        const prev = pts[pts.length - 1] as Pt
        pts.push({ ...prev, x: Math.max(prev.x, x - 0.01) })
        pts.push({ x, v: o.p * 100, round: r.round, aliveW, aliveL, scoreW, scoreL, first: firstSeen, fallen, est: o.est })
      }
      {
        /* 라운드 끝 — 마지막 상태 값을 라운드 끝까지 끌고 간다. 옛 판(JUMP_ON_ROUND_END)은 여기서 100/0 으로 튀었다 */
        const prev = pts[pts.length - 1] as Pt
        const x = xOf(r.end, half)
        pts.push({ ...prev, x: Math.max(prev.x, x - 0.01), first: firstSeen, fallen })
        if (JUMP_ON_ROUND_END && r.winner !== null) pts.push({ x, v: r.winner === W ? 100 : 0, round: r.round, aliveW, aliveL, scoreW, scoreL, first: firstSeen, fallen, est: false })
      }
      if (r.winner === W) scoreW += 1
      else if (r.winner === L) scoreL += 1
    }
    /* 경기 끝 — 최종 스코어의 경기 승률 (이긴 쪽이 1 에 가깝다) */
    if (AXIS === 'match' && pts.length > 0) {
      const so = scoreOdds(scoreW, scoreL, s !== null && second.length > 0 ? 'second' : 'first')
      const prev = pts[pts.length - 1] as Pt
      pts.push({ ...prev, v: so.p * 100, scoreW, scoreL, est: so.estimated })
      anyEst = anyEst || so.estimated
    }
    /* 전후반 요약 — 사장님 형식 「더법(선레드) 4라운드 1설」 */
    const summary = (list: typeof rounds) => {
      const won = { W: 0, L: 0 }
      const planted = { W: 0, L: 0 }
      let defW = 0
      let defL = 0
      for (const r of list) {
        if (r.winner === W) won.W += 1
        else if (r.winner === L) won.L += 1
        if (r.planted === W) planted.W += 1
        else if (r.planted === L) planted.L += 1
        if (r.defence === W) defW += 1
        else if (r.defence === L) defL += 1
      }
      const attack: 'W' | 'L' | null = defW > defL ? 'L' : defL > defW ? 'W' : null
      return { rounds: list.length, won, planted, attack }
    }
    return { pts, ticks, twoHalves, XM, anyEst, rounds, first: summary(first), second: summary(second), scoreW, scoreL }
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
  /* ★인원 줄★ (시안 A · 사장님 「인원 우위가 어케 됐는지도 축 이동하면서」) — 축이 없으면 마지막 상태 */
  const hud: Pt | null = hoverPt ?? last ?? null
  const sizeW = flow.team_size[winner.side]
  const sizeL = flow.team_size[loser.side]
  const endW = last ? last.v : 50
  const R = PLOT.markerR
  const nowX = last ? last.x : X1
  const close = Math.abs(yOf(endW) - yOf(100 - endW)) < 52
  /* 값이 같으면(50:50) 원 두 개가 포개진다 → 이긴 쪽 위·진 쪽 아래로 R 만큼 */
  const tie = Math.abs(endW - 50) < 0.5
  const wAbove = yOf(endW) <= yOf(100 - endW)
  void close
  /* % 글자 — 마커 위(이긴 쪽)·아래(진 쪽). 옛 판은 마커 오른쪽 */
  const labelX = nowX
  const winInk = GLOW ? (tone === V3 ? '#1c2f6b' : '#bcd2ff') : '#8fb4ff'
  /* 진 팀 색 — 육각형·위 범례와 같이 ★빨강★ 으로 고정한다. 클랜 테마(afterpray 파랑 · latency 회색)를 쓰니
     두 선이 같은 색이거나 회색이 됐다 (운영 QA 4경기). 옛 판은 LOSER_CLAN_COLOR */
  const loseInk = LOSER_CLAN_COLOR ? loser.theme.main : '#ff6b6b'
  /* 옛 판은 폰에서 홀수 라운드만 적었다(`every`). 지금은 매 라운드 — 좁으면 엇갈려 적는다 (사장님) */

  const dots = (n: number, total: number, color: string) => (
    <span style={{ display: 'inline-flex', gap: 3, verticalAlign: 'middle', margin: '0 5px' }}>
      {Array.from({ length: total }, (_, i) => (
        <i key={i} style={{ width: 10, height: 10, borderRadius: '50%', border: `1.5px solid ${color}`, background: i < n ? color : 'transparent', opacity: i < n ? 1 : 0.35, display: 'inline-block' }} />
      ))}
    </span>
  )
  const sideWord = (half: 'first' | 'second', team: 'W' | 'L', attack: 'W' | 'L' | null): string => {
    if (attack === null) return ''
    const isAttack = team === attack
    return half === 'first' ? (isAttack ? '선레드' : '선블루') : isAttack ? '레드' : '블루'
  }
  const halfRow = (label: string, sum: { rounds: number; won: { W: number; L: number }; planted: { W: number; L: number }; attack: 'W' | 'L' | null }, half: 'first' | 'second') => (
    <div style={{ padding: '8px 12px', minWidth: 0 }}>
      <div style={{ fontSize: 10.5, color: tone.textDim, letterSpacing: '.06em', marginBottom: 3 }}>{label} · {sum.rounds}라운드</div>
      {([['W', winner, winInk], ['L', loser, loseInk]] as const).map(([k, team, color]) => (
        <div key={k} style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 12.5, padding: '1px 0', minWidth: 0 }}>
          <span style={{ fontWeight: 700, color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{team.name}</span>
          <span style={{ fontSize: 10.5, color: tone.textDim, whiteSpace: 'nowrap' }}>{sideWord(half, k, sum.attack) ? `(${sideWord(half, k, sum.attack)})` : ''}</span>
          <span style={{ marginLeft: 'auto', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
            <b style={{ color: tone.textStrong, fontSize: 14 }}>{sum.won[k]}</b>라운드
            {/* 설점 — 해체로 블루도 가져간다 (사장님 규칙) → 0 이어도 적는다 */}
            {' '}<b style={{ color: tone.textStrong, fontSize: 14 }}>{sum.planted[k]}</b>설
          </span>
        </div>
      ))}
    </div>
  )

  return (
    <div ref={boxRef} style={{ padding: '6px 8px 8px', background: tone.plot }}>
      {/* ★전후반 요약★ — 라운드 수 · 설치 수 · 진영 (2026-09-23 사장님) */}
      {/* 후반이 없는 경기(5:0)는 한 칸만 — 빈 칸을 남기지 않는다 (운영 QA) */}
      <div style={{ display: 'grid', gridTemplateColumns: phone || model.second.rounds === 0 ? '1fr' : '1fr 1fr', gap: 1, background: tone.cardBorder, border: `1px solid ${tone.cardBorder}`, marginBottom: 6 }}>
        <div style={{ background: tone.plot }}>{halfRow('전반', model.first, 'first')}</div>
        {model.second.rounds > 0 ? <div style={{ background: tone.plot }}>{halfRow('후반', model.second, 'second')}</div> : null}
      </div>
      {/* ★인원 줄★ — 축을 옮기면 따라온다 (시안 A) */}
      {hud ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 12.5, padding: '4px 6px 6px', minHeight: 26 }}>
          <span style={{ color: tone.textDim }}>{hud.round === 0 ? '시작' : `${hud.round}라운드`}</span>
          <span style={{ fontWeight: 800, color: tone.textStrong, fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{hud.scoreW} : {hud.scoreL}</span>
          <span style={{ color: winInk, whiteSpace: 'nowrap' }}>{phone ? '' : winner.name}{dots(hud.aliveW, sizeW, winInk)}<b>{hud.aliveW}</b></span>
          <span style={{ color: loseInk, whiteSpace: 'nowrap' }}>{phone ? '' : loser.name}{dots(hud.aliveL, sizeL, loseInk)}<b>{hud.aliveL}</b></span>
          <span style={{ marginLeft: 'auto', color: tone.textDim, fontVariantNumeric: 'tabular-nums' }}>{hud.v.toFixed(0)}% : {(100 - hud.v).toFixed(0)}%{hud.est ? ' · 어림' : ''}</span>
        </div>
      ) : null}
      {/* ★죽은 차례★ — 축을 옮길 때마다 그 라운드에서 지금까지 죽은 사람을 차례대로
          (사장님 2026-09-23: 「처음 죽은 사람은 선짤 준성 · 그 다음 haeil 다운 · enanthate 다운 …」). 옛 판은 첫 희생만 적었다 */}
      {hud ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12.5, padding: '0 6px 8px', minHeight: 20 }}>
          {hud.fallen.length === 0 ? (
            <span style={{ color: tone.textGhost }}>{hud.round > 0 ? '아직 아무도 안 죽음' : ''}</span>
          ) : hud.fallen.map((f, i) => (
            <span key={i} style={{ whiteSpace: 'nowrap' }}>
              <span style={{ color: i === 0 ? '#f59e0b' : tone.textDim, fontWeight: i === 0 ? 700 : 400 }}>{i === 0 ? '선짤 ' : ''}</span>
              <span style={{ color: f.side === 'W' ? winInk : loseInk, fontWeight: 700 }}>{f.name ?? '—'}</span>
              <span style={{ color: tone.textDim }}>{i === 0 ? '' : ' 다운'}</span>
              {i < hud.fallen.length - 1 ? <span style={{ color: tone.textGhost, marginLeft: 8 }}>·</span> : null}
            </span>
          ))}
        </div>
      ) : null}
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
        {/* 라운드 칸 — 경계 점선 · 위 띠(딴 팀) · × (첫 희생 자리) · 아래 번호는 ★매 라운드★ (좁으면 위아래 엇갈림) */}
        {(() => {
          let lastX = -99
          let stagger = 0
          return model.ticks.map((t) => {
            const cx = (t.x + t.x1) / 2
            const tight = cx - lastX < (phone ? 16 : 22)
            stagger = tight ? 1 - stagger : 0
            lastX = cx
            return (
              <g key={t.round}>
                <line x1={t.x} y1={Y_TOP} x2={t.x} y2={Y_BOTTOM} stroke={tone.cardBorder} strokeDasharray="3 5" />
                {t.winner ? <rect x={t.x} y={Y_TOP - 9} width={Math.max(1, t.x1 - t.x)} height={4} fill={t.winner === 'W' ? winInk : loseInk} opacity={0.7} /> : null}
                {t.firstX !== null ? <text x={t.firstX} y={Y_TOP + 4} textAnchor="middle" fill={t.firstSide === 'W' ? winInk : loseInk} fontSize={9} opacity={0.85}>×</text> : null}
                <text x={cx} y={Y_BOTTOM + (phone ? 20 : 24) + stagger * (phone ? 11 : 12)} textAnchor="middle" fill={tone.textDim} fontSize={phone ? 10.5 : PLOT.axisFont}>{t.round}</text>
              </g>
            )
          })
        })()}
        {/* 전후반 경계 — 굵은 선 하나 (사장님). 'real' 축이면 실제 바뀐 자리 */}
        {model.twoHalves ? (
          <g>
            <line x1={model.XM} y1={Y_TOP - 14} x2={model.XM} y2={Y_BOTTOM + 6} stroke={tone.textMuted} strokeWidth={2} />
            <text x={(X0 + model.XM) / 2} y={Y_TOP - 16} textAnchor="middle" fill={tone.textMuted} fontSize={PLOT.tickFont} fontWeight="700">전반</text>
            <text x={(model.XM + X1) / 2} y={Y_TOP - 16} textAnchor="middle" fill={tone.textMuted} fontSize={PLOT.tickFont} fontWeight="700">후반</text>
          </g>
        ) : (
          <text x={(X0 + X1) / 2} y={Y_TOP - 16} textAnchor="middle" fill={tone.textMuted} fontSize={PLOT.tickFont} fontWeight="700">전반</text>
        )}
        <text x={X0 - 7} y={Y_BOTTOM + (phone ? 20 : 24)} textAnchor="end" fill={tone.textDim} fontSize={PLOT.axisFont}>{phone ? 'R' : '라운드'}</text>
        {model.pts.length > 1 ? (
          <g>
            {GLOW ? (
              <>
                <polyline points={loseLine} fill="none" stroke={loser.theme.deep} strokeWidth={PLOT.glowW} strokeLinejoin="round" strokeLinecap="round" filter={draw < 1 ? undefined : 'url(#rfGlowR)'} opacity={0.5} {...penDash(draw)} />
                <polyline points={winLine} fill="none" stroke={V3.blue} strokeWidth={PLOT.glowW} strokeLinejoin="round" strokeLinecap="round" filter={draw < 1 ? undefined : 'url(#rfGlowB)'} opacity={0.5} {...penDash(draw)} />
                <polyline points={loseLine} fill="none" stroke={loser.theme.deep} strokeWidth={PLOT.midW} strokeLinejoin="round" strokeLinecap="round" opacity={0.42} {...penDash(draw)} />
                <polyline points={winLine} fill="none" stroke="#7fa9ff" strokeWidth={PLOT.midW} strokeLinejoin="round" strokeLinecap="round" opacity={0.45} {...penDash(draw)} />
              </>
            ) : (
              <>
                {/* 얇은 빛 — sleeper 의 은은한 광 */}
                <polyline points={loseLine} fill="none" stroke={loseInk} strokeWidth={CLEAN_W * 3} strokeLinejoin="round" strokeLinecap="round" opacity={0.16} {...penDash(draw)} />
                <polyline points={winLine} fill="none" stroke={winInk} strokeWidth={CLEAN_W * 3} strokeLinejoin="round" strokeLinecap="round" opacity={0.16} {...penDash(draw)} />
              </>
            )}
            <polyline points={loseLine} fill="none" stroke={loseInk} strokeWidth={GLOW ? PLOT.coreW : CLEAN_W} strokeLinejoin="round" strokeLinecap="round" opacity={0.95} {...penDash(draw)} />
            <polyline points={winLine} fill="none" stroke={winInk} strokeWidth={GLOW ? PLOT.coreW : CLEAN_W} strokeLinejoin="round" strokeLinecap="round" opacity={0.95} {...penDash(draw)} />
            {/* 어림한 구간 — 옛 판은 심지 위에 점선을 덧그렸다 (DASH_ESTIMATED) */}
            {DASH_ESTIMATED ? estSegsL.map(([x1, y1, x2, y2], k) => <line key={`l${k}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={tone.plot} strokeWidth={PLOT.coreW} strokeDasharray="4 4" opacity={0.85} />) : null}
            {DASH_ESTIMATED ? estSegs.map(([x1, y1, x2, y2], k) => <line key={`w${k}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={tone.plot} strokeWidth={PLOT.coreW} strokeDasharray="4 4" opacity={0.85} />) : null}
          </g>
        ) : null}
        {hoverPt !== null && hover !== null ? (
          <g pointerEvents="none">
            {/* 옛 판은 여기 글자로 「n라운드 · 5:4 · 65%」 를 적었다 — 지금은 위 인원 줄이 말한다 */}
            <line x1={hover} y1={Y_TOP - 6} x2={hover} y2={Y_BOTTOM + 6} stroke="#0891b2" strokeWidth={1} opacity={0.7} />
            <circle cx={hoverPt.x} cy={yOf(hoverPt.v)} r={5} fill={winInk} stroke={tone.plot} strokeWidth={1.5} />
            <circle cx={hoverPt.x} cy={yOf(100 - hoverPt.v)} r={5} fill={loseInk} stroke={tone.plot} strokeWidth={1.5} />
          </g>
        ) : null}
        {last ? (
          <g pointerEvents="none">
            {GLOW ? <circle cx={nowX} cy={yOf(100 - endW)} r={R + 4} fill="none" stroke={loser.theme.deep} strokeWidth={6} filter={draw < 1 ? undefined : 'url(#rfGlowR)'} opacity={0.55} /> : null}
            <circle cx={nowX} cy={yOf(100 - endW) + (tie ? R : 0)} r={R} fill={tone.chip} stroke={loseInk} strokeWidth={2} />
            {loser.slug && hasFitMark(loser.slug) ? <image href={fitMarkUrl(loser.slug)} x={nowX - R} y={yOf(100 - endW) - R + (tie ? R : 0)} width={R * 2} height={R * 2} clipPath={`circle(${R}px at ${R}px ${R}px)`} /> : null}
            <text x={labelX} y={yOf(100 - endW) + (tie ? R : 0) + (wAbove ? R + 16 : -(R + 6))} textAnchor="middle" fill={tone.textStrong} fontSize={PLOT.valueFont} fontWeight="700">{(100 - endW).toFixed(0)}%</text>
            {GLOW ? <circle cx={nowX} cy={yOf(endW)} r={R + 4} fill="none" stroke={V3.blue} strokeWidth={6} filter={draw < 1 ? undefined : 'url(#rfGlowB)'} opacity={0.55} /> : null}
            <circle cx={nowX} cy={yOf(endW) - (tie ? R : 0)} r={R} fill={tone.chip} stroke={winInk} strokeWidth={2} />
            {winner.slug && hasFitMark(winner.slug) ? <image href={fitMarkUrl(winner.slug)} x={nowX - R} y={yOf(endW) - R - (tie ? R : 0)} width={R * 2} height={R * 2} clipPath={`circle(${R}px at ${R}px ${R}px)`} /> : null}
            <text x={labelX} y={yOf(endW) - (tie ? R : 0) + (wAbove ? -(R + 6) : R + 16)} textAnchor="middle" fill={tone.textStrong} fontSize={PLOT.valueFont} fontWeight="700">{endW.toFixed(0)}%</text>
          </g>
        ) : null}
        {/* 범례·각주 — 폰에서는 안 그린다: 인원 줄이 두 이름을 색으로 말하고, 엇갈린 라운드 번호와 겹쳤다 (2026-09-23 폰 캡쳐) */}
        {phone ? null : (
        <g>
          <line x1={X0} y1={H - 8} x2={X0 + 16} y2={H - 8} stroke={winInk} strokeWidth={3} />
          <text x={X0 + 22} y={H - 3} fill={winner.theme.deep} fontSize={PLOT.tickFont}>{winner.name} 승</text>
          <line x1={X0 + (phone ? 130 : 190)} y1={H - 8} x2={X0 + (phone ? 146 : 206)} y2={H - 8} stroke={loseInk} strokeWidth={3} />
          <text x={X0 + (phone ? 152 : 212)} y={H - 3} fill={loser.theme.deep} fontSize={PLOT.tickFont}>{loser.name} 패</text>
          <text x={box.X1} y={H - 3} textAnchor="end" fill={tone.textGhost} fontSize={PLOT.axisFont}>{phone ? '띠 = 딴 팀 · × = 첫 희생' : `위 띠 = 라운드 딴 팀 · × = 첫 희생 자리${model.anyEst ? ' · 표본 모자란 구간은 어림값' : ''}`}</text>
        </g>
        )}
      </svg>
    </div>
  )
}
