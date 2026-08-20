'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useMutation } from '@tanstack/react-query'
import { AuthCard, AuthField, AuthInput, AuthSubmit } from '@sacloud/ui'
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
        <Link href="/auth/login" className="underline">
          로그인으로 돌아가기
        </Link>
      }
    >
      <div className="mb-4 font-bold">비밀번호 재설정</div>
      <div className="mb-4 text-sm text-meta">
        가입한 이메일 주소로 재설정 링크를 보내드립니다.
      </div>

      <AuthField label="이메일">
        <AuthInput
          type="text"
          value={email}
          placeholder="you@naver.com"
          onChange={(event) => setEmail(event.target.value)}
        />
      </AuthField>

      {request.isSuccess ? (
        <div className="text-win">메일을 보냈습니다. 받은편지함을 확인해 주세요.</div>
      ) : null}
      {request.isError ? <div className="text-lose">요청하지 못했습니다.</div> : null}

      <AuthSubmit disabled={!email || request.isPending} onClick={() => request.mutate()}>
        재설정 메일 받기
      </AuthSubmit>
    </AuthCard>
  )
}
