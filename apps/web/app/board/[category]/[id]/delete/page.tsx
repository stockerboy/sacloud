'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Skeleton } from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { apiSend } from '@/lib/apiSend'
import { useApiReady } from '@/app/providers'

/**
 * 글 삭제 확인 `/board/{category}/{id}/delete`.
 * 비로그인 글은 작성 시 정한 비밀번호를 입력해야 삭제된다 (원본 동작).
 */
export default function BoardDeletePage({
  params,
}: {
  params: Promise<{ category: string; id: string }>
}) {
  const { category, id } = use(params)
  const router = useRouter()
  const ready = useApiReady()
  const [password, setPassword] = useState('')

  const post = useQuery({
    queryKey: ['board', id],
    queryFn: () => apiGet('boardShow', { params: { boardId: id } }),
    enabled: ready,
  })

  const remove = useMutation({
    mutationFn: () =>
      apiSend('boardDelete', {
        params: { boardId: id },
        body: { password: post.data?.data.login ? null : password },
      }),
    onSuccess: () => router.push(`/board/${category}`),
  })

  if (!post.data) return <Skeleton className="h-[240px] w-full" />

  const needsPassword = !post.data.data.login

  return (
    <div className="rounded-[var(--radius)] border border-line bg-card px-6 py-6 text-text max-md:px-4">
      <h1 className="display text-2xl text-text-strong">글을 삭제할까요?</h1>
      <div className="mt-4 text-meta">{post.data.data.title}</div>
      <div className="mt-1 text-sm text-faint">삭제한 글은 되돌릴 수 없습니다.</div>

      {needsPassword ? (
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="작성 시 입력한 비밀번호"
          className="mt-5 h-10 w-64 rounded-[var(--radius)] border border-line bg-card px-3 text-sm text-text placeholder:text-faint outline-none transition-colors duration-100 focus:border-accent"
        />
      ) : null}

      {remove.isError ? (
        <div className="mt-3 text-sm text-accent">
          삭제하지 못했습니다. 비밀번호를 확인해 주세요.
        </div>
      ) : null}

      <div className="mt-6 flex gap-2">
        <button
          type="button"
          disabled={remove.isPending || (needsPassword && !password)}
          onClick={() => remove.mutate()}
          className="h-10 w-24 rounded-[var(--radius)] border border-accent text-sm text-accent transition-colors duration-100 hover:bg-card-2 disabled:border-line disabled:text-faint"
        >
          삭제
        </button>
        <Link href={`/board/${category}/${id}`} className="btn-line h-10 w-24 text-sm">
          취소
        </Link>
      </div>
    </div>
  )
}
