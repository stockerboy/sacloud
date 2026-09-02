'use client'

import { use } from 'react'
import { BoardListScreen } from '@/components/board/BoardListScreen'

/**
 * 게시판 목록 `/board/{category}` — 전역 게시판.
 *
 * 2026-09-02 (지시 #14-2): 본문을 `components/board/BoardListScreen` 으로 옮기고 여기서는 부르기만 한다.
 * 리그 안 게시판(`/league/{slug}/board`)이 **같은 화면**을 다른 `basePath` 로 부른다.
 * 이 주소·동작은 그대로다 (`CLAUDE.md` 10-4) — 상단바 입구만 지시 #14 ① 에서 빠졌다.
 */
export default function BoardListPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = use(params)
  return <BoardListScreen category={category} basePath={`/board/${category}`} />
}
