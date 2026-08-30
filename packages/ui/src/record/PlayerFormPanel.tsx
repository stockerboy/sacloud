import type { PlayerForm } from '@sacloud/contract'
import { FORM_RECENT_GAMES } from '@sacloud/contract'
import { formatCount, formatRate } from '../common/format'
import { rateClass } from '../common/rate'
import { FORM_TREND_CLASS, FORM_TREND_TEXT, formMonthLabel } from './formCopy'
import { formChartDomain, formChartSegments, formChartX, formChartY } from './formChart'

/**
 * 선수 프로필 `최근 폼` (D-167).
 *
 * **원본(3rd.supply)에 없는 블록이다.** 사용자 요구로 승률 도넛 자리를 대신한다.
 * 원본과 동일함이 검증되지 않았다 (CLAUDE.md 3장 7번).
 *
 * ```
 * 최근 폼                        최근 6개월 · 한 달 단위 킬뎃
 * ┌───────────────────────────────────────────────┐
 * │      ●───●                                    │
 * │  ●          ╲              ●───●   ← 빈 달은 선이 끊긴다
 * │               ●                               │
 * └───────────────────────────────────────────────┘
 *   3월    4월    5월    6월    7월    8월
 *  50.3%  48.8%  50.7% 알수없음 45.9%  47.0%
 *
 * 최근 꾸준한 퍼포먼스를 보여줍니다   최근 10경기 킬뎃 47.1% · 직전 30경기 47.9%
 * ```
 *
 * ── 왜 SVG 를 직접 그리는가
 *   꺾은선 하나에 차트 라이브러리를 새로 깔지 않는다 (CLAUDE.md 7장 인프라 설치 원칙).
 *
 * ── 왜 선만 SVG 이고 점·기준선은 HTML 인가
 *   이 칸의 폭이 모바일 ~330px, PC ~800px 로 두 배 넘게 차이 난다.
 *   `preserveAspectRatio` 를 맞춰 두면 PC 에서 세로가 같이 늘어나 배너처럼 커진다.
 *   그래서 좌표계를 `0~100` 으로 두고 가로세로를 따로 늘린다(`none`).
 *   그러면 원은 타원이 되고 선 두께가 방향에 따라 달라지므로 —
 *   **선만** SVG 로 그리고 `vector-effect="non-scaling-stroke"` 로 두께를 고정했고,
 *   점과 기준선은 HTML 로 얹었다.
 *   높이는 예전 도넛(`h-28`)과 같은 값이다. 새 크기를 만들지 않았다.
 *
 * ── 결측 (D-106)
 *   경기가 없던 달은 `kd_rate = null` 이다. **0% 로 찍어 선을 바닥까지 끌지 않는다.**
 *   점을 그리지 않고 선을 끊으며, 눈금에는 `알수없음` 이라고 쓴다.
 *   여섯 달이 통째로 비면 그래프 대신 한 줄로 그 사실만 말한다.
 */

function TrendLine({ form }: { form: PlayerForm }) {
  return (
    <div className={`mt-2 ${FORM_TREND_CLASS[form.trend]}`}>
      {FORM_TREND_TEXT[form.trend]}
      {/* 무엇을 보고 그렇게 판정했는지 숫자를 함께 남긴다.
          판정이 불가능했으면 근거도 없으므로 아무것도 붙이지 않는다 */}
      {form.trend === 'unknown' ? null : (
        <span className="ml-2 text-xs text-meta">
          최근 {formatCount(FORM_RECENT_GAMES)}경기 킬뎃{' '}
          {form.recent_kd_rate === null ? '알수없음' : `${formatRate(form.recent_kd_rate)}%`} · 직전{' '}
          {formatCount(form.baseline_games)}경기{' '}
          {form.baseline_kd_rate === null ? '알수없음' : `${formatRate(form.baseline_kd_rate)}%`}
        </span>
      )}
    </div>
  )
}

export function PlayerFormPanel({ form }: { form: PlayerForm }) {
  const values = form.months
    .map((month) => month.kd_rate)
    .filter((value): value is number => value !== null)
  const domain = formChartDomain(values)

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <div className="text-lg">최근 폼</div>
        <div className="text-xs text-meta">최근 6개월 · 한 달 단위 킬뎃</div>
      </div>

      {domain === null ? (
        /* 여섯 달이 통째로 비었다. 0 으로 채운 빈 그래프를 그리지 않는다 (D-106) */
        <div className="py-6 text-center text-meta">최근 6개월간 기록된 경기가 없습니다.</div>
      ) : (
        <>
          <div className="relative mt-2 h-28 border-t border-b border-t-line-soft border-b-line-soft">
            {/* 킬뎃 50% 기준선. 킬과 데스가 같아지는 지점이라 위/아래가 뜻을 갖는다.
                축 범위 밖이면 그리지 않는다 */}
            {domain.lo <= 50 && domain.hi >= 50 ? (
              <div
                className="pointer-events-none absolute inset-x-0 border-t border-dashed border-t-line"
                style={{ top: `${formChartY(50, domain)}%` }}
                aria-hidden
              />
            ) : null}

            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="absolute inset-0 h-full w-full"
              aria-hidden
            >
              {formChartSegments(form.months, domain).map((segment) => (
                <polyline
                  key={segment.key}
                  points={segment.points}
                  fill="none"
                  stroke="var(--color-win-bar)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </svg>

            {/* 점은 HTML 이다 — 가로세로 배율이 달라서 SVG 원은 타원이 된다 */}
            {form.months.map((month, index) =>
              month.kd_rate === null ? null : (
                <div
                  key={month.month}
                  className="absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-win-bar"
                  style={{
                    left: `${formChartX(index, form.months.length)}%`,
                    top: `${formChartY(month.kd_rate, domain)}%`,
                  }}
                  aria-hidden
                />
              ),
            )}
          </div>

          {/* 눈금 — 달 이름과 그 달의 킬뎃. 랭킹 표와 **같은 색 등급**을 쓴다 */}
          <div
            className="mt-1 grid text-center"
            style={{ gridTemplateColumns: `repeat(${form.months.length}, minmax(0, 1fr))` }}
          >
            {form.months.map((month) => (
              <div key={month.month}>
                <div className="text-xs text-meta">{formMonthLabel(month.month)}</div>
                {month.kd_rate === null ? (
                  /* 경기가 없던 달 (D-106). `0%` 로 채우지 않는다 */
                  <div className="text-xs text-meta">알수없음</div>
                ) : (
                  <div className={`text-xs ${rateClass(month.kd_rate)}`}>
                    {formatRate(month.kd_rate)}%
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <TrendLine form={form} />
    </div>
  )
}
