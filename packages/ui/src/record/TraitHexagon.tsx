import type { PlayerTraits } from '@sacloud/contract'
import { formatCount } from '../common/format'
import {
  HEX_CENTER,
  HEX_DOT_RADIUS,
  HEX_DOT_RADIUS_WIDE,
  HEX_RADIUS,
  HEX_RING_SCALES,
  HEX_RING_SCALES_WIDE,
  axisLabelAnchor,
  axisValueText,
  hexPoint,
  hexPolygon,
  hexRing,
  pendingSummary,
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
 *   작업성공  ╲      ╱  기회창출
 *              소수싸움
 *
 *   같은 라플수 2,006명 안에서 견줬습니다
 *   측정중 4항목 — 라운드 복원 필요 · 배틀로그 필요 · 포지션 판정 필요
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
 *
 * ── 4번 꼭지점은 **기회창출** 이다 (2026-08-31 · D-214)
 *   `매치의 사나이` 를 내린 뒤(D-206) 비워 뒀던 자리를 채웠다. 라운드의 첫 킬을 딴
 *   비율이고, 라운드 복원이 재료라 세이브·소수싸움과 같은 때에 채워진다.
 *
 *   빈 자리를 그리는 길(`pending === 'undecided'` → 이름만 적고 값 줄은 비운다)은
 *   **그대로 남긴다.** 지금 그 사유를 쓰는 축은 없지만 다음 빈 축이 생기면 그 길로 그린다.
 */

/** 백분위 → 반지름. 0%도 점이 보이도록 최소값을 준다 (0은 "꼴찌"라는 **실제 값**이다) */
function radiusOf(percentile: number): number {
  return Math.max(3, (Math.min(100, Math.max(0, percentile)) / 100) * HEX_RADIUS)
}

const WEAPON_NAME: Record<0 | 1, string> = { 0: '라플수', 1: '스나수' }

/**
 * 그림 밀도 (2026-08-30 · 사용자 지시).
 *
 * > "육각형 ui디자인이 너무 구리고 더 촘촘하게 만들고 점을 조금더 작게 만들고싶은데
 * >  너무 큼직큼직하니까 뭐 얼마나 잘하는거고 그런게 직관적으로 와닿지가 않아.
 * >  (…) 육각형이 들어간 보드자체가 너무 커서 부담스럽다."
 *
 * `dense` 가 기본이다. `wide` 는 **그 지시 이전의 그림**이다 — 사용자가
 * "바꿀 때는 전 버전도 남긴다" 고 했으므로 지우지 않고 남겨 둔다.
 */
export type HexagonVariant = 'dense' | 'wide'

export function TraitHexagon({
  traits,
  variant = 'dense',
}: {
  traits: PlayerTraits
  variant?: HexagonVariant
}) {
  const filled = traits.axes.every((axis) => axis.percentile !== null)
  const summary = pendingSummary(traits.axes)
  const dense = variant === 'dense'
  const rings = dense ? HEX_RING_SCALES : HEX_RING_SCALES_WIDE
  const dotRadius = dense ? HEX_DOT_RADIUS : HEX_DOT_RADIUS_WIDE
  /* 축 이름 · 값 글자. 촘촘한 그림에서 10px 는 고리를 덮는다 */
  const labelSize = dense ? 9 : 10

  return (
    /* `적진` — 그림자를 쓰지 않는다. 면 대신 1px 선과 여백으로 카드를 만든다 */
    <div
      className={`rounded-[2px] border border-line bg-card text-text ${dense ? 'px-5 py-4' : 'px-5 py-5'}`}
    >
      <div className="flex items-baseline justify-between">
        <div className="font-display text-[20px] leading-none text-text-strong">전투력</div>
        {traits.measuring ? (
          <div className="text-xs text-side-meta">
            전투력 측정중 {formatCount(traits.measured)}/{traits.axes.length}
          </div>
        ) : null}
      </div>

      {/* 보드가 부담스럽다는 지적에 맞춰 그림 너비에 상한을 두고 가운데로 모은다.
          예전에는 칸 너비만큼 늘어나 카드가 통째로 커졌다 */}
      <svg
        viewBox="0 0 260 208"
        className={dense ? 'mx-auto mt-0.5 h-auto w-full max-w-[224px]' : 'mt-1 h-auto w-full'}
        role="img"
        aria-label="전투력 육각형"
      >
        {/* 눈금. 촘촘할수록 한 칸이 좁아져 "얼마나 잘하는가" 가 눈에 잡힌다.
            바깥에서 두 번째 고리가 상위 20% 선이다 */}
        {rings.map((scale) => (
          <polygon
            key={scale}
            points={hexRing(HEX_RADIUS * scale)}
            fill="none"
            stroke="var(--color-side-line)"
            strokeWidth={dense ? '0.6' : '1'}
            strokeOpacity={dense ? '0.75' : '1'}
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
              strokeWidth={dense ? '0.6' : '1'}
              strokeOpacity={dense ? '0.75' : '1'}
              strokeDasharray={axis.percentile === null ? '3 3' : undefined}
            />
          )
        })}

        {/* 1. 여섯 축을 다 쟀을 때만 잇는다 */}
        {filled ? (
          <polygon
            points={hexPolygon(traits.axes.map((axis) => radiusOf(axis.percentile as number)))}
            fill="var(--color-win-bar)"
            fillOpacity="0.16"
            stroke="var(--color-win-bar)"
            strokeWidth={dense ? '1.4' : '2'}
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
              r={dotRadius}
              fill="var(--color-win-bar)"
            />
          )
        })}

        {/* 축 이름과 값 */}
        {traits.axes.map((axis, index) => {
          const at = axisLabelAnchor(index)
          const value = axisValueText(axis)
          /* 빈 자리(D-206)는 축 이름도 값도 `미정` 이다. 같은 말을 두 줄 적지 않는다 —
             이름 줄만 남기고 값 줄은 비운다.
             ⚠ 4번이 `기회창출` 로 채워져(D-214) 지금 여기 걸리는 축은 없다.
             **길은 남긴다** — 다음 빈 축이 생기면 그대로 쓴다 */
          const undecided = axis.pending === 'undecided'
          return (
            <g key={axis.key}>
              <text
                x={at.x}
                y={at.y}
                textAnchor={at.anchor}
                fontSize={labelSize}
                /* 예전에는 `--color-line`(선 색)이었다. 바닥이 검어지면서 글자가
                   그대로 사라졌다 — 축 이름은 보조 글자색으로 읽는다 */
                fill={undecided ? 'var(--color-side-meta)' : 'var(--color-meta)'}
              >
                {axis.label}
              </text>
              {undecided ? null : (
                <text
                  x={at.x}
                  y={at.y + (dense ? 11 : 12)}
                  textAnchor={at.anchor}
                  fontSize={labelSize}
                  fill={
                    axis.percentile === null ? 'var(--color-side-meta)' : 'var(--color-win-bar)'
                  }
                >
                  {value}
                </text>
              )}
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
