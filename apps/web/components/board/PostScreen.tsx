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

  const addComment = useMutation({
    mutationFn: (input: { parent_id: string | null; content: string; password: string | null }) =>
      apiSend('commentCreate', {
        body: {
          board_id: id,
          parent_id: input.parent_id,
          content: input.content,
          disclose_type: 0,
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
            addComment.mutate({ parent_id: parentId, content, password: null })
          }
        />
        <CommentForm
          requirePassword={!post.data.data.login}
          onSubmit={(content, password) =>
            addComment.mutate({ parent_id: null, content, password })
          }
        />
      </div>
    </>
  )
}
