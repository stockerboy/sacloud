'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { apiSend } from '@/lib/apiSend'
import { MeButton, MeError, MeField, MeHeading, MeInput, MeNotice, MePanel } from '../ui'

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
    <MePanel className="max-w-[480px]">
      <MeHeading>비밀번호 변경</MeHeading>

      <Field label="현재 비밀번호" value={current} onChange={setCurrent} />
      <Field label="새 비밀번호" value={next} onChange={setNext} />
      <Field label="새 비밀번호 확인" value={confirm} onChange={setConfirm} />

      {next && next.length < 8 ? (
        <div className="-mt-3 mb-4 text-sm text-accent">새 비밀번호는 8자 이상이어야 합니다.</div>
      ) : null}
      {confirm && next !== confirm ? (
        <div className="-mt-3 mb-4 text-sm text-accent">새 비밀번호가 서로 다릅니다.</div>
      ) : null}
      {save.isSuccess ? <MeNotice>비밀번호를 변경했습니다.</MeNotice> : null}
      {save.isError ? <MeError>변경하지 못했습니다.</MeError> : null}

      <div className="mt-6">
        <MeButton disabled={!ok || save.isPending} onClick={() => save.mutate()}>
          변경
        </MeButton>
      </div>
    </MePanel>
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
    <MeField label={label}>
      <MeInput type="password" value={value} onChange={(event) => onChange(event.target.value)} />
    </MeField>
  )
}
