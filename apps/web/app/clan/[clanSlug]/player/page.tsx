'use client'

import { use } from 'react'
import type { ClanPlayer } from '@sacloud/contract'
import { ClanMemberList, LoadMoreButton } from '@sacloud/ui'
import { useCursorQuery } from '@/lib/useCursorQuery'

/** 클랜원 탭 `/clan/{slug}/player` — 커서 무한스크롤. */
export default function ClanMembersPage({
  params,
}: {
  params: Promise<{ clanSlug: string }>
}) {
  const { clanSlug } = use(params)

  const members = useCursorQuery<ClanPlayer>('clanPlayers', ['clan', clanSlug, 'players'], {
    params: { clanSlug },
  })

  return (
    <div className="pc-container mt-6 pb-10">
      <ClanMemberList
        members={members.items}
        loading={members.loading}
        error={members.error}
      />
      {members.hasMore ? (
        <LoadMoreButton onClick={members.loadMore} loading={members.loadingMore} />
      ) : null}
    </div>
  )
}
