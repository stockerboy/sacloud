import Link from 'next/link'
import type { League, LeagueClan } from '@sacloud/contract'
import { ClanMark } from '../common/ClanMark'
import { Label } from '../common/Label'
import { EmptyState } from '../common/EmptyState'
import { Skeleton } from '../common/Skeleton'
import { formatCount, formatDate, formatRate, formatRating } from '../common/format'
import { rateClass } from '../common/rate'

/**
 * 리그홈 (리그정보 / 리그소개).
 *
 * 원본 실측 구조
 * ```
 * <div class="mt-10 pc-container">
 *   <div class="px-10 py-10 text-white bg-purple-950">          ← 리그 헤더
 *     <div class="flex items-center">
 *       <div class="text-4xl tracking-wider">{리그명}</div>
 *       <배지 공식>  <div class="text-gray-300 ml-5">{n}개의 클랜 참여중</div>
 *       <div class="… border border-amber-400 text-amber-400 text-sm">즐겨찾기</div>
 *   <div class="flex items-center text-xl bg-white">            ← 탭 57px
 *     <a class="nav-item nav-active">리그정보</a><a class="nav-item">리그소개</a>
 *   <div>
 *     <div><div class="title">리그관리자</div><div class="content flex items-center">…</div></div>
 *     <div><div class="title">리그맵</div><div class="content">…</div></div>
 *     <div><div class="title">대전인원</div><div class="content">…</div></div>
 *     <div><div class="title">참여중인 클랜</div><div>…</div></div>
 * ```
 * 실측 CSS
 * - 헤더 배경 `#1A0533`, 즐겨찾기 테두리·글자 `#FBBF24`
 * - `.title`  테두리 1px `#E5E7EB` / 배경 흰색 / padding 7px 21px / 15.75px·600
 * - `.content` 좌·우·아래 테두리 / 배경 `#ECECEC` / padding 14px 21px / 17.5px / 글자 `#4A4A4A`
 */

export const LEAGUE_HOME_TABS = [
  { label: '리그정보', segment: 'info' },
  { label: '리그소개', segment: 'desc' },
] as const

export function LeagueHeader({ league }: { league: League }) {
  return (
    <div className="bg-league-header px-10 py-10 text-white">
      <div className="flex items-center">
        <div className="flex items-center">
          <div className="text-4xl tracking-wider">{league.name}</div>
          {league.official ? <Label name="공식" className="ml-2" /> : null}
          <div className="ml-5 text-line">{formatCount(league.clan_count)}개의 클랜 참여중</div>
        </div>
        {/*
          즐겨찾기는 로그인이 필요한 기능이다. 표시는 원본과 동일하게 하고
          실제 동작은 Phase 6(인증)에서 붙인다. 저장 위치·노출 지점은 아직 `[미확인]`.
        */}
        <div className="ml-5 flex cursor-pointer items-center justify-center border border-favorite px-2 py-1 text-sm text-favorite">
          <StarIcon />
          즐겨찾기
        </div>
      </div>
    </div>
  )
}

export function LeagueHomeTabs({ leagueSlug, current }: { leagueSlug: string; current: string }) {
  return (
    <div className="flex items-center bg-card text-xl">
      {LEAGUE_HOME_TABS.map((tab) => (
        <Link
          key={tab.segment}
          href={`/league/${leagueSlug}/home/${tab.segment}`}
          className={`flex cursor-pointer items-center justify-center border-2 border-transparent px-4 py-4 ${
            tab.segment === current ? 'border-b-[3px] border-b-black font-bold' : ''
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  )
}

function Field({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="border border-divider bg-card px-6 py-2 text-lg font-semibold">{title}</div>
      <div className="border-x border-b border-divider bg-row px-6 py-4 text-xl text-input-fg">
        {children}
      </div>
    </div>
  )
}

export function LeagueInfoPanel({
  league,
  clans,
  clansLoading,
}: {
  league: League
  clans?: readonly LeagueClan[]
  clansLoading?: boolean
}) {
  return (
    <>
      <Field title="리그관리자">{league.user?.nickname ?? '-'}</Field>
      <Field title="리그맵">
        {league.maps.length === 0 ? (
          '-'
        ) : (
          <span className="flex flex-wrap gap-x-6 gap-y-1">
            {league.maps.map((map) => (
              <span key={map.id}>{map.name}</span>
            ))}
          </span>
        )}
      </Field>
      <Field title="대전인원">
        {league.player_limits.length === 0 ? (
          '-'
        ) : (
          <span className="flex flex-wrap gap-x-6 gap-y-1">
            {league.player_limits.map((limit) => (
              <span key={limit}>
                {limit} vs {limit}
              </span>
            ))}
          </span>
        )}
      </Field>
      <div>
        <div className="border border-divider bg-card px-6 py-2 text-lg font-semibold">
          참여중인 클랜
        </div>
        <div className="border-x border-b border-divider">
          {clansLoading ? (
            <>
              {Array.from({ length: 6 }, (_, index) => (
                <div key={index} className="flex items-center border-b border-b-line bg-row py-3">
                  <Skeleton className="mx-6 h-[25px] w-full" />
                </div>
              ))}
            </>
          ) : !clans || clans.length === 0 ? (
            <EmptyState message="참여중인 클랜이 없습니다." />
          ) : (
            clans.map((entry) => (
              <Link
                key={entry.id}
                href={`/league/${league.slug}/clan/${entry.clan.slug}`}
                className="flex items-center border-b border-b-line bg-row px-6 py-3 text-meta last:border-b-0"
              >
                <ClanMark mark={entry.clan.mark} className="mr-2" alt={entry.clan.name} />
                <span className="w-64 font-semibold">{entry.clan.name}</span>
                <span className="w-24">{entry.division}부리그</span>
                <span className="w-28 text-right">
                  {formatCount(entry.win)}
                  <span className="ml-0.5">승</span>
                </span>
                <span className="w-28 text-right">
                  {formatCount(entry.lose)}
                  <span className="ml-0.5">패</span>
                </span>
                <span className={`w-24 text-right ${rateClass(entry.win_rate)}`}>
                  {formatRate(entry.win_rate)}
                  <span className="ml-0.5">%</span>
                </span>
                <span className="w-28 text-right">
                  {entry.placement ? '배치고사' : formatRating(entry.rating)}
                </span>
                <span className="flex-grow text-right">
                  {formatDate(entry.joined_at)} 가입
                </span>
              </Link>
            ))
          )}
        </div>
      </div>
    </>
  )
}

function StarIcon() {
  return (
    <svg viewBox="0 0 15 12" className="mr-1 h-3 w-[15px]" fill="currentColor" aria-hidden>
      <path d="M7.5 0 9.3 4h4.2l-3.4 2.6 1.3 4.1L7.5 8.2 3.6 10.7l1.3-4.1L1.5 4h4.2z" />
    </svg>
  )
}
