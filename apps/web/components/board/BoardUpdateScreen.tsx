'use client'

import { useRouter } from 'next/navigation'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Skeleton } from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { apiSend } from '@/lib/apiSend'
import { useApiReady } from '@/app/providers'
import { PostForm } from '@/components/PostForm'

/**
 * 글 수정 **화면** (지시 #14-2 로 라우트에서 분리).
 * `/board/{category}/{id}/update` 와 `/league/{slug}/board/{id}/update` 가 같은 화면을 부른다.
 * 본문은 `app/board/[category]/[id]/update/page.tsx` 그대로.
 */
export function BoardUpdateScreen({
  category,
  id,
  basePath,
}: {
  category: string
  id: string
  basePath: string
}) {
  const router = useRouter()
  const ready = useApiReady()

  const post = useQuery({
    queryKey: ['board', id],
    queryFn: () => apiGet('boardShow', { params: { boardId: id } }),
    enabled: ready,
  })

  const update = useMutation({
    mutationFn: (input: {
      title: string
      content: string
      disclose_type: number
      password: string | null
    }) =>
      apiSend('boardUpdate', {
        params: { boardId: id },
        body: { category, ...input, captcha_token: 'mock' },
      }),
    onSuccess: () => router.push(`${basePath}/${id}`),
  })

  if (!post.data) return <Skeleton className="h-[500px] w-full" />

  /*
   * ★원래 익명이었는지 그대로 이어받는다★ (2026-09-20 비판 검수에서 잡았다)
   *
   *   ⚠ 안 넘기면 ★실명으로 쓴 글을 고칠 때 익명으로 바뀐다.★ 기본값이
   *     익명이기 때문이다. (기본값을 뒤집기 전에는 ★반대 방향★ 으로 같은 버그였다 —
   *     방향만 바뀌었지 버그는 그대로 있었다.)
   *   ⚠ `writer.anonymous` 는 ★서버가 정한 사실★ 이다. 화면이 되짚지 않는다.
   */

  return (
    <>
      <h1 className="mb-6 display text-2xl text-text-strong">글 수정</h1>
      <PostForm
        initialTitle={post.data.data.title}
        initialContent={post.data.data.content}
        initialAnonymous={post.data.data.writer?.anonymous ?? true}
        requirePassword={!post.data.data.login}
        submitting={update.isPending}
        error={update.isError ? '글을 수정하지 못했습니다.' : null}
        submitLabel="수정"
        onSubmit={(input) => update.mutate(input)}
      />
    </>
  )
}
