import Link from 'next/link'
import type { ClanLeagueEntry, PlayerLeagueEntry } from '@sacloud/contract'
import { isOfficialLeague, showsDivision } from '@sacloud/contract'
import { Label } from '../common/Label'
import { EmptyState } from '../common/EmptyState'
import { Skeleton } from '../common/Skeleton'
import { formatCount, formatRate } from '../common/format'
import { rateClass } from '../common/rate'
import { NAV_TAB, NAV_TAB_ACTIVE, NAV_TAB_IDLE } from '../common/navTab'
import { leagueClanPath, leaguePlayerPath } from '../common/paths'

/**
 * 참여중인 리그 카드.
 *
 * **플레이어와 클랜의 카드 구성이 서로 다르다** (원본 실측, 2026-08-20).
 *
 * 플레이어 — `flex flex-col shadow w-96 mt-4 mr-4 p-4 border text-boardText hover:bg-blue-50`
 * ```
 * {리그명} [공식]
 *                              래더  3432점        ← flex-row-reverse, mt-6
 * 2,153전 1,302승 851패        승률  60.5%         ← mt-2
 * 17,855킬 17,422데스          킬뎃  50.6%         ← mt-2
 * ```
 * 클랜 — 같은 카드지만 `mt-4`가 없고 구성이 다르다
 * ```
 * {리그명} [공식]
 * 1부리그로 참여중                                  ← mt-2
 * 6,711전 3,624승 3,087패      승률  54%           ← mt-6, 래더·킬뎃 없음
 * ```
 *
 * **주의** — 플레이어 카드의 래더는 `3432점`으로 **천 단위 콤마가 없다.**
 * 같은 값이 랭킹 표에서는 `3,432점`으로 나온다. 원본이 실제로 이렇게 다르다.
 */

/**
 * 카드 한 장.
 *
 * 모바일에서는 `w-96`(24rem) 고정폭이 화면을 넘기 때문에 **전체폭 한 장씩** 쌓는다.
 * 항목·순서·문구는 그대로다 — 줄이지 않는다. 넓은 화면은 원본 실측 그대로 24rem 이다.
 */
const CARD_BASE =
  'flex flex-col w-96 mr-4 p-4 border border-divider shadow-card text-card-text cursor-pointer hover:bg-blue-50 max-md:w-full max-md:mr-0 max-md:mt-3'

