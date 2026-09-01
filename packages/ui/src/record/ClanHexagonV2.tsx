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
 * 클랜 육각형 **V2** (`docs/CLAN_HEXAGON_V2_SPEC.md` · D-217 · D-235).
 *
 * 새 여섯 축이다 — **스나싸움 · 소수싸움 · 세이브 · 게임템포 · B어택성공 · A어택성공**.
 * 옛 여섯 축(D-201)은 육각형에서 내려갔지만 **`ClanHexagon.tsx` 와 그 데이터는 그대로 있다**
 * (D-235 Q9 · `CLAUDE.md` 10-4). 이 파일은 옛 판을 고치지 않고 **옆에** 놓은 새 판이다.
 *
 * ── 그리는 규칙
 *   1. 좌표·눈금·점 크기는 `traitCopy.ts` 를 **그대로** 쓴다. 선수 육각형(`TraitHexagon`)·
 *      옛 클랜 육각형과 같은 viewBox 라야 같은 화면에서 넓이를 견줄 수 있다
 *   2. 못 잰 축(`value === null`)은 축 선을 점선으로 긋고 **꼭짓점 점을 찍지 않는다**
 *   3. **여섯 축이 전부 차야만 폴리곤을 잇는다.** 반쪽 도형은 넓이를 거짓말한다 (D-106)
 *   4. 겹쳐 그릴 때는 **우리 = 진홍(선+옅은 채움) · 상대 = 본문색(선만)** 이다 (D-235 Q10).
 *      **새 색을 만들지 않는다** (D-204) — 색맹에도 «채움 있음/없음» 으로 갈린다
 *
 * ── 값을 꼭짓점에 적지 않는다
 *   옛 두 육각형은 꼭짓점 밑에 값을 적었다. 여기서는 **축 이름만** 적고 값은 아래 목록으로
 *   내렸다. 겹쳐 그릴 때 꼭짓점마다 값이 둘씩 붙으면 도형이 글자에 파묻힌다.
 *   한 겹일 때도 같은 자리에 적어야 두 모습이 안 갈린다.
 *
 * ── 카드 껍데기를 그리지 않는다
 *   테두리·배경은 **페이지가** 감싼다 (옛 `ClanHexagon` 과 같다).
 */

/* ──────────────────────────────────────────────────────────────── 계약 타입
 *
 * ⚠ 임시 선언이다. `packages/contract/src/clanTraitsV2.ts` 를 다른 작업자가 쓰고 있고,
 *   모양은 확정돼 있다. 파일이 생기면 아래 세 선언을 지우고 이 한 줄로 바꾼다:
 *
 *   import type { ClanHexV2, ClanHexV2Axis } from '@sacloud/contract'
 */

export type ClanHexV2AxisKey =
  | 'sniperFight'
  | 'outnumbered'
  | 'save'
  | 'tempo'
  | 'lastSniper'
  | 'attackZone'

export type ClanHexV2PendingReason =
  | 'battlelog'
  | 'side'
  | 'foeSniper'
  | 'sample'
  | 'zone'
  | 'compare'

export interface ClanHexV2Axis {
  key: ClanHexV2AxisKey
  /** `스나싸움` 등. **화면 문구는 계약이 준다** — 여기서 이름을 지어내지 않는다 */
  label: string
  numerator: number | null
  denominator: number | null
  /** 비율(0~1) 또는 초 */
  raw: number | null
  /** 0~1 정규화. `null` 이면 못 잰 축이다 */
  value: number | null
  /** `42%` / `18.3초` / `측정중` */
  text: string
  pending: ClanHexV2PendingReason | null
}

export interface ClanHexV2 {
  /** 항상 6개, 순서 고정 */
  axes: ClanHexV2Axis[]
  measured: number
  matches: number
  rounds: number
  redRounds: number
  /** 지금 2 (D-235 Q6 — `녹뒤`·`머리` 좌표가 아직 없다) */
  zoneLabelsUsed: number
  /** 4 */
  zoneLabelsTotal: number
  formulaVersion: string
}

