import Link from 'next/link'
import type { HomeLeagueTop, HomeTop } from '@sacloud/contract'
import { ClanMark } from '../common/ClanMark'
import { formatRating } from '../common/format'
import { ratingClass } from '../common/rating'
import { leaguePlayerPath } from '../common/paths'
import { EmptyState } from '../common/EmptyState'
import { ErrorState } from '../common/ErrorState'
import { Skeleton } from '../common/Skeleton'

/**
 * 메인 · 리그별 개인랭킹 TOP3 (`docs/SITE_SPEC_V2.md` 3절).
 *
 * ── 원본에 없는 신규 화면이다
 *   3rd.supply 메인에는 이 칸이 없다. 사용자가 준 새 사양(2026-08-30)으로 만든 것이라
 *   **원본과 나란히 놓고 비교할 대상이 없다.** 그래서 모양을 새로 지어내지 않고
 *   바로 아래 인기게시글 카드와 **같은 카드 틀**(48rem · 흰 배경 · 남색 4px 머리선)을 쓴다.
 *
 * ── 보여 주는 값은 셋뿐이다
 *   사양이 `닉네임 · 클랜마크 · 래더 점수` 로 못박았다. 승패·킬뎃은 응답에도 없다.
 *   무소속리그(IPL)가 누적 킬뎃을 감추기 때문에(D-107) 세 리그를 나란히 놓으면
 *   컬럼이 리그마다 달라지는데, 애초에 그 칸을 만들지 않아 어긋날 일이 없다.
 *
 * ── 비어 있으면 비워 둔다
 *   무소속리그는 지금 등록 클랜이 0이라 랭킹도 0건이다. 0점으로 채우거나
 *   다른 리그 선수를 끌어오지 않는다 (CLAUDE.md 3장 7번 · D-106).
 */
export interface LeagueTop3Props {
  data?: HomeTop
  loading?: boolean
  error?: boolean
  onRetry?: () => void
}

export function LeagueTop3({ data, loading, error, onRetry }: LeagueTop3Props) {
  return (
    <div className="mt-10 flex justify-center max-md:mt-4 max-md:px-3">
      <div className="w-board rounded-sm bg-card shadow-card max-md:w-full">
        <div className="border-b-4 border-b-accent px-4 py-2 text-lg font-semibold text-accent">
          리그별 개인랭킹 TOP3
        </div>
        {error ? (
          <ErrorState message="랭킹을 불러오지 못했습니다." onRetry={onRetry} />
        ) : loading || !data ? (
          <LeagueTop3Skeleton />
        ) : (
          /* 넓은 화면은 세 리그를 한 줄에, 좁은 화면은 위아래로 쌓는다 */
          <div className="grid grid-cols-3 max-md:grid-cols-1">
            {data.leagues.map((league) => (
              <LeagueColumn key={league.slug} league={league} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function LeagueColumn({ league }: { league: HomeLeagueTop }) {
  return (
    /* 칸 사이 세로선은 넓은 화면에서만 — 쌓이면 가로선이 맞다 */
    <div className="border-r border-r-divider last:border-r-0 max-md:border-b max-md:border-r-0 max-md:border-b-divider max-md:last:border-b-0">
      <Link
        href={`/league/${league.slug}`}
        className="flex items-baseline border-b border-b-divider px-4 py-2"
      >
        <span className="font-semibold">{league.abbr}</span>
        <span className="ml-2 truncate text-sm text-meta">{league.name}</span>
      </Link>

      {league.rows.length === 0 ? (
        /* 문구를 짧게 둔다 — 세 칸 중 하나만 비는 일이 흔하다 */
        <EmptyState message="아직 기록이 없습니다." />
      ) : (
        <div>
          {league.rows.map((row) => (
            <div
              key={`${league.slug}:${row.player.id}`}
              className="flex items-center border-b border-b-divider px-4 py-3 last:border-b-0"
            >
              <div className="w-5 shrink-0 text-center text-sm text-meta">{row.rank}</div>
              <Link
                className="ml-2 flex min-w-0 flex-1 items-center"
                href={leaguePlayerPath(league.slug, row.player.id)}
              >
                {/* 무소속이어도 자리를 비우지 않는다 — fallback 마크를 그린다 (D-146) */}
                <ClanMark
                  clan={row.clan}
                  size="xs"
                  className="mr-2 shrink-0"
                  alt={row.clan?.name ?? ''}
                />
                <span className="truncate">{row.player.name}</span>
              </Link>
              <div className={`ml-2 shrink-0 text-sm ${ratingClass(row.rating)}`}>
                {formatRating(row.rating)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function LeagueTop3Skeleton() {
  return (
    <div className="grid grid-cols-3 max-md:grid-cols-1">
      {[0, 1, 2].map((column) => (
        <div
          key={column}
          className="border-r border-r-divider last:border-r-0 max-md:border-b max-md:border-r-0 max-md:border-b-divider max-md:last:border-b-0"
        >
          <div className="border-b border-b-divider px-4 py-2">
            <Skeleton className="h-[21px] w-28" />
          </div>
          {[0, 1, 2].map((row) => (
            <div
              key={row}
              className="flex items-center border-b border-b-divider px-4 py-3 last:border-b-0"
            >
              <Skeleton className="h-[21px] w-full" />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
