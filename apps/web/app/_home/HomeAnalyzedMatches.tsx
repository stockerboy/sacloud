'use client'

/**
 * ★홈 · 경기분석까지 끝난 최근 경기 셋★ (2026-09-12 사장님)
 *
 * > «가장최근 끝난 IPL SPL 경기 (경기분석까지 마친) 3개보여주자 눌러서 상세보기 볼 수 있게»
 *
 * ⚠ 이 자리에는 아까 「부문별 1위」가 있었다 (같은 날). 사장님이 바꾸셨다 —
 *   `HomeTopPlayers.tsx` 는 지우지 않았다 (`CLAUDE.md` 1-4).
 *
 * 「경기분석까지 마친」 = 그 판 육각형을 양 팀 다 접었다는 뜻이다. 판정은 서버가 한다.
 * 줄을 누르면 그 경기 상세로 간다.
 */
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ClanMark, leagueMatchPath, relativeKst } from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { useApiReady } from '@/app/providers'

const LEAGUE_LABEL: Readonly<Record<string, string>> = { nolink: 'IPL', supply: 'SPL' }

export function HomeAnalyzedMatches() {
  const ready = useApiReady()
  const q = useQuery({
    queryKey: ['home', 'analyzedMatches'],
    enabled: ready,
    queryFn: () => apiGet('homeAnalyzedMatches'),
  })
  const rows = q.data?.data ?? []
  /* 아직 못 받았거나 한 줄도 없으면 ★자리를 안 만든다★ — 빈 상자를 남기지 않는다 */
  if (rows.length === 0) return null

  return (
    <section aria-label="최근 분석 완료 경기" className="mt-6">
      <div className="mx-auto w-full max-w-[760px]">
        <div className="mb-[6px] flex items-baseline gap-[7px] px-[2px]">
          <span className="text-[10px] font-bold tracking-[.16em] text-[var(--v2-text-ghost)]">
            최근 경기
          </span>
          <span className="text-[10px] text-[var(--v2-text-ghost)]">경기분석 완료</span>
        </div>

        <ul className="flex flex-col">
          {rows.map((row) => (
            <li key={row.match_id}>
              <Link
                href={leagueMatchPath(row.league_slug, row.match_id)}
                className="grid min-w-0 grid-cols-[30px_minmax(0,1fr)_auto] items-center gap-[8px] border-b border-[var(--v2-row-divider)] py-[9px]"
              >
                <span className="text-[9.5px] font-bold tracking-[.06em] text-[var(--v2-text-ghost)]">
                  {LEAGUE_LABEL[row.league_slug] ?? ''}
                </span>

                <span className="flex min-w-0 items-center gap-[6px]">
                  <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center">
                    <ClanMark clan={row.won_clan} alt={row.won_clan.name} />
                  </span>
                  <span className="truncate text-[12px] font-bold text-[#9cc0ff]">
                    {row.won_clan.name}
                  </span>
                  <span className="shrink-0 text-[9.5px] text-[var(--v2-text-ghost)]">vs</span>
                  <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center">
                    <ClanMark clan={row.lost_clan} alt={row.lost_clan.name} />
                  </span>
                  <span className="truncate text-[12px] font-bold text-[#ff9aa0]">
                    {row.lost_clan.name}
                  </span>
                </span>

                <span className="flex items-baseline gap-[7px] whitespace-nowrap">
                  {row.map_name ? (
                    <span className="text-[10.5px] text-[var(--v2-text-faint)] max-md:hidden">
                      {row.map_name}
                    </span>
                  ) : null}
                  <span className="text-[10px] text-[var(--v2-text-ghost)]">
                    {relativeKst(row.start_at)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
