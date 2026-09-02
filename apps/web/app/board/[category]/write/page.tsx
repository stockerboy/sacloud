'use client'

import { use } from 'react'
import { BoardWriteScreen } from '@/components/board/BoardWriteScreen'

/** 글쓰기 `/board/{category}/write` — 전역 게시판. 본문은 `components/board/BoardWriteScreen` (지시 #14-2) */
export default function BoardWritePage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = use(params)
  return <BoardWriteScreen category={category} basePath={`/board/${category}`} />
}
