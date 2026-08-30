'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Skeleton, formatDate } from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { apiSend } from '@/lib/apiSend'
import { useApiReady } from '@/app/providers'
import { MeButton, MeError, MeHeading, MeInput, MePanel } from '../ui'

/**
 * 서든어택 계정 연동 `/me/link`.
 *
 * 원본은 계정 연동을 마친 회원만 리그를 만들 수 있다(관측).
 * **실제 인증 방식은 `[미확인]`** — 닉네임 입력 후 검증 코드 방식으로 추정되나 확인하지 못했다
 * (docs/DECISIONS.md D-003). Mock 단계에서는 닉네임 입력 → 연동 성공으로 흉내낸다.
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
          <MeHeading hint="연동을 마치면 리그를 만들 수 있습니다. 게임 내 닉네임을 입력해 주세요.">
            서든어택 계정 연동
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
              연동
            </MeButton>
          </div>
          {save.isError ? <MeError>연동하지 못했습니다. 닉네임을 확인해 주세요.</MeError> : null}
        </>
      )}
    </MePanel>
  )
}
