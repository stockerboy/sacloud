import type { ClanHexagon as ClanHexagonData } from '@sacloud/contract'
import { CLAN_TRAIT_PENDING_TEXT } from '@sacloud/contract'
import { formatCount } from '../common/format'
import {
  HEX_CENTER,
  HEX_DOT_RADIUS,
  HEX_RADIUS,
  HEX_RING_SCALES,
  axisLabelAnchor,
  hexPoint,
  hexPolygon,
  hexRing,
} from './traitCopy'

/**
 * 클랜 **육각형** (`docs/SITE_SPEC_V2.md` 5-5절 · 사용자 사양의 `6각형`).
 *
 * 그리는 규칙은 선수 육각형(`TraitHexagon`)과 **똑같다** — 좌표·눈금·점 크기를
 * `traitCopy.ts` 에서 그대로 가져다 쓴다. 두 육각형이 다르게 보이면 같은 화면에서
 * 넓이를 견줄 수 없다.
 *
 * ── 모르는 축은 그리지 않는다 (D-106)
 *   배틀로그 다섯 축은 **진영을 아는 라운드가 아직 10.8% 뿐이라** 대부분 비어 있다.
 *   비면 그 축은 점선이고 값 자리에 `측정중` 과 **못 재는 이유**를 적는다.
 *   0 으로 채우면 넓이가 "못한다" 는 뜻이 되어 버린다.
 */
export function ClanHexagon({ hexagon }: { hexagon: ClanHexagonData }) {
  const filled = hexagon.axes.every((axis) => axis.percentile !== null)
  /* 0% 도 점이 보이도록 최소 반지름을 준다 — 0 은 "꼴찌" 라는 **실제 값**이다 */
  const radiusOf = (percentile: number): number =>
    Math.max(3, (Math.min(100, Math.max(0, percentile)) / 100) * HEX_RADIUS)

  return (
    <div className="mt-3">
      <div className="flex items-baseline justify-between">
        <div className="text-sm">클랜 육각형</div>
        {hexagon.measuring ? (
          <div className="text-xs text-meta">
            측정중 {formatCount(hexagon.measured)}/{hexagon.axes.length}
          </div>
        ) : null}
      </div>

      <svg
        viewBox="0 0 260 208"
        className="mx-auto mt-0.5 h-auto w-full max-w-[224px]"
        role="img"
        aria-label="클랜 육각형"
      >
        {HEX_RING_SCALES.map((scale) => (
          <polygon
            key={scale}
            points={hexRing(HEX_RADIUS * scale)}
            fill="none"
            stroke="var(--color-divider)"
            strokeWidth="0.6"
            strokeOpacity="0.75"
          />
        ))}

        {/* 축 여섯 줄. 못 잰 축은 점선이라 그림만 봐도 갈린다 */}
        {hexagon.axes.map((axis, index) => {
          const end = hexPoint(index, HEX_RADIUS)
          return (
            <line
              key={axis.key}
              x1={HEX_CENTER.x}
              y1={HEX_CENTER.y}
              x2={end.x}
              y2={end.y}
              stroke="var(--color-divider)"
              strokeWidth="0.6"
              strokeOpacity="0.75"
              strokeDasharray={axis.percentile === null ? '3 3' : undefined}
            />
          )
        })}

        {/* 여섯 축을 다 쟀을 때만 잇는다 — 반쪽 도형은 넓이를 거짓말한다 */}
        {filled ? (
          <polygon
            points={hexPolygon(hexagon.axes.map((axis) => radiusOf(axis.percentile as number)))}
            fill="var(--color-win-bar)"
            fillOpacity="0.16"
            stroke="var(--color-win-bar)"
            strokeWidth="1.4"
          />
        ) : null}

        {hexagon.axes.map((axis, index) => {
          if (axis.percentile === null) return null
          const point = hexPoint(index, radiusOf(axis.percentile))
          return (
            <circle
              key={axis.key}
              cx={point.x}
              cy={point.y}
              r={HEX_DOT_RADIUS}
              fill="var(--color-win-bar)"
            />
          )
        })}

        {hexagon.axes.map((axis, index) => {
          const at = axisLabelAnchor(index)
          return (
            <g key={axis.key}>
              <text
                x={at.x}
                y={at.y}
                textAnchor={at.anchor}
                fontSize={9}
                /* `--color-ink` 는 페이지 바닥색(#060505)이라 카드(#120c0c) 위에서
                   글자가 사라진다. 축 이름은 본문 강조색으로 그린다 (`적진`) */
                fill="var(--color-text-strong)"
              >
                {axis.label}
              </text>
              <text
                x={at.x}
                y={at.y + 11}
                textAnchor={at.anchor}
                fontSize={9}
                fill={axis.percentile === null ? 'var(--color-meta)' : 'var(--color-win-bar)'}
              >
                {axis.percentile === null
                  ? '측정중'
                  : `상위 ${Math.round((100 - axis.percentile) * 10) / 10}%`}
              </text>
            </g>
          )
        })}
      </svg>

      {/* 무엇과 견줬는지 밝힌다. 백분위는 모집단을 모르면 읽을 수 없는 값이다 */}
      {hexagon.cohort === null ? null : (
        <div className="mt-1 text-xs text-meta">
          같은 리그 {formatCount(hexagon.cohort)}팀 안에서 견줬습니다
        </div>
      )}
      {/* 못 잰 축이 있으면 **무엇이 없어서** 못 쟀는지 적는다 */}
      {hexagon.measuring ? (
        <div className="mt-0.5 text-xs text-meta">
          {[
            ...new Set(
              hexagon.axes
                .map((axis) => axis.pending)
                .filter((pending): pending is NonNullable<typeof pending> => pending !== null)
                .map((pending) => CLAN_TRAIT_PENDING_TEXT[pending]),
            ),
          ].join(' · ')}
        </div>
      ) : null}
    </div>
  )
}
