'use client'

/**
 * 「알」 그림 — 클랜마크(또는 선수)를 덮는 껍데기.
 *
 * ── 두 가지 모습뿐이다 (사양 3장)
 * ```
 * sealed  알이 마크를 덮는다. 마크는 흐리게 비쳐 보인다 — "뭔가 있다" 는 알되 무엇인지는 모른다
 * broken  껍데기가 없다. 마크가 그대로 나오고 **은은하게 계속 빛난다**
 * ```
 *
 * ── 색
 *   껍데기는 무채색이다 (`--color-card-2` · `--color-line`). 진홍은 **깨진 알**에만 쓴다 —
 *   깨진 것이 드물어야 눈에 띄고, 그래야 깨러 오게 만든다.
 *   `CLAUDE.md` 3장 2번: 진홍은 아껴 쓴다.
 *
 * ── 크기는 알이 정하고, 안의 마크는 그 크기를 따라간다
 *   `[&>*]:h-full` 로 자식을 알에 맞춰 늘린다. 그래서 호출부는 `<ClanMark>` 의 size 를
 *   무엇으로 주든 알 밖으로 삐져나오지 않는다 — 표의 행 높이가 흔들리지 않는다.
 */

import type { ReactNode } from 'react'
import { EGG_SYSTEM_ENABLED, type EggState } from './eggState'

export type EggSize = 'xs' | 'sm' | 'md'

/**
 * 알 치수.
 *
 * `xs` 는 랭킹 표의 마크 자리와 **정확히 같은 치수**다 (`rankStyles.MARK` 의 리듬).
 * 여기를 바꾸면 모바일 행 높이 36px 이 무너진다.
 */
const SIZE: Record<EggSize, string> = {
  xs: 'w-8 h-8 max-md:w-[1.4rem] max-md:h-[1.4rem]',
  sm: 'w-12 h-12',
  md: 'w-[60px] h-[60px]',
}

/** 알 윤곽 — 위가 좁고 아래가 둥근 타원 */
const EGG_SHAPE = '50% 50% 50% 50% / 62% 62% 38% 38%'

/** 안에 든 것을 알 크기에 맞춘다 */
const FILL = '[&>*]:h-full [&>*]:w-full'

export interface EggProps {
  state: EggState
  size?: EggSize
  /** 알이 덮는 것 — 보통 `<ClanMark>` 다. 깨지면 이것이 그대로 나온다 */
  children: ReactNode
  /** 스크린리더·툴팁용 이름 (클랜명 · 닉네임) */
  label: string
  className?: string
}

export function Egg({ state, size = 'md', children, label, className = '' }: EggProps) {
  /*
   * ⚠ 2026-09-01 — 알을 껐다 (`eggState.ts` 의 `EGG_SYSTEM_ENABLED`).
   *
   * 껍데기도 빛(`egg-glow`)도 그리지 않고 **안에 든 것만** 내보낸다.
   * 그러면서도 **치수(`SIZE`)와 `FILL` 은 그대로 쓴다** — 이 자리는 랭킹 표의
   * 마크 칸이라, 감싸는 것을 통째로 없애면 모바일 행 높이 36px 이 무너진다.
   *
   * `title` 도 클랜명·닉네임만 남긴다. 알이 없는데 "알이 깨졌습니다" 가 뜨면 거짓말이다.
   */
  if (!EGG_SYSTEM_ENABLED) {
    return (
      <span
        className={`relative inline-flex shrink-0 items-center justify-center ${SIZE[size]} ${FILL} ${className}`}
        title={label}
      >
        {children}
      </span>
    )
  }

  if (state === 'broken') {
    /* 깨진 알 — 껍데기가 없다. 마크가 **계속** 은은하게 빛난다 (사양 3장) */
    return (
      <span
        className={`egg-glow relative inline-flex shrink-0 items-center justify-center ${SIZE[size]} ${FILL} ${className}`}
        title={`${label} — 알이 깨졌습니다`}
      >
        {children}
      </span>
    )
  }

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden ${SIZE[size]} ${className}`}
      style={{ borderRadius: EGG_SHAPE }}
      title={`${label} — 알이 깨지지 않았습니다`}
    >
      {/* 덮인 마크. 지우지 않는다 — 흐리게 비쳐 보여야 궁금해진다 */}
      <span
        aria-hidden
        className={`absolute inset-0 flex items-center justify-center opacity-25 blur-[3px] grayscale ${FILL}`}
      >
        {children}
      </span>
      {/* 껍데기 */}
      <span aria-hidden className="egg-shell absolute inset-0" style={{ borderRadius: EGG_SHAPE }} />
    </span>
  )
}
