'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AuthCard, AuthError, AuthField, AuthInput, AuthSubmit, AuthTitle } from '@sacloud/ui'
import { apiSend } from '@/lib/apiSend'
import { ApiError } from '@/lib/api'

/**
 * 로그인 `/auth/login?returnUrl=...`
 *
 * 원본 구성: 이메일 / 비밀번호 / (비밀번호를 잊으셨나요?) / 로그인 / 회원가입 안내.
 * 로그인 후에는 `returnUrl` 로 돌아간다 (원본 관측 — GNB 로그인 링크가 이 값을 붙인다).
 *
 * ══ ★2026-09-03 (O-029) — 로그인이 막혀 있었다★ ══
 *
 * 2026-09-01(D-252)에 로그인 키를 **이메일 → 아이디**로 바꿨다. 서버와 계약은 바뀌었는데
 * **이 화면이 안 따라왔다.** 가입 화면과 **똑같은 사고**다 (O-027).
 * ```
 * 계약이 받음   username 또는 email 중 하나 + password
 * 화면이 보냄   email 하나                       ← 아이디로 가입한 사람은 못 들어온다
 * 화면이 그림   「로그인하지 못했습니다」          ← ★서버가 준 이유를 덮어썼다★
 * ```
 * 서버는 이유를 정확히 주고 있었다 — 401 「아이디 또는 비밀번호가 올바르지 않습니다」,
 * 429 「로그인 시도가 너무 많습니다…」. 그게 여기서 한 문장으로 뭉개져서
 * **막힌 사람도 우리도 원인을 볼 수 없었다.** 특히 429 는 두드릴수록 길어지는데
 * 화면이 「못했습니다」만 보여 주니 사람은 계속 두드린다.
 *
 * ⚠ **계약을 화면에 맞추지 않는다. 화면을 계약에 맞춘다.**
 */
function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const returnUrl = searchParams.get('returnUrl') || '/'

  /* 아이디 칸 하나로 받는다. 서버(`findUserForLogin`)가 아이디로 먼저 찾고,
     `@` 가 들어 있으면 이메일로도 찾는다 — 옛 계정이 그대로 들어온다 */
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')

  const login = useMutation({
    mutationFn: () =>
      /* `email` 이 아니라 `username` 으로 보낸다. 이메일을 적어도 서버가 알아서 찾는다 —
         화면이 `@` 를 보고 갈래를 나누면 규칙이 두 군데로 갈라진다 */
      apiSend('authLogin', { body: { username: identifier.trim(), password } }),
    /**
     * **갱신을 기다린 뒤에 이동한다.**
     *
     * `invalidateQueries`를 기다리지 않고 바로 `push`하면, 이동한 화면의 `AuthGuard`가
     * 아직 갱신되지 않은 `/infos`(= 비로그인)를 보고 **다시 로그인으로 되돌린다.**
     * 로그인은 성공했는데 로그인 화면에 그대로 남는 것처럼 보인다 (실제로 그랬다).
     */
    onSuccess: async () => {
      /* 셸은 `['me']` 를 본다 (O-018). `['infos']` 도 같이 지운다 —
         게시판·리그설정 화면이 아직 그 키를 쓴다. 하나만 지우면 셸이 안 바뀐다 */
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['me'] }),
        queryClient.invalidateQueries({ queryKey: ['infos'] }),
      ])
      router.push(returnUrl)
    },
  })

  return (
    <AuthCard
      footer={
        <>
          회원이 아니신가요?{' '}
          <Link href="/auth/signup">
            {/* 색·밑줄은 안쪽 span 이 가진다 (레이어 밖 `a` 규칙이 `<a>` 유틸리티를 누른다) */}
            <span className="text-text-strong underline underline-offset-4">회원가입</span>
          </Link>
          {/* ⑥ 나갈 길 (O-032). 인증 화면에는 전역 GNB 가 없어서 **사이트로 돌아갈 길이
              로고 하나뿐**이었다. 로고가 링크인 줄 모르는 사람이 더 많다 */}
          <div className="mt-2">
            <Link href="/">
              <span className="underline underline-offset-4">둘러보기로 돌아가기</span>
            </Link>
          </div>
        </>
      }
    >
      <AuthTitle>로그인</AuthTitle>

      {/* 라벨이 「이메일」이면 아이디로 가입한 사람이 **여기서 되돌아간다.** 둘 다 된다고 쓴다 */}
      <AuthField label="아이디 또는 이메일">
        <AuthInput
          type="text"
          value={identifier}
          placeholder="아이디 또는 이메일"
          onChange={(event) => setIdentifier(event.target.value)}
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
              if (event.key === 'Enter' && identifier && password) login.mutate()
            }}
          />
        </div>
      </div>

      {/* 원본은 이 링크를 입력칸에 겹쳐 절대배치했다. 겹치면 좁은 카드에서 글자가 붙는다 —
          같은 자리에 흐름대로 놓는다. 가는 링크라 회색으로 두고 hover 에서만 진홍이 켜진다 */}
      <div className="text-right text-sm text-meta">
        <Link href="/auth/password/forget">
          {/* 밑줄은 안쪽 span 이 가진다 (레이어 밖 `a` 규칙이 `<a>` 유틸리티를 누른다) */}
          <span className="underline underline-offset-4">비밀번호를 잊으셨나요?</span>
        </Link>
      </div>

      {/* ★서버가 준 이유를 그대로 그린다★ — 「로그인하지 못했습니다」는 **이유를 못 받았을 때만** 쓴다.
          401 · 429 · 400 이 각각 다른 문장으로 나온다 (429 는 남은 시간까지) */}
      {login.isError ? (
        <AuthError>
          {login.error instanceof ApiError
            ? login.error.humanMessage('로그인하지 못했습니다.')
            : '로그인하지 못했습니다.'}
        </AuthError>
      ) : null}

      <AuthSubmit
        disabled={!identifier || !password || login.isPending}
        onClick={() => login.mutate()}
        /* ★누르는 동안 상태를 보여 준다★ (2026-09-03 · O-032 ①).
           강민재가 **12초를 아무 표시 없이** 기다렸다. 버튼이 흐려지기만 하면
           사람은 「눌리지 않았다」로 읽고, 폰에서는 두세 번 누른다 */
        pending={login.isPending}
        pendingLabel="로그인하는 중…"
      >
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
