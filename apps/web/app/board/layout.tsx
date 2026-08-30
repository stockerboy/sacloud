'use client'

import { usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { BoardNav } from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { useApiReady } from '@/app/providers'

/**
 * 게시판 공통 레이아웃 — 좌측 카테고리 내비 + 본문.
 *
 * `적진` — 본문 최대 폭 `--layout-max`(1120px). 사이드와 본문 사이는 선이 아니라
 * 여백으로 나눈다. 카테고리 목록은 `GET /infos` 의 `categories[]`.
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
    <div className="pc-container mt-12 pb-20 max-md:mt-6">
      <div className="mx-auto flex max-w-[var(--layout-max)] flex-row gap-10 max-md:flex-col max-md:gap-5">
        <BoardNav categories={infos.data?.data.categories ?? []} current={current} />
        <div className="min-w-0 flex-grow">{children}</div>
      </div>
    </div>
  )
}
