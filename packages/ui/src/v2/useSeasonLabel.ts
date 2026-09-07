'use client'

import { useEffect, useState } from 'react'
import { cloudSeasonLabel, seasonWindowAt } from '@sacloud/contract'

/**
 * ★★지금 시즌 이름★★ — `Cloud 0` (2026-09-07 · Part 10 ⑤~)
 *
 * ── ★왜 API 의 `season_type` 을 안 쓰나★
 *   리그 상세 API 도 시즌을 준다. 그런데 2026-09-07 실측에서 ★리그마다 달랐다★ —
 *   ```
 *   supply(SPL)  season=0  type=beta       ← 화면에 「BETA」가 떴다
 *   nolink(IPL)  season=0  type=official   ← 「Cloud 0」
 *   sanply(열산)  season=0  type=official   ← 「Cloud 0」
 *   ```
 *   ★같은 날, 같은 시각인데 리그마다 시즌 이름이 다르면 그건 시즌이 아니다.★
 *   DB 행이 갈라진 것이고 ★이번 작업(UI 이식)에서 고칠 것이 아니다★ (사장님 금지:
 *   season 구조 수정 · DB write). 그래서 화면은 ★홈과 같은 자리★ 를 본다 —
 *   `SEASON_WINDOWS` (`packages/contract/src/seasonWindow.ts`). 리그와 무관한 시각의 문제다.
 *
 * ── ★굳은 화면에서도 안 낡는다★
 *   랭킹 껍데기는 정적으로 굳는다(O-016). 빌드 시각으로 먼저 그리고, 붙은 뒤
 *   브라우저 시계로 한 번 다시 센다 — `useEffect` 는 hydration 다음이라 어긋나지 않는다.
 *
 * ── ★모르면 안 그린다★
 *   어느 창에도 안 들면 `null` 이다. 부르는 쪽은 그때 리본 줄 자체를 안 그린다.
 */
export function useSeasonLabel(): string | null {
  const [at, setAt] = useState<Date>(() => new Date())
  useEffect(() => {
    setAt(new Date())
  }, [])

  const window = seasonWindowAt(at)
  if (!window) return null
  /* 정식 시즌만 `Cloud N` 이다. 그 앞(legacy·beta)은 자기 이름을 쓴다 */
  return window.seasonType === 'official' ? cloudSeasonLabel(window.number) : window.label
}
