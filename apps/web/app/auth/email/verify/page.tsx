'use client'

import { Suspense, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useMutation } from '@tanstack/react-query'
import { AuthCard, AuthError, AuthNotice, AuthTitle } from '@sacloud/ui'
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
        <Link href="/auth/login">
          {/* 색·밑줄은 안쪽 span 이 가진다 (레이어 밖 `a` 규칙이 `<a>` 유틸리티를 누른다) */}
          <span className="text-text-strong underline underline-offset-4">로그인으로 돌아가기</span>
        </Link>
      }
    >
      <AuthTitle>{token ? '이메일 인증' : '가입 완료'}</AuthTitle>
      {!token ? (
        /*
         * ⚠ 2026-09-02 — 「메일을 보냈습니다」를 **뺐다.** 아무도 안 보내기 때문이다.
         *
         *   옛 문장 — 「가입하신 메일로 인증 링크를 보냈습니다. / 메일의 링크를 눌러
         *   인증을 완료해 주세요.」
         *
         *   저장소에 메일 발송 코드가 한 줄도 없다. 가입 API 가 `email_verify` 토큰을
         *   만들지만(`api/auth/signup/route.ts`) 사람에게 전달할 경로가 없어서,
         *   이 화면은 **오지 않을 메일을 기다리게 하는 막다른 안내**였다.
         *
         *   로그인은 인증을 요구하지 않는다(로그인 라우트에 검사 없음). 그래서 지금
         *   실제로 일어나는 일은 「가입이 끝났고 바로 로그인할 수 있다」이다. 그대로 적는다.
         *
         *   **토큰이 있는 경로는 한 줄도 안 고쳤다** — 메일 발송이 붙으면 그대로 돈다
         *   (`CLAUDE.md` 10-4).
         */
        <p className="text-sm leading-relaxed text-meta">
          가입이 끝났습니다.
          <br />
          바로 로그인하실 수 있습니다.
        </p>
      ) : verify.isPending ? (
        <p className="text-sm text-meta">인증하는 중…</p>
      ) : verify.isSuccess ? (
        <AuthNotice>인증이 완료되었습니다.</AuthNotice>
      ) : (
        <AuthError>인증하지 못했습니다. 링크가 만료되었을 수 있습니다.</AuthError>
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
