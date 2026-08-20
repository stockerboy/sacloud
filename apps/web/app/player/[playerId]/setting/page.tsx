'use client'

import { use, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Skeleton } from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { apiSend } from '@/lib/apiSend'
import { useApiReady } from '@/app/providers'
import { AuthGuard } from '@/components/AuthGuard'

/**
 * 플레이어 설정 `/player/{id}/setting`.
 *
 * **원본 화면 상세는 로그인이 필요해 관측하지 못했다 `[미확인]`.**
 * 계약(`PlayerSettingInput`)의 항목(포지션 메모 / 메모)만 구현한다.
 * 포지션 메모는 클랜원 목록에 표시된다(원본 관측: "2층", "B 사이트").
 */
function PlayerSettingBody({ playerId }: { playerId: string }) {
  const ready = useApiReady()
  const queryClient = useQueryClient()
  const [position, setPosition] = useState('')
  const [note, setNote] = useState('')

  const player = useQuery({
    queryKey: ['player', playerId],
    queryFn: () => apiGet('playerShow', { params: { playerId } }),
    enabled: ready,
  })

  useEffect(() => {
    if (player.data) {
      setPosition(player.data.data.position ?? '')
      setNote(player.data.data.note ?? '')
    }
  }, [player.data])

  const save = useMutation({
    mutationFn: () =>
      apiSend('playerSettingUpdate', {
        params: { playerId },
        body: { position: position.trim() || null, note: note.trim() || null },
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['player', playerId] }),
  })

  if (!player.data) return <Skeleton className="mt-10 h-[240px] w-full" />

  return (
    <div className="pc-container mt-10 pb-10">
      <div className="text-3xl">{player.data.data.name} 설정</div>
      <div className="mt-6 rounded bg-card px-6 py-6 shadow-card">
        <div className="mb-2 font-semibold">포지션 메모</div>
        <input
          value={position}
          onChange={(event) => setPosition(event.target.value)}
          placeholder="예: 2층, B 사이트"
          className="h-11 w-80 rounded border border-line px-3"
        />

        <div className="mb-2 mt-5 font-semibold">메모</div>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={3}
          className="w-full rounded border border-line px-3 py-2"
        />

        {save.isSuccess ? <div className="mt-3 text-win">저장했습니다.</div> : null}
        {save.isError ? <div className="mt-3 text-lose">저장하지 못했습니다.</div> : null}

        <div className="mt-5">
          <button
            type="button"
            disabled={save.isPending}
            onClick={() => save.mutate()}
            className="h-10 w-24 rounded bg-more text-white disabled:opacity-60"
          >
            저장
          </button>
        </div>
      </div>
    </div>
  )
}

export default function PlayerSettingPage({ params }: { params: Promise<{ playerId: string }> }) {
  const { playerId } = use(params)
  return (
    <AuthGuard>
      <PlayerSettingBody playerId={playerId} />
    </AuthGuard>
  )
}
