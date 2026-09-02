import type { ReactNode } from 'react'
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
 * ✅ **정리했다 (2026-09-02 · D-256).** 여기 있던 임시 선언 셋(`ClanHexV2AxisKey` ·
 *   `ClanHexV2PendingReason` · `ClanHexV2Axis` · `ClanHexV2`)과 문구 표를 **계약에서 가져오는
 *   것으로 바꿨다.** 옛 주석이 *"파일이 생기면 아래 세 선언을 지우고 이 한 줄로 바꾼다"* 라고
 *   적어 둔 그대로다.
 *
 *   ⚠ 왜 지금이냐 — **베껴 둔 축 이름이 실제로 낡아 있었다.** 계약은 축을
 *   `sniperDuel`·`firstBlood`·`trade` 로 바꿨는데 이 파일은 `sniperFight`·`lastSniper`·
 *   `attackZone` 을 그대로 들고 있었다. 문구 표(`PENDING_TEXT`)도 계약과 한 글자가 달랐다
 *   (`구역 좌표 없음` vs `구역 좌표 필요`). **한쪽만 고치면 조용히 갈라지는 자리**였다.
 *
 *   타입을 다시 내보내는 것은 유지한다 — 이 이름들로 import 하던 곳이 안 깨지게 (`CLAUDE.md` 10-4).
 */
import {
  CLAN_HEX_V2_PENDING_TEXT as PENDING_TEXT,
  type ClanHexV2,
  type ClanHexV2Axis,
  type ClanHexV2AxisKey,
  type ClanHexV2PendingReason,
} from '@sacloud/contract'

export type { ClanHexV2, ClanHexV2Axis, ClanHexV2AxisKey, ClanHexV2PendingReason }

/**
 * 정규화값(0~1) → 반지름.
 *
 * 0 도 점이 보이도록 최소 반지름을 준다 — 0 은 «못 쟀다» 가 아니라 **꼴찌라는 실제 값**이다.
 * (`TraitHexagon` · 옛 `ClanHexagon` 과 같은 규칙)
 */
function radiusOf(value: number): number {
  return Math.max(3, Math.min(1, Math.max(0, value)) * HEX_RADIUS)
}

/**
 * 값 옆에 **분자/분모**를 조용히 붙인다 — `25% (5/20)` (2026-09-02 · D-256).
 *
 * ── 왜
 *   경기 상세 실측에서 **분모가 1인 축이 32.5%** 였고, 그런 값이 `100%` 로 적혀 꼭짓점을
 *   꽉 채우고 있었다(분모 ≤ 2 이면서 `raw=1.000` 인 경기×클랜 행 **2,805개**).
 *   문턱을 걸어 축을 지우는 길(㉯)과 표본으로 눌러 그리는 길(㉰)이 있었지만, 앞은
 *   **육각형이 통째로 안 그려지고** 뒤는 **우리가 상수 `k` 를 지어내야 한다**(3장 7번).
 *   분자/분모를 그냥 보여 주는 것은 **아무것도 지어내지 않고** 읽는 사람이 스스로 판단하게 한다.
 *
 * ── 규칙
 *   - 글자는 작고 조용하게(`--color-faint`). **진홍을 쓰지 않는다** (D-204)
 *   - 못 잰 축(`측정중`)에는 안 붙인다 — 붙일 숫자가 없다
 *   - 게임템포는 `초`라 분자/분모가 «몇 초 / 몇 라운드» 이고 그대로 뜻이 통한다
 *   - **변별력이 실제보다 커 보이게 만드는 장치가 아니다.** 오히려 그 반대다
 */
function Fraction({ axis }: { axis: ClanHexV2Axis }) {
  if (axis.numerator === null || axis.denominator === null || axis.raw === null) return null
  return (
    <span className="ml-1 text-[11px] font-normal text-faint">
      ({formatCount(Math.round(axis.numerator))}/{formatCount(axis.denominator)})
    </span>
  )
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
  /**
   * 배치 (2026-09-02 사장님 그림 지시 #27).
   *
   * ```
   * 'stack'  (기본) 그래프 가운데 위 · 그 아래 축 목록 — 지금까지의 모습. 경기 상세도 이것
   * 'split'  세로 중심선으로 두 쪽: 왼쪽 위 `aside`(클랜 TOP3) · 왼쪽 아래 축 목록 · 오른쪽 절반을
   *          그래프가 꽉 채운다. 폰(390)은 세로로 TOP3 → 그래프 → 목록
   * ```
   * 옛 배치를 지우지 않았다 (`CLAUDE.md` 10-4) — 클랜 기록실이 `'split'` 을 고른다.
   */
  layout?: 'stack' | 'split'
  /** `'split'` 의 왼쪽 윗공간에 들어갈 것 (클랜 TOP3). 없으면 자리를 비운다 — 지어내지 않는다 */
  aside?: ReactNode
  /** 카드 제목. 클랜 기록실은 기본 「클랜 육각형」, 경기 상세는 「경기 분석」 (지시 #31) */
  title?: string
  /**
   * 못 잰 축을 **어떻게 부르나** (2026-09-02 사장님 지시 #31 — "경기가 끝났는데 뭔 측정중이냐").
   *
   * ```
   * 'measuring'  (기본) 「측정중」 + 「배틀로그 필요」 — 통산(클랜 기록실). 배틀로그가 더 오면 채워진다
   * 'final'      경기 상세. 끝난 경기라 더 올 것이 없다 — 「기록 없음」 + 사실 그대로
   *              (배틀로그 없음 · 진영 미판정 · 상대 스나 미확인 · 표본 없음 · 구역 좌표 없음 · 비교 대상 없음)
   *              표본 줄도 사람 말로 적는다 (숫자는 그대로)
   * ```
   */
  pendingWording?: 'measuring' | 'final'
}

