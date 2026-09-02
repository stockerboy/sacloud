'use client'

import { use } from 'react'
import { BoardWriteScreen } from '@/components/board/BoardWriteScreen'
import { resolveLeagueBoard } from '../leagueBoard'

/** 리그 안 글쓰기 `/league/{slug}/board/write` (지시 #14-2) */
export default function LeagueBoardWritePage({
  params,
}: {
  params: Promise<{ leagueSlug: string }>
}) {
  const { leagueSlug } = use(params)
  const { category, basePath } = resolveLeagueBoard(leagueSlug)
  return <BoardWriteScreen category={category} basePath={basePath} />
}
