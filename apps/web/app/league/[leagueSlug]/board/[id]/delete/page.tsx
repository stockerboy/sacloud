'use client'

import { use } from 'react'
import { BoardDeleteScreen } from '@/components/board/BoardDeleteScreen'
import { resolveLeagueBoard } from '../../leagueBoard'

/** 리그 안 글 삭제 확인 `/league/{slug}/board/{id}/delete` (지시 #14-2) */
export default function LeagueBoardDeletePage({
  params,
}: {
  params: Promise<{ leagueSlug: string; id: string }>
}) {
  const { leagueSlug, id } = use(params)
  const { basePath } = resolveLeagueBoard(leagueSlug)
  return <BoardDeleteScreen id={id} basePath={basePath} />
}
