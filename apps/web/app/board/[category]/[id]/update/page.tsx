'use client'

import { use } from 'react'
import { BoardUpdateScreen } from '@/components/board/BoardUpdateScreen'

/** 글 수정 `/board/{category}/{id}/update` — 전역 게시판. 본문은 `components/board/BoardUpdateScreen` (지시 #14-2) */
export default function BoardUpdatePage({
  params,
}: {
  params: Promise<{ category: string; id: string }>
}) {
  const { category, id } = use(params)
  return <BoardUpdateScreen category={category} id={id} basePath={`/board/${category}`} />
}
