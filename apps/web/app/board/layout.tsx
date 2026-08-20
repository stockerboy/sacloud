'use client'

import { usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { BoardNav } from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { useApiReady } from '@/app/providers'

/**
 * 게시판 공통 레이아웃 — 좌측 카테고리 내비 + 본문.
 *
 * 원본 실측: `<div class="pc-container mt-16"><div class="flex flex-row">` 안에
 * `w-60` 사이드 + 본문(846px). 카테고리 목록은 `GET /infos` 의 `categories[]`.
 */
export default function BoardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? ''
  const ready = useApiReady()
  const current = pathname.split('/')[2] ?? ''

  const infos = useQuery({
    queryKey: ['infos'],
    queryFn: () => apiGet('infos'),
    enabled: ready,
  })

  return (
    <div className="pc-container mt-16 pb-10">
      <div className="flex flex-row">
        <BoardNav categories={infos.data?.data.categories ?? []} current={current} />
        <div className="ml-2 flex-grow">{children}</div>
      </div>
    </div>
  )
}
