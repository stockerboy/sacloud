/**
 * ★배지 하나 — 가진 사람 전부★ (2026-09-17 사장님).
 *
 * > «뱃지 클릭하면 해당선수 그 뱃지 가진사람중 몇등이고 누구누구가 이 뱃지 가지고있는지
 * >  선수목록 나오게끔 만들어줘»
 *
 * ⚠ ★못 잰 선수는 목록에 없다★ — 표본이 모자란 사람을 0% 로 줄 세우지 않는다 (D-106).
 *   그래서 「N명 중」의 N 은 ★그 축을 잴 수 있는 사람 수★ 지 리그 인원이 아니다.
 */
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BADGES, BADGE_KEYS, badgeArtPath, type BadgeKey } from '@sacloud/contract'
import { MarkCircle, leagueBadgeListPath, leaguePlayerPath, leagueClanPath } from '@sacloud/ui'

import { badgeOwnersOf } from '@/lib/server/queries/badgeOwners'

export const dynamic = 'force-dynamic'

export default async function BadgePage({
  params,
}: {
  params: Promise<{ leagueSlug: string; badgeKey: string }>
}) {
  const { leagueSlug, badgeKey } = await params
  if (!(BADGE_KEYS as readonly string[]).includes(badgeKey)) notFound()
  const key = badgeKey as BadgeKey
  const badge = BADGES[key]
  const data = await badgeOwnersOf(leagueSlug, key)

  return (
    <main className="section-stack mx-auto w-full max-w-[--layout-max] px-4 py-6">
      <Link
        href={leagueBadgeListPath(leagueSlug)}
        className="text-[0.78rem] text-meta hover:text-text-strong"
      >
        ← 배지 전체
      </Link>

      <header className="flex items-center gap-4 border-b border-line-soft pb-4">
        <img
          src={badgeArtPath(badge)}
          alt={badge.label}
          width={72}
          height={72}
          className="h-[72px] w-[72px] shrink-0 select-none"
        />
        <div className="min-w-0">
          <h1 className="text-[1.4rem] font-black tracking-tight text-text-strong">{badge.label}</h1>
          <p className="mt-1 text-[0.82rem] leading-snug text-meta">{badge.note}</p>
          <p className="mt-1 text-[0.72rem] text-faint">
            {badge.weapons.length === 2 ? '스나 · 라플' : badge.weapons[0] === 1 ? '스나만' : '라플만'}
            {data ? ` · 잰 선수 ${data.total.toLocaleString()}명` : ''}
          </p>
        </div>
      </header>

      {data === null || data.rows.length === 0 ? (
        <p className="py-10 text-center text-[0.86rem] text-faint">
          아직 잴 수 있는 선수가 없다 — 표본이 모자란 값을 0% 로 적지 않는다.
        </p>
      ) : (
        <ul className="divide-y divide-line-soft border-y border-line-soft">
          {data.rows.map((r) => (
            <li
              key={`${r.leaguePlayerId}-${r.weapon}`}
              className="flex items-center gap-3 px-1 py-[0.65rem] text-[0.95rem]"
            >
              <span className="num w-[2.6rem] shrink-0 text-right text-[0.9rem] font-bold text-meta">
                {r.rank}
              </span>
              {/* ★배지가 실제로 달리는 사람★ 은 그림을 같이 보여 준다 */}
              <span className="w-[22px] shrink-0">
                {r.hasBadge ? (
                  <img
                    src={badgeArtPath(badge)}
                    alt=""
                    width={22}
                    height={22}
                    className="h-[22px] w-[22px] select-none"
                  />
                ) : null}
              </span>
              <Link
                href={leaguePlayerPath(leagueSlug, r.playerId)}
                className="flex min-w-0 flex-1 items-center gap-2 hover:text-text-strong"
              >
                {/* ★클랜마크는 이름 앞에 항상★ (`CLAUDE.md`) */}
                <MarkCircle
                  clan={{
                    slug: r.clanSlug,
                    is_official_clan: r.clanSlug !== null,
                    mark: { bg: r.clanMarkBgUrl, front: r.clanMarkFrontUrl },
                  }}
                  size={20}
                  title={r.clanName ?? undefined}
                />
                <span className="truncate font-bold">{r.nickname}</span>
                <span className="shrink-0 text-[0.7rem] text-faint">{r.weapon === 1 ? '[S]' : ''}</span>
              </Link>
              {r.clanSlug ? (
                <Link
                  href={leagueClanPath(leagueSlug, r.clanSlug)}
                  className="hidden w-[9rem] shrink-0 truncate text-[0.8rem] text-meta hover:text-text-strong md:block"
                >
                  {r.clanName}
                </Link>
              ) : (
                <span className="hidden w-[9rem] shrink-0 md:block" />
              )}
              <span className="num w-[4.2rem] shrink-0 text-right font-bold">{r.value.toFixed(1)}%</span>
              <span className="num hidden w-[3.6rem] shrink-0 text-right text-[0.78rem] text-faint md:block">
                {r.games}판
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
