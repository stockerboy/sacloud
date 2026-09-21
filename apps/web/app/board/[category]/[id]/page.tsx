'use client'

import { use } from 'react'
import { PostScreen } from '@/components/board/PostScreen'

/* ★갱신 주기 60초★ (2026-09-21) — 까닭은 `app/player/[playerId]/page.tsx` 에 한 번만 적었다 */
export const revalidate = 60


/**
 * 글 상세 `/board/{category}/{id}` — 전역 게시판.
 * 본문은 `components/board/PostScreen` (지시 #14-2). 리그 안 게시판과 같은 화면이다.
 */
export default function PostPage({
  params,
}: {
  params: Promise<{ category: string; id: string }>
}) {
  const { category, id } = use(params)
  return <PostScreen id={id} basePath={`/board/${category}`} />
}
