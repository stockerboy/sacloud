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
  /** 이 시점의 라운드 스코어 (이긴 클랜 : 진 클랜) — 경기 누적 */
  scoreW: number
  scoreL: number
  /** ★그 반의 점수★ (2026-09-23 오후 사장님: 「라운드 총스코어 X · 전반 끝나면 0:0 부터」). 후반 첫 라운드에서 0 으로 돌아간다 */
  halfScoreW: number
  halfScoreL: number
  /** 이 라운드에서 처음 죽은 사람 — 아직 아무도 안 죽었으면 null (사장님 「원 하나가 줄어들 때 띄워줘」) */
  first: { name: string | null; side: 'W' | 'L'; at: number } | null
  /** 이 시점까지 이 라운드에서 죽은 사람들 — 죽은 차례대로 (사장님 「선짤 준성 · haeil 다운 · …」) */
  fallen: { name: string | null; side: 'W' | 'L'; at: number; by: string | null }[]
  /** 이 라운드의 공격(레드) 팀. 모르면 null (사장님 「레드가 무조건 왼쪽 블루가 오른쪽」) */
  attack: 'W' | 'L' | null
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
/* ⚠ 2026-09-23 낮 — 69549563(폰 요약 위아래)이 Vercel 에 안 붙었고 빈 커밋은 「Not affected」 로 건너뛰었다. 실제 변경이 있어야 빌드된다 — 이 줄이 그 변경이다 */
/** 3.6초 긋기 애니메이션(useDrawIn · 화면에 보일 때) — 폰에서 중간에 멈춘 채 남아 껐다 (2026-09-23 사장님) */
const DRAW_IN = false
/** ★붙자마자 1.8초 긋기★ (2026-09-23 낮 · 사장님 「그래프에 애니메이트 프레임 올려서」) — 보이든 말든 끝까지 간다 */
const DRAW_ON_MOUNT_MS = 4200 /* 2026-09-23 오후 — 사장님 「조금 더 느리게 · 처음에 너무 빨리 그려지니까 맛이 없다」 (옛 값 1800 · 직선) */
/** ★빛번짐★ (사장님 「우리가 만든 적 있음」) — 상대전적의 14px 광선보다 얇게(9px · 28%) · 가독성 (GLOW 는 옛 굵은 판) */
const SOFT_GLOW = true
/** 진 팀 선을 클랜 테마 색으로 (지금은 빨강 고정) */
const LOSER_CLAN_COLOR = false
/** 깔끔한 판의 선 두께 (sleeper 참고) */
const CLEAN_W = 2.6
/*
 * ★★2026-09-23 오후 — 진영판★★ (사장님 손그림 3장 + 시안 아티팩트 확정)
 *
 *   그래프 → 인원(사람 아이콘 · 레드 왼쪽/블루 오른쪽 · 가운데 전반전/후반전) → 「레드 클랜 n:n 클랜 블루」
 *   → 죽은 차례 두 칸(왼쪽 = 레드가 잡은 것 · 오른쪽 = 블루가 잡은 것)
 *
 *   HALF_SUMMARY   옛 「전후반 요약」 상자 (사장님 X) — false
 *   CREW_ABOVE     옛 인원 줄(○ 동그라미 · 그래프 위) — false. 아래 사람 아이콘 줄이 대신한다
 *   옛 판 코드는 그대로 두었다 (`CLAUDE.md` 1-4) — 두 값을 true 로 되돌리면 그대로 돌아온다.
 */
