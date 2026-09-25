'use client'

/**
 * ★밝은/어두운 판 전환★ (2026-09-25 사장님 「라이트 모드 만들 수 있나」 → 「밝은 색 테마」).
 *
 * 선수·클랜·경기 상세(`v3/tokens.ts` 의 `V3`)는 CSS 변수가 아니라 ★JS 값★ 을 인라인
 * 스타일로 직접 쓴다 (`tokens.ts` 머리말 참고). 그래서 사이트 전역 CSS 토큰과는 별도로,
 * 이 판이 "지금 밝은지 어두운지"를 기억하는 아주 작은 저장소를 하나 둔다.
 *
 * ── 왜 Context 가 아니라 모듈 전역인가
 *   화면 트리 전체를 `<Provider>` 로 감싸려면 `packages/ui` 를 쓰는 모든 앱(`apps/web`)의
 *   최상위 레이아웃을 건드려야 한다. `useSyncExternalStore` 는 React 18 표준 훅이라
 *   Provider 없이도 ★어디서든 구독★ 할 수 있다 — 화면을 더 넓게 건드리지 않는다.
 *
 * ── 기억하는 곳
 *   `localStorage` 하나뿐이다. 서버(SSR)는 항상 "dark" 로 그리고, 브라우저에 붙은 뒤
 *   저장된 값이 있으면 그때 한 번 바뀐다(깜빡임은 값이 있을 때만, 아주 짧다).
 */
import { useSyncExternalStore } from 'react'

export type ThemeMode = 'dark' | 'light'

const STORAGE_KEY = 'sac-v3-theme'

const listeners = new Set<() => void>()
let mode: ThemeMode = 'dark'
let initialized = false

function readStored(): ThemeMode {
  if (typeof window === 'undefined') return 'dark'
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark'
  } catch {
    /* 프라이빗 창 등에서 localStorage 가 막히면 기본값(dark)으로 */
    return 'dark'
  }
}

function ensureInit(): void {
  if (initialized) return
  initialized = true
  mode = readStored()
}

export function getThemeMode(): ThemeMode {
  ensureInit()
  return mode
}

export function setThemeMode(next: ThemeMode): void {
  ensureInit()
  if (mode === next) return
  mode = next
  try {
    window.localStorage.setItem(STORAGE_KEY, next)
  } catch {
    /* 저장이 안 돼도 이번 방문 동안은 화면에 반영된다 — 그냥 넘어간다 */
  }
  for (const fn of listeners) fn()
}

export function toggleThemeMode(): void {
  setThemeMode(getThemeMode() === 'dark' ? 'light' : 'dark')
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  return () => {
    listeners.delete(onChange)
  }
}

/** ★지금 판★ — 바뀌면 이 훅을 쓰는 모든 컴포넌트가 다시 그려진다. 서버에서는 항상 "dark" */
export function useThemeMode(): ThemeMode {
  return useSyncExternalStore(subscribe, getThemeMode, () => 'dark')
}
