'use client'

import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { htmlToPlainText, plainTextToHtml } from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { useApiReady } from '@/app/providers'

/**
 * 글 작성 / 수정 폼.
 *
 * 원본은 리치텍스트 에디터(Froala)를 쓴다. V1 계획은 Tiptap이지만
 * **Mock 단계에서는 에디터를 도입하지 않고** 저장 형태(HTML 문자열)와 흐름만 맞춘다.
 * 실제 에디터는 Phase 7 이후 서버 저장·업로드와 함께 붙인다 (docs/DECISIONS.md D-018).
 *
 * 원본 관측 제약
 * - 비로그인 작성 시 삭제용 비밀번호를 받는다
 * - 익명 작성 선택이 있다 (`disclose_type`)
 * - 5분에 1글 rate limit + 캡차 (Mock에서는 서버가 형태만 응답)
 */
/** 입력칸 공통 — `적진`: 얇은 선, 각진 모서리, 포커스에서만 진홍 */
const FIELD =
  'rounded-[var(--radius)] border border-line bg-card px-3 py-2 text-text placeholder:text-faint outline-none transition-colors duration-100 focus:border-accent'

export function PostForm({
  initialTitle = '',
  initialContent = '',
  initialAnonymous,
  requirePassword,
  submitting,
  error,
  submitLabel,
  viewerIsAdmin = false,
  onSubmit,
}: {
  initialTitle?: string
  initialContent?: string
  /**
   * ★★수정할 때는 그 글이 원래 어땠는지를 받는다★★ (2026-09-20 비판 검수에서 잡았다)
   *
   *   안 받으면 ★새 글 기본값★ 이 그대로 켜진다. 기본값을 익명으로 바꾼 뒤로는
   *   ★실명으로 쓴 글을 오타 하나 고치려고 열면 체크가 켜진 채로 뜨고,
   *   저장하면 익명으로 바뀐다.★ (뒤집기 전에는 반대 방향으로 같은 버그였다)
   *
   * ⚠ 새 글에서는 안 넘긴다 — 그때는 아래 기본값(익명)이 맞다.
   */
  initialAnonymous?: boolean
  requirePassword: boolean
  submitting?: boolean
  error?: string | null
  submitLabel: string
  /**
   * ★관리자 대리 클랜★ (2026-09-25 사장님 「관리자는 클랜 아무거나 선택해서 마음대로
   * 글 쓸 수 있게 (…) 베리타스 고르고 쓰면 베리타스로 나오고(익명) 관리자 아닌것처럼」).
   * true 면 클랜 고르는 칸을 보여준다. 실제 권한 검사는 서버가 한다 — 여기는 단추만 보일지 정한다.
   */
  viewerIsAdmin?: boolean
  onSubmit: (input: {
    title: string
    content: string
    disclose_type: number
    password: string | null
    as_clan_slug: string | null
  }) => void
}) {
  const [title, setTitle] = useState(initialTitle)
  /*
   * ★문단을 살린다★ (2026-09-25 사장님 「그대로 갖다 붙이면 문단도 안나뉘고 이상하게 들어가」)
   *   textarea 의 줄바꿈은 HTML 에서 빈칸이라 한 덩어리로 붙어 나왔다. 저장할 때 <p>·<br> 로
   *   바꾸고(`plainTextToHtml`), 수정할 때는 되돌려 넣는다(`htmlToPlainText`). 순수 함수 · `@sacloud/ui/board/plainText`.
   */
  const [content, setContent] = useState(() => htmlToPlainText(initialContent))
  /*
   * ★★기본은 익명이다★★ (2026-09-20 사장님)
   *
   * > 「기본적으로 무조건 익명으로 써지게(글이든 댓글이든) 하고
   * >  자기가 원하면 익명 풀고 쓸 수 있게 만들어」
   *
   *   옛 기본값은 ★실명(false)★ 이었다 — 체크를 안 하면 닉네임이 그대로 나갔다.
   *   에브리타임도 익명이 기본이다. ★밝히고 싶은 사람이 체크를 푼다.★
   */
  const [anonymous, setAnonymous] = useState(initialAnonymous ?? true)
  const [password, setPassword] = useState('')
  /** ★관리자 대리 클랜★ — 고른 클랜의 slug. 안 고르면 null(평소처럼 관리자 본인 이름으로) */
  const [asClan, setAsClan] = useState<{ slug: string; name: string } | null>(null)

  const canSubmit =
    title.trim().length > 0 &&
    content.trim().length > 0 &&
    (!requirePassword || password.length > 0)

  return (
    <div className="rounded-[var(--radius)] border border-line bg-card px-6 py-6 text-text max-md:px-4">
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        maxLength={100}
        placeholder="제목을 입력하세요."
        className={`h-12 w-full text-lg ${FIELD}`}
      />
      <textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        rows={16}
        placeholder="내용을 입력하세요."
        className={`mt-3 w-full leading-7 ${FIELD}`}
      />

      {viewerIsAdmin ? (
        <div className="mt-3">
          <AdminAsClanPicker picked={asClan} onPick={setAsClan} />
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <label className="flex cursor-pointer select-none items-center gap-1 text-sm text-meta">
          <input
            type="checkbox"
            checked={anonymous}
            onChange={(event) => setAnonymous(event.target.checked)}
            className="accent-[var(--color-accent)]"
          />
          익명으로 작성
        </label>
        {requirePassword ? (
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="삭제용 비밀번호"
            className={`h-10 w-48 ${FIELD}`}
          />
        ) : null}
      </div>

      {error ? <div className="mt-3 text-sm text-accent">{error}</div> : null}

      <div className="mt-4 flex flex-row-reverse">
        <button
          type="button"
          disabled={!canSubmit || submitting}
          onClick={() =>
            onSubmit({
              title: title.trim(),
              content: plainTextToHtml(content.trim()),
              disclose_type: anonymous ? 1 : 0,
              password: requirePassword ? password : null,
              as_clan_slug: viewerIsAdmin ? (asClan?.slug ?? null) : null,
            })
          }
          className="inline-flex h-10 w-24 items-center justify-center rounded-[var(--radius)] border border-accent text-sm text-accent transition-colors duration-100 hover:bg-card-2 disabled:border-line disabled:text-faint"
        >
          {submitting ? '저장중' : submitLabel}
        </button>
      </div>
    </div>
  )
}

/**
 * ★관리자 대리 클랜 고르기★ (2026-09-25) — 이미 있는 통로(`clansSearch`)로 찾아 고른다.
 * 고르면 그 클랜 소속 익명 글처럼 나가고, 안 고르면 평소처럼(관리자 본인 이름) 나간다.
 * `/apply` 의 `ClanSearch` 와 같은 패턴 — 새 검색 API 를 만들지 않는다.
 */
function AdminAsClanPicker({
  picked,
  onPick,
}: {
  picked: { slug: string; name: string } | null
  onPick: (c: { slug: string; name: string } | null) => void
}) {
  const ready = useApiReady()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  const term = q.trim()
  const hits = useQuery({
    queryKey: ['clans', 'search', term],
    queryFn: () => apiGet('clansSearch', { params: { q: term } }),
    enabled: ready && term.length >= 2 && picked === null,
  })

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  if (picked !== null) {
    return (
      <div className="flex items-center gap-2 rounded-[var(--radius)] border border-accent bg-card-2 px-3 py-2 text-sm">
        <span className="text-faint">대리 클랜</span>
        <span className="font-bold text-accent">{picked.name}</span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => {
            onPick(null)
            setQ('')
          }}
          className="text-xs text-meta underline"
        >
          해제
        </button>
      </div>
    )
  }

  const rows = hits.data?.data ?? []

  return (
    <div ref={boxRef} className="relative">
      <input
        value={q}
        onChange={(event) => {
          setQ(event.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        placeholder="관리자 대리 클랜 — 이 클랜 소속 익명으로 쓰기 (두 글자부터 검색)"
        className={`h-10 w-full ${FIELD}`}
      />
      {!open || term.length < 2 ? null : (
        <div className="absolute left-0 right-0 top-11 z-10 max-h-64 overflow-y-auto rounded-[var(--radius)] border border-line bg-card">
          {hits.isLoading ? (
            <div className="px-3 py-2 text-sm text-faint">찾는 중…</div>
          ) : rows.length === 0 ? (
            <div className="px-3 py-2 text-sm text-faint">일치하는 클랜이 없습니다.</div>
          ) : (
            rows.map((c) => (
              <button
                key={c.slug}
                type="button"
                onClick={() => {
                  onPick({ slug: c.slug, name: c.name })
                  setOpen(false)
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text hover:bg-card-2"
              >
                {c.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
