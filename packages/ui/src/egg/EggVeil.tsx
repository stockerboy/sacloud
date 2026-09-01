'use client'

/**
 * 「알」이 가리는 자리 (사양 2장).
 *
 * ```
 * 가리지 않는다   판수 · 경기 상세기록
 * 가린다         승률 · N승N패 · 6각형 · 킬뎃(SPL) · 그 밖에 우리가 만든 지표
 * ```
 *
 * **빈칸으로 두지 않는다.** 비어 있으면 없는 줄 알지만, 문구가 있으면 궁금해진다.
 * 그래서 값을 지우는 대신 **덮는다** — 자리와 크기는 그대로 두고 읽지 못하게 한다.
 *
 * ⚠ 2026-09-02 — **이 파일의 세 함수 전부가 스위치를 탄다** (`eggState.ts`).
 *   전에는 `EggVeilLegend` 만 막았다. 나머지 둘은 `state === 'sealed'` 면 그대로 덮었고,
 *   그 `state` 를 부르는 쪽이 문맥(`useClanEgg`)이 아니라 **글자로 넘기는 자리**가 있다
 *   (`RecordPanels` 의 `props.egg ?? 'sealed'`). 그래서 스위치를 여기서도 본다 —
 *   껐으면 무엇을 넘기든 안 덮는다. `true` 로 되돌리면 옛 동작 그대로다.
 */

import type { ReactNode } from 'react'
import {
  EGG_SYSTEM_ENABLED,
  EGG_VEIL_MARK,
  EGG_VEIL_MESSAGE,
  type EggState,
} from './eggState'

/**
 * 표 한 칸처럼 좁은 자리.
 *
 * 값을 통째로 `▨▨` 로 바꾸고 문구는 `title` 로 단다. 좁은 칸에 한 문장을 우겨넣으면
 * 표가 무너진다 — 문구는 표 위에 한 번만 적는다 (`EggVeilLegend`).
 */
export function EggVeil({
  state,
  children,
}: {
  state: EggState
  children: ReactNode
}) {
  if (!EGG_SYSTEM_ENABLED || state === 'broken') return <>{children}</>
  return (
    <span
      className="select-none tracking-[0.1em] text-faint"
      title={EGG_VEIL_MESSAGE}
      aria-label={EGG_VEIL_MESSAGE}
    >
      {EGG_VEIL_MARK}
    </span>
  )
}

/**
 * 카드·그림처럼 큰 덩어리.
 *
 * 안쪽을 흐리게 덮고 그 위에 문구를 얹는다. 덮은 동안에는 누를 수도 없고
 * 스크린리더도 읽지 않는다 — 가린 값이 다른 경로로 새면 가린 뜻이 없다.
 */
export function EggVeilPanel({
  state,
  children,
  message = EGG_VEIL_MESSAGE,
  note,
}: {
  state: EggState
  children: ReactNode
  message?: string
  /** 문구 아래 한 줄 — 어떻게 깨는지 */
  note?: string
}) {
  if (!EGG_SYSTEM_ENABLED || state === 'broken') return <>{children}</>
  return (
    <div className="relative">
      <div aria-hidden className="pointer-events-none select-none blur-[6px] saturate-0 opacity-35">
        {children}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-4 text-center">
        <div className="text-[13px] text-text">{message}</div>
        {note ? <div className="text-[12px] text-faint">{note}</div> : null}
      </div>
    </div>
  )
}

/**
 * 표 위에 한 번만 적는 안내줄 — 칸마다 문장을 반복하지 않기 위해서다.
 *
 * ⚠ 2026-09-01 — 알을 껐으면 **아무것도 그리지 않는다** (`eggState.ts` 의 스위치).
 *   `RankTable` 이 이것을 **조건 없이** 표 밑에 붙이므로, 여기서 막지 않으면
 *   가린 것이 하나도 없는데 «▨▨ 알이 깨지면 기록을 볼 수 있습니다» 만 남는다.
 */
export function EggVeilLegend({ message = EGG_VEIL_MESSAGE }: { message?: string }) {
  if (!EGG_SYSTEM_ENABLED) return null
  return (
    <p className="mt-2 text-[12px] text-faint">
      <span className="mr-1.5 tracking-[0.1em] text-meta">{EGG_VEIL_MARK}</span>
      {message}
    </p>
  )
}
