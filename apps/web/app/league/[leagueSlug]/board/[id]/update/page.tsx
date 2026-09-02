'use client'

import { use } from 'react'
import { BoardUpdateScreen } from '@/components/board/BoardUpdateScreen'
import { resolveLeagueBoard } from '../../leagueBoard'

/** 리그 안 글 수정 `/league/{slug}/board/{id}/update` (지시 #14-2) */
export default function LeagueBoardUpdatePage({
  params,
}: {
  params: Promise<{ leagueSlug: string; id: string }>
}) {
  const { leagueSlug, id } = use(params)
  const { category, basePath } = resolveLeagueBoard(leagueSlug)
  return <BoardUpdateScreen category={category} id={id} basePath={basePath} />
}
