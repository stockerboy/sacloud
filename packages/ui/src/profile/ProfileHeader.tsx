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
    /* 모바일은 이름 아래로 내려간다 (`ml-8` 을 풀고 위 여백을 준다) */
    <div className="ml-8 max-md:ml-0 max-md:mt-3 max-md:w-full">
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
  /**
   * 소속 클랜. **무소속이면 `null` 을 그대로 넘긴다** — 마크를 통째로 지우지 않는다 (D-146).
   * `is_official_clan` 을 함께 받아야 등록 클랜만 실제 마크를 쓴다는 판정이 성립한다
   * (빠지면 `ClanMark` 가 전부 fallback 으로 떨어뜨린다).
   */
  clan: {
    slug: string
    name: string
    mark: ClanMarkSource
    is_official_clan?: boolean | null
  } | null
  renewedAt: string | null
  refreshState: RefreshState
  onRefresh: () => void
}) {
  return (
    /* 모바일은 여백을 줄이고, 이름 + 갱신 버튼을 줄바꿈한다. `md:` 이상은 원본 그대로 */
    <div className="mt-5 bg-player-header py-10 text-white max-md:mt-0 max-md:py-5">
      <div className="pc-container">
        <div className="flex items-center max-md:flex-wrap">
          {/* 무소속이어도 자리를 비우지 않는다 — fallback 마크가 그려진다 (D-146) */}
          <ClanMark clan={clan} size="max" alt={clan?.name ?? ''} />
          <div className="ml-5 text-4xl max-md:ml-3 max-md:min-w-0 max-md:flex-1 max-md:truncate max-md:text-2xl">
            {name}
          </div>
          <RefreshButton
            label="정보갱신"
            state={refreshState}
            renewedAt={renewedAt}
            onClick={onRefresh}
          />
        </div>
        <div className="mt-10 text-lg text-nav-fg max-md:mt-5 max-md:text-base">
          <div className="flex items-center">
            소속:
            {clan ? (
              <Link href={`/clan/${clan.slug}`} className="ml-5 inline-flex items-center">
                <ClanMark clan={clan} size="sm" className="mr-2" alt={clan.name} />
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
    /*
     * 모바일은 고정 높이(13rem)를 풀어야 한다 — 클랜마스터/설립일이 세로로 쌓이면서
     * 고정 높이를 넘어 다음 블록을 덮는다.
     */
    <div className="mt-5 h-52 bg-clan-header py-10 text-white max-md:mt-0 max-md:h-auto max-md:py-5">
      <div className="pc-container">
        <div className="flex items-center">
          <ClanMark mark={mark} size="max" alt={name} />
          <div className="ml-5 text-4xl max-md:ml-3 max-md:min-w-0 max-md:flex-1 max-md:truncate max-md:text-2xl">
            {name}
          </div>
        </div>
        <div className="mt-10 flex items-center text-lg text-nav-fg max-md:mt-4 max-md:flex-col max-md:items-start max-md:text-base">
          <div className="border-r border-r-clan-header-line px-4 max-md:border-r-0 max-md:px-0">
            클랜마스터:{' '}
            {master ? <Link href={`/player/${master.id}`}>{master.name}</Link> : '-'}
          </div>
          <div className="px-4 max-md:mt-1 max-md:px-0">
            클랜설립일: {establishedAt ? formatDate(establishedAt) : '-'}
          </div>
        </div>
      </div>
    </div>
  )
}
