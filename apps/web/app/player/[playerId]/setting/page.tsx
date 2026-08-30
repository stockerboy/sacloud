'use client'

import { use, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ProfileSkeleton, SectionTitle } from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { apiSend } from '@/lib/apiSend'
import { useApiReady } from '@/app/providers'
import { AuthGuard } from '@/components/AuthGuard'

/**
 * 플레이어 설정 `/player/{id}/setting`.
 *
 * 항목은 그대로다 — 포지션 메모 / 메모. 저장하는 API 도 `playerSettingUpdate` 그대로다.
 * 겉만 `적진` 팔레트로 바꿨다.
 *
 * 포지션 메모는 클랜원 명단에서 **묶음 이름**으로 쓰인다. 비워 두면 `포지션 미정` 으로 간다.
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

  if (!player.data) {
    return (
      <div className="pc-container pt-[40px]">
        <ProfileSkeleton rows={1} height={240} />
      </div>
    )
  }

  return (
    <div className="pc-container pb-[40px] pt-[40px]">
      <SectionTitle title="설정" note={player.data.data.name} />

      <div className="mt-6 max-w-[560px]">
        <label className="block text-[12px] text-meta" htmlFor="setting-position">
          포지션 메모
        </label>
        <input
          id="setting-position"
          value={position}
          onChange={(event) => setPosition(event.target.value)}
          placeholder="예: 2층, B 사이트"
          className="mt-2 h-11 w-full rounded-[2px] border border-line bg-card px-3 text-[15px] text-text placeholder:text-faint focus:border-accent focus:outline-none"
        />
        <p className="mt-2 text-[12px] text-faint">
          비워 두면 클랜원 명단에서 `포지션 미정` 으로 묶입니다.
        </p>

        <label className="mt-7 block text-[12px] text-meta" htmlFor="setting-note">
          메모
        </label>
        <textarea
          id="setting-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={3}
          className="mt-2 w-full rounded-[2px] border border-line bg-card px-3 py-2 text-[15px] text-text placeholder:text-faint focus:border-accent focus:outline-none"
        />

        <div className="mt-7 flex items-center gap-4">
          <button
            type="button"
            disabled={save.isPending}
            onClick={() => save.mutate()}
            className="h-10 rounded-[2px] border border-accent px-6 text-[13px] text-accent transition-colors hover:bg-accent hover:text-page disabled:opacity-50"
          >
            {save.isPending ? '저장중' : '저장'}
          </button>
          {save.isSuccess ? (
            <span className="text-[12px] text-meta">저장했습니다.</span>
          ) : null}
          {save.isError ? (
            <span className="text-[12px] text-accent">저장하지 못했습니다.</span>
          ) : null}
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
