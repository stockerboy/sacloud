'use client'

/**
 * ★깃발 산★ — 하루(17:00~03:00)를 산 하나로 그린다 (2026-09-15 사장님).
 *
 * > «파노라 라는 어플 조사해서 그 깃발 꼽는 그 애니메이트 똑같이 따라해서
 * >  막 경쟁해서 새벽 3시에 1등인 사람이 깃발 꽂고» · «그 깃발꼽는게 귀엽게»
 * > (첫 판을 보시고) «깃발이랑 그래프 디자인 개 에반데» → 실제 화면을 주시며 «똑같이 만들어»
 *
 * ── ⚠ 첫 판은 버렸다
 *   내가 SVG 로 ★파란 삼각형 세 개★ 를 그렸다. 조잡했고 사장님이 바로 잡아 주셨다.
 *   («CSS 로 사진 흉내 내지 말 것» 은 전에도 들은 말이다 — 내가 어겼다)
 *
 * ── 사장님이 주신 화면에서 읽은 것 (그대로 옮긴다)
 *   ```
 *   회청색 바탕 + 아래쪽에 따뜻한 주황 번짐
 *   왼쪽 위에 ★아주 큰 숫자★
 *   ★흰 얇은 꺾은선★ 능선 · 선 아래는 옅은 흰 면
 *   봉우리마다 ★작은 흰 점 + 색깔 깃발★
 *   지금 지점은 ★큰 흰 원 + 바닥까지 내려오는 세로선★
 *   가로 ★점선★ 기준선 하나
 *   오른쪽에 100 / 0 · 아래에 시각 눈금
 *   여백이 많고 아주 미니멀
 *   ```
 *
 * ── 우리 것으로 옮기면
 *   ```
 *   가로축   17시 ─────────── 03시   (30분 한 칸 · 스무 칸)
 *   세로축   점수 0~100
 *   능선     ★그 시각까지의 1등 점수★
 *   깃발     1·2·3등이 가장 높이 올라간 자리 (금·은·동)
 *   큰 원    지금 시각 (마감됐으면 03시)
 *   점선     깃발 문턱 — 이 위로 올라와야 깃발을 다툰다
 *   ```
 *
 * ── ⚠ 기본은 ★보이는 것★
 *   스크립트가 죽어도 능선과 깃발은 남는다. 움직임은 `mounted` 뒤에만 건다.
 *   `prefers-reduced-motion` 이면 아무것도 안 움직인다.
 */
import { useEffect, useMemo, useState } from 'react'
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
  /** 그날(17:00~03:00) 기록만으로 만든 여섯 축. 못 재면 빈 배열 */
  axes: readonly {
    key: string
    value: number | null
    pct: number | null
    /** ★그날 안에서의 등수★ — 축 밑에 «n위» 로 적는다 (2026-09-15 사장님) */
    rank?: number | null
    total?: number | null
  }[]
}

export interface FlagTimelinePoint {
  slot: number
  score: number | null
  player_id: string | null
}

export interface FlagMountainProps {
  leagueSlug: string
  /** 마감일 `YYYY-MM-DD` */
  dayKey: string
  live: boolean
  /** 하루가 몇 % 지났나 (0~1) */
  progress: number
  /** 한 칸이 몇 분인가 */
  slotMinutes: number
  /** 능선 — 칸마다 «그때까지의 1등 점수» */
  timeline: readonly FlagTimelinePoint[]
  rows: readonly FlagMountainRow[]
}

/* ── 그림판. 좌표는 이 안에서만 쓴다 ─────────────────────────── */
const W = 360
const H = 208
/** 그림 여백 — 위는 큰 숫자 자리, 오른쪽은 눈금 글자 자리 */
const PAD = { top: 78, right: 34, bottom: 26, left: 12 }
const PLOT_W = W - PAD.left - PAD.right
const PLOT_H = H - PAD.top - PAD.bottom
/** 깃발 문턱 — 점선이 그어지는 높이 (점수) */
const THRESHOLD = 50

/**
 * ★능선 그래프를 그리나★ — 지금은 ★아니다★ (2026-09-15 사장님: «깃발 그래프 빼자 그냥 번거롭다»).
 * `true` 로 바꾸면 파노라 모양 능선이 돌아온다 (`Ridge`).
 */
