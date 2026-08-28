'use client'

import Link from 'next/link'
import { ClanMark, type ClanMarkSource } from '../common/ClanMark'
import { RelativeTime } from '../common/RelativeTime'
import { StarIcon } from '../league/LeagueHome'
import type { RefreshState } from './ProfileHeader'

/**
 * 리그 기록실(선수 · 클랜) 상단 헤더.
 *
 * 우리 기록실에는 **이 블록이 통째로 없었다** — 탭만 있었다 (UI_PARITY_AUDIT 5-3~5-6 · 6-3 · 6-4).
 * 아래 구조는 2026-08-27 원본 DOM 실측이다.
 *
 * 클랜 `/league/{slug}/clan/{slug}`
 * ```
 * <div class="mt-5 bg-warmGray-800 h-56 py-10 text-white">
 *   <div class="pc-container">
 *     <div class="flex items-center">
 *       <sp-common-clan-mark class="mark-max">
 *       <div class="flex flex-col content-between ml-5">
 *         <div class="text-sm">서플라이공식리그 - 2부리그<span> - 8위</span></div>
 *         <div class="text-4xl">afterpray</div>
 *     <div class="flex flex-col ml-20 mt-5">
 *       <div class="flex items-center">
 *         <button class="… bg-blue-600 border-blue-700 text-white w-28 h-12 text-lg">전적갱신</button>
 *         <a      class="… bg-gray-500 border-gray-600 text-white ml-2 px-5 h-12 text-lg">기본정보</a>
 *         <div    class="… bg-coolGray-700 border-coolGray-800 text-amber-400 ml-2 px-5 h-12 text-lg">☆ 즐겨찾기</div>
 *       <div class="text-xs mt-0.5 text-gray-300">최근갱신: 16분 전</div>
 * ```
 *
 * 선수 `/league/{slug}/player/{id}` — 같은 구조인데 세 가지가 다르다.
 * 배경이 `blueGray-default`, **`전적갱신`과 `최근갱신`이 없고**, 버튼 두 개가
 * 이름 오른쪽(`flex items-center ml-10`)에 붙는다. 즐겨찾기 배경도 한 단계 어둡다.
 *
 * `즐겨찾기`는 원본에서도 링크가 아니라 클릭 가능한 `div` 다. 로그인이 필요한 기능이라
 * 표시만 원본과 같게 하고 동작은 붙이지 않는다 — 저장 위치·노출 지점은 `[미확인]`
 * (`LeagueHeader` 의 즐겨찾기와 같은 상태다).
 */

const BTN = 'inline-flex h-12 items-center justify-center border px-5 text-lg'
const BTN_NEUTRAL = `${BTN} border-btn-neutral-border bg-btn-neutral text-white`

/** 즐겨찾기 — 표시 전용. 원본도 `div` 라 시맨틱을 바꾸지 않는다 */
function FavoriteButton({ dark }: { dark: boolean }) {
  const tone = dark
    ? 'border-btn-fav-dark-border bg-btn-fav-dark'
    : 'border-btn-fav-border bg-btn-fav'
  return (
    <div className={`${BTN} ml-2 cursor-pointer text-favorite ${tone}`}>
      <StarIcon className="mr-1 h-[15px] w-4" />
      즐겨찾기
    </div>
  )
}

/**
 * 브레드크럼 한 줄 — `{리그명} - {2부리그}` + `<span> - 8위</span>`.
 *
 * 뒷조각(순위)은 원본이 `<span>` 으로 따로 감싼다. 순위가 없으면(배치고사 중)
 * 그 조각을 **만들지 않는다** — `- 0위` 같은 값을 지어내지 않는다.
 */
function Breadcrumb({ head, tail }: { head: string; tail: string | null }) {
  return (
    <div className="text-sm">
      {head}
      {tail === null ? null : <span> {tail}</span>}
    </div>
  )
}

