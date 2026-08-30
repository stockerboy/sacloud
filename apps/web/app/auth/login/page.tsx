'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AuthCard, AuthError, AuthField, AuthInput, AuthSubmit, AuthTitle } from '@sacloud/ui'
import { apiSend } from '@/lib/apiSend'

/**
 * 로그인 `/auth/login?returnUrl=...`
 *
 * 원본 구성: 이메일 / 비밀번호 / (비밀번호를 잊으셨나요?) / 로그인 / 회원가입 안내.
 * 로그인 후에는 `returnUrl` 로 돌아간다 (원본 관측 — GNB 로그인 링크가 이 값을 붙인다).
 */
function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const returnUrl = searchParams.get('returnUrl') || '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const login = useMutation({
    mutationFn: () => apiSend('authLogin', { body: { email, password } }),
    /**
     * **갱신을 기다린 뒤에 이동한다.**
     *
     * `invalidateQueries`를 기다리지 않고 바로 `push`하면, 이동한 화면의 `AuthGuard`가
     * 아직 갱신되지 않은 `/infos`(= 비로그인)를 보고 **다시 로그인으로 되돌린다.**
     * 로그인은 성공했는데 로그인 화면에 그대로 남는 것처럼 보인다 (실제로 그랬다).
     */
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['infos'] })
      router.push(returnUrl)
    },
  })

  return (
    <AuthCard
      footer={
        <>
          회원이 아니신가요?{' '}
          <Link href="/auth/signup" className="text-text-strong underline underline-offset-4">
            회원가입
          </Link>
        </>
      }
    >
      <AuthTitle>로그인</AuthTitle>

      <AuthField label="이메일">
        <AuthInput
          type="text"
          value={email}
          placeholder="you@example.com"
          onChange={(event) => setEmail(event.target.value)}
        />
      </AuthField>

      <div className="mb-1">
        <label className="mb-2 block text-sm font-bold text-meta">비밀번호</label>
        <div className="flex h-11 items-stretch">
          <AuthInput
            type="password"
            value={password}
            placeholder="비밀번호"
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && email && password) login.mutate()
            }}
          />
        </div>
      </div>

      {/* 원본은 이 링크를 입력칸에 겹쳐 절대배치했다. 겹치면 좁은 카드에서 글자가 붙는다 —
          같은 자리에 흐름대로 놓는다. 가는 링크라 회색으로 두고 hover 에서만 진홍이 켜진다 */}
      <div className="text-right text-sm text-meta">
        <Link href="/auth/password/forget" className="underline underline-offset-4">
          비밀번호를 잊으셨나요?
        </Link>
      </div>

      {login.isError ? <AuthError>로그인하지 못했습니다.</AuthError> : null}

      <AuthSubmit disabled={!email || !password || login.isPending} onClick={() => login.mutate()}>
        로그인
      </AuthSubmit>
    </AuthCard>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
