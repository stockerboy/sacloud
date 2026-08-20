'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AuthCard,
  AuthField,
  AuthInput,
  AuthSubmit,
  canSubmitSignup,
  isAllowedSignupEmail,
  validateSignupNickname,
  validateSignupPassword,
} from '@sacloud/ui'
import { apiSend } from '@/lib/apiSend'

/**
 * 회원가입 `/auth/signup`.
 *
 * 원본 관측 제약
 * - **네이버 메일로만 가입 가능** (placeholder `you@naver.com`)
 * - 가입 시 이메일 인증이 진행된다
 * - 약관·개인정보 동의 체크가 필수
 * 안내 문구는 원본 문장을 그대로 쓰지 않고 같은 뜻으로 새로 썼다 (CLAUDE.md 3장 4번).
 */
export default function SignupPage() {
  const router = useRouter()
  const queryClient = useQueryClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [agreed, setAgreed] = useState(false)

  // 검증 규칙은 `packages/ui/src/auth/signupRules.ts` 한 곳에 있다 (단위 테스트로 고정)
  const domainOk = isAllowedSignupEmail(email)
  const passwordError = validateSignupPassword(password)
  const nicknameError = validateSignupNickname(nickname)
  const canSubmit = canSubmitSignup({ email, password, nickname, agreed })

  const signup = useMutation({
    mutationFn: () =>
      apiSend('authSignup', {
        body: { email, password, nickname: nickname.trim(), captcha_token: 'mock' },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries()
      router.push('/auth/email/verify')
    },
  })

  return (
    <AuthCard
      footer={
        <Link href="/auth/login" className="underline">
          로그인으로 돌아가기
        </Link>
      }
    >
      <div className="mb-4">
        <div className="font-bold">이메일인증</div>
        <div className="mt-1 text-sm text-meta">
          가입 과정에서 이메일 인증을 진행합니다.
          <br />
          가입은 네이버 메일 주소로만 할 수 있습니다.
        </div>
      </div>

      <AuthField label="이메일">
        <AuthInput
          type="text"
          value={email}
          placeholder="you@naver.com"
          onChange={(event) => setEmail(event.target.value)}
        />
      </AuthField>
      {email && !domainOk ? (
        <div className="-mt-2 mb-3 text-sm text-lose">네이버 메일 주소만 사용할 수 있습니다.</div>
      ) : null}

      <AuthField label="비밀번호">
        <AuthInput
          type="password"
          value={password}
          placeholder="비밀번호"
          onChange={(event) => setPassword(event.target.value)}
        />
      </AuthField>
      {password && passwordError ? (
        <div className="-mt-2 mb-3 text-sm text-lose">{passwordError}</div>
      ) : null}

      <AuthField label="닉네임">
        <AuthInput
          type="text"
          value={nickname}
          placeholder="닉네임"
          onChange={(event) => setNickname(event.target.value)}
        />
      </AuthField>
      {nickname && nicknameError ? (
        <div className="-mt-2 mb-3 text-sm text-lose">{nicknameError}</div>
      ) : null}

      <label className="flex items-start text-sm">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(event) => setAgreed(event.target.checked)}
          className="mr-2 mt-0.5"
        />
        <span>
          <Link href="/clause/service" target="_blank" className="underline">
            이용약관
          </Link>
          과{' '}
          <Link href="/clause/policy" target="_blank" className="underline">
            개인정보 취급방침
          </Link>
          에 동의합니다.
        </span>
      </label>

      {signup.isError ? <div className="mt-3 text-lose">가입하지 못했습니다.</div> : null}

      <AuthSubmit disabled={!canSubmit || signup.isPending} onClick={() => signup.mutate()}>
        회원가입
      </AuthSubmit>
    </AuthCard>
  )
}
