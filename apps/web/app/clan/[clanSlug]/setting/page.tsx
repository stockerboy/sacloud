'use client'

import { use, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Skeleton } from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { apiSend } from '@/lib/apiSend'
import { useApiReady } from '@/app/providers'
import { AuthGuard } from '@/components/AuthGuard'

/**
 * 클랜 설정 `/clan/{slug}/setting`.
 *
 * **원본 화면 상세는 로그인이 필요해 관측하지 못했다 `[미확인]`.**
 * 계약(`ClanSettingInput`)에 정의한 항목(클랜 공지 / 리그 초대 차단)만 구현한다.
 * 실측되면 화면을 원본에 맞춰 고친다.
 */
function ClanSettingBody({ clanSlug }: { clanSlug: string }) {
  const ready = useApiReady()
  const queryClient = useQueryClient()
  const [notice, setNotice] = useState('')
  const [blockInvitation, setBlockInvitation] = useState(false)

  const clan = useQuery({
    queryKey: ['clan', clanSlug],
    queryFn: () => apiGet('clanShow', { params: { clanSlug } }),
    enabled: ready,
  })

  useEffect(() => {
    if (clan.data) setNotice(clan.data.data.notice ?? '')
  }, [clan.data])

  const save = useMutation({
    mutationFn: () =>
      apiSend('clanSettingUpdate', {
        params: { clanSlug },
        body: { notice: notice.trim() || null, block_invitation: blockInvitation },
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['clan', clanSlug] }),
  })

  if (!clan.data) return <Skeleton className="mt-10 h-[240px] w-full" />

  return (
    <div className="pc-container mt-10 pb-10">
      <div className="text-3xl">{clan.data.data.name} 클랜 설정</div>
      <div className="mt-6 rounded bg-card px-6 py-6 shadow-card">
        <div className="mb-2 font-semibold">클랜 공지</div>
        <textarea
          value={notice}
          onChange={(event) => setNotice(event.target.value)}
          rows={4}
          className="w-full rounded border border-line px-3 py-2"
        />

        <label className="mt-4 flex items-center">
          <input
            type="checkbox"
            checked={blockInvitation}
            onChange={(event) => setBlockInvitation(event.target.checked)}
            className="mr-2"
          />
          리그 초대 받지 않기
        </label>

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

export default function ClanSettingPage({ params }: { params: Promise<{ clanSlug: string }> }) {
  const { clanSlug } = use(params)
  return (
    <AuthGuard>
      <ClanSettingBody clanSlug={clanSlug} />
    </AuthGuard>
  )
}
