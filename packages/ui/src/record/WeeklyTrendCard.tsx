'use client'

import { useState } from 'react'
import {
  WEEKLY_DEFAULT_WEEKS,
  WEEKLY_RANGES,
  type WeeklyTrend,
  type WeeklyRangeWeeks,
} from '@sacloud/contract'
import {
  WEEKLY_FIXED_DOMAIN,
  weeklyFixedTicks,
  weeklyPercentDomain,
  weeklyRankDomain,
  weeklyRankY,
  weeklyDashRuns,
  weeklySegments,
  weeklyTicks,
  weeklyShowsLabel,
  weeklyTail,
  weeklyX,
  weeklyY,
  type ChartSeries,
} from './weeklyChart'

/**
 * **주간 추이 카드** (2026-09-02 사용자 지시).
 *
 * > "일주일단위로 킬데스 그래프로 찍어주기 (…) 그래프카드가 잘보이게"
 * > "일주일 단위로 찍고 찍을때마다 점을 찍어줘 그걸 다 이으면 그래프가 되는거야
 * >  그리고 점에 %를 써줘"
 * > "라플이랑 스나 킬뎃을 그래프 색을 다르게해서 한 카드 안에 (…)
 * >  여기에 승률 그래프도 (…) 순위 변동그래프도 (…) 그래프 표안에 넣어"
 * > "한달단위(5주) 두달단위(10주) 세달단위(15주) 6개월단위(25주) (…) 기본값은 최근5주치"
 *
 * ── 이 카드가 **선수와 클랜 양쪽**에 쓰인다
 *   클랜 카드는 «그래프카드에 일주일 단위 승률기록(개인기록과 동일)» 이라 했으므로
 *   승률 선 하나만 켜면 된다. 그래서 어느 선을 그릴지는 **부르는 쪽이 고른다**(`show`).
 *   화면마다 다른 그래프를 새로 만들지 않는다.
 *
 * ── 날짜를 **적는다** (2026-09-02 사장님 지시 #26 — 앞 지시를 뒤집었다)
 *   > "찍힌 날자를 적어라 (매주 수요일 아까 말한 시간이니까 목요일 날짜로 기록하면 된다)"
 *   점마다 그 주의 **목요일 날짜**(`8/7`)를 아래에 적는다. 값은 계산팀의 주 경계(`weekly.ts` ·
 *   목요일 00:00 KST)가 준 `WeeklyPoint.start` 의 월/일을 **그대로 잘라** 쓴다 — 화면에서
 *   날짜를 새로 계산하지 않는다. 값 글자와 같은 솎아내기(`weeklyShowsLabel`)라 폰에서 안 겹친다.
 *   「N주 전 · 이번 주」 줄은 그대로 두었다 (더한 것이지 뺀 것이 아니다).
 *   ⚠ 옛 서술: «날짜를 적지 않는다 — 「몇 주 전」만 한 줄로». 그때는 그랬다.
 *
 * ── 범례를 눌러 선을 **켜고 끈다** (2026-09-02 사장님 지시 #29)
 *   > "이거 누르면 해당하는 그래프만 볼 수 있게 기능 추가해라"
 *   토글이다 — 누른 선을 끄고 다시 누르면 켠다. 「하나만 보기」로 하면 셋을 다시 켜기 번거롭다.
 *   **마지막 하나는 안 꺼진다.** 꺼진 범례는 흐리고, 세로축은 남은 선의 범위로 다시 잡힌다.
 *   상태는 이 화면 안에서만 산다(저장하지 않는다). 범례가 하나뿐이면(클랜 카드) 버튼이 아니다.
 *   옛 동작(항상 다 보임)은 `LEGEND_TOGGLE` 스위치로 남아 있다 (`CLAUDE.md` 10-4).
 *
 * ── 값이 없는 선은 **범례에서도 뺀다**
 *   스나를 한 번도 안 든 선수에게 「스나 킬뎃」 범례만 덩그러니 있으면
 *   값이 0 인지 없는 건지 알 수 없다. 아예 빼는 쪽이 정직하다 (D-106).
 */

/**
 * ★옛 선 색 (파랑·주황·초록)★ — 서플라이 원본 체계였다. ★지우지 않는다★ (`CLAUDE.md` 1-4).
 *
 * 카드(#2c304c) 위 대비를 재고 고른 값들이다. 되돌리려면 `COLOR` 를 이걸로 바꾸면 된다.
 */
