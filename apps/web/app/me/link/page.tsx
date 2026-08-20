'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Skeleton, formatDate } from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { apiSend } from '@/lib/apiSend'
import { useApiReady } from '@/app/providers'

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
    <div className="rounded bg-card px-6 py-6 shadow-card">
      {state.linked && state.player ? (
        <>
          <div className="text-xl">연동된 계정</div>
          <div className="mt-3">
            <Link href={`/player/${state.player.id}`} className="underline">
              {state.player.name}
            </Link>
            {state.linked_at ? (
              <span className="ml-3 text-meta">{formatDate(state.linked_at)} 연동</span>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <div className="text-xl">서든어택 계정 연동</div>
          <div className="mt-2 text-meta">
            연동을 마치면 리그를 만들 수 있습니다. 게임 내 닉네임을 입력해 주세요.
          </div>
          <div className="mt-4 flex items-center">
            <input
              value={playerName}
              onChange={(event) => setPlayerName(event.target.value)}
              placeholder="서든어택 닉네임"
              className="h-11 w-80 rounded border border-line px-3"
            />
            <button
              type="button"
              disabled={!playerName.trim() || save.isPending}
              onClick={() => save.mutate()}
              className="ml-3 h-11 w-24 rounded bg-more text-white disabled:opacity-60"
            >
              연동
            </button>
          </div>
          {save.isError ? (
            <div className="mt-3 text-lose">연동하지 못했습니다. 닉네임을 확인해 주세요.</div>
          ) : null}
        </>
      )}
    </div>
  )
}
