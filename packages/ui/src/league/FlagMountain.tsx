'use client'

/**
 * ★깃발 산★ — 하루(17:00~03:00)의 경쟁을 산 하나로 그린다 (2026-09-15 사장님).
 *
 * > «파노라 라는 어플 조사해서 그 깃발 꼽는 그 애니메이트 똑같이 따라해서
 * >  막 경쟁해서 새벽 3시에 1등인 사람이 깃발 꽂고»
 * > «그 깃발꼽는게 귀엽게»
 *
 * ── 파노라에서 ★가져온 것과 안 가져온 것★
 *   파노라(BlueSignum)는 애플워치 스트레스 앱이다. 하루를 산 하나로 그리고
 *   봉우리에 깃발을 꽂아 «그때 무슨 일이 있었나» 를 남긴다.
 *   ★가져온 것은 그림의 문법이다★ — «하루 = 산», «정상 = 깃발».
 *   ★그림·아이콘·코드는 한 줄도 안 베꼈다★ (`CLAUDE.md` 2장 4번).
 *   산도 깃발도 여기서 좌표로 직접 그린다.
 *
 * ── 우리 산은 이렇게 읽는다
 *   ```
 *   가로축   17시 ────────────── 03시     (하루가 흐른 만큼 능선이 자란다)
 *   세로축   그날 점수                      (1등이 제일 높은 봉우리)
 *   정상     ★1등의 깃발★                  마감(03시)에 꽂힌다
 *   ```
 *
 * ── 움직임 (사장님: «귀엽게»)
 *   ① 정상이 반짝  ② 깃발대가 위에서 톡 떨어져 ★살짝 튕긴다★
 *   ③ 천이 펄럭 펴진다  ④ 닉네임이 옆에 뜬다
 *   ★`prefers-reduced-motion` 이면 아무것도 안 움직인다★ — 꽂힌 모습만 보여 준다.
 *
 * ── ⚠ 기본은 ★보이는 것★
 *   스크립트가 죽어도 산과 깃발은 남는다. 움직임은 `mounted` 가 붙은 뒤에만 건다.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { playerHexLabelOf, type TraitAxisKey } from '@sacloud/contract'
import { Hexagon, type HexAxisView } from '../v3/Hexagon'
import { V3 } from '../v3/tokens'
import { statColor } from '../v3/rankColors'

export interface FlagMountainRow {
  rank: number
  player_id: string
  name: string
  clan: { slug: string; name: string; mark: { bg: string | null; front: string | null } } | null
  score: number
  games: number
  win: number
  lose: number
  win_rate: number
  kd_rate: number | null
  flags: number
  /**
   * ★그날 육각★ — 그 하루(17:00~03:00) 기록만으로 만든 여섯 축 (2026-09-15 사장님:
   * «이것도 그 날 1700-0300까지의 육각이다 알겠지?»).
   * 마감 뒤 저장본에는 아직 없다 — 그때는 빈 배열이고 육각을 안 그린다.
   */
  axes: readonly { key: string; value: number | null; pct: number | null }[]
}

export interface FlagMountainProps {
  /** 리그 slug — 닉네임을 누르면 그 리그의 기록실로 간다 */
  leagueSlug: string
  /** 마감일 `YYYY-MM-DD` */
  dayKey: string
  /** 아직 경쟁 중인가 */
  live: boolean
  /** 하루가 몇 % 지났나 (0~1) — 능선이 그만큼 자란다 */
  progress: number
  rows: readonly FlagMountainRow[]
}

/*
 * 산을 그리는 상자 — 좌표계는 이 안에서만 쓴다.
 *
 * ⚠ ★봉우리 위에 깃발이 설 자리를 남긴다★ (2026-09-15 QA에서 잡았다).
 *   처음에는 봉우리를 높이 세웠다가 ★깃대가 상자 위로 잘려★ 막대만 보였다.
 *   깃발은 30px 을 쓰므로 정상은 `FLAG_ROOM` 아래에 둔다.
 */
const W = 320
const H = 146
/** 능선이 닿는 바닥 */
const BASE = H - 18
/** 정상 위에 비워 두는 높이 — 깃대(30) + 여유 */
const FLAG_ROOM = 38

/**
 * ★능선★ — 1·2·3등의 점수를 봉우리 셋으로 세운다.
 *
 * 점수를 그대로 높이로 쓰면 셋이 비슷할 때 밋밋해진다.
 * 그래서 ★1등을 정상에 두고★ 아래 둘을 그 비율로 앉힌다 —
 * «누가 위인가» 가 한눈에 보이는 것이 이 그림의 일이다.
 */
