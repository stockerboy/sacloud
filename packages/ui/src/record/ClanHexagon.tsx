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
/**
 * ── ⚠ **정정 (2026-09-01 · D-235 Q9)** — 이 여섯 축은 **육각형 자리에서 내려왔다**
 *
 *   사용자가 클랜 육각형을 새로 정의하면서 *"기본거 없애고"* 라고 했다 (D-217).
 *   그래서 육각형은 `ClanHexagonV2`(스나싸움 · 소수싸움 · 세이브 · 게임템포 ·
 *   B어택성공 · A어택성공)가 그린다.
 *
 *   그러나 **이 컴포넌트도 이 값들도 지우지 않는다.**
 *   `기본거 없애고` 는 «육각형에서 빼라» 는 말이고, 값을 화면에서 없애는 것은 다른 일이다.
 *   **데이터가 사라지면 그것은 결함이다** (`CLAUDE.md` 3장 8번 · 10-4).
 *
 *   그래서 `variant` 를 뒀다 — `TraitHexagon` 이 옛 `wide` 를 남긴 것과 같은 방식이다.
 *
 *   ```
 *   variant="hexagon"  옛 모습 그대로. 도형을 그린다      ← 기본값. 아무것도 안 바뀐다
 *   variant="list"     도형 없이 줄 표기만                ← 클랜 페이지가 지금 쓰는 것
 *   ```
 *
 *   ⚠ 이 여섯 중 `게임템포` 는 V2 의 같은 이름과 **다른 지표다** (옛: 라운드 길이 중앙값,
 *     새: 레드일 때 상대 3명 지우기까지 걸린 초). **두 육각형을 나란히 놓지 않는다.**
 */
export function ClanHexagon({
  hexagon,
  variant = 'hexagon',
}: {
  hexagon: ClanHexagonData
  variant?: 'hexagon' | 'list'
}) {
  const filled = hexagon.axes.every((axis) => axis.percentile !== null)

  /* 줄 표기 — 도형을 빼고 값만 남긴다. 축 순서는 도형과 같게 둔다(읽는 순서가 안 바뀌게) */
  if (variant === 'list') {
    return (
      <div className="mt-3">
        <div className="flex items-baseline justify-between">
          {/* O-040 ② — 옛 이름 「지표 여섯」. 선수 화면(`TraitHexagon`)의 「전투력」으로 맞췄다 */}
          <div className="text-sm">전투력</div>
          {hexagon.cohort === null ? null : (
            <div className="text-xs text-meta">
              같은 리그 {formatCount(hexagon.cohort)}팀 안에서
            </div>
          )}
        </div>

        <div className="mt-1">
          {hexagon.axes.map((axis) => (
            <div
              key={axis.key}
              className="flex items-baseline justify-between border-b border-line-soft py-1.5 text-sm last:border-b-0"
            >
              <span className="text-text">{axis.label}</span>
              <span
                className={axis.percentile === null ? 'text-xs text-meta' : 'num text-text-strong'}
              >
                {axis.percentile === null
                  ? '측정중'
                  : `상위 ${Math.round((100 - axis.percentile) * 10) / 10}%`}
              </span>
            </div>
          ))}
        </div>

        {hexagon.measuring ? (
          <div className="mt-1 text-xs text-meta">
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
  /* 0% 도 점이 보이도록 최소 반지름을 준다 — 0 은 "꼴찌" 라는 **실제 값**이다 */
  const radiusOf = (percentile: number): number =>
    Math.max(3, (Math.min(100, Math.max(0, percentile)) / 100) * HEX_RADIUS)

  return (
    <div className="mt-3">
      <div className="flex items-baseline justify-between">
        {/* O-040 ② — 옛 이름 「클랜 육각형」. 같은 그림을 위에서는 「지표 여섯」이라 불렀다 */}
        <div className="text-sm">전투력</div>
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
        aria-label="전투력 육각형"
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
