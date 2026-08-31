'use client'

/**
 * 「알」이 가리는 자리 (사양 2장).
 *
 * ```
 * 가리지 않는다   판수 · 경기 상세기록
 * 가린다         승률 · N승N패 · 6각형 · 킬뎃(DPL) · 그 밖에 우리가 만든 지표
 * ```
 *
 * **빈칸으로 두지 않는다.** 비어 있으면 없는 줄 알지만, 문구가 있으면 궁금해진다.
 * 그래서 값을 지우는 대신 **덮는다** — 자리와 크기는 그대로 두고 읽지 못하게 한다.
 */

import type { ReactNode } from 'react'
import { EGG_VEIL_MARK, EGG_VEIL_MESSAGE, type EggState } from './eggState'

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
  if (state === 'broken') return <>{children}</>
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
  if (state === 'broken') return <>{children}</>
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

/** 표 위에 한 번만 적는 안내줄 — 칸마다 문장을 반복하지 않기 위해서다 */
export function EggVeilLegend({ message = EGG_VEIL_MESSAGE }: { message?: string }) {
  return (
    <p className="mt-2 text-[12px] text-faint">
      <span className="mr-1.5 tracking-[0.1em] text-meta">{EGG_VEIL_MARK}</span>
      {message}
    </p>
  )
}
