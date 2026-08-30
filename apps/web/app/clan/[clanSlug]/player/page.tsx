'use client'

import { use } from 'react'
import type { ClanPlayer } from '@sacloud/contract'
import { ClanRosterByPosition, ProfileLoadMore } from '@sacloud/ui'
import { useCursorQuery } from '@/lib/useCursorQuery'

/**
 * 클랜원 탭 `/clan/{slug}/player` — 커서 무한스크롤.
 *
 * 명단을 **포지션으로 묶어** 보여 준다. 포지션 메모가 비어 있는 사람은
 * `포지션 미정` 묶음에 그대로 남는다 — 없는 포지션을 지어내지 않는다.
 * 불러오는 API 와 커서 동작은 그대로다.
 */
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
    <div className="pc-container pb-[40px]">
      <ClanRosterByPosition
        members={members.items}
        loading={members.loading}
        error={members.error}
      />
      {members.hasMore ? (
        <ProfileLoadMore onClick={members.loadMore} loading={members.loadingMore} />
      ) : null}
    </div>
  )
}
