'use client'

import { use } from 'react'
import { PostScreen } from '@/components/board/PostScreen'
import { resolveLeagueBoard } from '../leagueBoard'

/** 리그 안 글 상세 `/league/{slug}/board/{id}` (지시 #14-2). 댓글도 여기서 */
export default function LeagueBoardPostPage({
  params,
}: {
  params: Promise<{ leagueSlug: string; id: string }>
}) {
  const { leagueSlug, id } = use(params)
  const { basePath } = resolveLeagueBoard(leagueSlug)
  return <PostScreen id={id} basePath={basePath} />
}