function ridgePath(peaks: readonly number[]): string {
  if (peaks.length === 0) {
    /* 아무도 안 올랐으면 ★민둥한 능선★ 하나 — 빈 상자를 보여 주지 않는다 */
    return `M0 ${BASE} L${W * 0.35} ${BASE - 26} L${W * 0.62} ${BASE - 14} L${W} ${BASE - 34} L${W} ${H} L0 ${H} Z`
  }
  const top = Math.max(...peaks)
  const height = (v: number) => {
    const ratio = top === 0 ? 0 : v / top
    /* 제일 낮은 봉우리도 바닥에 깔리지 않게 밑값을 준다. 위로는 깃발 자리를 남긴다 */
    const top1 = BASE - FLAG_ROOM
    const floor1 = BASE - 26
    return floor1 - ratio * (floor1 - top1)
  }
  /* 1등을 오른쪽(정상)에, 2·3등을 왼쪽 어깨에 앉힌다 — 카드는 왼쪽 아래에 선다 */
  const xs = [0.72, 0.42, 0.16]
  const pts = peaks.map((v, i) => ({ x: W * (xs[i] ?? 0.14 - i * 0.05), y: height(v) }))
  const sorted = [...pts].sort((a, b) => a.x - b.x)
  let d = `M0 ${BASE + 6}`
  for (const p of sorted) {
    /* 봉우리 하나마다 «올라갔다 내려오는» 두 선 — 각지게 그려야 산처럼 보인다 */
    d += ` L${(p.x - 26).toFixed(1)} ${(p.y + 22).toFixed(1)} L${p.x.toFixed(1)} ${p.y.toFixed(1)} L${(p.x + 24).toFixed(1)} ${(p.y + 20).toFixed(1)}`
  }
  d += ` L${W} ${BASE - 8} L${W} ${H} L0 ${H} Z`
  return d
}

/** 1등 봉우리의 꼭대기 좌표 — 깃발은 여기 꽂힌다 */
function summitOf(peaks: readonly number[]): { x: number; y: number } {
  if (peaks.length === 0) return { x: W * 0.35, y: BASE - 26 }
  const top = Math.max(...peaks)
  const ratio = top === 0 ? 0 : (peaks[0] ?? 0) / top
  const top1 = BASE - FLAG_ROOM
  const floor1 = BASE - 26
  return { x: W * 0.72, y: floor1 - ratio * (floor1 - top1) }
}

const MEDAL = ['#ffd95e', '#cfd8e8', '#e0a06a']