const HALF_SUMMARY = false
const CREW_ABOVE = false
/** ★재생★ — 축이 왼쪽에서 오른쪽으로 천천히 훑는다 (2026-09-23 오후 사장님). 라운드 하나에 이만큼 걸린다 */
const PLAY_MS_PER_ROUND = 5000 /* 2026-09-23 저녁 사장님 「훨씬 더 느리게 너무 빨라」 — 옛 값 1800 */

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
  /* 붙자마자 긋기 — rAF 로 0→1. IO 를 안 타서 접힌 칸이 열릴 때도 처음부터 끝까지 간다 */
  const [mountDraw, setMountDraw] = useState(DRAW_ON_MOUNT_MS > 0 ? 0 : 1)
  useEffect(() => {
    if (DRAW_ON_MOUNT_MS <= 0) return
    let raf = 0
    const t0 = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / DRAW_ON_MOUNT_MS)
      /* 천천히 시작해서 천천히 끝난다 (ease-in-out) */
      const k = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
      setMountDraw(k)
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    const safety = window.setTimeout(() => setMountDraw(1), DRAW_ON_MOUNT_MS + 400)
    return () => { cancelAnimationFrame(raf); window.clearTimeout(safety) }
  }, [flow])
  const draw = DRAW_IN ? drawIn : mountDraw
  const box = plotBox(width)
  /* ⚠ 2026-09-23 낮 — 사장님: 「이 공간을 남기지 말고 다 쓰라는거임」. 옛 판은 마커 옆 「94%」 자리로 오른쪽 58~66px 을 비웠다.
     이제 판을 오른쪽 끝까지 쓰고, 마커는 선 끝에 얹고 % 는 마커 ★위/아래★ 에 적는다. 옛 값: box.X1 - (phone ? 58 : 66) */
  const { H, X0, Y_TOP, Y_BOTTOM, phone } = box
  /* ⚠ 2026-09-23 오후 사장님 폰 캡쳐: 「오른쪽 공간이 안 남게 그래프를 끝까지 뻗어줘」 → 폰은 마커 반지름만큼만 남긴다.
     plotBox 가 폰에 34 를 비워 두는데 그 위에 16 을 더 비웠었다 (옛 값). % 글자는 마커 왼쪽으로 옮겼다 */
  const X1 = phone ? width - PLOT.markerR - 2 : box.X1 - 18
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
    /* 그 반의 점수 — 후반 첫 라운드에서 0:0 으로 (사장님) */
    let halfScoreW = 0
    let halfScoreL = 0
    let lastHalf: 'A' | 'B' = 'A'
    /* 출발 — 옛 판은 이긴 클랜이 아래(0)에서 (상대전적 그래프와 같다). 지금은 1라운드 값에서 바로 시작 */
    if (START_AT_EDGES) pts.push({ x: xOf(0, 'A'), v: 0, round: 0, aliveW: sizeW, aliveL: sizeL, scoreW, scoreL, halfScoreW, halfScoreL, first: null, fallen: [], attack: null, est: false })
    for (const r of rounds) {
      const half: 'A' | 'B' = s !== null && r.round >= s ? 'B' : 'A'
      const halfKey: 'first' | 'second' = half === 'A' ? 'first' : 'second'
      if (half !== lastHalf) { halfScoreW = 0; halfScoreL = 0; lastHalf = half }
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
      const attack: Pt['attack'] = r.defence === null ? null : r.defence === W ? 'L' : 'W'
      pts.push({ x: xOf(r.start, half), v: o.p * 100, round: r.round, aliveW, aliveL, scoreW, scoreL, halfScoreW, halfScoreL, first: null, fallen, attack, est: o.est })
      for (const d of r.deaths) {
        if (d.side === W) aliveW = Math.max(0, aliveW - 1)
        else aliveL = Math.max(0, aliveL - 1)
        if (firstSeen === null) firstSeen = { name: d.name, side: d.side === W ? 'W' : 'L', at: d.at }
        fallen = [...fallen, { name: d.name, side: d.side === W ? 'W' : 'L', at: d.at, by: d.by }]
        /* 한쪽이 0 이 되는 마지막 죽음은 안 찍는다 — 그 순간 확률이 100/0 으로 튀어 빗살이 된다 (운영 캡쳐).
           라운드가 끝난 것이라 「마지막 인원 상태 값」 을 그대로 끌고 간다 (JUMP_ON_ROUND_END 와 같은 뜻) */
        if (aliveW === 0 || aliveL === 0) break
        o = odds()
        anyEst = anyEst || o.est
        const x = xOf(Math.min(d.at, r.end), half)
        /* 계단 — 죽기 직전까지는 앞 값 그대로 */
        const prev = pts[pts.length - 1] as Pt
        pts.push({ ...prev, x: Math.max(prev.x, x - 0.01) })
        pts.push({ x, v: o.p * 100, round: r.round, aliveW, aliveL, scoreW, scoreL, halfScoreW, halfScoreL, first: firstSeen, fallen, attack, est: o.est })
      }
      {
        /* 라운드 끝 — 마지막 상태 값을 라운드 끝까지 끌고 간다. 옛 판(JUMP_ON_ROUND_END)은 여기서 100/0 으로 튀었다 */
        const prev = pts[pts.length - 1] as Pt
        const x = xOf(r.end, half)
        pts.push({ ...prev, x: Math.max(prev.x, x - 0.01), first: firstSeen, fallen })
        if (JUMP_ON_ROUND_END && r.winner !== null) pts.push({ x, v: r.winner === W ? 100 : 0, round: r.round, aliveW, aliveL, scoreW, scoreL, halfScoreW, halfScoreL, first: firstSeen, fallen, attack, est: false })
      }
      if (r.winner === W) { scoreW += 1; halfScoreW += 1 }
      else if (r.winner === L) { scoreL += 1; halfScoreL += 1 }
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
  /*
   * ★재생★ (2026-09-23 오후 사장님: 「재생 버튼 누르면 축이 쓱 훑고 지나가면서(천천히) 경기 흐름을 재생해줘 —
   *   시안 아티팩트에서 만든 것처럼」). rAF 로 축(`hover`)을 X0→X1 로 옮긴다. 손으로 만지면 멈춘다.
   */
  const [playing, setPlaying] = useState(false)
  const playRef = useRef<{ raf: number; t0: number } | null>(null)
  const stopPlay = () => {
    if (playRef.current) cancelAnimationFrame(playRef.current.raf)
    playRef.current = null
    setPlaying(false)
  }
  const startPlay = () => {
    stopPlay()
    const total = Math.max(20000, flow.rounds.length * PLAY_MS_PER_ROUND)
    const t0 = performance.now()
    setPlaying(true)
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / total)
      setHover(X0 + (X1 - X0) * k)
      if (k >= 1) { playRef.current = null; setPlaying(false); return }
      playRef.current = { raf: requestAnimationFrame(tick), t0 }
    }
    playRef.current = { raf: requestAnimationFrame(tick), t0 }
  }
  useEffect(() => () => { if (playRef.current) cancelAnimationFrame(playRef.current.raf) }, [])
  const pickAt = (clientX: number) => {
    const svg = svgRef.current
    if (!svg) return
    if (playRef.current) stopPlay()
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
  void wAbove
  /* % 글자 — 마커 위/아래. 판 끝(위 띠 · 아래 라운드 번호)에 닿으면 반대쪽으로 (폰 캡쳐: 94% 가 띠에, 6% 가 번호에 겹쳤다). 옛 판은 마커 오른쪽 */
  const labelX = nowX
  const yW = yOf(endW) - (tie ? R : 0)
  const yL = yOf(100 - endW) + (tie ? R : 0)
  const wLabelDy = yW < Y_TOP + 36 ? R + 16 : -(R + 6)
  const lLabelDy = yL > Y_BOTTOM - 36 ? -(R + 6) : R + 16
  const winInk = GLOW ? (tone === V3 ? '#1c2f6b' : '#bcd2ff') : '#8fb4ff'
  /* 진 팀 색 — 육각형·위 범례와 같이 ★빨강★ 으로 고정한다. 클랜 테마(afterpray 파랑 · latency 회색)를 쓰니
     두 선이 같은 색이거나 회색이 됐다 (운영 QA 4경기). 옛 판은 LOSER_CLAN_COLOR */
  const loseInk = LOSER_CLAN_COLOR ? loser.theme.main : '#ff6b6b'
  /* 진영판을 그릴 수 있나 — 그 라운드의 공격(레드) 팀을 알아야 한다 */
  const sidesKnown = hud !== null && hud.attack !== null
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
  /*
   * ★전후반 요약 — 가로 배열★ (2026-09-23 낮 · 사장님: 「처음시작(선레드자리) / hing(선블루자리) | hing / 처음시작(진영교체 후 블루)
   *   이렇게 배열하고 각각 획득 라운드를 클랜명 밑에 써줘 … 세로배열은 한눈에 안 보여」).
   *   반마다 [공격(레드) · 수비(블루)] 두 칸 · 반 사이 세로선 · 칸마다 「클랜명 (선레드)」 위 · 「5라운드 0설」 아래.
   *   진영을 모르면 이긴 팀 · 진 팀 차례. 옛 세로 배열(halfRow)은 지웠다 — 이 블록이 그 자리다.
   */
  type HalfSum = { rounds: number; won: { W: number; L: number }; planted: { W: number; L: number }; attack: 'W' | 'L' | null }
  const halfCells = (sum: HalfSum, half: 'first' | 'second') => {
    const order: ('W' | 'L')[] = sum.attack === 'L' ? ['L', 'W'] : ['W', 'L']
    return order.map((k) => {
      const team = k === 'W' ? winner : loser
      const color = k === 'W' ? winInk : loseInk
      const word = sideWord(half, k, sum.attack)
      return (
        <div key={k} style={{ minWidth: 0, textAlign: 'center', padding: '6px 4px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 4, minWidth: 0 }}>
            <span style={{ fontWeight: 700, color, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{team.name}</span>
            {word ? <span style={{ fontSize: 10.5, color: tone.textDim, whiteSpace: 'nowrap' }}>({word})</span> : null}
          </div>
          <div style={{ fontSize: 12.5, color: tone.textDim, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
            <b style={{ color: tone.textStrong, fontSize: 15 }}>{sum.won[k]}</b>라운드 <b style={{ color: tone.textStrong, fontSize: 15 }}>{sum.planted[k]}</b>설
          </div>
        </div>
      )
    })
  }

  return (
    <div ref={boxRef} style={{ padding: '6px 8px 8px', background: tone.plot }}>
      {/* ★전후반 요약★ — 가로 배열: [전반 공격 · 전반 수비] | [후반 공격 · 후반 수비] (2026-09-23 사장님)
          ⚠ 2026-09-23 오후 — 사장님이 시안에서 X 치셨다. HALF_SUMMARY=false 로 안 그린다 (코드는 남긴다) */}
      {HALF_SUMMARY ? (
      <div style={{ border: `1px solid ${tone.cardBorder}`, marginBottom: 6 }}>
        {/* 폰은 네 칸이 안 들어가 이름이 「Th…」 로 잘렸다 (운영 캡쳐) → 폰에서는 전반/후반을 위아래로 (각 반은 여전히 가로 두 칸) */}
        {phone ? (
          <>
            <div style={{ padding: '4px 8px', fontSize: 10.5, color: tone.textDim, letterSpacing: '.06em', borderBottom: `1px solid ${tone.cardBorder}` }}>전반 · {model.first.rounds}라운드</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>{halfCells(model.first, 'first')}</div>
            {model.second.rounds > 0 ? (
              <>
                <div style={{ padding: '4px 8px', fontSize: 10.5, color: tone.textDim, letterSpacing: '.06em', borderTop: `2px solid ${tone.textMuted}`, borderBottom: `1px solid ${tone.cardBorder}` }}>후반 · {model.second.rounds}라운드</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>{halfCells(model.second, 'second')}</div>
              </>
            ) : null}
          </>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: model.second.rounds > 0 ? '1fr 1fr' : '1fr', fontSize: 10.5, color: tone.textDim, letterSpacing: '.06em', borderBottom: `1px solid ${tone.cardBorder}` }}>
              <div style={{ padding: '4px 8px' }}>전반 · {model.first.rounds}라운드</div>
              {model.second.rounds > 0 ? <div style={{ padding: '4px 8px', borderLeft: `2px solid ${tone.textMuted}` }}>후반 · {model.second.rounds}라운드</div> : null}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: model.second.rounds > 0 ? '1fr 1fr' : '1fr' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>{halfCells(model.first, 'first')}</div>
              {model.second.rounds > 0 ? <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderLeft: `2px solid ${tone.textMuted}` }}>{halfCells(model.second, 'second')}</div> : null}
            </div>
          </>
        )}
      </div>
      ) : null}
      {/* ★인원 줄★ — 축을 옮기면 따라온다 (시안 A)
          ⚠ 2026-09-23 오후 — 옛 판(○ 동그라미 · 그래프 위). 지금은 그래프 ★아래★ 사람 아이콘 줄(CREW_ABOVE=false) */}
      {CREW_ABOVE && hud ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 12.5, padding: '4px 6px 6px', minHeight: 26 }}>
          <span style={{ color: tone.textDim }}>{hud.round === 0 ? '시작' : `${hud.round}라운드`}</span>
          <span style={{ fontWeight: 800, color: tone.textStrong, fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{hud.scoreW} : {hud.scoreL}</span>
          {/* ★레드가 무조건 왼쪽 · 블루가 오른쪽★ — 전후반이 바뀌면 자리가 바뀐다 · 사이에 진영 표 (사장님 2026-09-23) */}
          {(hud.attack === 'L' ? (['L', 'W'] as const) : (['W', 'L'] as const)).map((k, i) => {
            const team = k === 'W' ? winner : loser
            const color = k === 'W' ? winInk : loseInk
            const alive = k === 'W' ? hud.aliveW : hud.aliveL
            const size = k === 'W' ? sizeW : sizeL
            const tag = hud.attack === null ? null : i === 0 ? '레드' : '블루'
            return (
              <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                {tag ? <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.06em', padding: '1px 5px', border: `1px solid ${i === 0 ? 'rgba(255,107,107,.5)' : 'rgba(143,180,255,.5)'}`, color: i === 0 ? '#ff6b6b' : '#8fb4ff' }}>{tag}</span> : null}
                <span style={{ color }}>{phone ? '' : team.name}{dots(alive, size, color)}<b>{alive}</b></span>
              </span>
            )
          })}
          <span style={{ marginLeft: 'auto', color: tone.textDim, fontVariantNumeric: 'tabular-nums' }}>{hud.v.toFixed(0)}% : {(100 - hud.v).toFixed(0)}%{hud.est ? ' · 어림' : ''}</span>
        </div>
      ) : null}
      {/* ★재생 단추★ — 그래프 바로 위 오른쪽. 누르면 축이 처음부터 끝까지 천천히 훑는다 · 다시 누르면 멈춘다 */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '2px 4px 4px' }}>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); if (playing) stopPlay(); else startPlay() }}
          style={{ fontFamily: 'inherit', fontSize: 11.5, fontWeight: 700, padding: '4px 11px', cursor: 'pointer', color: playing ? '#f59e0b' : tone.textDim, background: 'transparent', border: `1px solid ${playing ? 'rgba(245,158,11,.55)' : tone.cardBorder}`, borderRadius: 3, whiteSpace: 'nowrap' }}
        >
          {playing ? '❚❚ 멈춤' : '▶ 재생'}
        </button>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${H}`}
        style={{ width: '100%', height: H, display: 'block', cursor: 'crosshair' }}
        onMouseMove={(e) => pickAt(e.clientX)}
        onMouseLeave={() => { if (!playRef.current) setHover(null) }}
        onTouchStart={(e) => { const t = e.touches[0]; if (t) pickAt(t.clientX) }}
        onTouchMove={(e) => { const t = e.touches[0]; if (t) pickAt(t.clientX) }}
        onTouchEnd={() => { if (!playRef.current) setHover(null) }}
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
          const manyRounds = model.ticks.length > 18
          return model.ticks.map((t) => {
            const cx = (t.x + t.x1) / 2
            const tight = cx - lastX < (phone ? 16 : 22)
            /* ⚠ 2026-09-23 오후 사장님: 「라운드 1부터 14 숫자가 삐뚤빼뚤」 → 폰은 엇갈리지 않고 한 줄. 좁으면(18R 초과) 홀수만 적는다 */
            stagger = phone ? 0 : tight ? 1 - stagger : 0
            lastX = cx
            const skipNumber = phone && manyRounds && t.round % 2 === 0
            return (
              <g key={t.round}>
                <line x1={t.x} y1={Y_TOP} x2={t.x} y2={Y_BOTTOM} stroke={tone.cardBorder} strokeDasharray="3 5" />
                {t.winner ? <rect x={t.x} y={Y_TOP - 9} width={Math.max(1, t.x1 - t.x)} height={4} fill={t.winner === 'W' ? winInk : loseInk} opacity={0.7} /> : null}
                {t.firstX !== null ? <text x={t.firstX} y={Y_TOP + 4} textAnchor="middle" fill={t.firstSide === 'W' ? winInk : loseInk} fontSize={9} opacity={0.85}>×</text> : null}
                {skipNumber ? null : <text x={cx} y={Y_BOTTOM + (phone ? 20 : 24) + stagger * (phone ? 11 : 12)} textAnchor="middle" fill={tone.textDim} fontSize={phone ? 10 : PLOT.axisFont}>{t.round}</text>}
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
                {/* 빛번짐 — 상대전적의 feGaussianBlur 필터를 얇게 (SOFT_GLOW) · 끄면 sleeper 식 은은한 광 */}
                <polyline points={loseLine} fill="none" stroke={loseInk} strokeWidth={SOFT_GLOW ? 9 : CLEAN_W * 3} strokeLinejoin="round" strokeLinecap="round" opacity={SOFT_GLOW ? 0.28 : 0.16} filter={SOFT_GLOW && draw >= 1 ? 'url(#rfGlowR)' : undefined} {...penDash(draw)} />
                <polyline points={winLine} fill="none" stroke={winInk} strokeWidth={SOFT_GLOW ? 9 : CLEAN_W * 3} strokeLinejoin="round" strokeLinecap="round" opacity={SOFT_GLOW ? 0.28 : 0.16} filter={SOFT_GLOW && draw >= 1 ? 'url(#rfGlowB)' : undefined} {...penDash(draw)} />
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
            <text x={phone ? nowX - R - 3 : labelX} y={phone ? yOf(100 - endW) + (tie ? R : 0) + 5 : yL + lLabelDy} textAnchor={phone ? 'end' : 'middle'} fill={tone.textStrong} fontSize={PLOT.valueFont} fontWeight="700">{(100 - endW).toFixed(0)}%</text>
            {GLOW ? <circle cx={nowX} cy={yOf(endW)} r={R + 4} fill="none" stroke={V3.blue} strokeWidth={6} filter={draw < 1 ? undefined : 'url(#rfGlowB)'} opacity={0.55} /> : null}
            <circle cx={nowX} cy={yOf(endW) - (tie ? R : 0)} r={R} fill={tone.chip} stroke={winInk} strokeWidth={2} />
            {winner.slug && hasFitMark(winner.slug) ? <image href={fitMarkUrl(winner.slug)} x={nowX - R} y={yOf(endW) - R - (tie ? R : 0)} width={R * 2} height={R * 2} clipPath={`circle(${R}px at ${R}px ${R}px)`} /> : null}
            <text x={phone ? nowX - R - 3 : labelX} y={phone ? yOf(endW) - (tie ? R : 0) + 5 : yW + wLabelDy} textAnchor={phone ? 'end' : 'middle'} fill={tone.textStrong} fontSize={PLOT.valueFont} fontWeight="700">{endW.toFixed(0)}%</text>
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
      {/* ★죽은 차례★ — 축을 옮길 때마다 그 라운드에서 지금까지 죽은 사람을 차례대로
          (사장님 2026-09-23: 「처음 죽은 사람은 선짤 준성 · 그 다음 haeil 다운 · enanthate 다운 …」). 옛 판은 첫 희생만 적었다 */}
      {/* ⚠ 2026-09-23 오후 — 사장님: 「누가 누구 죽였는지 나오면서 공간이 달라지니까 그래프 판 자체가 위아래로 움직이고 정신없어」
          → 이 줄을 ★그래프 아래★ 로 내리고 최소 높이를 잡아 판이 안 움직인다 (JSX 주석은 표현식 자리에 못 둔다 — 위에 둔다) */}
      {/*
        ★★2026-09-23 오후 — 진영판★★ (사장님 손그림 3장 · 시안 아티팩트 「그대로 넣어」)

          ┌ 사람 아이콘 5 (레드)  │ 후반전 · 12R  │  사람 아이콘 5 (블루) ┐   ← 죽으면 흐린 윤곽만
          │ [레드] evermore        1 : 2         hardcores [블루]      │   ← 그 반의 점수 (후반 0:0 부터)
          ├───────────────────────────┬───────────────────────────────┤
          │ evermore가 잡음            │              hardcores가 잡음  │
          │ 선짤 wytysmore ▸ 임소혜    │      Peyz; ▸ 리라몬모어 다운   │   ← 왼쪽 = 레드가 잡은 것
          └───────────────────────────┴───────────────────────────────┘

        ── 진영은 `hud.attack`(그 라운드의 공격 팀)이 정한다 — 레드 = 공격. 이름 색은 ★승패가 아니라 진영★ 이라
           같은 선수가 전반엔 파랑, 후반엔 빨강이 된다 (사장님 그림 2).
        ── 공수를 모르는 라운드(`attack === null`)는 이 판을 못 그린다 → 아래 옛 세로 목록으로 떨어진다.
           모르는 것을 블루라고 적지 않는다 (D-106).
      */}
      {hud && sidesKnown ? (() => {
        const leftKey: 'W' | 'L' = hud.attack as 'W' | 'L'
        const rightKey: 'W' | 'L' = leftKey === 'W' ? 'L' : 'W'
        const teamOf = (k: 'W' | 'L') => (k === 'W' ? winner : loser)
        const aliveOf = (k: 'W' | 'L') => (k === 'W' ? hud.aliveW : hud.aliveL)
        const sizeOf = (k: 'W' | 'L') => (k === 'W' ? sizeW : sizeL)
        const halfScoreOf = (k: 'W' | 'L') => (k === 'W' ? hud.halfScoreW : hud.halfScoreL)
        const inkOf = (k: 'W' | 'L') => (k === leftKey ? RED_INK : BLUE_INK)
        /* 왼쪽 칸 = 레드가 잡은 것(죽은 쪽이 블루) · 오른쪽 칸 = 블루가 잡은 것 */
        const killedBy = (k: 'W' | 'L') => hud.fallen.filter((f) => f.side !== k)
        const firstAt = hud.fallen[0]?.at
        const killRow = (f: Pt['fallen'][number], i: number, align: 'left' | 'right') => (
          <span key={`${f.at}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', minWidth: 0, justifyContent: align === 'right' ? 'flex-end' : 'flex-start' }}>
            {f.at === firstAt ? <span style={{ color: '#f59e0b', fontWeight: 800, fontSize: 11.5, flex: 'none' }}>선짤</span> : null}
            {f.by ? (<><span style={{ color: inkOf(f.side === 'W' ? 'L' : 'W'), fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{f.by}</span><span style={{ color: tone.textGhost, fontSize: 11, flex: 'none' }}>▸</span></>) : null}
            <span style={{ color: inkOf(f.side), fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{f.name ?? '—'}</span>
            {/* 폰은 두 칸이 좁아 「다운」 을 뺀다 — 이름이 「푸른살…」 로 잘리는 것보다 낫다 (2026-09-23 폰 캡쳐) */}
            {f.at === firstAt || phone ? null : <span style={{ color: tone.textDim, fontSize: 11, flex: 'none' }}>다운</span>}
          </span>
        )
        const col = (k: 'W' | 'L', align: 'left' | 'right') => {
          const list = killedBy(k)
          return (
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10, letterSpacing: '.08em', color: tone.textGhost, marginBottom: 3, textAlign: align, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{teamOf(k).name}가 잡음</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12.5 }}>
                {list.length === 0 ? <span style={{ color: tone.textGhost, fontSize: 12, textAlign: align }}>{hud.round > 0 ? '아직 없음' : ''}</span> : list.map((f, i) => killRow(f, i, align))}
              </div>
            </div>
          )
        }
        const secondFrom = flow.second_half_from
        const halfWord = secondFrom !== null && hud.round >= secondFrom ? '후반전' : '전반전'
        const leftPct = leftKey === 'W' ? hud.v : 100 - hud.v
        return (
          <>
            {/* ① 인원 — 사람 아이콘. 레드 왼쪽(가운데 쪽부터 꺼짐) · 블루 오른쪽(가운데 쪽부터 꺼짐) · 가운데 전반전/후반전 · 라운드 · 확률 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 8, padding: '9px 2px 5px', borderTop: `1px solid ${tone.cardBorder}`, marginTop: 4 }}>
              <CrewIcons alive={aliveOf(leftKey)} size={sizeOf(leftKey)} ink={RED_INK} glow={RED_GLOW} fromRight={true} />
              <div style={{ textAlign: 'center', padding: '0 9px', borderLeft: `1px solid ${tone.cardBorder}`, borderRight: `1px solid ${tone.cardBorder}`, whiteSpace: 'nowrap' }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', color: tone.textDim }}>{halfWord}{hud.round > 0 ? ` · ${hud.round}R` : ''}</div>
                <div style={{ fontSize: 10.5, color: tone.textGhost, fontVariantNumeric: 'tabular-nums' }}>{leftPct.toFixed(0)}% : {(100 - leftPct).toFixed(0)}%{hud.est ? ' · 어림' : ''}</div>
              </div>
              <CrewIcons alive={aliveOf(rightKey)} size={sizeOf(rightKey)} ink={BLUE_INK} glow={BLUE_GLOW} fromRight={false} />
            </div>
            {/* ② 레드 클랜 · 그 반의 점수 · 클랜 블루 — 후반이면 자리가 바뀐다 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'baseline', gap: 8, padding: '4px 2px 8px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, minWidth: 0 }}>
                <SideTag red />
                <span style={{ fontWeight: 800, fontSize: 13.5, color: RED_INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{teamOf(leftKey).name}</span>
              </div>
              <div style={{ fontWeight: 800, fontSize: 20, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', padding: '0 8px', color: tone.textStrong }}>
                <span style={{ color: RED_INK }}>{halfScoreOf(leftKey)}</span><span style={{ color: tone.textGhost, margin: '0 4px', fontWeight: 500 }}>:</span><span style={{ color: BLUE_INK }}>{halfScoreOf(rightKey)}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, minWidth: 0, justifyContent: 'flex-end' }}>
                <span style={{ fontWeight: 800, fontSize: 13.5, color: BLUE_INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{teamOf(rightKey).name}</span>
                <SideTag red={false} />
              </div>
            </div>
            {/* ③ 죽은 차례 — 두 칸. 판 높이는 고정해 그래프가 위아래로 안 움직인다 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr', gap: '0 10px', borderTop: `1px solid ${tone.cardBorder}`, paddingTop: 8, minHeight: phone ? 96 : 72 }}>
              {col(leftKey, 'left')}
              <div style={{ background: tone.cardBorder }} />
              {col(rightKey, 'right')}
            </div>
          </>
        )
      })() : null}
      {/*
        ★★2026-09-23 오후 — 진영을 글자로 박는다★★ (사장님 지시 ①-5: 「헷갈려 죽겠어」)

        옛 판은 ★색만★ 달랐다 (파랑 = 이긴 팀 · 빨강 = 진 팀). 그런데 이 판에서 묻는 것은
        「이긴 팀/진 팀」이 아니라 ★그 라운드에 누가 레드(공격)였나★ 라서, 색으로는 답이 안 나왔다.
        이제 이름 앞에 ★[레드] / [블루] 칩★ 을 붙이고 ★한 줄에 한 건씩 세로로★ 쌓는다.

        ── 진영을 어떻게 아나
          `hud.attack` 이 ★그 라운드의 공격(레드) 팀★ 이다 (위 인원 줄과 같은 재료).
          죽은 사람의 팀이 `f.side` 이므로 ★킬러는 그 반대★ 다 (같은 팀을 죽이는 줄은 없다).
          `hud.attack` 이 `null` — ★수비/공격을 모르는 라운드★ 면 칩을 ★안 붙인다★ (D-106).
      */}
      {hud && !sidesKnown ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12.5, padding: '8px 6px 2px', minHeight: phone ? 64 : 28, borderTop: `1px solid ${tone.cardBorder}`, marginTop: 4 }}>
          {hud.fallen.length === 0 ? (
            <span style={{ color: tone.textGhost }}>{hud.round > 0 ? '아직 아무도 안 죽음' : ''}</span>
          ) : hud.fallen.map((f, i) => {
            /* 죽은 쪽이 레드였나 — 공격 팀이 레드다. 모르면 둘 다 null 이라 칩을 안 그린다 */
            const victimRed = hud.attack === null ? null : f.side === hud.attack
            const killerRed = victimRed === null ? null : !victimRed
            return (
              <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', minWidth: 0 }}>
                {i === 0 ? <span style={{ color: '#f59e0b', fontWeight: 700, flex: 'none' }}>선짤</span> : null}
                {/* 「[진영] 킬러 ▸ [진영] 희생자」 — 킬러를 모르면 희생자만 */}
                {f.by ? (
                  <>
                    <SideChip red={killerRed} />
                    <span style={{ color: f.side === 'W' ? loseInk : winInk, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{f.by}</span>
                    <span style={{ color: tone.textGhost, flex: 'none' }}>▸</span>
                  </>
                ) : null}
                <SideChip red={victimRed} />
                <span style={{ color: f.side === 'W' ? winInk : loseInk, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{f.name ?? '—'}</span>
                <span style={{ color: tone.textDim, flex: 'none' }}>{i === 0 ? '' : '다운'}</span>
              </span>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

/* 진영 색 — 인원 줄 · 클랜 이름 · 죽은 차례가 전부 같은 두 색을 쓴다 (인원 줄 옛 칩과 같은 값) */
const RED_INK = '#ff6b6b'
const BLUE_INK = '#8fb4ff'
const RED_GLOW = 'drop-shadow(0 0 2.5px rgba(255,80,80,.95)) drop-shadow(0 0 6px rgba(255,60,60,.55))'
const BLUE_GLOW = 'drop-shadow(0 0 2.5px rgba(90,150,255,.95)) drop-shadow(0 0 6px rgba(60,120,255,.55))'
const PERSON_PATH = 'M8 2.6a2.7 2.7 0 1 1 0 5.4 2.7 2.7 0 0 1 0-5.4Zm0 6.2c3 0 5.2 1.7 5.2 3.6V14H2.8v-1.6c0-1.9 2.2-3.6 5.2-3.6Z'

/**
 * ★인원 — 사람 아이콘★ (2026-09-23 오후 사장님 사진: 빨강·파랑 번지는 사람 모양).
 * 살아 있으면 진영 색 + 번짐, 죽으면 흐린 윤곽만. `fromRight` 면 오른쪽 끝(가운데 쪽)부터 꺼진다 —
 * 레드(왼쪽)도 블루(오른쪽)도 가운데 쪽부터 꺼져 양쪽이 대칭이다.
 */
function CrewIcons({ alive, size, ink, glow, fromRight }: { alive: number; size: number; ink: string; glow: string; fromRight: boolean }) {
  return (
    <span style={{ display: 'flex', gap: 5, alignItems: 'center', justifyContent: fromRight ? 'flex-start' : 'flex-end' }}>
      {Array.from({ length: size }, (_, i) => {
        const on = (fromRight ? i : size - 1 - i) < alive
        return (
          <svg key={i} viewBox="0 0 16 16" style={{ width: 16, height: 16, display: 'block', filter: on ? glow : undefined }} aria-hidden>
            <path d={PERSON_PATH} fill={on ? ink : 'none'} stroke={on ? 'none' : '#33405f'} strokeWidth={on ? 0 : 1.6} />
          </svg>
        )
      })}
    </span>
  )
}

/** 「레드」 / 「블루」 작은 표 — 클랜 이름 옆 */
function SideTag({ red }: { red: boolean }) {
  return (
    <span style={{ flex: 'none', fontSize: 10, fontWeight: 800, letterSpacing: '.06em', padding: '1px 5px', border: `1px solid ${red ? 'rgba(255,107,107,.55)' : 'rgba(143,180,255,.55)'}`, color: red ? RED_INK : BLUE_INK }}>{red ? '레드' : '블루'}</span>
  )
}


/**
 * ★진영 칩★ — 「레드」(공격) 빨강 테두리 · 「블루」(수비) 파랑 테두리 (2026-09-23 오후 사장님).
 *
 * `red === null` 이면 ★아무것도 안 그린다★ — 그 라운드의 공수를 모르는 경기가 있고,
 * 모르는 것을 「블루」 라고 적으면 거짓이다 (D-106). 인원 줄의 진영 표와 같은 색을 쓴다.
 */
function SideChip({ red }: { red: boolean | null }) {
  if (red === null) return null
  return (
    <span
      style={{
        flex: 'none',
        fontSize: 9.5,
        fontWeight: 800,
        letterSpacing: '.04em',
        padding: '1px 4px',
        lineHeight: 1.3,
        border: `1px solid ${red ? 'rgba(255,107,107,.55)' : 'rgba(143,180,255,.55)'}`,
        color: red ? '#ff6b6b' : '#8fb4ff',
      }}
    >
      {red ? '레드' : '블루'}
    </span>
  )
}
