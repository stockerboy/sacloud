'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Skeleton, formatDate } from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { apiSend } from '@/lib/apiSend'
import { useApiReady } from '@/app/providers'
import { MeButton, MeError, MeHeading, MeInput, MePanel } from '../ui'
import { TitleVerify } from './TitleVerify'
import { IntroVerify } from './IntroVerify'

/**
 * 서든어택 계정 연동 `/me/link`.
 *
 * 두 길이 나란히 있다.
 *
 * ① **칭호 인증** (2026-09-01, 정식 경로) — 게임에서 칭호를 `[용병]` 으로 바꾸면 바로 승인된다.
 *    그 계정에 실제로 로그인해야만 할 수 있는 일이라 **소유권을 증명한다.**
 * ② **운영자 수동 승인** (D-121, 옛 경로) — 근거를 적어 신청하면 사람이 본다.
 *    ①이 안 되는 사람을 위해 **남겨 둔다** (CLAUDE.md 10-4). 지우지 않는다.
 *
 * 둘 중 어느 것도 **회원가입을 막지 않는다.** 인증은 가입 후 선택이다.
 */
export default function MeLinkPage() {
  const ready = useApiReady()
  const queryClient = useQueryClient()
  const [playerName, setPlayerName] = useState('')

  const link = useQuery({
    queryKey: ['me', 'link'],
    queryFn: () => apiGet('meLinkShow'),
    enabled: ready,
  })

  const save = useMutation({
    mutationFn: () => apiSend('meLinkUpdate', { body: { player_name: playerName.trim() } }),
    onSuccess: () => void queryClient.invalidateQueries(),
  })

  if (!link.data) return <Skeleton className="h-[200px] w-full" />
  const state = link.data.data

  /*
   * ★★인증이 끝났으면 방법들을 보여 주지 않는다★★ (2026-09-20 사장님)
   *
   * > 「저기 attacker 베리타스 저거 빼버려」
   * > 「인증되면 인증된계정이라고 확실하게 문구띄워줘 안헷갈리게」
   *
   *   인증을 마친 뒤에도 ★칭호 인증 칸과 운영자 신청 칸이 그대로 떠 있었다.★
   *   자동완성 목록(「attacker · 베리타스」)까지 보여서 ★아직 안 된 줄 알게 된다.★
   *   ★끝났으면 끝났다고만 말한다.★
   */
  const done = state.linked && state.player

  return (
    <div className="section-stack">
      {done ? (
        <MePanel className="max-w-[560px]">
          <p className="text-[12px] tracking-[.12em] text-accent">SUDDEN ATTACK</p>
          <h2 className="mt-1.5 text-[20px] text-text-strong">인증된 계정입니다</h2>
          <div className="mt-3 flex items-baseline gap-3">
            <Link
              href={`/player/${state.player!.id}`}
              className="text-[17px] text-text-strong underline underline-offset-4"
            >
              {state.player!.name}
            </Link>
            {state.linked_at ? (
              <span className="num text-[12px] text-meta">{formatDate(state.linked_at)} 연동</span>
            ) : null}
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-meta">
            이 아이디가 사장님 것임이 확인되었습니다. 병영수첩 자기소개나 게임 칭호는
            이제 원래대로 되돌리셔도 됩니다.
          </p>
        </MePanel>
      ) : (
        <>
          {/*
            ★세 가지 중 하나만 하면 된다★ (2026-09-20 사장님:
              「이거 3가지 방법중 하나를 선택 할 수있다고 설명해주고」)
            어느 것을 골라도 결과는 같다 — 그 말을 먼저 해 줘야 사람이 셋을 다 하지 않는다.
          */}
          <MePanel className="max-w-[560px]">
            <MeHeading>서든어택 계정 인증</MeHeading>
            <p className="text-[13px] leading-relaxed text-meta">
              아래 <b className="text-text">세 가지 중 하나만</b> 하시면 됩니다. 어느 것을 고르셔도
              결과는 같습니다.
            </p>
            <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[13px] leading-relaxed text-meta">
              <li>
                <b className="text-text">자기소개 인증</b> — 게임을 안 켜도 됩니다. 가장 빠릅니다
              </li>
              <li>
                <b className="text-text">칭호 인증</b> — 게임에서 칭호를 바꿀 수 있는 분
              </li>
              <li>
                <b className="text-text">운영자 승인</b> — 위 둘이 안 될 때
              </li>
            </ol>
          </MePanel>

          <IntroVerify />
          <TitleVerify />

          {/* ③ 옛 경로 — 운영자 수동 승인 */}
          <MePanel className="max-w-[560px]">
          <>
            <MeHeading hint="칭호를 바꿀 수 없다면 이쪽으로 신청해 주세요. 운영자가 근거를 보고 승인합니다.">
              운영자 승인으로 연동
            </MeHeading>
            <div className="flex items-center gap-3">
              <MeInput
                value={playerName}
                onChange={(event) => setPlayerName(event.target.value)}
                placeholder="서든어택 닉네임"
              />
              <MeButton
                disabled={!playerName.trim() || save.isPending}
                onClick={() => save.mutate()}
                className="h-11 shrink-0"
              >
                신청
              </MeButton>
            </div>
            {save.isError ? <MeError>신청하지 못했습니다. 닉네임을 확인해 주세요.</MeError> : null}
          </>
          </MePanel>
        </>
      )}
    </div>
  )
}
