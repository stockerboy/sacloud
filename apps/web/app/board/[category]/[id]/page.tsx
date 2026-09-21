'use client'

import { use } from 'react'
import { PostScreen } from '@/components/board/PostScreen'

/*
 * ⚠ ★게시판에는 갱신 주기를 걸지 않는다★ (2026-09-21 — 걸었다가 ★500 을 냈다★)
 *
 *   게시판 화면은 ★로그인 쿠키를 읽는다★ (내 글인지 · 쓸 수 있는지). 쿠키를 읽는
 *   화면에 `revalidate` 를 걸면 Next 가 ★정적으로 굳히려다 터진다.★
 *   사장님 화면에 「500 Internal Server Error」 가 떴다 — 내가 낸 것이다.
 *
 *   게시판은 원래 ★요청마다 새로 그린다★ — 굳을 일이 없어 갱신 주기도 필요 없다.
 */


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
