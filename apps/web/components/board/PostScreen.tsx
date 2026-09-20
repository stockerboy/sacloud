'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CommentForm, CommentList, PostView, Skeleton } from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { apiSend } from '@/lib/apiSend'
import { useApiReady } from '@/app/providers'

/**
 * 글 상세 **화면** — 본문 + 추천/비추천 + 댓글 목록 + 댓글 작성 (지시 #14-2 로 라우트에서 분리).
 *
 * `/board/{category}/{id}` 와 `/league/{slug}/board/{id}` 가 같은 화면을 부른다.
 * `basePath` 는 수정·삭제 링크가 가는 곳이다. 본문은 `app/board/[category]/[id]/page.tsx` 에서 그대로 옮겼다.
 */
export function PostScreen({ id, basePath }: { id: string; basePath: string }) {
  const ready = useApiReady()
  const queryClient = useQueryClient()

  const post = useQuery({
    queryKey: ['board', id],
    queryFn: () => apiGet('boardShow', { params: { boardId: id } }),
    enabled: ready,
  })

  const comments = useQuery({
    queryKey: ['comments', id],
    queryFn: () => apiGet('commentList', { search: { board_id: id } }),
    enabled: ready,
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['board', id] })
    void queryClient.invalidateQueries({ queryKey: ['comments', id] })
  }

  const vote = useMutation({
    mutationFn: (type: number) => apiSend('boardVote', { params: { boardId: id }, body: { type } }),
    onSuccess: invalidate,
  })

  const commentVote = useMutation({
    mutationFn: ({ commentId, type }: { commentId: string; type: number }) =>
      apiSend('commentVote', { params: { commentId }, body: { type } }),
    onSuccess: invalidate,
  })

  /*
   * ★★댓글도 기본이 익명이다★★ (2026-09-20 사장님)
   *
   * > 「댓글이 익명으로 안써져 기본적으로 무조건 익명으로 써지게(글이든 댓글이든)
   * >  하고 자기가 원하면 익명 풀고 쓸 수 있게 만들어」
   *
   *   옛 판은 ★`disclose_type: 0` 을 고정★ 으로 보냈다 — 체크를 하든 말든 실명이었다.
   *   부품(`CommentForm`)은 체크값을 넘길 준비가 이미 되어 있었는데 ★호출부가 버렸다.★
   *   `CommentList.tsx` 주석에도 「지금 호출부가 0 을 고정으로 보낸다」 고 적혀 있었다.
   *
   * ⚠ `disclose_type` — ★1 이 익명, 0 이 실명★ 이다 (`packages/contract` 의 `DiscloseType`).
   */
  const addComment = useMutation({
    mutationFn: (input: {
      parent_id: string | null
      content: string
      password: string | null
      anonymous: boolean
    }) =>
      apiSend('commentCreate', {
        body: {
          board_id: id,
          parent_id: input.parent_id,
          content: input.content,
          disclose_type: input.anonymous ? 1 : 0,
          password: input.password,
        },
      }),
    onSuccess: invalidate,
  })

  if (!post.data) {
    return <Skeleton className="h-[600px] w-full" />
  }

  return (
    <>
      <PostView post={post.data.data} onVote={(type) => vote.mutate(type)} basePath={basePath} />
      <div className="mt-[var(--section-gap)] rounded-[var(--radius)] border border-line bg-card px-6 py-5 max-md:px-4">
        <CommentList
          comments={comments.data?.data}
          loading={!comments.data}
          onVote={(commentId, type) => commentVote.mutate({ commentId, type })}
          onReply={(parentId, content) =>
            /* ★답글도 익명이 기본★ — 답글 칸에는 체크가 없다 (2026-09-20 사장님) */
            addComment.mutate({ parent_id: parentId, content, password: null, anonymous: true })
          }
        />
        <CommentForm
          requirePassword={!post.data.data.login}
          /* ★체크를 보여 준다★ — 이제 값을 실제로 보내므로 화면이 거짓말하지 않는다 */
          showAnonymousToggle
          onSubmit={(content, password, anonymous) =>
            addComment.mutate({ parent_id: null, content, password, anonymous })
          }
        />
      </div>
    </>
  )
}
