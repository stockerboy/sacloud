'use client'

/**
 * ★부문별 1위 판★ — 홈 검색창 밑 (2026-09-12 사장님)
 *
 * > «로고가 빠진 사이 공간에 스나싸움1위 / 세이브1위 / 소수싸움1위 / 샷싸움1위 (…)
 * >  개인 6각 특성 스나수까지 총 7개부문 1위 (마크) 닉네임 성공률 퍼센티지
 * >  (…) 스나수면 스코프 표시 / 닉네임 클릭하면 바로 갈 수 있게끔»
 *
 * ⚠ ★2026-09-12 두 번째 판 — 얇은 줄★ (사장님: «너무 크고 두껍잖아 얇게 배열해줘야지
 *   이쁘게 개오바 너무 커»). 옛 판은 테두리 있는 카드 일곱 장이었다 —
 *   폰에서 화면 한 판을 다 먹었다. 이제 ★한 줄에 한 부문★ 이고 테두리 대신 가는 선이다.
 *
 * ── 왜 일곱인가
 *   여섯 축인데 ★싸움만 무기별로 둘★ 이다 — 스나싸움(스나수 안)과 샷싸움(라플수 안).
 *   잣대가 아예 달라 한 줄로 묶을 수 없다 (`playerHexScore` 의 모집단 주석).
 *
 * ── [가정] 어느 리그인가
 *   IPL 이다. 축 등수는 ★리그 안에서만★ 매겨진다 — 리그를 섞은 «1위» 는 없는 값이다.
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
    <section aria-label="부문별 1위" className="mt-6">
      <div className="mx-auto w-full max-w-[760px]">
        <div className="mb-[6px] flex items-baseline gap-[7px] px-[2px]">
          <span className="text-[10px] font-bold tracking-[.16em] text-[var(--v2-text-ghost)]">
            부문별 1위
          </span>
          <span className="text-[10px] text-[var(--v2-text-ghost)]">IPL · 시즌 Cloud 0</span>
        </div>

        {/* PC 는 두 줄로 접어 담는다 — 일곱 줄이 세로로 늘어지지 않게 */}
        <ul className="grid grid-cols-2 gap-x-[26px] max-md:grid-cols-1">
          {rows.map((row) => (
            <li
              key={row.key + (row.weapon ?? '')}
              className="grid min-w-0 grid-cols-[64px_18px_minmax(0,1fr)_auto] items-center gap-[7px] border-b border-[var(--v2-row-divider)] py-[7px] max-md:grid-cols-[58px_16px_minmax(0,1fr)_auto]"
            >
              <span className="flex items-center gap-[3px] truncate text-[10.5px] font-bold text-[var(--v2-text-faint)]">
                {row.label}
                {/* ★스나수면 스코프★ (2026-09-12 사장님) */}
                {row.weapon === 1 ? <SniperMark size={10} /> : null}
              </span>

              {row.clan ? (
                <Link
                  href={leagueClanPath(HOME_TOP_LEAGUE, row.clan.slug)}
                  aria-label={row.clan.name}
                  className="flex h-[18px] w-[18px] items-center justify-center"
                >
                  <ClanMark clan={row.clan} alt={row.clan.name} />
                </Link>
              ) : (
                <span aria-hidden />
              )}

              {/* 닉네임을 누르면 그 선수로 간다. `a { color: inherit }` 이라 색은 안쪽 span 에 (D-231) */}
              <Link href={leaguePlayerPath(HOME_TOP_LEAGUE, row.player.id)} className="min-w-0">
                <span className="block truncate text-[12px] font-bold text-[var(--v2-text-strong)]">
                  {row.player.name}
                </span>
              </Link>

              <span className="flex items-baseline gap-[2px] whitespace-nowrap">
                <span className="num text-[12px] font-semibold text-[#8ff0ff]">
                  {row.unit === 'percent' ? `${row.value.toFixed(1)}%` : row.value.toFixed(2)}
                </span>
                {row.unit === 'per_game' ? (
                  <span className="text-[9.5px] text-[var(--v2-text-ghost)]">킬/판</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
