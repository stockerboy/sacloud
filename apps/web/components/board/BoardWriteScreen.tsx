'use client'

import { useRouter } from 'next/navigation'
import { useMutation, useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/api'
import { apiSend } from '@/lib/apiSend'
import { useApiReady } from '@/app/providers'
import { PostForm } from '@/components/PostForm'

/**
 * 글쓰기 **화면** (지시 #14-2 로 라우트에서 분리).
 * `/board/{category}/write` 와 `/league/{slug}/board/write` 가 같은 화면을 부른다.
 * 저장이 끝나면 `basePath/{id}` 로 간다. 본문은 `app/board/[category]/write/page.tsx` 그대로.
 */
export function BoardWriteScreen({ category, basePath }: { category: string; basePath: string }) {
  const router = useRouter()
  const ready = useApiReady()

  const infos = useQuery({
    queryKey: ['infos'],
    queryFn: () => apiGet('infos'),
    enabled: ready,
  })
  const loggedIn = !!infos.data?.data.user
  /* ★관리자는 기본이 실명(SACLOUD)이다★ (2026-09-25 사장님 「관리자 아이디로 댓글 달았는데
     베리타스로 달려」) — 새 글도 같은 규칙. 체크를 켜면 관리자도 익명으로 쓸 수 있다 */
  const viewerIsAdmin = infos.data?.data.user?.role === 2

  const create = useMutation({
    mutationFn: (input: {
      title: string
      content: string
      disclose_type: number
      password: string | null
      as_clan_slug: string | null
    }) =>
      apiSend('boardCreate', {
        body: { category, ...input, captcha_token: 'mock' },
      }),
    onSuccess: (response) => router.push(`${basePath}/${response.data.id}`),
  })

  return (
    <>
      <h1 className="mb-6 display text-2xl text-text-strong">글쓰기</h1>
      <PostForm
        /* `infos` 가 늦게 오면(첫 렌더는 「모른다」) 관리자 여부가 확정된 뒤 한 번 다시 만든다 */
        key={infos.isSuccess ? String(viewerIsAdmin) : 'pending'}
        requirePassword={!loggedIn}
        initialAnonymous={viewerIsAdmin ? false : undefined}
        viewerIsAdmin={viewerIsAdmin}
        submitting={create.isPending}
        error={create.isError ? '글을 저장하지 못했습니다.' : null}
        submitLabel="등록"
        onSubmit={(input) => create.mutate(input)}
      />
    </>
  )
}
