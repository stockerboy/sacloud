'use client'

import { useState } from 'react'

/**
 * 지정 문자열을 그대로 입력해야 실행되는 위험 작업 확인.
 *
 * 원본은 클랜 **추방** 시 `추방합니다` 를 입력해야 실행된다(관측).
 * 추방은 되돌릴 수 없고 재가입도 불가하다.
 * 입력이 정확히 일치하지 않으면 실행 버튼이 비활성 상태로 남는다.
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
  const matched = value === phrase

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50">
      <div className="w-[420px] rounded bg-card px-6 py-6 shadow-card">
        <div className="text-xl font-semibold">{title}</div>
        <div className="mt-2 text-meta">{description}</div>
        <div className="mt-4 text-sm">
          계속하려면 <span className="font-bold">{phrase}</span> 를 입력하세요.
        </div>
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="mt-2 h-11 w-full rounded border border-line px-3"
        />
        <div className="mt-5 flex flex-row-reverse">
          <button
            type="button"
            disabled={!matched}
            onClick={onConfirm}
            className="ml-2 h-10 w-24 rounded bg-lose text-white disabled:opacity-50"
          >
            {actionLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="h-10 w-24 rounded border border-line"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  )
}