/** 경기 상세(끝난 경기)에서 쓰는 이유 문구 — 계약의 「~ 필요」 를 「~ 없음」 으로 (지시 #31) */
const FINAL_REASON_TEXT: Record<ClanHexV2PendingReason, string> = {
  battlelog: '배틀로그 없음',
  side: '진영 미판정',
  foeSniper: '상대 스나 미확인',
  sample: '표본 없음',
  zone: '구역 좌표 없음',
  compare: '비교 대상 없음',
}

/** 경기 상세에서 값 자리에 적는 말 */
const FINAL_PENDING_LABEL = '기록 없음'

export function ClanHexagonV2({
  hexagon,
  foe,
  name,
  layout = 'stack',
  aside,
  title = '클랜 육각형',
  pendingWording = 'measuring',
}: ClanHexagonV2Props) {
  const isFinal = pendingWording === 'final'
  const reasonText = (reason: ClanHexV2PendingReason) =>
    isFinal ? FINAL_REASON_TEXT[reason] : PENDING_TEXT[reason]
  /* 값 자리 글자 — 못 잰 축은 통산이면 계약의 「측정중」, 끝난 경기면 「기록 없음」 */
  const valueText = (axis: ClanHexV2Axis | undefined) =>
    axis === undefined
      ? isFinal
        ? FINAL_PENDING_LABEL
        : '측정중'
      : axis.value === null && isFinal
        ? FINAL_PENDING_LABEL
        : axis.text
  const foeHex = foe?.hexagon
  const compare = foeHex !== undefined
  const filled = isFilled(hexagon)
  const foeFilled = foeHex !== undefined && isFilled(foeHex)
  const empty = hexagon.measured === 0 && (foeHex === undefined || foeHex.measured === 0)

  /* ⚠ **정정 (2026-09-02 · D-256) — «구역 n/4» 표기를 뺐다.**
     여기 있던 것:
       const zoneAxis = axisOf(hexagon, 'attackZone')
     그리고 아래 머리에 «구역 {zoneLabelsUsed}/{zoneLabelsTotal}» 을 적는 블록이 있었다.

     사용자가 ① 을 스나 대 스나로 바꾸고 ⑤⑥ 을 빼면서 **구역을 보는 축이 하나도 안 남았다.**
     `attackZone` 축 자체가 없어졌으므로 이 표기는 영영 안 나온다. 죽은 조건을 남겨 두면
     다음 사람이 «왜 안 뜨지» 를 뒤진다. `zoneLabelsUsed`/`zoneLabelsTotal` **칸은 그대로 둔다** —
     옛 축이 되살아나면 그 값이 다시 뜻을 갖는다 (`CLAUDE.md` 10-4). */

  /* 못 재는 이유는 양쪽 것을 함께 모은다. 겹쳐 그릴 때 «누구 때문에 비었나» 보다
     «무엇이 없나» 가 먼저다 */
  const reasons: string[] = []
  for (const axis of [...hexagon.axes, ...(foeHex?.axes ?? [])]) {
    if (axis.pending === null) continue
    const text = reasonText(axis.pending)
    if (!reasons.includes(text)) reasons.push(text)
  }

  /* 끝난 경기(지시 #31)에서는 **이유별로 축 이름을 묶어** 사람 말로 적는다 —
     「스나싸움·선짤·교환: 배틀로그 없음 · 게임템포: 진영 미판정」. 우리 축 기준이고 상대만 못 잰
     이유는 뒤에 「상대: …」 로 붙인다. 숫자(경기 · 라운드 · 레드 라운드)는 그대로 둔다 */
  const groupedReasons = (axes: readonly ClanHexV2Axis[]): string[] => {
    const byReason = new Map<ClanHexV2PendingReason, string[]>()
    for (const axis of axes) {
      if (axis.pending === null) continue
      const list = byReason.get(axis.pending) ?? []
      list.push(axis.label)
      byReason.set(axis.pending, list)
    }
    return [...byReason.entries()].map(([reason, labels]) => `${labels.join('·')}: ${reasonText(reason)}`)
  }
  const ourMissing = hexagon.axes.filter((axis) => axis.value === null).length
  const finalSentence = isFinal
    ? [
        `${formatCount(hexagon.rounds)}라운드 중 진영을 아는 레드 라운드 ${formatCount(hexagon.redRounds)}`,
        ourMissing === 0 ? null : `못 그린 축 ${ourMissing} — ${groupedReasons(hexagon.axes).join(' · ')}`,
        foeHex && groupedReasons(foeHex.axes).length > 0
          ? `상대 — ${groupedReasons(foeHex.axes).join(' · ')}`
          : null,
      ]
        .filter((part): part is string => part !== null)
        .join(' · ')
    : null

  const header = (
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-sm text-text-strong">{title}</div>
        <div className="flex items-baseline gap-2 text-xs text-meta">
          {/* 다 쟀으면 `측정중` 이라고 적지 않는다. 예전 미리보기에서 `측정중 6/6` 이
              찍힌 적이 있다 (`apps/web/scripts/hexagonPreview.mts` 머리말).
              끝난 경기(지시 #31)에는 「측정중」 을 안 쓴다 — 아래 문장이 무엇이 없는지 말한다 */}
          {hexagon.measured < 6 && !isFinal ? (
            <span className="num">
              측정중 {hexagon.measured}/{hexagon.axes.length}
            </span>
          ) : null}
        </div>
      </div>
  )

  /* 그래프 — `split` 이면 오른쪽 절반을 꽉 채운다(최대 폭 해제), `stack` 이면 옛 224px 그대로 */
  const chart = (
    <>
      <svg
        viewBox="0 0 260 208"
        className={
          layout === 'split'
            ? 'mx-auto mt-0.5 h-auto w-full max-w-none'
            : 'mx-auto mt-0.5 h-auto w-full max-w-[224px]'
        }
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
        <div className="mt-1 text-center text-xs text-meta">
          {isFinal ? '이 경기의 배틀로그가 없습니다' : '배틀로그가 아직 없습니다'}
        </div>
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
    </>
  )

  /* 축 목록 + 표본 줄 + 못 잰 이유 — `split` 이면 왼쪽 아래로 간다 */
  const list = (
    <>
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
                  {valueText(axis)}
                  <Fraction axis={axis} />
                </span>
                {compare ? (
                  <span
                    className={`num ${(foeAxis?.value ?? null) === null ? 'text-meta' : 'text-text'}`}
                    title={foe?.name}
                  >
                    {valueText(foeAxis)}
                    {foeAxis ? <Fraction axis={foeAxis} /> : null}
                  </span>
                ) : null}
              </span>
            </div>
          )
        })}
      </div>

      {/* 표본을 밝힌다. 비율은 분모를 모르면 읽을 수 없는 값이다.
          넷(①④⑤⑥)이 레드 라운드 한정이라 레드 라운드 수를 따로 적는다.
          끝난 경기(지시 #31)는 같은 숫자를 **사람 말**로 — 「9라운드 중 진영을 아는 레드 라운드 0 ·
          못 그린 축 4 — 스나싸움·선짤·교환: 배틀로그 없음 · 게임템포: 진영 미판정」 */}
      {finalSentence !== null ? (
        <div className="num mt-1 text-xs text-meta">{finalSentence}</div>
      ) : (
        <>
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
        </>
      )}
    </>
  )

  if (layout === 'split') {
    return (
      <div className="mt-3">
        {header}
        {/* 두 쪽. PC: 왼쪽 열 = [aside 위 · 목록 아래], 오른쪽 열 = 그래프(두 줄을 다 차지).
            폰: 한 열로 TOP3 → 그래프 → 목록 (DOM 순서가 곧 폰 순서다) */}
        <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-3 max-md:grid-cols-1">
          <div className="min-w-0 md:col-start-1 md:row-start-1">{aside ?? null}</div>
          <div className="min-w-0 md:col-start-2 md:row-span-2 md:row-start-1">{chart}</div>
          <div className="min-w-0 md:col-start-1 md:row-start-2">{list}</div>
        </div>
      </div>
    )
  }

  /* 옛 배치 (`stack`) — 그래프 가운데 위, 그 아래 목록. 지우지 않았다 (`CLAUDE.md` 10-4) */
  return (
    <div className="mt-3">
      {header}
      {chart}
      {list}
    </div>
  )
}