/** 프로필 하위 탭 (플레이어: 리그정보 / 클랜: 리그정보·클랜원) */
export function ProfileTabs({
  tabs,
  current,
}: {
  tabs: readonly { label: string; href: string }[]
  current: string
}) {
  return (
    <div className="bg-card">
      {/* 탭이 3개면 좁은 화면에서 넘친다 — 탭 줄 안에서만 가로로 밀리게 한다 */}
      <div className="pc-container flex items-center text-xl max-md:overflow-x-auto">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`${NAV_TAB} max-md:whitespace-nowrap ${
              tab.href === current ? NAV_TAB_ACTIVE : NAV_TAB_IDLE
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>
    </div>
  )
}

function CardTitle({ name, official }: { name: string; official: boolean }) {
  return (
    <div className="flex items-center">
      <div className="text-2xl font-semibold text-ink">{name}</div>
      {official ? <Label name="공식" className="ml-2" /> : null}
    </div>
  )
}

/* ---------------------------------------------------------------- 플레이어 --- */

function PlayerEntryCard({ entry, playerId }: { entry: PlayerLeagueEntry; playerId: string }) {
  return (
    <Link
      /**
       * 기록실 경로에는 **`playerId`** 를 넣는다 (`common/paths.ts` 참조).
       * `league_player_id`를 넣으면 API가 404를 돌려주고 화면이 빈 페이지가 된다 — 실제 버그였다.
       */
      href={leaguePlayerPath(entry.league.slug, playerId)}
      className={`${CARD_BASE} mt-4`}
    >
      {/* 공식 표기는 계약의 표가 정한다 (#17). 옛 값: `entry.league.official` */}
      <CardTitle name={entry.league.name} official={isOfficialLeague(entry.league.slug)} />
      <div className="mt-6 flex flex-row-reverse items-center">
        <div className="flex items-center">
          래더
          {/* 이 창에 0판이면 래더 자리에 `기록 없음` (배치고사 폐지 · 2026-09-01) */}
          <span className="ml-2 w-20 text-right text-2xl">
            {entry.placement ? '기록 없음' : `${entry.rating}점`}
          </span>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <div>
          {formatCount(entry.win + entry.lose)}전 {formatCount(entry.win)}승{' '}
          {formatCount(entry.lose)}패
        </div>
        <div className="flex items-center">
          승률
          <span className={`ml-2 w-20 text-right text-2xl ${rateClass(entry.win_rate)}`}>
            {formatRate(entry.win_rate)}%
          </span>
        </div>
      </div>
      {/* 무소속리그 카드에는 누적 킬·데스·킬뎃 줄이 아예 없다.
          래더·승패·승률·순위는 공식리그 카드와 똑같이 나온다 (D-107) */}
      {entry.kill === null || entry.death === null || entry.kd_rate === null ? null : (
        <div className="mt-2 flex items-center justify-between">
          <div>
            {formatCount(entry.kill)}킬 {formatCount(entry.death)}데스
          </div>
          <div className="flex items-center">
            킬뎃
            <span className={`ml-2 w-20 text-right text-2xl ${rateClass(entry.kd_rate)}`}>
              {formatRate(entry.kd_rate)}%
            </span>
          </div>
        </div>
      )}
    </Link>
  )
}

export function PlayerLeagueCards({
  playerId,
  entries,
  loading,
}: {
  /** 카드가 이동할 기록실 경로에 쓰인다. 리그 참가 ID가 아니라 **플레이어 ID**다 */
  playerId: string
  entries?: readonly PlayerLeagueEntry[]
  loading?: boolean
}) {
  if (loading) return <CardSkeleton />
  if (!entries || entries.length === 0) {
    return <EmptyState message="참여중인 리그가 없습니다." />
  }
  return (
    <div className="flex flex-wrap">
      {entries.map((entry) => (
        <PlayerEntryCard key={entry.league.id} entry={entry} playerId={playerId} />
      ))}
    </div>
  )
}

/* -------------------------------------------------------------------- 클랜 --- */

function ClanEntryCard({ entry, clanSlug }: { entry: ClanLeagueEntry; clanSlug: string }) {
  return (
    <Link href={leagueClanPath(entry.league.slug, clanSlug)} className={CARD_BASE}>
      {/* 공식 표기는 계약의 표가 정한다 (#17). 옛 값: `entry.league.official` */}
      <CardTitle name={entry.league.name} official={isOfficialLeague(entry.league.slug)} />
      <div className="mt-2">
        {/* 부리그를 화면에 내지 않는 리그(지시 #9)는 «참여중» 만 적는다 */}
        <div>{showsDivision(entry.league.slug) ? `${entry.division}부리그로 참여중` : '참여중'}</div>
      </div>
      <div className="mt-6 flex items-center justify-between">
        <div>
          {formatCount(entry.win + entry.lose)}전 {formatCount(entry.win)}승{' '}
          {formatCount(entry.lose)}패
        </div>
        <div className="flex items-center">
          승률
          <span className={`ml-2 text-2xl ${rateClass(entry.win_rate)}`}>
            {formatRate(entry.win_rate)}%
          </span>
        </div>
      </div>
    </Link>
  )
}

export function ClanLeagueCards({
  clanSlug,
  entries,
  loading,
}: {
  clanSlug: string
  entries?: readonly ClanLeagueEntry[]
  loading?: boolean
}) {
  if (loading) return <CardSkeleton />
  if (!entries || entries.length === 0) {
    return <EmptyState message="참여중인 리그가 없습니다." />
  }
  return (
    <div className="flex flex-wrap">
      {entries.map((entry) => (
        <ClanEntryCard key={entry.league.id} entry={entry} clanSlug={clanSlug} />
      ))}
    </div>
  )
}

function CardSkeleton() {
  return (
    <div className="flex flex-wrap">
      {Array.from({ length: 2 }, (_, index) => (
        <div key={index} className={`${CARD_BASE} mt-4`}>
          <Skeleton className="h-[153px] w-full" />
        </div>
      ))}
    </div>
  )
}
