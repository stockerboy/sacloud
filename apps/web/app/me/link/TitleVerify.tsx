'use client'

/**
 * 서든어택 계정 **소유권 증명** — 게임 칭호 `[용병]` (2026-09-01).
 *
 * ```
 * ① 자기 서든 닉네임을 넣는다
 * ② 게임에서 칭호를 [용병] 으로 바꾼다      ← 복사 버튼을 준다. 손으로 옮겨 적는 건 고통이다
 * ③ 「확인」 → 우리가 넥슨으로 그 닉네임의 칭호를 읽는다
 * ④ 맞으면 바로 승인. 프로필 관리(한 줄 소개·포지션)가 열린다
 * ```
 *
 * ── 실패하면 **왜 실패했는지 보여 준다**
 *   칭호가 다름 / 칭호를 못 읽음(`알수없음`) / 닉네임 없음 / 이미 남이 인증함 / 조회 불가.
 *   「다시 해 보세요」만 띄우면 사용자는 무엇을 고쳐야 할지 모른다.
 *
 * ── 색
 *   진홍(`--color-accent`)은 **바꿔야 하는 칭호 한 곳**에만 쓴다 (D-204).
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Skeleton } from '@sacloud/ui'
import type { TitleVerificationOutcome, TitleVerificationState } from '@sacloud/contract'
import { ApiError, apiGet } from '@/lib/api'
import { apiSend } from '@/lib/apiSend'
import { useApiReady } from '@/app/providers'
import { MeButton, MeError, MeHeading, MeInput, MeNotice, MePanel } from '../ui'

export function TitleVerify() {
  const ready = useApiReady()
  const queryClient = useQueryClient()
  const [nickname, setNickname] = useState('')
  const [copied, setCopied] = useState(false)

  const state = useQuery({
    queryKey: ['me', 'title-verification'],
    queryFn: () => apiGet('meTitleVerificationShow'),
    enabled: ready,
  })

  const data = state.data?.data ?? null

  /* 이미 신청해 둔 닉네임이 있으면 입력칸을 그것으로 채운다 — 다시 타이핑시키지 않는다 */
  useEffect(() => {
    if (data?.nickname) setNickname((current) => (current === '' ? data.nickname ?? '' : current))
  }, [data?.nickname])

  const check = useMutation({
    mutationFn: () =>
      apiSend('meTitleVerificationCheck', { body: { nickname: nickname.trim() } }),
    onSuccess: () => void queryClient.invalidateQueries(),
  })

  if (!data) return <Skeleton className="h-[220px] w-full" />

  const required = data.required_title

  /* 넥슨 조회 수단이 없으면 있는 척하지 않는다 */
  if (!data.available && data.status !== 'verified') {
    return (
      <MePanel className="max-w-[560px]">
        <MeHeading>서든어택 계정 인증</MeHeading>
        <MeNotice>본인 인증은 준비 중입니다.</MeNotice>
      </MePanel>
    )
  }

  if (data.status === 'verified') {
    return (
      <MePanel className="max-w-[560px]">
        <MeHeading hint="이 계정이 당신 것임을 확인했습니다. 칭호는 원래대로 되돌려도 됩니다.">
          인증 완료
        </MeHeading>
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="text-text-strong">{data.nickname}</span>
          {data.last_seen_title ? (
            <span className="text-sm text-meta">인증 당시 칭호 {data.last_seen_title}</span>
          ) : null}
        </div>
        {data.player ? (
          <div className="mt-5 flex flex-wrap items-center gap-4">
            <Link href={`/player/${data.player.id}`}>
              <span className="text-text-strong underline underline-offset-4">
                {data.player.name}
              </span>
            </Link>
            <Link href={`/player/${data.player.id}/setting`} className="btn-line h-9 px-5 text-sm leading-9">
              <span>프로필 관리</span>
            </Link>
          </div>
        ) : (
          <MeNotice>
            연결할 선수를 아직 찾지 못했습니다. 전적이 쌓이면 자동으로 이어집니다.
          </MeNotice>
        )}
      </MePanel>
    )
  }

  const minutesLeft = data.expires_at ? remainingMinutes(data.expires_at) : null

  return (
    <MePanel className="max-w-[560px]">
      <MeHeading hint="게임 안에서 칭호를 바꿀 수 있는 사람만 인증할 수 있습니다. 인증한 뒤에는 칭호를 원래대로 되돌려도 됩니다.">
        서든어택 계정 인증
      </MeHeading>

      <ol className="mb-6 space-y-2 text-sm leading-relaxed text-meta">
        <li>1. 아래에 서든어택 닉네임을 넣습니다.</li>
        <li className="flex flex-wrap items-center gap-2">
          <span>2. 게임에서 칭호를</span>
          {/* 진홍은 여기 하나뿐이다 */}
          <span className="num font-bold text-accent">{required}</span>
          <span>으로 바꿉니다.</span>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(required).then(
                () => setCopied(true),
                () => setCopied(false),
              )
            }}
            className="btn-line h-7 px-3 text-xs"
          >
            {copied ? '복사됨' : '복사'}
          </button>
        </li>
        <li>3. 아래 「확인」을 누릅니다.</li>
      </ol>

      <div className="flex items-center gap-3">
        <MeInput
          value={nickname}
          onChange={(event) => setNickname(event.target.value)}
          placeholder="서든어택 닉네임"
        />
        <MeButton
          disabled={!nickname.trim() || check.isPending}
          onClick={() => check.mutate()}
          className="h-11 shrink-0"
        >
          {check.isPending ? '확인중' : '확인'}
        </MeButton>
      </div>

      {minutesLeft !== null ? (
        <p className="mt-4 text-sm text-meta">
          남은 시간 <span className="num text-text">{minutesLeft}</span>분
        </p>
      ) : null}

      {check.isError ? <MeError>{sendErrorMessage(check.error)}</MeError> : null}
      {!check.isError && data.outcome ? (
        <MeError>{outcomeMessage(data.outcome, required, data.last_seen_title)}</MeError>
      ) : null}
      {!check.isError && !data.outcome && data.status === 'expired' ? (
        <MeNotice>시간이 지났습니다. 닉네임을 다시 넣고 확인해 주세요.</MeNotice>
      ) : null}
      {!check.isError && !data.outcome && data.status === 'exhausted' ? (
        <MeNotice>확인을 너무 많이 눌렀습니다. 잠시 후 다시 시작해 주세요.</MeNotice>
      ) : null}
    </MePanel>
  )
}