const COLOR_V1: Record<ChartSeries['key'], string> = {
  kd: 'var(--color-rate-1)' /* 옛 체계에는 통합 킬뎃 선이 없었다 — 되살릴 때 정하면 된다 */,
  sniper_kd: 'var(--color-rate-3)' /* 파랑 3.26:1 */,
  rifle_kd: 'var(--color-rate-2)' /* 주황 4.38:1 */,
  win_rate: 'var(--color-rate-1)' /* 초록 4.19:1 */,
  rank: 'var(--color-text)' /* 밝은 회색 9.30:1 */,
}

/**
 * ★★선 색 — 사장님 지시로 빨강으로 바꿨다★★ (2026-09-04).
 *
 * > ★「선은 빨간색」★
 *
 * ⚠ ★그런데 선이 최대 넷이다★ (스나 킬뎃 · 라플 킬뎃 · 승률 · 순위).
 *   ★똑같은 빨강 하나로 다 칠하면 어느 선이 무엇인지 못 읽는다.★
 *   ★그래서 빨강 「한 무리」로 갈랐다★ — 색상은 전부 빨강이고 ★밝기로 구분한다.★
 *   ★이건 내 판단이다.★ 「전부 같은 빨강」을 원하시면 세 값을 같게 하면 된다.
 *
 * 카드(#2c304c) 위 대비를 재고 골랐다 (옛 색들이 3.26~4.38 이었으니 그 아래로 안 내렸다) —
 * ```
 * 승률      #ff5f5f  ★4.32:1★   ← 제일 진한 빨강. ★주인공 선★
 * 라플 킬뎃  #ff8a6b  ★5.57:1★
 * 스나 킬뎃  #ffb3a7  ★7.50:1★
 * ```
 * ★순위만 회색 점선 그대로다★ — 축이 다르고(1위가 위) 단위도 「위」다.
 * ★값 선과 같은 색으로 칠하면 다른 축인 줄 모른다.★
 */
const COLOR: Record<ChartSeries['key'], string> = {
  kd: '#ff5f5f' /* ★주인공. 지금은 이 선 하나만 그린다★ */,
  sniper_kd: '#ffb3a7',
  rifle_kd: '#ff8a6b',
  win_rate: '#ff5f5f',
  rank: 'var(--color-text)' /* 밝은 회색 9.30:1 — 점선이라 더 밝게 둔다 */,
}

const LABEL: Record<ChartSeries['key'], string> = {
  kd: '킬뎃',
  sniper_kd: '스나 킬뎃',
  rifle_kd: '라플 킬뎃',
  win_rate: '승률',
  rank: '순위',
}

/**
 * ★옛 기본값★ — 넷을 다 그렸다 (2026-09-04 이전). ★지우지 않는다★ (`CLAUDE.md` 1-4).
 */
const DEFAULT_SHOW_V1: ChartSeries['key'][] = ['sniper_kd', 'rifle_kd', 'win_rate', 'rank']

/**
 * ★★기본으로 그리는 선 — 킬뎃 하나★★ (2026-09-04 사장님).
 *
 * > ★«선 걍 하나로 해 킬데스만 보이게» «다 필요없어»★
 *
 * ⚠ ★스나/라플로 나누는 것도 뺐다.★ ★「킬데스만」이라고 하셨다★ — 무기를 안 가린 ★통합 킬뎃★ 하나다.
 *   그래서 ★색을 밝기로 구분할 일도 없어졌다.★ ★빨강 하나면 된다.★
 *
 * ★부르는 쪽이 `show` 를 주면 그대로 따른다★ — 클랜 카드는 승률 하나를 준다.
 * ★넷을 다시 보려면 `DEFAULT_SHOW_V1` 로 되돌리면 된다.★
 */
const DEFAULT_SHOW: ChartSeries['key'][] = ['kd']

/**
 * 범례 토글 (지시 #29). `false` 면 옛 동작 — 범례는 글자이고 선은 항상 다 보인다.
 * 타입을 `boolean` 으로 넓혀 둔 이유는 리터럴로 좁히면 옛 가지가 «닿을 수 없는 코드» 가 되기 때문이다.
 */
const LEGEND_TOGGLE: boolean = true

/**
 * 점 아래 날짜 (지시 #26) — `WeeklyPoint.start`(KST ISO `YYYY-MM-DDT…+09:00`)의 월/일을 그대로 잘라 `8/7`.
 * `Date` 로 되돌리지 않는다 — 브라우저 시간대에 따라 하루가 밀릴 수 있고, 무엇보다 **날짜를 화면에서
 * 다시 계산하지 말라**는 지시다. 계산팀이 목요일로 맞춘 문자열이 그대로 답이다.
 */