const RIDGE_ON = false

/** 1·2·3등 깃발 색 — 금·은·동 */
const MEDAL = ['#ffd95e', '#dfe6f2', '#e3a06a']

const yOf = (score: number) => PAD.top + PLOT_H * (1 - Math.max(0, Math.min(100, score)) / 100)

export function FlagMountain({
  leagueSlug,
  dayKey,
  live,
  progress,
  slotMinutes,
  timeline,
  rows,
}: FlagMountainProps) {
  const [mounted, setMounted] = useState(false)
  const [planted, setPlanted] = useState(false)
  const [pickedRank, setPickedRank] = useState(1)

  useEffect(() => {
    setMounted(true)
    if (rows.length === 0) return
    const t = setTimeout(() => setPlanted(true), 420)
    return () => clearTimeout(t)
  }, [rows.length, dayKey])

  const picked = rows.find((r) => r.rank === pickedRank) ?? rows[0] ?? null

  /** 원값을 축 단위에 맞게 — ★선짤만 «회»★ 이고 나머지는 % 다 (2026-09-15) */
  const axisValueText = (a: { key: string; value: number | null }): string =>
    a.value === null ? '측정중' : a.key === 'opening' ? `${a.value}회` : `${a.value}%`

  /* 그날 여섯 축 → 육각형이 읽는 모양. 면적은 ★백분위★ 로 그린다 */
  const hexAxes = useMemo<HexAxisView[]>(() => {
    if (picked === null) return []
    return picked.axes.map((a) => ({
      label: playerHexLabelOf(a.key as TraitAxisKey, null),
      value: a.pct,
      /*
       * ★축 밑에는 «등수» 를 적는다★ (2026-09-15 사장님 «퍼센트 말고 순위로 해주면 안돼?»).
       *
       * 선수 상세·클랜 카드는 처음부터 «n위» 였는데 깃발과 오늘의 셋만 값을 적고 있었다 —
       * 그날 자료라 시즌 등수가 없어서였다. 이제 ★그날 뛴 사람들 안에서의 등수★ 다.
       * ★값은 안 사라진다★ — 두 번째 줄로 내려간다.
       *
       * ⚠ 단위는 ★선짤만 «회»★ 다. 같은 날 캐리력(→게임영향력)과 연속킬(→교환율)이
       *   둘 다 퍼센트로 옮겨 가서, 남은 «회» 는 선짤 하나뿐이다.
       */
      note: a.rank === null ? (a.value === null ? '측정중' : axisValueText(a)) : `${a.rank}위`,
      /*
       * ⚠ ★`rankColorHexAxis` 를 쓰면 안 된다★ — 그 함수는 «등수» 를 받는다.
       *   여기 값은 ★백분위★ (높을수록 좋다) 라 승률과 같은 잣대를 쓴다.
       */
      noteColor: a.pct === null ? V3.textMuted : statColor(a.pct),
      /*
       * ★모집단을 같이 적는다★ (2026-09-15 · 무한 QA) — «60위» 가 혼자 있으면
       * 깃발 1등인데 왜 60위인지 알 수 없다. «그날 82명중» 이 붙으면 읽힌다.
       * 선수 상세(`playerHexAxes`)도 «스나 24명중» 으로 같은 꼴이다.
       */
      note2: a.rank === null ? null : a.total === null ? null : `그날 ${a.total}명중`,
    }))
  }, [picked])

  return (
    <section className="v2-flagmt">
      {/*
       * ⚠ ★능선 그래프를 뺐다★ (2026-09-15 사장님: «깃발 그래프 빼자 그냥 번거롭다»).
       *
       *   산 능선은 ★그 시각까지의 1등 점수★ 를 그리는 그림이었다. 보기에는 좋았지만
       *   재료를 30분 칸으로 스무 번 접어야 해서 ★응답이 6초★ 였고, 사장님도
       *   «번거롭다» 고 하셨다. ★깃발과 1·2·3등과 육각★ 만 남긴다.
       *
       *   ★코드는 지우지 않았다★ (`CLAUDE.md` 1-4) — 아래 `Ridge` 에 그대로 있고
       *   `RIDGE_ON` 을 `true` 로 바꾸면 돌아온다. 서버의 `timeline` 도 그대로 온다.
       */}
      {RIDGE_ON ? (
        <Ridge
          dayKey={dayKey}
          live={live}
          progress={progress}
          slotMinutes={slotMinutes}
          timeline={timeline}
          rows={rows}
          mounted={mounted}
          planted={planted}
        />
      ) : (
        /* ★깃발 한 줄★ — 오늘 누가 꽂았나를 한눈에 */
        <header className="v2-flagmt__head">
          <span className="v2-flagmt__title">
            <span aria-hidden>🚩</span> 오늘의 깃발
          </span>
          <span className={`v2-flagmt__state${live ? ' is-live' : ''}`}>
            {live ? '경쟁중 · 새벽 3시 마감' : `${dayKey.slice(5).replace('-', '/')} 마감`}
          </span>
        </header>
      )}

      {/* 그날 육각 — 누른 사람 것 */}
      {picked === null || hexAxes.length === 0 ? null : (
        <div className="v2-flagmt__hex">
          <Hexagon axes={hexAxes} id={`flagmt-${leagueSlug}-${picked.player_id}`} />
        </div>
      )}

      {rows.length === 0 ? (
        <p className="v2-flagmt__empty">
          {live ? '아직 아무도 정상에 오르지 않았습니다' : '이 날은 깃발이 없습니다'}
          <span>하루 4판 이상 · 승률 50% 이상이면 깃발을 다툽니다</span>
        </p>
      ) : (
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
              {r.rank === 1 && r.flags > 0 ? (
                <span className="v2-flagmt__count" title={`깃발 ${r.flags}개`}>
                  {'🚩'.repeat(Math.min(r.flags, 5))}
                  {r.flags > 5 ? ` ${r.flags}` : ''}
                </span>
              ) : null}
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

/**
 * ⚠ ★쓰지 않는다★ — 2026-09-15 사장님: «깃발 그래프 빼자 그냥 번거롭다».
 *
 * 지우지 않고 남긴다 (`CLAUDE.md` 1-4). `RIDGE_ON` 을 `true` 로 바꾸면 돌아온다.
 * 사장님이 파노라 화면을 주시며 «똑같이 만들어» 하셔서 만든 그림이다 —
 * 회청색 바탕 · 흰 얇은 꺾은선 · 작은 깃발 · 큰 흰 원과 세로선 · 가로 점선.
 */
function Ridge({
  dayKey,
  live,
  progress,
  slotMinutes,
  timeline,
  rows,
  mounted,
  planted,
}: {
  dayKey: string
  live: boolean
  progress: number
  slotMinutes: number
  timeline: readonly FlagTimelinePoint[]
  rows: readonly FlagMountainRow[]
  mounted: boolean
  planted: boolean
}) {
  const top = rows[0] ?? null
  const points = (() => {
    const n = Math.max(2, timeline.length)
    const stepX = PLOT_W / (n - 1)
    let last = 0
    return timeline.map((p, i) => {
      const v = p.score ?? last
      last = v
      return { x: PAD.left + stepX * i, y: yOf(v), score: v, playerId: p.player_id }
    })
  })()
  const nowIndex = Math.max(
    0,
    Math.min(points.length - 1, Math.round((points.length - 1) * Math.min(1, Math.max(0, progress)))),
  )
  const nowPoint = points[nowIndex] ?? null
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
  const area =
    points.length === 0
      ? ''
      : `${line} L${points[points.length - 1]!.x.toFixed(1)} ${(H - PAD.bottom).toFixed(1)}` +
        ` L${points[0]!.x.toFixed(1)} ${(H - PAD.bottom).toFixed(1)} Z`
  const flagSpots = rows.map((r) => {
    let best: { x: number; y: number } | null = null
    for (const p of points) {
      if (p.playerId !== r.player_id) continue
      if (best === null || p.y < best.y) best = { x: p.x, y: p.y }
    }
    return {
      row: r,
      x: best?.x ?? PAD.left + PLOT_W * (0.2 + 0.18 * (r.rank - 1)),
      y: best?.y ?? yOf(r.score),
    }
  })
  const ticks = (() => {
    const n = Math.max(2, timeline.length)
    const stepX = PLOT_W / (n - 1)
    const out: { x: number; label: string }[] = []
    for (let i = 0; i < n; i += 1) {
      const minutes = i * slotMinutes
      if (minutes % 180 !== 0 && i !== n - 1) continue
      out.push({ x: PAD.left + stepX * i, label: String((17 + Math.floor(minutes / 60)) % 24).padStart(2, '0') })
    }
    return out
  })()
  return (
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="v2-flagmt__svg"
        role="img"
        aria-label={top === null ? '오늘은 아직 아무도 정상에 오르지 않았습니다' : `오늘 1등 ${top.name}`}
      >
        <defs>
          <linearGradient id="flagmt-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5d6f79" />
            <stop offset="100%" stopColor="#3f4d56" />
          </linearGradient>
          <radialGradient id="flagmt-warm" cx="0.42" cy="0.95" r="0.55">
            <stop offset="0%" stopColor="#e8a06a" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#e8a06a" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="flagmt-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.04" />
          </linearGradient>
        </defs>

        <rect x="0" y="0" width={W} height={H} fill="url(#flagmt-sky)" />
        {/* 아래쪽 따뜻한 번짐 — 사장님 화면의 그 빛이다 */}
        <rect x="0" y={H * 0.4} width={W} height={H * 0.6} fill="url(#flagmt-warm)" />

        {/* 큰 숫자 — 지금 1등 점수 */}
        <text x={PAD.left + 6} y={PAD.top - 24} className="v2-flagmt__big">
          {top === null ? '—' : Math.round(top.score)}
        </text>
        <text x={PAD.left + 8} y={PAD.top - 6} className="v2-flagmt__biglabel">
          {live ? '지금 1등 · 새벽 3시 마감' : `${dayKey.slice(5).replace('-', '/')} 마감`}
        </text>

        {/* 기준선 — 이 위로 올라와야 깃발을 다툰다 */}
        <line
          x1={PAD.left}
          y1={yOf(THRESHOLD)}
          x2={W - PAD.right + 6}
          y2={yOf(THRESHOLD)}
          className="v2-flagmt__dash"
        />

        {/* 능선 */}
        {points.length === 0 ? null : (
          <>
            <path d={area} fill="url(#flagmt-fill)" />
            <path d={line} className="v2-flagmt__line" />
          </>
        )}

        {/* 지금 지점 — 큰 원 + 바닥까지 내려오는 세로선 */}
        {nowPoint === null ? null : (
          <>
            <line
              x1={nowPoint.x}
              y1={nowPoint.y}
              x2={nowPoint.x}
              y2={H - PAD.bottom}
              className="v2-flagmt__nowline"
            />
            <circle cx={nowPoint.x} cy={nowPoint.y} r="5.5" className="v2-flagmt__nowdot" />
          </>
        )}

        {/* 깃발 — 1·2·3등 */}
        {flagSpots.map(({ row, x, y }) => (
          <g
            key={row.player_id}
            className={`v2-flagmt__flag${mounted ? ' is-armed' : ''}${planted ? ' is-in' : ''}`}
            transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}
            style={{ transitionDelay: `${(row.rank - 1) * 120}ms` }}
          >
            <circle cx="0" cy="0" r="2.6" className="v2-flagmt__peakdot" />
            <line x1="0" y1="0" x2="0" y2="-17" className="v2-flagmt__pole" />
            <path
              d="M0.8 -17 L9 -14 L0.8 -11 Z"
              fill={MEDAL[row.rank - 1] ?? '#cfd8e8'}
              className="v2-flagmt__cloth"
            />
          </g>
        ))}

        {/* 오른쪽 세로 눈금 */}
        <text x={W - PAD.right + 10} y={yOf(100) + 4} className="v2-flagmt__axis">
          100
        </text>
        <text x={W - PAD.right + 10} y={yOf(0) + 4} className="v2-flagmt__axis">
          0
        </text>

        {/* 아래 시각 눈금 */}
        {ticks.map((t) => (
          <text key={t.x} x={t.x} y={H - 8} className="v2-flagmt__axis" textAnchor="middle">
            {t.label}
          </text>
        ))}
      </svg>
  )
}