/** 실패 이유를 **그대로** 보여 준다. 무엇을 고쳐야 하는지 알 수 있어야 한다 */
function outcomeMessage(
  outcome: TitleVerificationOutcome,
  required: string,
  lastSeen: TitleVerificationState['last_seen_title'],
): string {
  switch (outcome) {
    case 'verified':
      return '인증했습니다.'
    case 'wrong-title':
      return lastSeen
        ? `지금 칭호가 ${lastSeen} 입니다. ${required} 으로 바꾼 뒤 다시 확인해 주세요.`
        : `칭호가 ${required} 이 아닙니다.`
    case 'no-title':
      /* 넥슨이 칭호를 안 주면 `알수없음` 이다. 없는 값을 지어내지 않는다 */
      return `칭호를 읽지 못했습니다 (알수없음). ${required} 을 착용한 뒤 다시 확인해 주세요.`
    case 'unknown-nickname':
      return '그 닉네임을 쓰는 계정을 찾지 못했습니다. 띄어쓰기까지 정확히 넣어 주세요.'
    case 'taken':
      return '그 계정은 이미 다른 회원이 인증했습니다.'
    case 'closed':
      return '시간이 지났습니다. 다시 확인해 주세요.'
    case 'unavailable':
      return '지금은 계정 조회를 할 수 없습니다. 잠시 후 다시 시도해 주세요.'
  }
}

function sendErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 429) {
    return '확인을 너무 자주 눌렀습니다. 잠시 후 다시 시도해 주세요.'
  }
  return '확인하지 못했습니다. 잠시 후 다시 시도해 주세요.'
}

function remainingMinutes(isoLike: string): number | null {
  const at = new Date(isoLike).getTime()
  if (Number.isNaN(at)) return null
  const minutes = Math.ceil((at - Date.now()) / 60_000)
  return minutes > 0 ? minutes : null
}
