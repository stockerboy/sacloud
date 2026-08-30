'use client'

import { use, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ProfileSkeleton, SectionTitle } from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { apiSend } from '@/lib/apiSend'
import { useApiReady } from '@/app/providers'
import { AuthGuard } from '@/components/AuthGuard'

/**
 * 클랜 설정 `/clan/{slug}/setting`.
 *
 * 항목은 그대로다 — 클랜 공지 / 리그 초대 차단. 저장 API 도 `clanSettingUpdate` 그대로다.
 * 겉만 `적진` 팔레트로 바꿨다.
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

  if (!clan.data) {
    return (
      <div className="pc-container pt-[40px]">
        <ProfileSkeleton rows={1} height={240} />
      </div>
    )
  }

  return (
    <div className="pc-container pb-[40px] pt-[40px]">
      <SectionTitle title="클랜 설정" note={clan.data.data.name} />

      <div className="mt-6 max-w-[560px]">
        <label className="block text-[12px] text-meta" htmlFor="clan-notice">
          클랜 공지
        </label>
        <textarea
          id="clan-notice"
          value={notice}
          onChange={(event) => setNotice(event.target.value)}
          rows={4}
          className="mt-2 w-full rounded-[2px] border border-line bg-card px-3 py-2 text-[15px] text-text placeholder:text-faint focus:border-accent focus:outline-none"
        />

        <label className="mt-5 flex items-center gap-2 text-[14px] text-text">
          <input
            type="checkbox"
            checked={blockInvitation}
            onChange={(event) => setBlockInvitation(event.target.checked)}
            className="accent-accent"
          />
          리그 초대 받지 않기
        </label>

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

export default function ClanSettingPage({ params }: { params: Promise<{ clanSlug: string }> }) {
  const { clanSlug } = use(params)
  return (
    <AuthGuard>
      <ClanSettingBody clanSlug={clanSlug} />
    </AuthGuard>
  )
}