function weekDateLabel(start: string): string {
  const month = Number(start.slice(5, 7))
  const day = Number(start.slice(8, 10))
  if (!Number.isFinite(month) || !Number.isFinite(day) || month === 0 || day === 0) return ''
  return `${month}/${day}`
}

export interface WeeklyTrendCardProps {
  weekly: WeeklyTrend
  /** 어느 선을 그릴까. 안 주면 넷 다 (선수 카드) */
  show?: ChartSeries['key'][]
  /** 카드 제목. 클랜 카드는 `주간 승률` 처럼 바꿔 부른다 */
  title?: string
  /**
   * 순위 선을 못 그리는 이유를 한 줄 적을까.
   *
   * 주간 순위 기록이 아직 없다 — **그 사실을 감추지 않는다.** 빈 자리로 두면
   * 「고장났나」로 읽히고, 0 으로 채우면 거짓말이 된다.
   */
  rankNote?: string
}

export function WeeklyTrendCard({
  weekly,
  show = DEFAULT_SHOW,
  title = '주간 추이',
  rankNote,
}: WeeklyTrendCardProps) {
  const [weeks, setWeeks] = useState<WeeklyRangeWeeks>(WEEKLY_DEFAULT_WEEKS)
  /* 범례로 끈 선 (지시 #29). 이 화면 안에서만 산다 — 저장하지 않는다 */
  const [hiddenKeys, setHiddenKeys] = useState<ChartSeries['key'][]>([])
  const points = weeklyTail(weekly.points, weeks)
  const count = points.length

  const rankValues = points.map((p) => p.rank)
  const percentOf = (key: ChartSeries['key']) =>
    points.map((p) =>
      key === 'kd'
        ? p.kd
        : key === 'sniper_kd'
          ? p.sniper_kd
          : key === 'rifle_kd'
            ? p.rifle_kd
            : p.win_rate,
    )

  /* 범례에 오를 수 있는 선 전부 — 한 점도 없는 선은 그리지도, 범례에 적지도 않는다 (D-106) */
  const available: ChartSeries[] = []
  for (const key of show) {
    if (key === 'rank') {
      if (weeklyRankDomain(rankValues) === null) continue
      available.push({
        key,
        label: LABEL[key],
        color: COLOR[key],
        dashed: true,
        values: rankValues,
        suffix: '위',
      })
      continue
    }
    const values = percentOf(key)
    if (values.every((v) => v === null)) continue
    available.push({ key, label: LABEL[key], color: COLOR[key], dashed: false, values, suffix: '%' })
  }

  /* 실제로 그리는 선 = 범례로 끄지 않은 선. 스위치가 꺼져 있으면 전부다 */
  const series = LEGEND_TOGGLE
    ? available.filter((s) => !hiddenKeys.includes(s.key))
    : available
  /* 범례를 누를 수 있나 — 선이 둘 이상일 때만. 하나뿐이면 끌 수 없으니 글자로 둔다 */
  const legendClickable = LEGEND_TOGGLE && available.length > 1

  const toggleSeries = (key: ChartSeries['key']) => {
    setHiddenKeys((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key)
      /* **마지막 하나는 안 꺼진다** — 빈 그래프를 만들지 않는다 */
      const visible = available.filter((s) => !prev.includes(s.key))
      if (visible.length <= 1) return prev
      return [...prev, key]
    })
  }

  /* 퍼센트 선들은 **축을 함께 쓴다** — 따로 쓰면 「스나가 승률보다 높다」가 거짓이 된다.
     축은 **보이는 선**으로만 잡는다 (지시 #29) — 선 하나만 남기면 그 선의 범위로 늘어난다 */
  const percentValues = series.filter((s) => s.key !== 'rank').flatMap((s) => s.values)
  /*
   * ★★축을 고정한다★★ (2026-09-04 · 사장님이 아홉 값을 직접 주셨다 · `weeklyChart.ts` 참조)
   *
   * 옛 방식(`weeklyPercentDomain`)은 ★값에 맞춰 축을 좁혔다.★ 그래서 ★주마다 축이 달라졌고★
   * 지난주 그래프와 이번주 그래프를 ★눈으로 겹쳐 볼 수 없었다.★
   * ⚠ ★값이 하나도 없으면 여전히 안 그린다★ — ★0 으로 채운 축을 만들지 않는다★ (D-106).
   *   축만 고정한 것이지 ★없는 값을 0 으로 만든 게 아니다.★
   */
  const hasPercent = percentValues.some((v) => v !== null)
  const percentDomain = hasPercent ? WEEKLY_FIXED_DOMAIN : null
  /*
   * ★옛 방식들은 지우지 않는다★ (`CLAUDE.md` 1-4). 되돌리는 법 —
   * ```
   * 축   `weeklyPercentDomain(percentValues)`   ← 값에 맞춰 좁히던 축
   * 눈금 `weeklyTicks(percentDomain)`           ← 10 단위로 자동 생성
   * 색   `COLOR_V1`                             ← 파랑·주황·초록
   * ```
   * ⚠ ★쓰지 않아도 컴파일러가 「안 읽는다」고 막는다.★ 그래서 여기서 한 번 만진다 —
   *   ★지우는 것보다 이 줄 하나가 낫다.★
   */
  void [weeklyPercentDomain, weeklyTicks, COLOR_V1, DEFAULT_SHOW_V1]
  const rankDomain = series.some((s) => s.key === 'rank') ? weeklyRankDomain(rankValues) : null

  const hasAnything = series.length > 0 && (percentDomain !== null || rankDomain !== null)

  return (
    <section className="rounded-[2px] border border-line bg-card px-4 py-4 text-text">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-medium text-text-strong">{title}</h2>
        {/* 필터 — 사용자가 준 네 구간 그대로 */}
        <div className="flex gap-1" role="group" aria-label="기간">
          {WEEKLY_RANGES.map((range) => (
            <button
              key={range.weeks}
              type="button"
              onClick={() => setWeeks(range.weeks)}
              aria-pressed={weeks === range.weeks}
              className={`rounded-[2px] border px-2 py-[3px] text-[12px] transition-colors ${
                weeks === range.weeks
                  ? 'border-accent text-accent'
                  : 'border-line text-meta hover:text-text'
              }`}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      {!hasAnything ? (
        /* 값이 하나도 없다. **빈 그래프를 그리지 않는다** */
        <p className="mt-4 text-[13px] text-meta">아직 그릴 기록이 없습니다.</p>
      ) : (
        <>
          {/* 범례 — 누를 수 있으면 버튼(지시 #29 · 키보드 포커스 포함), 아니면 글자.
              꺼진 선은 흐리게. 범례는 **끈 선도** 보여 준다 — 다시 켜야 하니까 */}
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1" role={legendClickable ? 'group' : undefined} aria-label={legendClickable ? '선 켜기·끄기' : undefined}>
            {available.map((s) => {
              const hidden = LEGEND_TOGGLE && hiddenKeys.includes(s.key)
              const swatch = (
                <span
                  aria-hidden
                  className="inline-block h-[2px] w-4"
                  style={
                    s.dashed
                      ? {
                          backgroundImage: `repeating-linear-gradient(90deg, ${s.color} 0 4px, transparent 4px 7px)`,
                        }
                      : { background: s.color }
                  }
                />
              )
              if (!legendClickable) {
                return (
                  <span key={s.key} className="flex items-center gap-1.5 text-[12px] text-meta">
                    {swatch}
                    {s.label}
                  </span>
                )
              }
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => toggleSeries(s.key)}
                  aria-pressed={!hidden}
                  title={hidden ? `${s.label} 켜기` : `${s.label} 끄기`}
                  className={`flex items-center gap-1.5 rounded-[2px] px-1 py-0.5 text-[12px] transition-opacity focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent ${
                    hidden ? 'opacity-40 hover:opacity-70' : 'text-meta hover:text-text'
                  }`}
                >
                  {swatch}
                  {s.label}
                </button>
              )
            })}
          </div>

          {/*
            ★그림은 SVG, **점과 글자는 HTML** 이다★ (2026-09-02)

            처음엔 점도 SVG `<circle>` 로 그렸는데 사장님이 «점이 왤케 큰거야» 라고 했다.
            원인은 `preserveAspectRatio="none"` 이다 — 세로·가로 배율이 달라서
            원이 **타원으로 늘어난다.** 390×190 화면에서 반지름 1.5 가
            가로 5.9px · 세로 4.6px 짜리 덩어리가 됐다.

            선은 늘어나도 상관없다(`vector-effect` 가 굵기를 지킨다). 그래서
            **선만 SVG 에 두고 점·글자는 위에 겹친 HTML 층**으로 옮겼다.
            그래야 점이 어느 화면에서나 정확히 같은 크기의 동그라미다.
          */}
          <div className="relative mt-2 h-[190px] w-full">
            {/* 눈금 — 10 단위. «저게 몇퍼대인지 보이지» */}
            {percentDomain === null
              ? null
              : weeklyFixedTicks().map((tick) => {
                  const top = weeklyY(tick, percentDomain)
                  return (
                    <div
                      key={tick}
                      className="pointer-events-none absolute inset-x-0 flex items-center gap-2"
                      style={{ top: `${top}%`, transform: 'translateY(-50%)' }}
                    >
                      <span className="num w-6 shrink-0 text-right text-[10px] leading-none text-faint">
                        {tick}
                      </span>
                      <span className="h-px flex-1 bg-line-soft" />
                    </div>
                  )
                })}

            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="absolute inset-0 h-full w-full"
              role="img"
              aria-label={`${title} — ${series.map((s) => s.label).join(' · ')} 최근 ${count}주`}
            >
              {series.map((s) => {
                const toY = (value: number) =>
                  s.key === 'rank' ? weeklyRankY(value, rankDomain!) : weeklyY(value, percentDomain!)
                return (
                  <g key={s.key}>
                    {/*
                      ★★한 선 안에서 실선과 점선이 갈린다★★ (O-045 · 2026-09-04 화면에 붙임)

                      ⚠ ★전에는 이 규칙이 계약(`weekly.ts`)에만 있고 화면엔 안 붙어 있었다.★
                        `WeeklyPoint.line` 을 아무도 읽지 않아서 ★25판 규칙이 화면에 없었다.★
                      ★순위 선은 그대로 통째로 점선이다★ — 그건 「축이 다르다」는 표시라 성질이 다르다.
                    */}
                    {weeklySegments(s.values, toY).flatMap((seg, i) =>
                      (s.key === 'rank'
                        ? [{ dashed: true, points: seg }]
                        : weeklyDashRuns(seg, (index) => points[index]?.line ?? 'dashed')
                      ).map((run, j) => (
                      <polyline
                        key={`${i}-${j}`}
                        points={run.points.map((p) => `${p.x},${p.y}`).join(' ')}
                        fill="none"
                        stroke={s.color}
                        strokeWidth={1.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeDasharray={run.dashed ? '4 3' : undefined}
                        vectorEffect="non-scaling-stroke"
                      />
                      )),
                    )}
                  </g>
                )
              })}
            </svg>

            {/* 점 + 값 — 늘어나지 않는 층 */}
            {series.map((s) =>
              s.values.map((value, index) => {
                if (value === null) return null
                const x = weeklyX(index, count)
                const y =
                  s.key === 'rank' ? weeklyRankY(value, rankDomain!) : weeklyY(value, percentDomain!)
                return (
                  <span key={`${s.key}-${index}`}>
                    <span
                      aria-hidden
                      className="pointer-events-none absolute block h-[5px] w-[5px] rounded-full"
                      style={{
                        left: `${x}%`,
                        top: `${y}%`,
                        background: s.color,
                        transform: 'translate(-50%, -50%)',
                      }}
                    />
                    {weeklyShowsLabel(index, count) ? (
                      <span
                        className="num pointer-events-none absolute whitespace-nowrap text-[9px] leading-none"
                        style={{
                          left: `${x}%`,
                          top: `${y}%`,
                          color: s.color,
                          transform: 'translate(-50%, -140%)',
                        }}
                      >
                        {Math.round(value)}
                        {s.suffix}
                      </span>
                    ) : null}
                  </span>
                )
              }),
            )}
          </div>

          {/* 점 아래 날짜 (지시 #26) — 각 점의 x 에 그 주의 목요일 날짜. 값 글자와 같은 솎아내기라
              25주 화면에서도 3주마다 하나만 적혀 폰(390px)에서 안 겹친다 */}
          <div className="relative mt-1 h-[14px] w-full">
            {points.map((p, index) => {
              if (!weeklyShowsLabel(index, count)) return null
              const label = weekDateLabel(p.start)
              if (label === '') return null
              return (
                <span
                  key={p.start}
                  className="num pointer-events-none absolute top-0 whitespace-nowrap text-[10px] leading-none text-faint"
                  style={{ left: `${weeklyX(index, count)}%`, transform: 'translateX(-50%)' }}
                >
                  {label}
                </span>
              )
            })}
          </div>

          <div className="mt-0.5 flex items-center justify-between text-[11px] text-faint">
            <span>{count}주 전</span>
            <span>이번 주</span>
          </div>
        </>
      )}

      {/* 순위 선을 못 그리는 이유 — 감추지 않는다 */}
      {show.includes('rank') && !weekly.has_rank && rankNote ? (
        <p className="mt-2 text-[12px] text-faint">{rankNote}</p>
      ) : null}
    </section>
  )
}
