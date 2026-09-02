import Link from 'next/link'
import type { LeagueListItem } from '@sacloud/contract'
import {
  isLeagueListed,
  isOfficialLeague,
  leagueLandingPath,
  LEAGUE_HOME_DOORS_OPEN,
} from '@sacloud/contract'
import { ClanMark } from '../common/ClanMark'
import { Label } from '../common/Label'
import { EmptyState } from '../common/EmptyState'
import { ErrorState } from '../common/ErrorState'
import { Skeleton } from '../common/Skeleton'
import { formatCount, formatDate } from '../common/format'
import { HEAD, NUM, ROW } from './rankStyles'

/**
 * 리그 목록 표 (`/leagues`).
 *
 * `적진` 톤 — 얼룩무늬·그림자 없이 1px 선으로만 나눈다. 랭킹 표와 **같은 행 토큰**을 쓴다
 * (`rankStyles.ts`) — 한 사이트에 두 가지 표 리듬을 만들지 않는다.
 *
 * 칸 구성은 그대로다: `리그명 · 참여 클랜 수 · 관리자 · 개설일`.
 * 좁은 화면에서는 관리자·개설일을 감춘다 (랭킹 표와 같은 규칙 — 가로로 밀어 보게 하지 않는다).
 * **이동 경로(href)는 바뀌지 않았다.**
 */
export function LeagueListTable({
  items,
  loading,
  error,
  onRetry,
}: {
  items?: readonly LeagueListItem[]
  loading?: boolean
  error?: boolean
  onRetry?: () => void
}) {
  /* 닫힌 리그(대룰리그 · 지시 #22)는 목록에서 뺀다. 데이터는 그대로다 — 화면에서만 거른다 */
  const listed = items?.filter((league) => isLeagueListed(league.slug))
  return (
    <div className="mt-6 rounded-[var(--radius)] border border-line">
      <div className={HEAD}>
        <div className="min-w-0 flex-1">리그명</div>
        <div className="w-40 shrink-0 text-right max-md:hidden">참여 클랜</div>
        <div className="w-48 shrink-0 text-right max-md:hidden">관리자</div>
        <div className="w-40 shrink-0 text-right max-md:hidden">개설일</div>
      </div>

      {error ? (
        <ErrorState message="리그 목록을 불러오지 못했습니다." onRetry={onRetry} />
      ) : loading ? (
        <>
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className={ROW}>
              <Skeleton className="h-[22px] w-64" />
            </div>
          ))}
        </>
      ) : !listed || listed.length === 0 ? (
        <EmptyState message="리그가 없습니다." />
      ) : (
        listed.map((league) => (
          <Link
            key={league.id}
            /* ★2026-09-03 (O-024) — 리그홈 대신 그 리그의 첫 화면으로★
               `/home/info` 는 2026-09-01 지시(D-245)로 이미 랭킹으로 리다이렉트된다.
               **누르면 딴 데로 튕기는 링크**를 남겨 둘 이유가 없다.
               `LEAGUE_HOME_DOORS_OPEN` 을 `true` 로 되돌리면 옛 주소로 돌아간다 */
            href={
              LEAGUE_HOME_DOORS_OPEN
                ? `/league/${league.slug}/home/info`
                : leagueLandingPath(league.slug)
            }
            className={`${ROW} hover:text-text-strong`}
          >
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span className="truncate font-semibold text-text-strong">{league.name}</span>
              {/* 표기는 계약의 표가 정한다 (#17). **항상** 그린다 — 공식이면 「공식」, 아니면 「비공식」 (#17-2).
                  옛 줄(공식일 때만): `league.official ? <Label name="공식" /> : null` */}
              <Label name={isOfficialLeague(league.slug) ? '공식' : '비공식'} />
              <span className="flex items-center gap-1 max-md:hidden">
                {league.clans.map((clan) => (
                  <ClanMark key={clan.id} mark={clan.mark} alt={clan.name} />
                ))}
              </span>
            </div>
            <div className="w-40 shrink-0 text-right text-sm text-meta max-md:hidden">
              <span className={NUM}>{formatCount(league.clan_count)}</span>개 참여중
            </div>
            <div className="w-48 shrink-0 truncate text-right text-sm text-meta max-md:hidden">
              {league.user?.nickname ?? '-'}
            </div>
            <div className={`w-40 shrink-0 text-right text-xs ${NUM} text-faint max-md:hidden`}>
              {formatDate(league.created_at)}
            </div>
          </Link>
        ))
      )}
    </div>
  )
}
