'use client'

import { use } from 'react'
import { BoardDeleteScreen } from '@/components/board/BoardDeleteScreen'

/** 글 삭제 확인 `/board/{category}/{id}/delete` — 전역 게시판. 본문은 `components/board/BoardDeleteScreen` (지시 #14-2) */
export default function BoardDeletePage({
  params,
}: {
  params: Promise<{ category: string; id: string }>
}) {
  const { category, id } = use(params)
  return <BoardDeleteScreen id={id} basePath={`/board/${category}`} />
}
