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
  SITE_BRAND,
} from '@sacloud/ui'
import {
  PASSWORD_RESET_MAIL_ENABLED,
  PASSWORD_RESET_UNAVAILABLE_MESSAGE,
} from '@sacloud/contract'
import { apiSend } from '@/lib/apiSend'

/**
 * 비밀번호 재설정 메일 요청 `/auth/password/forget`.
 *
 * ── ⚠ 2026-09-02 — **화면을 닫았다.** 메일 발송이 없어서 막다른 길이었다
 *
 *   `POST /api/auth/password/forget` 은 `password_reset` 토큰을 만들어 DB 에 넣고
 *   **60분 뒤 버린다.** 그런데 저장소에 메일 발송 코드가 한 줄도 없어서 그 토큰을
 *   사람에게 줄 방법이 없다. 관리자 화면에도 꺼내 주는 곳이 없다.
 *   즉 이 화면은 「보냈습니다」라고 말한 뒤 **아무 일도 일어나지 않는** 화면이었고,
 *   비밀번호를 잊은 회원에게 **우회 경로가 없다.**
 *
 *   그래서 게시판(D-252)과 같은 방식으로 **화면만 닫는다.**
 *   ```
 *   false  준비중 안내만 보여 준다        ← 지금
 *   true   옛 폼이 그대로 돌아온다        ← 메일 발송이 붙으면 이 한 줄
 *   ```
 *   **API 라우트 · 토큰 발급 · `/auth/password/reset`(토큰으로 실제 재설정하는 화면)은
 *   하나도 안 건드렸다** (`CLAUDE.md` 10-4). 토큰을 손에 넣을 수 있는 사람은
 *   지금도 그 화면으로 비밀번호를 바꿀 수 있다.
 *
 * ── ★2026-09-02 (O-010) — 스위치를 계약으로 옮겼다. 반쪽만 닫혀 있었다★
 *
 *   위 상수가 **이 파일 안에만** 있어서 서버는 그 값을 몰랐다. 화면은 닫혔는데
 *   `POST /api/auth/password/forget` 은 **그대로 `200 {"ok":true}`** 를 돌려주고
 *   토큰까지 만들고 있었다 (운영에서 직접 찔러 확인). 게시판이 똑같았다(O-011).
 *   값을 `@sacloud/contract` 로 올려 **한 줄이 화면과 API 를 같이 움직이게** 했다.
 *
 *   그리고 안내에 **무엇을 하면 되는지**를 넣었다. 「준비중」만 적으면 비밀번호를
 *   잊은 사람은 갈 곳이 없다. 문의 메일은 푸터가 쓰는 그 주소 하나에서 온다.
 */

export default function PasswordForgetPage() {
  if (!PASSWORD_RESET_MAIL_ENABLED) return <PasswordForgetPreparing />
  return <PasswordForgetForm />
}

/**
 * 준비중 안내.
 *
 * **왜 못 하는지를 적는다.** 「준비중」만 적으면 언제 되는지도, 지금 무엇을 해야
 * 하는지도 알 수 없다. 날짜는 적지 않는다 — 정해진 것이 없다 (`CLAUDE.md` 3장 7번).
 */
function PasswordForgetPreparing() {
  return (
    <AuthCard
      footer={
        <Link href="/auth/login">
          <span className="text-text-strong underline underline-offset-4">로그인으로 돌아가기</span>
        </Link>
      }
    >
      <AuthTitle>비밀번호 재설정</AuthTitle>
      <p className="text-sm leading-relaxed text-meta">{PASSWORD_RESET_UNAVAILABLE_MESSAGE}</p>
      {/* 갈 곳을 준다. 주소가 정해지지 않았으면 링크를 그리지 않는다 —
          없는 주소를 보여 주는 것보다 안 보여 주는 편이 낫다 (`site-config.ts` 규칙) */}
      {SITE_BRAND.contactEmail ? (
        <p className="mt-3 text-sm leading-relaxed text-meta">
          <a href={`mailto:${SITE_BRAND.contactEmail}`}>
            <span className="text-text-strong underline underline-offset-4">
              {SITE_BRAND.contactEmail}
            </span>
          </a>
        </p>
      ) : null}
    </AuthCard>
  )
}

/** 옛 화면 — **지우지 않았다.** 위 스위치를 `true` 로 되돌리면 그대로 돈다 */
function PasswordForgetForm() {
  const [email, setEmail] = useState('')

  const request = useMutation({
    mutationFn: () => apiSend('authPasswordForget', { body: { email } }),
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
      <AuthTitle hint="가입한 이메일 주소로 재설정 링크를 보내드립니다.">비밀번호 재설정</AuthTitle>

      <AuthField label="이메일">
        <AuthInput
          type="text"
          value={email}
          placeholder="you@example.com"
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
