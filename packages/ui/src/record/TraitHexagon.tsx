import type { PlayerTraits } from '@sacloud/contract'
import { formatCount } from '../common/format'
import {
  HEX_CENTER,
  HEX_RADIUS,
  axisLabelAnchor,
  hexPoint,
  hexPolygon,
  hexRing,
  pendingSummary,
  topPercentText,
} from './traitCopy'

/**
 * 선수 **전투력 육각형** (`docs/PLAYER_TRAITS_SPEC.md` 4절 · D-185).
 *
 * **원본(3rd.supply)에 없는 화면이다.** 사용자 지시로 만들었고 원본과 동일함이
 * 검증되지 않았다 (`CLAUDE.md` 3장 7번).
 *
 * ```
 *              세이브
 *            측정중
 *   스나싸움  ╱      ╲  캐리력
 *   측정중   │   ◆   │  상위 12%
 *   작업성공  ╲      ╱  매치의사나이
 *              소수싸움
 *
 *   같은 라플수 2,006명 안에서 견줬습니다
 *   측정중 5항목 — 라운드 복원 필요 · 배틀로그 필요 · 포지션 판정 필요
 * ```
 *
 * ── 세 가지 모습
 *   1. **여섯 축을 다 쟀다** → 백분위를 이은 도형을 채운다. 그 넓이가 곧 전투력이다
 *   2. **일부만 쟀다** → 잰 축만 점으로 찍는다. **도형을 잇지 않는다** —
 *      모르는 축을 0 으로 이으면 그 넓이가 "못한다" 는 거짓이 된다 (D-106)
 *   3. **하나도 못 쟀다** → 작은 정육각형이 **심장처럼 뛴다**. `전투력 측정중`
 *
 *   사양(4절)이 정한 것은 1과 3이다. 2는 지금 재료가 두 축밖에 없어서 생긴 상태이고,
 *   잰 값을 버리지 않으려고 우리가 더했다 — 배틀로그가 들어오면 자연히 1로 넘어간다.
 */

/** 백분위 → 반지름. 0%도 점이 보이도록 최소값을 준다 (0은 "꼴찌"라는 **실제 값**이다) */
function radiusOf(percentile: number): number {
  return Math.max(3, (Math.min(100, Math.max(0, percentile)) / 100) * HEX_RADIUS)
}

const WEAPON_NAME: Record<0 | 1, string> = { 0: '라플수', 1: '스나수' }

export function TraitHexagon({ traits }: { traits: PlayerTraits }) {
  const filled = traits.axes.every((axis) => axis.percentile !== null)
  const summary = pendingSummary(traits.axes)

  return (
    <div className="bg-side px-3 py-3 text-line shadow-card">
      <div className="flex items-baseline justify-between">
        <div>전투력</div>
        {traits.measuring ? (
          <div className="text-xs text-side-meta">
            전투력 측정중 {formatCount(traits.measured)}/{traits.axes.length}
          </div>
        ) : null}
      </div>

      <svg viewBox="0 0 260 208" className="mt-1 h-auto w-full" role="img" aria-label="전투력 육각형">
        {/* 눈금 세 겹. 넓이를 눈으로 어림잡을 수 있어야 한다 */}
        {[1, 2 / 3, 1 / 3].map((scale) => (
          <polygon
            key={scale}
            points={hexRing(HEX_RADIUS * scale)}
            fill="none"
            stroke="var(--color-side-line)"
            strokeWidth="1"
          />
        ))}

        {/* 축 여섯 줄. 못 잰 축은 점선이라 그림만 봐도 갈린다 */}
        {traits.axes.map((axis, index) => {
          const end = hexPoint(index, HEX_RADIUS)
          return (
            <line
              key={axis.key}
              x1={HEX_CENTER.x}
              y1={HEX_CENTER.y}
              x2={end.x}
              y2={end.y}
              stroke="var(--color-side-line)"
              strokeWidth="1"
              strokeDasharray={axis.percentile === null ? '3 3' : undefined}
            />
          )
        })}

        {/* 1. 여섯 축을 다 쟀을 때만 잇는다 */}
        {filled ? (
          <polygon
            points={hexPolygon(traits.axes.map((axis) => radiusOf(axis.percentile as number)))}
            fill="var(--color-win-bar)"
            fillOpacity="0.35"
            stroke="var(--color-win-bar)"
            strokeWidth="2"
          />
        ) : null}

        {/* 3. 하나도 못 쟀을 때 — 심장처럼 뛰는 작은 정육각형 (사양 4절) */}
        {traits.measured === 0 ? (
          <polygon
            points={hexRing(HEX_RADIUS * 0.34)}
            fill="var(--color-side-line)"
            fillOpacity="0.55"
            stroke="var(--color-side-line)"
            strokeWidth="2"
            className="trait-heartbeat"
          />
        ) : null}

        {/* 2. 잰 축은 점으로 남긴다 (다 쟀으면 도형 꼭지점 위에 겹친다) */}
        {traits.axes.map((axis, index) => {
          if (axis.percentile === null) return null
          const point = hexPoint(index, radiusOf(axis.percentile))
          return (
            <circle
              key={axis.key}
              cx={point.x}
              cy={point.y}
              r="3.5"
              fill="var(--color-win-bar)"
            />
          )
        })}

        {/* 축 이름과 값 */}
        {traits.axes.map((axis, index) => {
          const at = axisLabelAnchor(index)
          const top = topPercentText(axis.percentile)
          return (
            <g key={axis.key}>
              <text
                x={at.x}
                y={at.y}
                textAnchor={at.anchor}
                fontSize="10"
                fill="var(--color-line)"
              >
                {axis.label}
              </text>
              <text
                x={at.x}
                y={at.y + 12}
                textAnchor={at.anchor}
                fontSize="10"
                fill={top === null ? 'var(--color-side-meta)' : 'var(--color-win-bar)'}
              >
                {top ?? '측정중'}
              </text>
            </g>
          )
        })}
      </svg>

      {/* 무엇과 견줬는지 밝힌다. 백분위는 모집단을 모르면 읽을 수 없는 값이다 */}
      {traits.weapon === null || traits.cohort === null ? null : (
        <div className="mt-1 text-xs text-side-meta">
          같은 {WEAPON_NAME[traits.weapon]} {formatCount(traits.cohort)}명 안에서 견줬습니다
        </div>
      )}
      {summary === '' ? null : <div className="mt-1 text-xs text-side-meta">{summary}</div>}
    </div>
  )
}
