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
    /*
     * 모바일에서는 좌측 내비(15rem)를 옆에 둘 폭이 없다. 위아래로 쌓고
     * 카테고리는 가로로 눕힌다(`BoardNav`). 항목을 빼지는 않는다.
     */
    <div className="pc-container mt-16 pb-10 max-md:mt-6">
      <div className="flex flex-row max-md:flex-col">
        <BoardNav categories={infos.data?.data.categories ?? []} current={current} />
        <div className="ml-2 flex-grow max-md:ml-0 max-md:mt-2 max-md:min-w-0">{children}</div>
      </div>
    </div>
  )
}
