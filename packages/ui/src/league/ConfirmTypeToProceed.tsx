'use client'

import { useState } from 'react'
import { isConfirmPhraseMatched } from './confirmPhrase'

/**
 * 지정 문자열을 그대로 입력해야 실행되는 위험 작업 확인.
 *
 * 원본은 클랜 **추방** 시 `추방합니다` 를 입력해야 실행된다(관측).
 * 추방은 되돌릴 수 없고 재가입도 불가하다.
 * 입력이 정확히 일치하지 않으면 실행 버튼이 비활성 상태로 남는다.
 *
 * 화면 검증만 믿지 않는다 — 서버도 같은 문구를 다시 확인한다
 * (`/api/leagues/:slug/clans/:id/expel`).
 */
export function ConfirmTypeToProceed({
  title,
  description,
  phrase,
  actionLabel,
  onConfirm,
  onCancel,
}: {
  title: string
  description: string
  /** 사용자가 그대로 입력해야 하는 문자열 */
  phrase: string
  actionLabel: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const [value, setValue] = useState('')
  const matched = isConfirmPhraseMatched(value, phrase)

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-page/80">
      <div className="w-[420px] rounded-[var(--radius)] border border-line bg-card px-6 py-6">
        <div className="font-display text-xl tracking-wide text-text-strong">{title}</div>
        <div className="mt-2 text-sm leading-relaxed text-meta">{description}</div>
        <div className="mt-5 text-sm text-text">
          계속하려면 <span className="font-bold text-text-strong">{phrase}</span> 를 입력하세요.
        </div>
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="mt-2 h-11 w-full rounded-[var(--radius)] border border-line bg-card-2 px-3 text-text"
        />
        <div className="mt-5 flex flex-row-reverse">
          <button
            type="button"
            disabled={!matched}
            onClick={onConfirm}
            className="ml-2 h-10 w-24 rounded-[var(--radius)] bg-accent font-semibold text-text-strong disabled:opacity-40"
          >
            {actionLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="h-10 w-24 rounded-[var(--radius)] border border-line text-meta hover:text-text-strong"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  )
}
