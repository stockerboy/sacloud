'use client'

import { useState } from 'react'
import { htmlToPlainText, plainTextToHtml } from '@sacloud/ui'

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
  onSubmit: (input: {
    title: string
    content: string
    disclose_type: number
    password: string | null
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
