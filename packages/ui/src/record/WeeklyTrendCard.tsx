'use client'

import { useState } from 'react'
import {
  WEEKLY_DEFAULT_WEEKS,
  WEEKLY_RANGES,
  type WeeklyTrend,
  type WeeklyRangeWeeks,
} from '@sacloud/contract'
import {
  weeklyPercentDomain,
  weeklyRankDomain,
  weeklyRankY,
  weeklySegments,
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
 * ── 날짜를 **적지 않는다** (사용자 지시)
 *   가로축에 눈금 글자가 없다. 대신 「몇 주 전」이 왼→오른쪽이라는 것만 한 줄로 적는다.
 *
 * ── 값이 없는 선은 **범례에서도 뺀다**
 *   스나를 한 번도 안 든 선수에게 「스나 킬뎃」 범례만 덩그러니 있으면
 *   값이 0 인지 없는 건지 알 수 없다. 아예 빼는 쪽이 정직하다 (D-106).
 */

/** 선 색 — 전부 토큰에서 온다. 여기서 새 색을 지어내지 않는다 */
const COLOR: Record<ChartSeries['key'], string> = {
  /* 서플라이 원본 색 체계를 그대로 쓴다 (사용자 지시). 카드(#2c304c) 위 대비를 재고 골랐다 */
  sniper_kd: 'var(--color-rate-3)' /* 파랑 3.26:1 */,
  rifle_kd: 'var(--color-rate-2)' /* 주황 4.38:1 */,
  win_rate: 'var(--color-rate-1)' /* 초록 4.19:1 */,
  rank: 'var(--color-text)' /* 밝은 회색 9.30:1 — 점선이라 더 밝게 둔다 */,
}

const LABEL: Record<ChartSeries['key'], string> = {
  sniper_kd: '스나 킬뎃',
  rifle_kd: '라플 킬뎃',
  win_rate: '승률',
  rank: '순위',
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
  show = ['sniper_kd', 'rifle_kd', 'win_rate', 'rank'],
  title = '주간 추이',
  rankNote,
}: WeeklyTrendCardProps) {
  const [weeks, setWeeks] = useState<WeeklyRangeWeeks>(WEEKLY_DEFAULT_WEEKS)
  const points = weeklyTail(weekly.points, weeks)
  const count = points.length

  /* 퍼센트 세 선은 **축을 함께 쓴다** — 따로 쓰면 「스나가 승률보다 높다」가 거짓이 된다 */
  const percentKeys = show.filter((key) => key !== 'rank')
  const percentValues = percentKeys.flatMap((key) =>
    points.map((p) => (key === 'sniper_kd' ? p.sniper_kd : key === 'rifle_kd' ? p.rifle_kd : p.win_rate)),
  )
  const percentDomain = weeklyPercentDomain(percentValues)

  const rankValues = points.map((p) => p.rank)
  const rankDomain = show.includes('rank') ? weeklyRankDomain(rankValues) : null

  const series: ChartSeries[] = []
  for (const key of show) {
    if (key === 'rank') {
      if (!rankDomain) continue
      series.push({
        key,
        label: LABEL[key],
        color: COLOR[key],
        dashed: true,
        values: rankValues,
        suffix: '위',
      })
      continue
    }
    const values = points.map((p) =>
      key === 'sniper_kd' ? p.sniper_kd : key === 'rifle_kd' ? p.rifle_kd : p.win_rate,
    )
    /* 한 점도 없는 선은 그리지도, 범례에 적지도 않는다 */
    if (values.every((v) => v === null)) continue
    series.push({ key, label: LABEL[key], color: COLOR[key], dashed: false, values, suffix: '%' })
  }

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
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
            {series.map((s) => (
              <span key={s.key} className="flex items-center gap-1.5 text-[12px] text-meta">
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
                {s.label}
              </span>
            ))}
          </div>

          <div className="mobile-scroll-x mt-2">
            <svg
              viewBox="0 0 100 62"
              preserveAspectRatio="none"
              className="h-[190px] w-full"
              role="img"
              aria-label={`${title} — ${series.map((s) => s.label).join(' · ')} 최근 ${count}주`}
            >
              {/* 가로 안내선 넷. 눈금 숫자는 안 쓴다 (날짜·눈금을 적지 말라는 지시) */}
              {[0, 1, 2, 3].map((i) => {
                const y = 14 + (i / 3) * (62 - 14 - 12)
                return (
                  <line
                    key={i}
                    x1={0}
                    x2={100}
                    y1={(y * 62) / 100}
                    y2={(y * 62) / 100}
                    stroke="var(--color-line-soft)"
                    strokeWidth={0.3}
                    vectorEffect="non-scaling-stroke"
                  />
                )
              })}

              {series.map((s) => {
                const toY = (value: number) =>
                  s.key === 'rank'
                    ? ((weeklyRankY(value, rankDomain!) * 62) / 100)
                    : ((weeklyY(value, percentDomain!) * 62) / 100)
                const segments = weeklySegments(s.values, toY)
                return (
                  <g key={s.key}>
                    {segments.map((seg, i) => (
                      <polyline
                        key={i}
                        points={seg.map((p) => `${p.x},${p.y}`).join(' ')}
                        fill="none"
                        stroke={s.color}
                        strokeWidth={1.6}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeDasharray={s.dashed ? '3 2.5' : undefined}
                        vectorEffect="non-scaling-stroke"
                      />
                    ))}
                    {segments.flat().map((p) => (
                      <circle
                        key={`${s.key}-${p.index}`}
                        cx={p.x}
                        cy={p.y}
                        r={1.5}
                        fill={s.color}
                        vectorEffect="non-scaling-stroke"
                      />
                    ))}
                  </g>
                )
              })}
            </svg>
          </div>

          {/*
            점 옆 글자는 SVG 밖에 겹쳐 놓는다.
            `preserveAspectRatio="none"` 으로 늘린 SVG 안에 텍스트를 넣으면 글자까지 늘어난다.
          */}
          <div className="relative -mt-[190px] h-[190px] w-full">
            {series.map((s) =>
              s.values.map((value, index) => {
                if (value === null || !weeklyShowsLabel(index, count)) return null
                const x = weeklyX(index, count)
                const y =
                  s.key === 'rank' ? weeklyRankY(value, rankDomain!) : weeklyY(value, percentDomain!)
                return (
                  <span
                    key={`${s.key}-${index}`}
                    className="num pointer-events-none absolute -translate-x-1/2 -translate-y-full whitespace-nowrap text-[10px] leading-none"
                    style={{ left: `${x}%`, top: `${y}%`, color: s.color, marginTop: '-4px' }}
                  >
                    {s.key === 'rank' ? Math.round(value) : Math.round(value)}
                    {s.suffix}
                  </span>
                )
              }),
            )}
          </div>

          <div className="mt-1 flex items-center justify-between text-[11px] text-faint">
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
