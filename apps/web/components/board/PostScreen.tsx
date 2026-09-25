'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CommentForm, CommentList, PostView, Skeleton, POST_ETA } from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { apiSend } from '@/lib/apiSend'
import { useApiReady } from '@/app/providers'
import { AdminAsClanPicker } from '@/components/AdminAsClanPicker'

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

  /*
   * ★관리자 상단 고정★ (2026-09-25 사장님 「관리자 권한으로 아무글이나 상단 고정하고 내릴 수 있게」)
   *   보는 사람이 관리자(role 2)인지는 `/infos` 의 user 로 안다 — 셸이 이미 받아 둔 값이라 추가 요청이 없다.
   *   진짜 권한 검사는 서버(`setBoardPinned` → `isAdmin`)가 한다. 여기는 단추를 보일지만 정한다.
   */
  const infos = useQuery({ queryKey: ['infos'], queryFn: () => apiGet('infos'), enabled: ready })
  const viewerIsAdmin = infos.data?.data.user?.role === 2
  const pin = useMutation({
    mutationFn: (pinned: boolean) => apiSend('boardPin', { params: { boardId: id }, body: { pinned } }),
    onSuccess: () => {
      invalidate()
      void queryClient.invalidateQueries({ queryKey: ['boards'] })
    },
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
      as_clan_slug: string | null
    }) =>
      apiSend('commentCreate', {
        body: {
          board_id: id,
          parent_id: input.parent_id,
          content: input.content,
          disclose_type: input.anonymous ? 1 : 0,
          password: input.password,
          as_clan_slug: input.as_clan_slug,
        },
      }),
    onSuccess: invalidate,
  })

  if (!post.data) {
    return <Skeleton className="h-[600px] w-full" />
  }

  return (
    <>
      <PostView
        post={post.data.data}
        onVote={(type) => vote.mutate(type)}
        basePath={basePath}
        admin={viewerIsAdmin ? { onTogglePin: () => pin.mutate(!post.data!.data.pinned), busy: pin.isPending } : null}
      />
      {/* 2026-09-24 QA(운영 폰): 글 카드 밑 「댓글 n개」 와 댓글 카드 사이가 80px 넘게 비었다 → section-gap(40) 대신 12 */}
      <div
        className={POST_ETA ? 'mt-3 rounded-[18px] border px-6 py-5 max-md:px-4' : 'mt-3 rounded-[var(--radius)] border border-line bg-card px-6 py-5 max-md:px-4'}
        style={POST_ETA ? { background: '#0f1729', borderColor: '#243250' } : undefined}
      >
        <CommentList
          comments={comments.data?.data}
          loading={!comments.data}
          onVote={(commentId, type) => commentVote.mutate({ commentId, type })}
          onReply={(parentId, content) =>
            /*
             * ★답글도 익명이 기본 — 단, 관리자는 아니다★ (2026-09-25 사장님 「관리자 아이디로
             * 댓글 달았는데 베리타스로 달려」). 답글 칸에는 체크가 없어서(2026-09-20) 여기서
             * 값을 정한다 — 관리자가 아니면 옛 규칙 그대로 익명이다.
             */
            addComment.mutate({ parent_id: parentId, content, password: null, anonymous: !viewerIsAdmin, as_clan_slug: null })
          }
        />
        <CommentForm
          /*
           * ★관리자 여부가 늦게 도착해도 체크박스가 그 값을 따라가게★ — `defaultAnonymous` 는
           * `useState` 초기값이라 한 번만 읽힌다. `/infos` 응답이 늦게 오면(첫 렌더는 항상
           * 「모른다」) 관리자인데도 체크가 켜진 채 굳어 버린다. `key` 로 응답이 오면 한 번 다시 만든다.
           */
          key={infos.isSuccess ? String(viewerIsAdmin) : 'pending'}
          requirePassword={!post.data.data.login}
          /* ★체크를 보여 준다★ — 이제 값을 실제로 보내므로 화면이 거짓말하지 않는다 */
          showAnonymousToggle
          /* ★관리자는 기본이 실명(SACLOUD)이다★ (2026-09-25) — 체크를 켜면 그때는 관리자도 익명이 된다 */
          defaultAnonymous={!viewerIsAdmin}
          /* ★관리자 대리 클랜★ (2026-09-25 사장님 「댓글 달때도 다른 클랜인척하면서 클랜 바꿔서 달 수 있게」) */
          viewerIsAdmin={viewerIsAdmin}
          renderAsClanPicker={(picked, onPick) => <AdminAsClanPicker picked={picked} onPick={onPick} />}
          onSubmit={(content, password, anonymous, asClanSlug) =>
            addComment.mutate({ parent_id: null, content, password, anonymous, as_clan_slug: asClanSlug })
          }
        />
      </div>
    </>
  )
}
