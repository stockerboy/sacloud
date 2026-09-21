'use client'

import { use } from 'react'
import { BoardListScreen } from '@/components/board/BoardListScreen'
import { resolveLeagueBoard } from './leagueBoard'

/* ★갱신 주기 60초★ (2026-09-21) — 까닭은 `app/player/[playerId]/page.tsx` 에 한 번만 적었다 */
export const revalidate = 60


/** 리그 안 게시판 목록 `/league/{slug}/board` (지시 #14-2). 화면은 전역 게시판과 같다 */
export default function LeagueBoardPage({ params }: { params: Promise<{ leagueSlug: string }> }) {
  const { leagueSlug } = use(params)
  const { category, basePath } = resolveLeagueBoard(leagueSlug)
  return <BoardListScreen category={category} basePath={basePath} />
}
