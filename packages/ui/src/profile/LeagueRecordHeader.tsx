'use client'

import Link from 'next/link'
import { ClanMark, type ClanMarkSource } from '../common/ClanMark'
import { RelativeTime } from '../common/RelativeTime'
import { StarIcon } from '../league/LeagueHome'
import type { RefreshState } from './ProfileHeader'
import { IdentityBand, MetaDot } from '../player/profileKit'

/**
 * 리그 기록실(선수 · 클랜) 상단 헤더 — `적진` 팔레트.
 *
 * 예전에는 원본(3rd.supply)의 실측 구조였다 — 고정 높이 14rem 의 회색 띠에
 * 흰 글자, 48px 높이의 채운 파란 버튼 세 개. 재현을 그만두면서 전부 걷어냈다.
 *
 * 지금은 전역 프로필(`/player/{id}` · `/clan/{slug}`)과 **같은 신원 띠**를 쓴다.
 * 같은 사람·같은 클랜을 두 화면에서 볼 때 머리가 다시 자리를 찾지 않아도 되게 하려는 것이다.
 *
 * **하는 일은 그대로다** — `전적갱신` 은 `clanRenew` 를 부르고, `기본정보` 는 전역
 * 프로필로 가고, `즐겨찾기` 는 여전히 표시 전용이다(저장 위치·노출 지점 `[미확인]`).
 * 리그 이름 문자열은 받은 그대로 흘려보낸다 — 이 파일이 가공하지 않는다.
 */

/**
 * 헤더 안의 보조 버튼 — 면을 채우지 않고 1px 선으로 만든다 (`적진`).
 *
 * **글자색을 여기에 넣지 않는다.** `styles.css` 의 `a { color: inherit }` 는 레이어
 * 밖이라 `<a>` 에 직접 준 Tailwind 색 유틸리티를 눌러 버린다. 링크에 쓸 때는
 * 색을 안쪽 `<span>` 이 맡는다 (`group-hover`).
 */
const HEADER_BTN =
  'group inline-flex h-9 items-center justify-center rounded-[2px] border border-line px-4 text-[13px] transition-colors hover:border-accent'

/** `HEADER_BTN` 안쪽 글자 — 색은 여기가 쓴다 */
const HEADER_BTN_LABEL = 'text-text transition-colors group-hover:text-accent'

/**
 * 즐겨찾기 — 표시 전용.
 * 원본에서도 링크가 아니라 클릭 가능한 `div` 였고, 로그인이 필요한 기능이라
 * 표시만 두고 동작은 붙이지 않는다 (`LeagueHeader` 의 즐겨찾기와 같은 상태다).
 */
function FavoriteButton() {
  return (
    <div className={`${HEADER_BTN} cursor-pointer`}>
      <StarIcon className="mr-1.5 h-[13px] w-3.5" />
      <span className={HEADER_BTN_LABEL}>즐겨찾기</span>
    </div>
  )
}

/**
 * 리그 · 순위 한 줄.
 *
 * 순위가 없으면(배치고사 중) 그 조각을 **만들지 않는다** — `- 0위` 를 지어내지 않는다.
 */
function LeagueLine({ head, tail }: { head: string; tail: string | null }) {
  return (
    <span className="flex items-center gap-2">
      <span className="text-text">{head}</span>
      {tail === null ? null : (
        <>
          <MetaDot />
          <span className="font-num text-text tabular-nums">{tail}</span>
        </>
      )}
    </span>
  )
}

/** 선수 기록실 헤더 */
export function LeaguePlayerRecordHeader({
  leagueName,
  name,
  infoHref,
  clan,
  rank,
  position,
}: {
  leagueName: string
  name: string
  /** `기본정보` 버튼이 가는 곳 (전역 프로필) */
  infoHref: string
  /** 소속 클랜. 무소속이어도 `null` 을 그대로 넘긴다 — fallback 마크가 그려진다 (D-146) */
  clan: { name: string; mark: ClanMarkSource; is_official_clan?: boolean | null } | null
  /** 개인랭킹 순위. 배치고사 중이면 `null` */
  rank: number | null
  /**
   * 포지션 — `스나수` · `2F` · `B리베` · `숏` 중 하나 (D-199 · 사용자 지시).
   *
   * **그 판에 무슨 총을 들었나가 아니다.** 그 선수의 고유 자리이고 경기마다 바뀌지 않는다.
   * 판정이 없으면 `null` 이고 **줄 자체를 그리지 않는다** — 빈 자리를 만들지 않는다.
   */
  position?: string | null
}) {
  return (
    <IdentityBand
      mark={<ClanMark clan={clan} size="max" alt={clan?.name ?? ''} />}
      name={name}
      meta={
        <>
          <LeagueLine
            head={leagueName}
            tail={rank === null ? null : `개인랭킹 ${rank}위`}
          />
          {position ? (
            <>
              <MetaDot />
              <span className="flex items-center gap-2">
                <span className="text-faint">포지션</span>
                <span className="text-text">{position}</span>
              </span>
            </>
          ) : null}
        </>
      }
      action={
        <div className="flex items-center gap-2">
          <Link href={infoHref} className={HEADER_BTN}>
            <span className={HEADER_BTN_LABEL}>기본정보</span>
          </Link>
          <FavoriteButton />
        </div>
      }
    />
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
  /* 리그 이름은 손대지 않는다. 부리그 표기만 뒤에 붙인다 */
  const head = divisionCount > 1 ? `${leagueName} - ${division}부리그` : leagueName

  return (
    <IdentityBand
      mark={<ClanMark clan={clan} size="max" alt={clan.name} />}
      name={name}
      meta={
        <>
          <LeagueLine head={head} tail={rank === null ? null : `${rank}위`} />
          <MetaDot />
          <span className="flex items-center gap-2">
            <span className="text-faint">최근갱신</span>
            {refreshState === 'failed' ? (
              <span className="text-accent">갱신 실패</span>
            ) : renewedAt === null ? (
              <span className="text-faint">기록 없음</span>
            ) : (
              <span className="text-text">
                <RelativeTime value={renewedAt} />
              </span>
            )}
          </span>
        </>
      }
      action={
        <div className="flex items-center gap-2">
          {/* 실패 문구는 위 `최근갱신` 줄이 이미 말한다 — 버튼 아래에 또 적지 않는다 */}
          <button
            type="button"
            disabled={refreshState === 'pending'}
            onClick={onRefresh}
            className={`${HEADER_BTN} border-accent text-accent disabled:opacity-50`}
          >
            {refreshState === 'pending' ? '갱신중' : '전적갱신'}
          </button>
          <Link href={infoHref} className={HEADER_BTN}>
            <span className={HEADER_BTN_LABEL}>기본정보</span>
          </Link>
          <FavoriteButton />
        </div>
      }
    />
  )
}
