'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMutation } from '@tanstack/react-query'
import { AuthCard, AuthError, AuthField, AuthInput, AuthSubmit, AuthTitle } from '@sacloud/ui'
import { apiSend } from '@/lib/apiSend'

/**
 * 비밀번호 재설정 `/auth/password/reset?token=...`.
 * 원본 화면은 관측했지만 엔드포인트 경로는 자체 설계다 (docs/DECISIONS.md D-003).
 */
function ResetForm() {
  const router = useRouter()
  const token = useSearchParams().get('token') ?? ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')

  const ok = password.length >= 8 && password === confirm

  const reset = useMutation({
    mutationFn: () => apiSend('authPasswordReset', { body: { token, password } }),
    onSuccess: () => router.push('/auth/login'),
  })

  return (
    <AuthCard
      footer={
        <Link href="/auth/login">
          {/* 색·밑줄은 안쪽 span 이 가진다 (레이어 밖 `a` 규칙이 `<a>` 유틸리티를 누른다) */}
          <span className="text-text-strong underline underline-offset-4">로그인으로 돌아가기</span>
        </Link>
      }
    >
      <AuthTitle>새 비밀번호 설정</AuthTitle>

      <AuthField label="새 비밀번호">
        <AuthInput
          type="password"
          value={password}
          placeholder="8자 이상"
          onChange={(event) => setPassword(event.target.value)}
        />
      </AuthField>
      <AuthField label="새 비밀번호 확인">
        <AuthInput
          type="password"
          value={confirm}
          placeholder="한 번 더 입력"
          onChange={(event) => setConfirm(event.target.value)}
        />
      </AuthField>

      {confirm && password !== confirm ? (
        <div className="-mt-4 text-sm text-accent">비밀번호가 서로 다릅니다.</div>
      ) : null}
      {reset.isError ? <AuthError>재설정하지 못했습니다.</AuthError> : null}

      <AuthSubmit disabled={!ok || reset.isPending} onClick={() => reset.mutate()}>
        비밀번호 변경
      </AuthSubmit>
    </AuthCard>
  )
}

export default function PasswordResetPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  )
}