export function FlagMountain({ leagueSlug, dayKey, live, progress, rows }: FlagMountainProps) {
  const [mounted, setMounted] = useState(false)
  const [planted, setPlanted] = useState(false)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    setMounted(true)
    /* ★마감된 날에만 깃발을 꽂는다★ — 경쟁 중에는 아직 아무 것도 안 꽂혔다 */
    if (live || rows.length === 0) return
    const t = setTimeout(() => setPlanted(true), 420)
    timers.current.push(t)
    return () => {
      for (const id of timers.current) clearTimeout(id)
      timers.current = []
    }
  }, [live, rows.length, dayKey])

  /*
   * ★누구의 육각을 볼까★ (2026-09-15 사장님: «맨위 육각그래프는 (…)
   *   그 날 마감기준 1,2,3등 (…) 이것도 그 날 1700-0300까지의 육각이다»).
   *   기본은 1등. 2·3 등 줄을 누르면 그 사람 것으로 바뀐다.
   */
  const [pickedRank, setPickedRank] = useState(1)
  const picked = rows.find((r) => r.rank === pickedRank) ?? rows[0] ?? null

  /* 그날 여섯 축 → 육각형이 읽는 모양. 면적은 ★백분위★ 로 그린다 */
  const hexAxes = useMemo<HexAxisView[]>(() => {
    if (picked === null) return []
    return picked.axes.map((a) => ({
      label: playerHexLabelOf(a.key as TraitAxisKey, null),
      value: a.pct,
      /* 원값을 밑에 적는다 — 캐리력은 «킬/판» 이라 % 가 아니다 */
      note: a.value === null ? '측정중' : a.key === 'carry' ? `${a.value}킬` : `${a.value}%`,
      /*
       * ⚠ ★`rankColorHexAxis` 를 쓰면 안 된다★ — 그 함수는 «등수» 를 받는다.
       *   여기 값은 ★백분위★ (높을수록 좋다) 라 승률과 같은 잣대(`statColor`)를 쓴다.
       */
      noteColor: a.pct === null ? V3.textMuted : statColor(a.pct),
      note2: null,
    }))
  }, [picked])

  const peaks = useMemo(() => rows.map((r) => r.score), [rows])
  const path = useMemo(() => ridgePath(peaks), [peaks])
  const summit = useMemo(() => summitOf(peaks), [peaks])
  const top = rows[0] ?? null

  /* 하루가 흐른 만큼만 능선을 보여 준다 — «지금 어디쯤 올라와 있나» */
  const clipW = Math.max(6, Math.round(W * Math.min(1, Math.max(0, progress))))

  return (
    <section className="v2-flagmt">
      <header className="v2-flagmt__head">
        <span className="v2-flagmt__title">오늘의 깃발</span>
        <span className={`v2-flagmt__state${live ? ' is-live' : ''}`}>
          {live ? '경쟁중 · 새벽 3시 마감' : `${dayKey.slice(5).replace('-', '/')} 마감`}
        </span>
      </header>

      <div className="v2-flagmt__scene">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="v2-flagmt__svg"
          role="img"
          aria-label={
            top === null
              ? '오늘은 아직 아무도 정상에 오르지 않았습니다'
              : `오늘 1등 ${top.name}`
          }
        >
          <defs>
            <linearGradient id="flagmt-sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1a2740" />
              <stop offset="100%" stopColor="#0c1424" />
            </linearGradient>
            <linearGradient id="flagmt-rock" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#5b7fd6" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#25304d" stopOpacity="0.9" />
            </linearGradient>
            <clipPath id="flagmt-grow">
              <rect x="0" y="0" width={clipW} height={H} />
            </clipPath>
          </defs>

          <rect x="0" y="0" width={W} height={H} fill="url(#flagmt-sky)" />

          {/* 능선 — 하루가 흐른 만큼만 보인다 */}
          <g clipPath="url(#flagmt-grow)">
            <path d={path} fill="url(#flagmt-rock)" stroke="#7ea2ff" strokeWidth="1.1" strokeLinejoin="round" />
          </g>

          {/* ★깃발★ — 마감된 날에만. 정상에 꽂힌다 */}
          {top === null || live ? null : (
            <g
              className={`v2-flagmt__flag${mounted ? ' is-armed' : ''}${planted ? ' is-in' : ''}`}
              transform={`translate(${summit.x.toFixed(1)} ${summit.y.toFixed(1)})`}
            >
              {/* 반짝 */}
              <circle className="v2-flagmt__spark" cx="0" cy="0" r="9" fill="#ffe89a" opacity="0" />
              {/* 깃대 */}
              <rect className="v2-flagmt__pole" x="-1.2" y="-32" width="2.4" height="32" rx="1.2" fill="#ffe89a" />
              {/* 천 — 삼각형. 작으면 «막대» 로만 보인다 */}
              <path className="v2-flagmt__cloth" d="M1.2 -31 L26 -23.5 L1.2 -16 Z" fill="#ffd95e" />
            </g>
          )}
        </svg>

      </div>

      {/*
       * ★그날 육각★ (2026-09-15 사장님: «맨위 육각그래프는 (…) 그 날 마감기준 1,2,3등
       *   (…) 이것도 그 날 1700-0300까지의 육각이다 알겠지?»).
       *
       *   ★시즌 누적이 아니다★ — 그 하루에 뛴 것만으로 만든 여섯 축이고,
       *   백분위도 ★그날 뛴 사람들 안에서★ 낸 값이다.
       *   아래 1·2·3등 줄을 누르면 그 사람 것으로 바뀐다.
       */}
      {picked === null || hexAxes.length === 0 ? null : (
        <div className="v2-flagmt__hex">
          <Hexagon axes={hexAxes} id={`flagmt-${leagueSlug}-${picked.player_id}`} />
        </div>
      )}

      {/* 정상에 선 사람 — ★산 밑에 선다★ (2026-09-15 QA: 겹쳐 놓으니 능선을 가렸다) */}
      <div className="v2-flagmt__below">
        {top === null ? (
          <p className="v2-flagmt__empty">
            {live ? '아직 아무도 정상에 오르지 않았습니다' : '이 날은 깃발이 없습니다'}
            <span>하루 4판 이상 · 승률 50% 이상이면 깃발을 다툽니다</span>
          </p>
        ) : (
          <a className="v2-flagmt__top" href={`/league/${leagueSlug}/player/${top.player_id}`}>
            <span className="v2-flagmt__topname">{top.name}</span>
            {top.clan === null ? null : <span className="v2-flagmt__topclan">{top.clan.name}</span>}
            <span className="v2-flagmt__topline">
              {top.games}전 {top.win}승 {top.lose}패 · 승률 {top.win_rate}%
              {top.kd_rate === null ? null : ` · 킬뎃 ${top.kd_rate}%`}
            </span>
            {top.flags <= 0 ? null : (
              <span className="v2-flagmt__count" title={`깃발 ${top.flags}개`}>
                {'🚩'.repeat(Math.min(top.flags, 5))}
                {top.flags > 5 ? ` ${top.flags}개` : ''}
              </span>
            )}
          </a>
        )}
      </div>

      {/*
       * 1·2·3등 — ★누르면 위 육각이 그 사람 것으로 바뀐다★ (2026-09-15).
       * 닉네임만 기록실로 가는 링크다. 줄 자체를 링크로 두면 육각을 못 바꾼다.
       */}
      {rows.length === 0 ? null : (
        <ol className="v2-flagmt__rest">
          {rows.map((r) => (
            <li key={r.player_id} className={r.rank === pickedRank ? 'is-on' : undefined}>
              <button
                type="button"
                className="v2-flagmt__pick"
                aria-pressed={r.rank === pickedRank}
                onClick={() => setPickedRank(r.rank)}
              >
                <span className="v2-flagmt__rank" style={{ color: MEDAL[r.rank - 1] ?? '#8fa0bd' }}>
                  {r.rank}위
                </span>
              </button>
              <a href={`/league/${leagueSlug}/player/${r.player_id}`}>{r.name}</a>
              {r.clan === null ? null : <span className="v2-flagmt__restclan">{r.clan.name}</span>}
              <span className="v2-flagmt__restline">
                {r.win}승 {r.lose}패 · {r.win_rate}%
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