/** 선수 기록실 헤더 */
export function LeaguePlayerRecordHeader({
  leagueName,
  name,
  infoHref,
  clan,
  rank,
}: {
  leagueName: string
  name: string
  /** `기본정보` 버튼이 가는 곳 (전역 프로필) */
  infoHref: string
  /** 소속 클랜. 무소속이어도 `null` 을 그대로 넘긴다 — fallback 마크가 그려진다 (D-146) */
  clan: { name: string; mark: ClanMarkSource; is_official_clan?: boolean | null } | null
  /** 개인랭킹 순위. 배치고사 중이면 `null` */
  rank: number | null
}) {
  return (
    /*
     * 모바일은 고정 높이(14rem)를 풀고 버튼 줄을 이름 아래로 내린다.
     * 넓은 화면(`md:` 이상)은 원본 실측 그대로 한 줄이다.
     */
    <div className="mt-5 h-56 bg-player-header py-10 text-white max-md:mt-0 max-md:h-auto max-md:py-5">
      <div className="pc-container">
        <div className="flex items-center max-md:flex-wrap">
          <ClanMark clan={clan} size="max" alt={clan?.name ?? ''} />
          <div className="ml-5 flex flex-col max-md:ml-3 max-md:min-w-0 max-md:flex-1">
            <Breadcrumb
              head={leagueName}
              tail={rank === null ? null : `- 개인랭킹 ${rank}위`}
            />
            <div className="text-4xl max-md:truncate max-md:text-2xl">{name}</div>
          </div>
          <div className="ml-10 flex items-center max-md:ml-0 max-md:mt-3 max-md:w-full">
            <Link href={infoHref} className={BTN_NEUTRAL}>
              기본정보
            </Link>
            <FavoriteButton dark />
          </div>
        </div>
      </div>
    </div>
  )
}

/** 클랜 기록실 헤더 */
export function LeagueClanRecordHeader({
  leagueName,
  name,
  infoHref,
  clan,
  division,
  divisionCount,
  rank,
  renewedAt,
  refreshState,
  onRefresh,
}: {
  leagueName: string
  name: string
  infoHref: string
  clan: { name: string; mark: ClanMarkSource; is_official_clan?: boolean | null }
  division: number
  /**
   * 리그의 부리그 수. `1`이면 단일리그라 브레드크럼에 `N부리그` 를 넣지 않는다
   * (CLAUDE.md 6장). 단일리그 원본 화면은 아직 못 봤다 `[미확인]`.
   */
  divisionCount: number
  /** 클랜랭킹 순위. 배치고사 중이면 `null` */
  rank: number | null
  renewedAt: string | null
  refreshState: RefreshState
  onRefresh: () => void
}) {
  const head = divisionCount > 1 ? `${leagueName} - ${division}부리그` : leagueName

  return (
    /* 모바일 — 고정 높이 해제 + 버튼 줄의 왼쪽 들여쓰기(`ml-20`) 제거 */
    <div className="mt-5 h-56 bg-clan-header py-10 text-white max-md:mt-0 max-md:h-auto max-md:py-5">
      <div className="pc-container">
        <div className="flex items-center">
          <ClanMark clan={clan} size="max" alt={clan.name} />
          <div className="ml-5 flex min-w-0 flex-col max-md:ml-3">
            <Breadcrumb head={head} tail={rank === null ? null : `- ${rank}위`} />
            <div className="text-4xl max-md:truncate max-md:text-2xl">{name}</div>
          </div>
        </div>
        <div className="ml-20 mt-5 flex flex-col max-md:ml-0 max-md:mt-3">
          <div className="flex items-center max-md:flex-wrap max-md:gap-y-2">
            <button
              type="button"
              disabled={refreshState === 'pending'}
              onClick={onRefresh}
              className={`${BTN} w-28 border-refresh-border bg-refresh px-0 text-white focus:outline-none disabled:opacity-60`}
            >
              {refreshState === 'pending' ? '갱신중' : '전적갱신'}
            </button>
            <Link href={infoHref} className={`${BTN_NEUTRAL} ml-2`}>
              기본정보
            </Link>
            <FavoriteButton dark={false} />
          </div>
          <div className="mt-0.5 text-xs text-line">
            {refreshState === 'failed' ? (
              '갱신에 실패했습니다'
            ) : renewedAt === null ? (
              '갱신 기록 없음'
            ) : (
              <>
                최근갱신: <RelativeTime value={renewedAt} />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
