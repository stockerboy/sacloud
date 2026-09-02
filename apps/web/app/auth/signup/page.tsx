'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AuthCard,
  AuthError,
  AuthField,
  AuthInput,
  AuthSubmit,
  AuthTitle,
  canSubmitSignup,
  isAllowedSignupEmail,
  validateSignupUsername,
  validateSignupNickname,
  validateSignupPassword,
} from '@sacloud/ui'
import { apiSend } from '@/lib/apiSend'
import { ApiError } from '@/lib/api'

/**
 * 회원가입 `/auth/signup`.
 *
 * 원본 관측 제약 (2026-08-21)
 * - **네이버 메일로만 가입 가능** (placeholder `you@naver.com`)   ← ⚠ 아래 참조
 * - 가입 시 이메일 인증이 진행된다                                ← ⚠ 아래 참조
 * - 약관·개인정보 동의 체크가 필수
 * 안내 문구는 원본 문장을 그대로 쓰지 않고 같은 뜻으로 새로 썼다 (CLAUDE.md 3장 4번).
 *
 * ── ⚠ 2026-09-02 — 위 둘은 **지금 우리 사이트의 사실이 아니다**
 *   ① 도메인 제한을 풀었다 (`SIGNUP_ALLOWED_EMAIL_DOMAINS = []`).
 *   ② **메일을 보내는 기능이 없다.** 저장소 전체에 발송 코드가 0건이다.
 *      가입 API 는 `email_verify` 토큰을 만들지만 전달할 경로가 없다.
 *   그래서 화면 안내에서 둘 다 뺐다. 위 서술은 **원본 관측 기록**으로 남긴다.
 */
