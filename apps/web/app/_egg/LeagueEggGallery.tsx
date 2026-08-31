'use client'

/**
 * 리그 하나의 알 모음집 (사양 5-1).
 *
 * 데이터를 가져오는 일만 한다 — 그리는 일은 `@sacloud/ui` 의 `EggGallery` 가 한다.
 */

import { useMemo } from 'react'
import { EggGallery, useEggKnowledge, type EggGalleryItem } from '@sacloud/ui'
import { useLeagueEggs } from './useLeagueEggs'

export function LeagueEggGallery({
  leagueSlug,
  title,
}: {
  /** 리그 slug — DPL 은 `supply`, IPL 은 `nolink` */
  leagueSlug: string
  /** 화면에 쓰는 리그 이름 */
  title: string
}) {
  const { clans, loading, error, retry, truncated } = useLeagueEggs(leagueSlug)
  const { brokenClanSlugs } = useEggKnowledge()

  const items = useMemo<EggGalleryItem[]>(
    () =>
      clans.map((row) => ({
        key: row.id,
        name: row.clan.name,
        /* 누르면 그 리그 안의 클랜 기록으로 간다 — 랭킹 표와 같은 곳이다 */
        href: `/league/${leagueSlug}/clan/${row.clan.slug}`,
        clan: row.clan,
        state: brokenClanSlugs.includes(row.clan.slug) ? ('broken' as const) : ('sealed' as const),
      })),
    [clans, leagueSlug, brokenClanSlugs],
  )

  return (
    <EggGallery
      title={title}
      note={
        truncated
          ? '클랜이 많아 일부만 그렸습니다'
          : '알을 깨면 그 클랜의 기록이 열립니다'
      }
      items={items}
      loading={loading}
      error={error}
      onRetry={retry}
    />
  )
}
