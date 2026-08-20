'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { apiSend } from '@/lib/apiSend'

/** 비밀번호 변경 `/me/password`. */
export default function MePasswordPage() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')

  const ok = current.length > 0 && next.length >= 8 && next === confirm

  const save = useMutation({
    mutationFn: () =>
      apiSend('mePasswordUpdate', { body: { current_password: current, password: next } }),
    onSuccess: () => {
      setCurrent('')
      setNext('')
      setConfirm('')
    },
  })

  return (
    <div className="rounded bg-card px-6 py-6 shadow-card">
      <Field label="현재 비밀번호" value={current} onChange={setCurrent} />
      <Field label="새 비밀번호" value={next} onChange={setNext} />
      <Field label="새 비밀번호 확인" value={confirm} onChange={setConfirm} />

      {next && next.length < 8 ? (
        <div className="text-sm text-lose">새 비밀번호는 8자 이상이어야 합니다.</div>
      ) : null}
      {confirm && next !== confirm ? (
        <div className="text-sm text-lose">새 비밀번호가 서로 다릅니다.</div>
      ) : null}
      {save.isSuccess ? <div className="text-win">비밀번호를 변경했습니다.</div> : null}
      {save.isError ? <div className="text-lose">변경하지 못했습니다.</div> : null}

      <div className="mt-5">
        <button
          type="button"
          disabled={!ok || save.isPending}
          onClick={() => save.mutate()}
          className="h-10 w-24 rounded bg-more text-white disabled:opacity-60"
        >
          변경
        </button>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="mb-4">
      <label className="mb-2 block font-semibold">{label}</label>
      <input
        type="password"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-80 rounded border border-line px-3"
      />
    </div>
  )
}
