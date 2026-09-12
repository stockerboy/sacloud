'use client'

/**
 * ★부문별 1위 판★ — 홈 검색창 밑 (2026-09-12 사장님)
 *
 * > «로고가 빠진 사이 공간에 스나싸움1위 / 세이브1위 / 소수싸움1위 / 샷싸움1위 (…)
 * >  개인 6각 특성 스나수까지 총 7개부문 1위 (마크) 닉네임 성공률 퍼센티지
 * >  ex 스나싸움 성공률 60퍼센트 (…) 스나수면 스코프 표시
 * >  그리고 닉네임 클릭하면 바로 갈 수 있게끔»
 *
 * ── 왜 일곱인가
 *   여섯 축인데 ★싸움만 무기별로 둘★ 이다 — 스나싸움(스나수 안)과 샷싸움(라플수 안).
 *   잣대가 아예 달라 한 줄로 묶을 수 없다 (`playerHexScore` 의 모집단 주석).
 *
 * ── [가정] 어느 리그인가
 *   IPL 이다. 축 등수는 ★리그 안에서만★ 매겨진다 — 리그를 섞은 «1위» 는 없는 값이다.
 *   세 리그 중 사람이 가장 많은 곳을 골랐다. 사장님이 다른 리그를 원하시면 한 줄이다.
 */
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ClanMark, SniperMark, leagueClanPath, leaguePlayerPath } from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { useApiReady } from '@/app/providers'

/** [가정] 홈이 보여 주는 리그 — 사람이 가장 많은 IPL */
const HOME_TOP_LEAGUE = 'nolink'

export function HomeTopPlayers() {
  const ready = useApiReady()
  const q = useQuery({
    queryKey: ['home', 'topAxes', HOME_TOP_LEAGUE],
    enabled: ready,
    queryFn: () => apiGet('leagueTopAxes', { params: { leagueId: HOME_TOP_LEAGUE } }),
  })
  const rows = q.data?.data ?? []
  /* 아직 못 받았거나 한 줄도 없으면 ★자리를 안 만든다★ — 빈 상자를 남기지 않는다 */
  if (rows.length === 0) return null

  return (
    <section aria-label="부문별 1위" className="mt-7">
      <div className="mx-auto grid w-full max-w-[980px] grid-cols-4 gap-[10px] max-lg:grid-cols-3 max-md:grid-cols-2">
        {rows.map((row) => (
          <div
            key={row.key + (row.weapon ?? '')}
            className="flex min-w-0 flex-col gap-[7px] border border-[var(--v2-card-border)] bg-[var(--v2-card)] px-[13px] py-[11px]"
            style={{ borderRadius: 8 }}
          >
            <span className="flex items-center gap-[5px]">
              <span className="truncate text-[11px] font-bold tracking-[.06em] text-[var(--v2-text-muted)]">
                {row.label}
              </span>
              {/* ★스나수면 스코프★ (2026-09-12 사장님) */}
              {row.weapon === 1 ? <SniperMark size={12} /> : null}
              <span className="ml-auto text-[10px] font-bold text-[#ffd83d]">1위</span>
            </span>

            <span className="flex min-w-0 items-center gap-[7px]">
              {row.clan ? (
                <Link
                  href={leagueClanPath(HOME_TOP_LEAGUE, row.clan.slug)}
                  aria-label={row.clan.name}
                  className="flex h-[22px] w-[22px] shrink-0 items-center justify-center"
                >
                  <ClanMark clan={row.clan} alt={row.clan.name} />
                </Link>
              ) : (
                <span aria-hidden className="h-[22px] w-[22px] shrink-0" />
              )}
              {/* 닉네임을 누르면 그 선수로 간다 (2026-09-12 사장님) */}
              <Link href={leaguePlayerPath(HOME_TOP_LEAGUE, row.player.id)} className="min-w-0">
                {/* `a { color: inherit }` — 색은 안쪽 span 에 (D-231) */}
                <span className="block truncate text-[13px] font-bold text-[var(--v2-text-strong)]">
                  {row.player.name}
                </span>
              </Link>
            </span>

            <span className="flex items-baseline gap-[3px]">
              <span className="num text-[17px] font-extralight text-[#8ff0ff]">
                {row.unit === 'percent' ? row.value.toFixed(1) : row.value.toFixed(2)}
              </span>
              <span className="text-[10.5px] text-[var(--v2-text-ghost)]">
                {row.unit === 'percent' ? '%' : '킬 / 판'}
              </span>
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}
