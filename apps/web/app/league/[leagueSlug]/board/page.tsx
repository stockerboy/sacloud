'use client'

import { use } from 'react'
import { BoardListScreen } from '@/components/board/BoardListScreen'
import { resolveLeagueBoard } from './leagueBoard'

/** 리그 안 게시판 목록 `/league/{slug}/board` (지시 #14-2). 화면은 전역 게시판과 같다 */
export default function LeagueBoardPage({ params }: { params: Promise<{ leagueSlug: string }> }) {
  const { leagueSlug } = use(params)
  const { category, basePath } = resolveLeagueBoard(leagueSlug)
  return <BoardListScreen category={category} basePath={basePath} />
}
