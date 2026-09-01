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

  return (
    <div className="section-stack">
      {/* ① 정식 경로 — 게임 칭호로 소유권을 증명한다 */}
      <TitleVerify />

      {/* ② 옛 경로 — 운영자 수동 승인 */}
      <MePanel className="max-w-[560px]">
        {state.linked && state.player ? (
          <>
            <MeHeading>연동된 계정</MeHeading>
            <div className="flex items-baseline gap-3">
              <Link
                href={`/player/${state.player.id}`}
                className="text-text-strong underline underline-offset-4"
              >
                {state.player.name}
              </Link>
              {state.linked_at ? (
                <span className="num text-sm text-meta">{formatDate(state.linked_at)} 연동</span>
              ) : null}
            </div>
          </>
        ) : (
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
        )}
      </MePanel>
    </div>
  )
}
