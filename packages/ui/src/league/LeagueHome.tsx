import Link from 'next/link'
import type { League, LeagueClan } from '@sacloud/contract'
import { isOfficialLeague, showsTier } from '@sacloud/contract'
import { ClanMark } from '../common/ClanMark'
import { Label } from '../common/Label'
import { EmptyState } from '../common/EmptyState'
import { Skeleton } from '../common/Skeleton'
import { formatCount, formatDate, formatRate, formatRating } from '../common/format'
import { COL_STAT, NUM, SUB, TAB, TAB_ACTIVE, TAB_IDLE } from './rankStyles'

/**
 * 리그홈 (리그정보 / 리그소개).
 *
 * `적진` 톤으로 다시 그렸다 (2026-08-30).
 * - 헤더의 검보라 판(`--color-league-header`)을 걷어냈다. 배경은 카드 검정 하나뿐이고,
 *   리그명은 `--font-display` 로 크게 세운다. 면을 칠하는 대신 **여백과 1px 선**으로 나눈다
 * - 정보 항목을 상자 안의 상자(제목 박스 + 내용 박스)에서 **한 줄짜리 정의 목록**으로 폈다.
 *   화면을 꽉 채우지 않는다
 * - 참여 클랜 목록은 랭킹 표와 **같은 치수·색 토큰**(`rankStyles.ts`)을 쓴다.
 *   승/패는 승률 아래로 접었다 — 데이터는 그대로 있고 위계만 바뀌었다
 * - 빨강은 쓰지 않는다. 이 화면에는 1위도 활성 탭 밑줄 말고는 강조할 숫자가 없다
 *
 * **탭이 가리키는 곳(href)과 버튼이 하는 일은 그대로다.**
 */

export const LEAGUE_HOME_TABS = [
  { label: '리그정보', segment: 'info' },
  { label: '리그소개', segment: 'desc' },
] as const

export function LeagueHeader({ league }: { league: League }) {
  return (
    <div className="border-b border-line bg-card px-8 py-10 max-md:px-4 max-md:py-7">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="font-display text-4xl tracking-wide text-text-strong max-md:text-3xl">
          {league.name}
        </h1>
        {/* 표기는 계약의 표가 정한다 (#17). 옛 줄: `league.official ? …` */}
        {isOfficialLeague(league.slug) ? <Label name="공식" /> : null}
        <div className="text-sm text-meta">
          <span className={NUM}>{formatCount(league.clan_count)}</span>개의 클랜 참여중
        </div>
        {/*
          즐겨찾기는 로그인이 필요한 기능이다. 표시만 하고 실제 동작은 그대로 미구현이다.
          저장 위치·노출 지점은 아직 `[미확인]`.
        */}
        <div className="ml-auto flex cursor-pointer select-none items-center rounded-[var(--radius)] border border-line px-2.5 py-1 text-xs text-meta hover:text-text-strong">
          <StarIcon />
          즐겨찾기
        </div>
      </div>
    </div>
  )
}

export function LeagueHomeTabs({ leagueSlug, current }: { leagueSlug: string; current: string }) {
  return (
    /* 랭킹 화면의 탭과 같은 상수를 쓴다 — 한 사이트에 두 가지 탭 디자인을 만들지 않는다 */
    <div className="flex items-stretch gap-1 border-b border-line px-8 max-md:px-4">
      {LEAGUE_HOME_TABS.map((tab) => (
        <Link
          key={tab.segment}
          href={`/league/${leagueSlug}/home/${tab.segment}`}
          className={`${TAB} ${tab.segment === current ? TAB_ACTIVE : TAB_IDLE}`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  )
}

/** 정보 한 줄 — 제목(왼쪽, 옅게) + 내용. 상자를 겹치지 않는다 */
function Field({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex border-b border-b-line-soft px-8 py-4 max-md:flex-col max-md:px-4">
      <div className="w-36 shrink-0 text-xs tracking-[0.14em] text-faint max-md:mb-1.5 max-md:w-auto">
        {title}
      </div>
      <div className="min-w-0 flex-1 text-text">{children}</div>
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
          <span className="flex flex-wrap gap-x-5 gap-y-1">
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
          <span className="flex flex-wrap gap-x-5 gap-y-1">
            {league.player_limits.map((limit) => (
              <span key={limit} className={NUM}>
                {limit} vs {limit}
              </span>
            ))}
          </span>
        )}
      </Field>

      <div className="mt-10">
        <div className="px-8 pb-3 text-xs tracking-[0.14em] text-faint max-md:px-4">
          참여중인 클랜
        </div>
        <div className="border-y border-line">
          {clansLoading ? (
            <>
              {Array.from({ length: 6 }, (_, index) => (
                <div
                  key={index}
                  className="flex items-center border-b border-b-line-soft py-3 last:border-b-0"
                >
                  <Skeleton className="mx-8 h-[22px] w-full max-md:mx-4" />
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
                className="flex items-center border-b border-b-line-soft px-8 py-3 text-text last:border-b-0 hover:text-text-strong max-md:px-4"
              >
                <ClanMark mark={entry.clan.mark} className="mr-2" alt={entry.clan.name} />
                <span className="min-w-0 flex-1 truncate">{entry.clan.name}</span>
                {/* 부리그를 화면에 내지 않는 리그(지시 #9)는 이 칸이 없다 */}
                {showsTier(league.slug) ? (
                  <span className="w-24 shrink-0 text-right text-sm text-meta max-md:hidden">
                    {entry.division}티어
                  </span>
                ) : null}
                {/* 승/패는 승률 아래로 접었다 (랭킹 표와 같은 규칙) */}
                <span className={COL_STAT}>
                  <span className={`${NUM} text-text-strong`}>{formatRate(entry.win_rate)}</span>
                  <span className="ml-0.5 text-xs text-faint">%</span>
                  <span className={SUB}>
                    {formatCount(entry.win)}승 {formatCount(entry.lose)}패
                  </span>
                </span>
                <span className={`w-28 shrink-0 text-right ${NUM} text-text-strong max-md:w-20`}>
                  {/* 이 창에 0판이면 점수 대신 `기록 없음` (배치고사 폐지 · 2026-09-01) */}
                  {entry.placement ? (
                    <span className="font-body text-sm text-meta">기록 없음</span>
                  ) : (
                    formatRating(entry.rating)
                  )}
                </span>
                <span className="w-40 shrink-0 text-right text-xs text-faint max-md:hidden">
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

/**
 * 즐겨찾기 별 — 빈 별(외곽선)이다. 채운 별은 "이미 즐겨찾기에 넣었다"는 뜻으로 읽혀
 * 비로그인 상태와 어긋난다. 자산을 가져오지 않고 새로 그렸다.
 */
export function StarIcon({ className = 'mr-1.5 h-3 w-[15px]' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 15"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M8 1.2l1.9 4 4.3.6-3.1 3 .7 4.3L8 11.1l-3.8 2 .7-4.3-3.1-3 4.3-.6z" />
    </svg>
  )
}