/**
 * 못 재는 이유를 사람 말로.
 *
 * ⚠ 계약이 같은 표(`CLAN_HEX_V2_PENDING_TEXT`)를 내보내기 시작하면 그것을 쓰고 여기를 지운다.
 *   문구가 두 군데 있으면 조용히 갈라진다.
 */
const PENDING_TEXT: Record<ClanHexV2PendingReason, string> = {
  battlelog: '배틀로그 필요',
  side: '진영 판정 필요',
  foeSniper: '상대 스나 미확인',
  sample: '표본 부족',
  zone: '구역 좌표 없음',
  compare: '비교 대상 없음',
}

/**
 * 정규화값(0~1) → 반지름.
 *
 * 0 도 점이 보이도록 최소 반지름을 준다 — 0 은 «못 쟀다» 가 아니라 **꼴찌라는 실제 값**이다.
 * (`TraitHexagon` · 옛 `ClanHexagon` 과 같은 규칙)
 */
function radiusOf(value: number): number {
  return Math.max(3, Math.min(1, Math.max(0, value)) * HEX_RADIUS)
}

/** 같은 축을 키로 짚는다. 순서는 고정이라지만 키로 맞추면 순서가 흔들려도 안 어긋난다 */
function axisOf(hexagon: ClanHexV2 | undefined, key: ClanHexV2AxisKey): ClanHexV2Axis | undefined {
  return hexagon?.axes.find((axis) => axis.key === key)
}

/** 여섯 축을 다 쟀나 — 폴리곤을 이을지 가르는 조건 (D-106) */
function isFilled(hexagon: ClanHexV2): boolean {
  return hexagon.axes.length === 6 && hexagon.axes.every((axis) => axis.value !== null)
}

export interface ClanHexagonV2Props {
  hexagon: ClanHexV2
  /** 경기 상세에서 겹쳐 그릴 상대. 없으면 한 겹만 그린다 */
  foe?: { hexagon: ClanHexV2; name: string } | null
  /** 우리 이름 (겹쳐 그릴 때 범례에 쓴다) */
  name?: string
}

