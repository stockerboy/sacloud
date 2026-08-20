'use client'

import { use } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Skeleton } from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { apiSend } from '@/lib/apiSend'
import { useApiReady } from '@/app/providers'
import { PostForm } from '@/components/PostForm'

/** 글 수정 `/board/{category}/{id}/update`. */
export default function BoardUpdatePage({
  params,
}: {
  params: Promise<{ category: string; id: string }>
}) {
  const { category, id } = use(params)
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
    onSuccess: () => router.push(`/board/${category}/${id}`),
  })

  if (!post.data) return <Skeleton className="h-[500px] w-full" />

  return (
    <>
      <div className="my-2 text-2xl">글 수정</div>
      <PostForm
        initialTitle={post.data.data.title}
        initialContent={post.data.data.content}
        requirePassword={!post.data.data.login}
        submitting={update.isPending}
        error={update.isError ? '글을 수정하지 못했습니다.' : null}
        submitLabel="수정"
        onSubmit={(input) => update.mutate(input)}
      />
    </>
  )
}
