'use client'

import { Suspense, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useMutation } from '@tanstack/react-query'
import { AuthCard } from '@sacloud/ui'
import { apiSend } from '@/lib/apiSend'

/**
 * 이메일 인증 `/auth/email/verify?token=...`.
 *
 * 토큰이 있으면 바로 인증을 시도하고, 없으면 메일을 확인해 달라는 안내만 보여준다
 * (가입 직후 이 화면으로 온다). 엔드포인트 경로는 자체 설계다 (docs/DECISIONS.md D-003).
 */
function VerifyBody() {
  const token = useSearchParams().get('token')

  const verify = useMutation({
    mutationFn: (value: string) => apiSend('authEmailVerify', { body: { token: value } }),
  })

  const run = verify.mutate
  useEffect(() => {
    if (token) run(token)
  }, [token, run])

  return (
    <AuthCard
      footer={
        <Link href="/auth/login" className="underline">
          로그인으로 돌아가기
        </Link>
      }
    >
      <div className="mb-4 font-bold">이메일 인증</div>
      {!token ? (
        <div className="text-sm text-meta">
          가입하신 메일로 인증 링크를 보냈습니다.
          <br />
          메일의 링크를 눌러 인증을 완료해 주세요.
        </div>
      ) : verify.isPending ? (
        <div className="text-sm text-meta">인증하는 중…</div>
      ) : verify.isSuccess ? (
        <div className="text-win">인증이 완료되었습니다.</div>
      ) : (
        <div className="text-lose">인증하지 못했습니다. 링크가 만료되었을 수 있습니다.</div>
      )}
    </AuthCard>
  )
}

export default function EmailVerifyPage() {
  return (
    <Suspense>
      <VerifyBody />
    </Suspense>
  )
}