export function ClanHexagonV2({ hexagon, foe, name }: ClanHexagonV2Props) {
  const foeHex = foe?.hexagon
  const compare = foeHex !== undefined
  const filled = isFilled(hexagon)
  const foeFilled = foeHex !== undefined && isFilled(foeHex)
  const empty = hexagon.measured === 0 && (foeHex === undefined || foeHex.measured === 0)

  /* ⑥ A어택성공이 있으면 «구역 2/4» 를 적는다 (D-235 Q6).
     좌표가 둘뿐이라는 사실을 **화면이 말해야** 한다 — 값만 보면 다 센 것처럼 읽힌다 */
  const zoneAxis = axisOf(hexagon, 'attackZone')

  /* 못 재는 이유는 양쪽 것을 함께 모은다. 겹쳐 그릴 때 «누구 때문에 비었나» 보다
     «무엇이 없나» 가 먼저다 */
  const reasons: string[] = []
  for (const axis of [...hexagon.axes, ...(foeHex?.axes ?? [])]) {
    if (axis.pending === null) continue
    const text = PENDING_TEXT[axis.pending]
    if (!reasons.includes(text)) reasons.push(text)
  }

  return (
    <div className="mt-3">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-sm text-text-strong">클랜 육각형</div>
        <div className="flex items-baseline gap-2 text-xs text-meta">
          {/* 다 쟀으면 `측정중` 이라고 적지 않는다. 예전 미리보기에서 `측정중 6/6` 이
              찍힌 적이 있다 (`apps/web/scripts/hexagonPreview.mts` 머리말) */}
          {hexagon.measured < 6 ? (
            <span className="num">
              측정중 {hexagon.measured}/{hexagon.axes.length}
            </span>
          ) : null}
          {/* 구역 표기는 **모자랄 때만** 적는다.
              2026-09-01 에 사용자가 `녹뒤`·`머리` 를 직접 칠해 **넷이 다 찼다**.
              다 찼는데도 `구역 4/4` 를 적으면 «뭔가 모자란가» 로 읽힌다 —
              위의 `측정중 6/6` 을 안 적는 것과 같은 이유다. 모자라면 다시 나온다 */}
          {zoneAxis !== undefined && hexagon.zoneLabelsUsed < hexagon.zoneLabelsTotal ? (
            <span className="num">
              구역 {hexagon.zoneLabelsUsed}/{hexagon.zoneLabelsTotal}
            </span>
          ) : null}
        </div>
      </div>

      <svg
        viewBox="0 0 260 208"
        className="mx-auto mt-0.5 h-auto w-full max-w-[224px]"
        role="img"
        aria-label={compare ? '클랜 육각형 비교' : '클랜 육각형'}
      >
        {/* 눈금 다섯 겹. 한 칸이 20%p 다 */}
        {HEX_RING_SCALES.map((scale) => (
          <polygon
            key={scale}
            points={hexRing(HEX_RADIUS * scale)}
            fill="none"
            stroke="var(--color-line)"
            strokeWidth="0.6"
            strokeOpacity="0.75"
          />
        ))}

        {/* 축 여섯 줄.
            겹쳐 그릴 때는 **어느 한쪽이라도 못 쟀으면** 점선이다 — 실선은 «이 축은 둘을
            견줄 수 있다» 는 뜻이고, 한쪽이 비면 견줄 수 없다 */}
        {hexagon.axes.map((axis, index) => {
          const end = hexPoint(index, HEX_RADIUS)
          const foeAxis = axisOf(foeHex, axis.key)
          const unmeasured = axis.value === null || (compare && (foeAxis?.value ?? null) === null)
          return (
            <line
              key={axis.key}
              x1={HEX_CENTER.x}
              y1={HEX_CENTER.y}
              x2={end.x}
              y2={end.y}
              stroke="var(--color-line)"
              strokeWidth="0.6"
              strokeOpacity="0.75"
              strokeDasharray={unmeasured ? '3 3' : undefined}
            />
          )
        })}

        {/* 상대를 **먼저** 그린다. 우리가 위로 온다 (D-235 Q10) */}
        {foeHex !== undefined && foeFilled ? (
          <polygon
            points={hexPolygon(foeHex.axes.map((axis) => radiusOf(axis.value as number)))}
            fill="none"
            stroke="var(--color-text)"
            strokeWidth="1.2"
          />
        ) : null}

        {/* 우리 — 진홍. 채움은 아주 옅게(0.12) 한다. 넓은 면을 강조색으로 칠하지 않는다 (D-204) */}
        {filled ? (
          <polygon
            points={hexPolygon(hexagon.axes.map((axis) => radiusOf(axis.value as number)))}
            fill="var(--color-accent)"
            fillOpacity="0.12"
            stroke="var(--color-accent)"
            strokeWidth="1.4"
          />
        ) : null}

        {/* 하나도 못 쟀을 때 — 작은 정육각형이 심장처럼 뛴다 (`TraitHexagon` 과 같은 손짓) */}
        {empty ? (
          <polygon
            points={hexRing(HEX_RADIUS * 0.34)}
            fill="var(--color-line)"
            fillOpacity="0.55"
            stroke="var(--color-line)"
            strokeWidth="2"
            className="trait-heartbeat"
          />
        ) : null}

        {/* 상대 꼭짓점 — 속이 빈 동그라미. 채움/없음의 차이를 점에서도 지킨다 */}
        {foeHex?.axes.map((axis, index) => {
          if (axis.value === null) return null
          const point = hexPoint(index, radiusOf(axis.value))
          return (
            <circle
              key={axis.key}
              cx={point.x}
              cy={point.y}
              r={HEX_DOT_RADIUS}
              fill="none"
              stroke="var(--color-text)"
              strokeWidth="1"
            />
          )
        })}

        {/* 우리 꼭짓점 — 채운 점 */}
        {hexagon.axes.map((axis, index) => {
          if (axis.value === null) return null
          const point = hexPoint(index, radiusOf(axis.value))
          return (
            <circle
              key={axis.key}
              cx={point.x}
              cy={point.y}
              r={HEX_DOT_RADIUS}
              fill="var(--color-accent)"
            />
          )
        })}

        {/* 축 이름만 적는다. 값은 아래 목록이 맡는다 */}
        {hexagon.axes.map((axis, index) => {
          const at = axisLabelAnchor(index)
          return (
            <text
              key={axis.key}
              x={at.x}
              y={at.y}
              textAnchor={at.anchor}
              fontSize={9}
              /* `--color-ink` 는 페이지 바닥색이라 카드 위에서 글자가 사라진다.
                 축 이름은 본문 강조색으로 그린다 (`적진`) */
              fill="var(--color-text-strong)"
            >
              {axis.label}
            </text>
          )
        })}
      </svg>

      {empty ? (
        <div className="mt-1 text-center text-xs text-meta">배틀로그가 아직 없습니다</div>
      ) : null}

      {/* 범례 — 도형 아래 한 줄. 이름 옆에 채운 네모 / 빈 네모 */}
      {compare ? (
        <div className="mt-1 flex items-center justify-center gap-3 text-xs text-meta">
          <span className="flex items-center gap-1">
            {/* 채운 네모 — 도형의 채움과 같은 12% 다 */}
            <span aria-hidden className="inline-block h-2 w-2 border border-accent bg-accent/12" />
            <span className="text-text-strong">{name ?? '우리'}</span>
          </span>
          <span className="flex items-center gap-1">
            <span aria-hidden className="inline-block h-2 w-2 border border-text" />
            <span>{foe?.name}</span>
          </span>
        </div>
      ) : null}

      {/* 값 목록 — 여섯 줄. 겹쳐 그릴 때는 양쪽 값을 나란히 놓는다.
          얼룩무늬 없이 `--color-line-soft` 1px 로만 행을 나눈다 (D-204) */}
      <div className="mt-2">
        {hexagon.axes.map((axis) => {
          const foeAxis = axisOf(foeHex, axis.key)
          return (
            <div
              key={axis.key}
              className="flex items-baseline justify-between gap-2 border-b border-line-soft py-1 text-xs last:border-b-0"
            >
              <span className="text-meta">{axis.label}</span>
              <span className="flex items-baseline gap-3">
                <span
                  className={`num ${axis.value === null ? 'text-meta' : 'text-accent'}`}
                  title={compare ? (name ?? '우리') : undefined}
                >
                  {axis.text}
                </span>
                {compare ? (
                  <span
                    className={`num ${(foeAxis?.value ?? null) === null ? 'text-meta' : 'text-text'}`}
                    title={foe?.name}
                  >
                    {foeAxis?.text ?? '측정중'}
                  </span>
                ) : null}
              </span>
            </div>
          )
        })}
      </div>

      {/* 표본을 밝힌다. 비율은 분모를 모르면 읽을 수 없는 값이다.
          넷(①④⑤⑥)이 레드 라운드 한정이라 레드 라운드 수를 따로 적는다 */}
      <div className="mt-1 text-xs text-meta">
        <span className="num">경기 {formatCount(hexagon.matches)}</span>
        {' · '}
        <span className="num">
          레드 라운드 {formatCount(hexagon.redRounds)}/{formatCount(hexagon.rounds)}
        </span>
      </div>

      {reasons.length === 0 ? null : (
        <div className="mt-0.5 text-xs text-meta">{reasons.join(' · ')}</div>
      )}
    </div>
  )
}
