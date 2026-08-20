'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Skeleton } from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { apiSend } from '@/lib/apiSend'
import { useApiReady } from '@/app/providers'

/** 정보 수정 `/me/setting` — 닉네임 변경. */
export default function MeSettingPage() {
  const ready = useApiReady()
  const queryClient = useQueryClient()
  const [nickname, setNickname] = useState('')

  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => apiGet('meShow'),
    enabled: ready,
  })

  useEffect(() => {
    if (me.data) setNickname(me.data.data.nickname)
  }, [me.data])

  const save = useMutation({
    mutationFn: () =>
      apiSend('meSettingUpdate', {
        body: { nickname: nickname.trim(), avatar_url: me.data?.data.avatar_url ?? null },
      }),
    onSuccess: () => void queryClient.invalidateQueries(),
  })

  if (!me.data) return <Skeleton className="h-[160px] w-full" />
  const ok = nickname.trim().length >= 2 && nickname.trim().length <= 16

  return (
    <div className="rounded bg-card px-6 py-6 shadow-card">
      <label className="mb-2 block font-semibold">닉네임</label>
      <input
        value={nickname}
        onChange={(event) => setNickname(event.target.value)}
        className="h-11 w-80 rounded border border-line px-3"
      />
      {nickname && !ok ? (
        <div className="mt-2 text-sm text-lose">닉네임은 2~16자여야 합니다.</div>
      ) : null}
      {save.isSuccess ? <div className="mt-2 text-win">저장했습니다.</div> : null}
      {save.isError ? <div className="mt-2 text-lose">저장하지 못했습니다.</div> : null}
      <div className="mt-5">
        <button
          type="button"
          disabled={!ok || save.isPending}
          onClick={() => save.mutate()}
          className="h-10 w-24 rounded bg-more text-white disabled:opacity-60"
        >
          저장
        </button>
      </div>
    </div>
  )
}
