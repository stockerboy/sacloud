'use client'

import Link from 'next/link'
import { ClanMark, type ClanMarkSource } from '../common/ClanMark'
import { RelativeTime } from '../common/RelativeTime'
import { formatDate } from '../common/format'

/**
 * 플레이어 / 클랜 프로필 헤더.
 *
 * 원본 실측 구조 — 플레이어
 * ```
 * <div class="mt-5 bg-blueGray-default py-10 text-white">    배경 #374151
 *   <div class="pc-container">
 *     <div class="flex items-center">
 *       <sp-common-clan-mark class="mark-max">              51×51
 *       <div class="text-4xl ml-5">{닉네임}</div>
 *       <div class="ml-8">
 *         <button class="w-24 h-12 bg-blue-600 border border-blue-700">정보갱신</button>
 *         <div class="text-xs mt-0.5 text-gray-300">최근갱신: 21시간 전</div>
 *     <div class="mt-10 text-gray-200 text-lg">
 *       <div class="flex items-center">소속:
 *         <a class="inline-flex items-center ml-5"><마크 w-7 h-7>{클랜명}</a>
 * ```
 *
 * 원본 실측 구조 — 클랜
 * ```
 * <div class="mt-5 bg-warmGray-800 h-52 py-10 text-white">   배경 #292524, 높이 13rem
 *   <div class="pc-container">
 *     <div class="flex items-center"><마크 51><div class="text-4xl ml-5">{클랜명}</div>
 *     (※ 클랜 헤더에는 갱신 버튼이 없다 — 플레이어 헤더에만 있다. 2026-08-20 실측)
 *     <div class="flex items-center mt-10 text-gray-200 text-lg">
 *       <div class="px-4 border-r border-warmGray-600">클랜마스터: <a>{이름}</a></div>
 *       <div class="px-4">클랜설립일: {날짜}</div>
 * ```
 */

/** 갱신 버튼 상태 — 원본은 버튼 + 아래에 `최근갱신: N일 전` */
export type RefreshState = 'idle' | 'pending' | 'failed'

export function RefreshButton({
  label,
  state,
  renewedAt,
  onClick,
}: {
  /** `정보갱신`(플레이어) / `전적갱신`(클랜) */
  label: string
  state: RefreshState
  renewedAt: string | null
  onClick: () => void
}) {
  return (
    <div className="ml-8">
      <button
        type="button"
        disabled={state === 'pending'}
        onClick={onClick}
        className="flex h-12 w-24 items-center justify-center border border-refresh-border bg-refresh focus:outline-none disabled:opacity-60"
      >
        <div>{state === 'pending' ? '갱신중' : label}</div>
      </button>
      <div className="mt-0.5 text-xs text-line">
        {state === 'failed' ? (
          <div>갱신에 실패했습니다</div>
        ) : renewedAt ? (
          <div>
            최근갱신: <RelativeTime value={renewedAt} />
          </div>
        ) : (
          <div>갱신 기록 없음</div>
        )}
      </div>
    </div>
  )
}

export function PlayerHeader({
  name,
  clan,
  renewedAt,
  refreshState,
  onRefresh,
}: {
  name: string
  clan: { slug: string; name: string; mark: ClanMarkSource } | null
  renewedAt: string | null
  refreshState: RefreshState
  onRefresh: () => void
}) {
  return (
    <div className="mt-5 bg-player-header py-10 text-white">
      <div className="pc-container">
        <div className="flex items-center">
          {clan ? <ClanMark mark={clan.mark} size="max" alt={clan.name} /> : null}
          <div className="ml-5 text-4xl">{name}</div>
          <RefreshButton
            label="정보갱신"
            state={refreshState}
            renewedAt={renewedAt}
            onClick={onRefresh}
          />
        </div>
        <div className="mt-10 text-lg text-nav-fg">
          <div className="flex items-center">
            소속:
            {clan ? (
              <Link href={`/clan/${clan.slug}`} className="ml-5 inline-flex items-center">
                <ClanMark mark={clan.mark} size="sm" className="mr-2" alt={clan.name} />
                {clan.name}
              </Link>
            ) : (
              <span className="ml-5">없음</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export function ClanHeader({
  name,
  mark,
  master,
  establishedAt,
}: {
  name: string
  mark: ClanMarkSource
  master: { id: string; name: string } | null
  establishedAt: string | null
}) {
  return (
    <div className="mt-5 h-52 bg-clan-header py-10 text-white">
      <div className="pc-container">
        <div className="flex items-center">
          <ClanMark mark={mark} size="max" alt={name} />
          <div className="ml-5 text-4xl">{name}</div>
        </div>
        <div className="mt-10 flex items-center text-lg text-nav-fg">
          <div className="border-r border-r-clan-header-line px-4">
            클랜마스터:{' '}
            {master ? <Link href={`/player/${master.id}`}>{master.name}</Link> : '-'}
          </div>
          <div className="px-4">
            클랜설립일: {establishedAt ? formatDate(establishedAt) : '-'}
          </div>
        </div>
      </div>
    </div>
  )
}
