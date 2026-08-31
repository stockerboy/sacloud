'use client'

/**
 * 「알」이 깨졌는지를 화면 전체에 하나로 알려 주는 문맥.
 *
 * 화면 컴포넌트가 저마다 "이 사람 알이 깨졌나" 를 다시 계산하면 화면마다 답이
 * 달라진다. **판정은 한 곳에서만** 하고, 나머지는 물어보기만 한다.
 *
 * ── 무엇을 넣어 주는가는 이 파일이 정하지 않는다
 *   `packages/ui` 는 API 도 DB 도 모른다. 깨진 목록을 채우는 일은 `apps/web` 이 한다
 *   (`apps/web/app/_egg/EggBoot.tsx`).
 *
 * ── 아직 없는 것
 *   사양 4장의 **칭호 인증**과 3장의 **30% 집계**는 DB·수집 쪽 일이라 여기에 없다.
 *   그때가 오면 이 문맥에 넣어 주는 값만 바뀌고, 화면은 한 줄도 고치지 않아도 된다.
 */

import { createContext, useContext, useMemo } from 'react'
import type { ReactNode } from 'react'
import type { EggState } from './eggState'

export interface EggKnowledge {
  /** 알이 깨진 플레이어 id */
  brokenPlayerIds: readonly string[]
  /** 알이 깨진 클랜 slug */
  brokenClanSlugs: readonly string[]
  /**
   * 아직 판정을 못 하는 상태(불러오는 중).
   *
   * 이때도 화면은 **알을 씌운 채로** 그린다. 잠깐 기록이 보였다가 덮이는 것보다
   * 덮인 채로 있다가 열리는 편이 낫다.
   */
  loading?: boolean
}

const EMPTY: EggKnowledge = { brokenPlayerIds: [], brokenClanSlugs: [] }

const EggContext = createContext<EggKnowledge>(EMPTY)

export function EggProvider({
  value,
  children,
}: {
  value: EggKnowledge
  children: ReactNode
}) {
  /* 배열 정체성이 매번 바뀌어도 아래 훅이 헛돌지 않게 Set 으로 굳혀 둔다 */
  const stable = useMemo<EggKnowledge>(
    () => ({
      brokenPlayerIds: value.brokenPlayerIds,
      brokenClanSlugs: value.brokenClanSlugs,
      loading: value.loading,
    }),
    [value.brokenPlayerIds, value.brokenClanSlugs, value.loading],
  )
  return <EggContext.Provider value={stable}>{children}</EggContext.Provider>
}

export function useEggKnowledge(): EggKnowledge {
  return useContext(EggContext)
}

/** 이 플레이어의 알이 깨졌는가 */
export function usePlayerEgg(playerId?: string | null): EggState {
  const { brokenPlayerIds } = useContext(EggContext)
  if (!playerId) return 'sealed'
  return brokenPlayerIds.includes(playerId) ? 'broken' : 'sealed'
}

/** 이 클랜의 알이 깨졌는가 */
export function useClanEgg(clanSlug?: string | null): EggState {
  const { brokenClanSlugs } = useContext(EggContext)
  if (!clanSlug) return 'sealed'
  return brokenClanSlugs.includes(clanSlug) ? 'broken' : 'sealed'
}

/** 가려야 하는가 — `sealed` 면 참 */
export function isSealed(state: EggState): boolean {
  return state === 'sealed'
}
