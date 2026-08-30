'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Skeleton } from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { apiSend } from '@/lib/apiSend'
import { useApiReady } from '@/app/providers'
import { MeButton, MeError, MeField, MeHeading, MeInput, MeNotice, MePanel } from '../ui'

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
    <MePanel className="max-w-[480px]">
      <MeHeading>정보 수정</MeHeading>

      <MeField label="닉네임">
        <MeInput value={nickname} onChange={(event) => setNickname(event.target.value)} />
      </MeField>

      {nickname && !ok ? (
        <div className="-mt-3 text-sm text-accent">닉네임은 2~16자여야 합니다.</div>
      ) : null}
      {save.isSuccess ? <MeNotice>저장했습니다.</MeNotice> : null}
      {save.isError ? <MeError>저장하지 못했습니다.</MeError> : null}

      <div className="mt-6">
        <MeButton disabled={!ok || save.isPending} onClick={() => save.mutate()}>
          저장
        </MeButton>
      </div>
    </MePanel>
  )
}