export default function SignupPage() {
  const router = useRouter()
  const queryClient = useQueryClient()

  /* ★아이디가 로그인 키다★ 이메일이 아니다 (D-252). 이 칸이 없어서 가입이 통째로 막혔었다 */
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [agreed, setAgreed] = useState(false)

  // 검증 규칙은 `packages/ui/src/auth/signupRules.ts` 한 곳에 있다 (단위 테스트로 고정)
  const usernameError = validateSignupUsername(username)
  const domainOk = isAllowedSignupEmail(email)
  const passwordError = validateSignupPassword(password)
  const nicknameError = validateSignupNickname(nickname)
  const canSubmit = canSubmitSignup({ username, email, password, nickname, agreed })

  /*
   * ★서버가 「어느 칸인지」까지 알려 준다★ (2026-09-03 · O-032 ④).
   *
   * 가입 API 는 `{ message, errors: { username: ['이미 사용 중인 아이디입니다'] } }` 로 답한다.
   * 그런데 화면은 `message` 만 **버튼 바로 위**에 그렸다 — 아이디 칸은 **화면 맨 위**다.
   * 사람이 위아래를 오가며 어느 칸인지 찾아야 했다. 이제 그 칸 밑에 붙인다.
   */
  const serverFieldError = (field: string): string | undefined =>
    signup.error instanceof ApiError ? signup.error.fieldErrors?.[field]?.[0] : undefined

  const signup = useMutation({
    mutationFn: () =>
      apiSend('authSignup', {
        body: {
          username,
          password,
          nickname: nickname.trim(),
          /* 이메일은 **선택**이다 (D-252). 비었으면 아예 안 보낸다 —
             빈 문자열을 보내면 서버의 이메일 형식 검사에 걸린다 */
          ...(email.trim() ? { email: email.trim() } : {}),
          captcha_token: 'mock',
        },
      }),
    /*
     * ★가입하면 바로 로그인이다★ (2026-09-03 · O-032 ⑤).
     *
     * **서버는 이미 세션을 준다** — 가입 API 의 마지막 줄이 `startSession(user.id)` 이고
     * 그 안에서 httpOnly 쿠키까지 심는다. 그런데 화면이 그걸 안 쓰고
     * 「가입 완료」 화면으로 보낸 뒤 **다시 로그인**을 시켰다. 한 단계가 헛돌았다.
     *
     * ⚠ **세션 발급 방식은 한 글자도 안 바꿨다.** 서버가 주는 것을 쓸 뿐이다.
     * ⚠ 갱신을 **기다린 뒤에** 옮긴다 — 안 기다리면 옮겨 간 화면이 아직 낡은
     *   「비로그인」을 보고 되돌려 보낸다 (로그인 화면이 겪은 그 사고다).
     *
     * 옛 줄 — `router.push('/auth/email/verify')`. 그 화면은 지우지 않았다
     * (`CLAUDE.md` 10-4). 메일 발송이 붙으면 그때 다시 그리로 보낸다.
     */
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['me'] }),
        queryClient.invalidateQueries({ queryKey: ['infos'] }),
      ])
      router.push('/')
    },
  })

  /**
   * 위 오류가 **어느 칸엔가 이미 적혔는가** — 그러면 버튼 위에 또 적지 않는다.
   *
   * ⚠ **`signup` 보다 뒤에 있어야 한다.** 위에 두면 `useMutation` 이 아직 안 돌아서
   *   `signup` 이 TDZ 에 걸리고 화면이 **500** 이 된다. 실제로 그렇게 깨뜨려 봤다.
   */
  const shownByField = ['username', 'email', 'password', 'nickname'].some(
    (field) => serverFieldError(field) !== undefined,
  )

  return (
    <AuthCard
      footer={
        <>
          <Link href="/auth/login">
            {/* 색·밑줄은 안쪽 span 이 가진다 (레이어 밖 `a` 규칙이 `<a>` 유틸리티를 누른다) */}
            <span className="text-text-strong underline underline-offset-4">
              로그인으로 돌아가기
            </span>
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
      {/*
        ⚠ 2026-09-02 — 안내에서 **두 가지를 뺐다** (사실이 아니었다).

          「가입 과정에서 이메일 인증을 진행합니다」
            → 메일을 보내는 기능이 저장소에 없다. 가입 API 가 `email_verify` 토큰을
              만들기는 하지만 **전달할 길이 없다.** 없는 절차를 있다고 말하지 않는다
              (`CLAUDE.md` 3장 7번).
          「가입은 네이버 메일 주소로만 할 수 있습니다」
            → 도메인 제한이 풀렸다 (`SIGNUP_ALLOWED_EMAIL_DOMAINS = []`).

        옛 문장은 지우지 않고 위에 적어 둔다 (`CLAUDE.md` 10-4). 제한을 되살리면
        `domainOk` 분기와 함께 그때 문장도 되살린다.
      */}
      <AuthTitle hint="약관과 개인정보 처리방침에 동의하면 가입할 수 있습니다.">회원가입</AuthTitle>

      {/* ★아이디 — 로그인 키다★ (D-252). 규칙은 계약(`Username`)에서 그대로 온다 */}
      <AuthField
        label="아이디"
        /* ★예시가 규칙보다 크다★ (O-032 ②) — 선수 열에 여덟이 자기 닉네임을 넣고 튕긴다.
           「영문으로 시작하는 4~16자」는 규칙이고, 아래 줄은 **답**이다 */
        hint="영문으로 시작하는 4~16자 · 예: heojinseok, hjs_2026"
        error={(username && usernameError) || serverFieldError('username')}
      >
        <AuthInput
          type="text"
          value={username}
          placeholder="영문으로 시작하는 4~16자"
          onChange={(event) => setUsername(event.target.value)}
        />
      </AuthField>

      {/* 이메일은 **선택**이다 (D-252). 비워도 가입된다 — 필수처럼 보이면 안 된다 */}
      <AuthField
        label="이메일 (선택)"
        hint="비워 두어도 가입됩니다. 나중에 비밀번호를 찾을 때 씁니다"
        error={serverFieldError('email')}
      >
        <AuthInput
          type="text"
          value={email}
          placeholder="비워 두어도 됩니다"
          onChange={(event) => setEmail(event.target.value)}
        />
      </AuthField>
      {/*
        도메인 제한이 살아 있을 때만 뜨는 줄이다. 지금은 목록이 비어 있어 `domainOk` 가
        항상 참이라 **그려지지 않는다.** 분기는 남긴다 — 제한을 되살리면 그대로 돈다.
      */}
      {email && !domainOk ? (
        <div className="-mt-4 mb-5 text-sm text-accent">가입할 수 없는 메일 주소입니다.</div>
      ) : null}

      {/* ③ 규칙을 **치기 전에** 보여 준다. 짧게 치고 나서야 알려 주지 않는다 */}
      <AuthField
        label="비밀번호"
        hint="8자 이상"
        error={(password && passwordError) || serverFieldError('password')}
      >
        <AuthInput
          type="password"
          value={password}
          placeholder="비밀번호"
          onChange={(event) => setPassword(event.target.value)}
        />
      </AuthField>

      <AuthField
        label="닉네임"
        /* 닉네임은 **한글이 된다** — 아이디에서 튕긴 사람이 여기서 자기 이름을 쓸 수 있다.
           그 사실을 적어 두는 것이 이 줄의 값어치다 */
        hint="2~16자 · 한글도 됩니다"
        error={(nickname && nicknameError) || serverFieldError('nickname')}
      >
        <AuthInput
          type="text"
          value={nickname}
          placeholder="닉네임"
          onChange={(event) => setNickname(event.target.value)}
        />
      </AuthField>

      <label className="flex items-start text-sm text-meta">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(event) => setAgreed(event.target.checked)}
          className="mr-2 mt-0.5 accent-accent"
        />
        <span>
          <Link
            href="/clause/service"
            target="_blank"
            className="text-text underline underline-offset-4"
          >
            이용약관
          </Link>
          과{' '}
          <Link
            href="/clause/policy"
            target="_blank"
            className="text-text underline underline-offset-4"
          >
            개인정보 취급방침
          </Link>
          에 동의합니다.
        </span>
      </label>

      {/*
        ★서버가 준 이유를 그대로 그린다★ (2026-09-02 · O-023).
        그전에는 무슨 일이 있어도 「가입하지 못했습니다」 한 줄이었다. 서버는 칸마다
        사람 말을 만들어 주고 있었는데(`signupFieldMessage()`) 화면이 안 썼고,
        `apiSend` 도 본문을 버렸다. **가입이 왜 막혔는지 알 길이 없었다.**
        「가입하지 못했습니다」는 이제 **이유를 못 받았을 때의 마지막 문구**다.
      */}
      {/*
        ★칸 밑에 이미 적힌 말을 여기서 또 하지 않는다★ (2026-09-03 · O-032 ④).

        서버가 칸을 짚어 주면(`errors.username` 등) 그 말은 **그 칸 밑에** 나간다.
        여기서 또 그리면 같은 문장이 화면에 **두 번** 뜬다 — 실제로 그랬다
        (「이미 사용 중인 아이디입니다」가 아이디 칸 밑과 버튼 위에 동시에).
        칸을 못 짚는 오류(429 · 500 처럼 화면 전체에 해당하는 것)만 여기 남는다.
      */}
      {signup.isError && !shownByField ? (
        <AuthError>
          {signup.error instanceof ApiError
            ? signup.error.humanMessage('가입하지 못했습니다.')
            : '가입하지 못했습니다.'}
        </AuthError>
      ) : null}

      <AuthSubmit
        disabled={!canSubmit || signup.isPending}
        onClick={() => signup.mutate()}
        /* ① 흐려지기만 하면 사람은 「눌리지 않았다」로 읽고 또 누른다 (O-032 ①) */
        pending={signup.isPending}
        pendingLabel="가입하는 중…"
      >
        회원가입
      </AuthSubmit>
    </AuthCard>
  )
}
