'use client'

import { use } from 'react'
import { PostScreen } from '@/components/board/PostScreen'
import { resolveLeagueBoard } from '../leagueBoard'

/*
 * ⚠ ★게시판에는 갱신 주기를 걸지 않는다★ (2026-09-21 — 걸었다가 ★500 을 냈다★)
 *
 *   게시판 화면은 ★로그인 쿠키를 읽는다★ (내 글인지 · 쓸 수 있는지). 쿠키를 읽는
 *   화면에 `revalidate` 를 걸면 Next 가 ★정적으로 굳히려다 터진다.★
 *   사장님 화면에 「500 Internal Server Error」 가 떴다 — 내가 낸 것이다.
 *
 *   게시판은 원래 ★요청마다 새로 그린다★ — 굳을 일이 없어 갱신 주기도 필요 없다.
 */


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
