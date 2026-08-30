'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useMutation } from '@tanstack/react-query'
import {
  AuthCard,
  AuthError,
  AuthField,
  AuthInput,
  AuthNotice,
  AuthSubmit,
  AuthTitle,
} from '@sacloud/ui'
import { apiSend } from '@/lib/apiSend'

/** 비밀번호 재설정 메일 요청 `/auth/password/forget`. */
export default function PasswordForgetPage() {
  const [email, setEmail] = useState('')

  const request = useMutation({
    mutationFn: () => apiSend('authPasswordForget', { body: { email } }),
  })

  return (
    <AuthCard
      footer={
        <Link href="/auth/login" className="text-text-strong underline underline-offset-4">
          로그인으로 돌아가기
        </Link>
      }
    >
      <AuthTitle hint="가입한 이메일 주소로 재설정 링크를 보내드립니다.">비밀번호 재설정</AuthTitle>

      <AuthField label="이메일">
        <AuthInput
          type="text"
          value={email}
          placeholder="you@naver.com"
          onChange={(event) => setEmail(event.target.value)}
        />
      </AuthField>

      {request.isSuccess ? (
        <AuthNotice>메일을 보냈습니다. 받은편지함을 확인해 주세요.</AuthNotice>
      ) : null}
      {request.isError ? <AuthError>요청하지 못했습니다.</AuthError> : null}

      <AuthSubmit disabled={!email || request.isPending} onClick={() => request.mutate()}>
        재설정 메일 받기
      </AuthSubmit>
    </AuthCard>
  )
}
