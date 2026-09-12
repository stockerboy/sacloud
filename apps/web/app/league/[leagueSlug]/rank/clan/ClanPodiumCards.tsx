'use client'

/**
 * ★클랜랭킹 1·2·3위 카드★ (2026-09-12 사장님)
 *
 * > «클랜도 탑3는 플레이스타일 6각형이랑 승률 같은거 개인랭킹페이지 처럼 보여줘»
 *
 * 개인랭킹 포디움(`PodiumCards`)과 ★같은 짜임★ 이다 — 이름·래더가 윗줄,
 * 아래에 순위·승률과 여섯 축 그림. 폰에서는 그림이 오른쪽으로 눕는다 (같은 CSS 를 쓴다).
 *
 * ── 그림은 어디서 오나
 *   이 화면은 클랜을 한 번에 다 받아 ★브라우저에서★ 줄을 세운다. 그래서 1·2·3위가
 *   누구인지는 여기서만 안다. 정해진 뒤 그 셋의 상세(`leagueClanShow`)만 더 받는다 —
 *   상세에 이미 육각형이 실려 있어 새 길목을 파지 않았다.
 *
 * ── 없으면 안 그린다
 *   배틀로그가 아직 없는 클랜은 그림 자리를 비운다. 셋이 다 차지 않으면 카드도 안 낸다 —
 *   반쪽 포디움을 만들지 않는다 (개인랭킹과 같은 규칙).
 */
import Link from 'next/link'
import { useQueries } from '@tanstack/react-query'
import {
  ClanMark,
  Hexagon,
  Panel,
  clanHexAxes,
  formatRate,
  formatRating,
  leagueClanPath,
  rankColor,
  rateClass,
} from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { useApiReady } from '@/app/providers'

export interface ClanPodiumRow {
  rank: number | null
  leagueClanId: string
  clan: { id: string; slug: string; name: string; mark: { bg: string | null; front: string | null } }
  win: number
  lose: number
  winRate: number | null
  rating: number
}

/** 개인랭킹 포디움과 같은 색 (1·2·3위 띠) */
const SHEEN: Readonly<Record<number, string>> = {
  1: 'rgba(255,216,61,.16)',
  2: 'rgba(200,214,255,.14)',
  3: 'rgba(201,163,91,.14)',
}

export function ClanPodiumCards({ leagueSlug, rows }: { leagueSlug: string; rows: readonly ClanPodiumRow[] }) {
  const ready = useApiReady()
  const top = rows.slice(0, 3)

  /* 셋의 상세만 더 받는다 — 목록은 이미 손에 있다 */
  const details = useQueries({
    queries: top.map((row) => ({
      queryKey: ['clan', leagueSlug, row.clan.slug, 'show'],
      enabled: ready,
      queryFn: () => apiGet('leagueClanShow', { params: { leagueSlug, clanSlug: row.clan.slug } }),
    })),
  })

  /* ★1·2·3위가 다 있을 때만★ — 반쪽 포디움을 만들지 않는다 */
  if (top.length < 3) return null

  return (
    <div className="mt-[26px] grid grid-cols-3 gap-[14px] max-md:grid-cols-1">
      {top.map((row, index) => {
        const ink = row.rank === null ? 'var(--v2-text-strong)' : (rankColor(row.rank) ?? 'var(--v2-text-strong)')
        const hex = details[index]?.data?.data.hexagon_v2 ?? null
        const played = row.win + row.lose > 0
        return (
          <Panel
            key={row.leagueClanId}
            edge={ink}
            sweep
            sweepColor={SHEEN[row.rank ?? 0]}
            style={{ padding: '20px 20px 18px' }}
          >
            <div className="relative flex items-start gap-4">
              <Link
                href={leagueClanPath(leagueSlug, row.clan.slug)}
                tabIndex={-1}
                aria-hidden="true"
                className="flex h-[54px] w-[54px] shrink-0 items-center justify-center border border-[var(--v2-emblem-border)]"
              >
                <ClanMark clan={row.clan} alt={row.clan.name} />
              </Link>

              <span className="flex min-w-0 flex-col gap-[5px] pt-1">
                <Link href={leagueClanPath(leagueSlug, row.clan.slug)} className="min-w-0">
                  {/* `a { color: inherit }` — 색은 안쪽 span 에 (D-231) */}
                  <span className="block truncate text-[19px] font-bold" style={{ color: ink }} title={row.clan.name}>
                    {row.clan.name}
                  </span>
                </Link>
                <span className="text-[11.5px] text-[var(--v2-text-faint)]">
                  {row.win}승 {row.lose}패
                </span>
              </span>

              <span className="flex-1" />

              <span className="flex shrink-0 flex-col items-end gap-[2px]">
                <span className="num text-[22px] font-extralight leading-none text-[var(--v2-text-strong)]">
                  {formatRating(row.rating)}
                </span>
                <span className="text-[10.5px] tracking-[.06em] text-[var(--v2-text-ghost)]">LADDER</span>
              </span>
            </div>

            <div className="v3-podium-body relative">
              {hex ? (
                <div className="v3-podium-hex">
                  <span className="v3-podium-hex__box">
                    <span className="v3-podium-hex__inner">
                      <Hexagon axes={clanHexAxes(hex)} id={`clanPodiumHex-${row.leagueClanId}`} />
                    </span>
                  </span>
                </div>
              ) : null}

              <div className="v3-podium-stats relative flex items-baseline gap-[22px] border-t border-[var(--v2-card-divider)] pt-[14px]">
                <span className="flex items-baseline gap-[2px]" style={{ color: ink }}>
                  <span className="num text-[34px] font-black leading-none tracking-[-.02em]">
                    {row.rank ?? '-'}
                  </span>
                  <span className="text-[15px] font-bold">위</span>
                </span>

                <span className="flex flex-col gap-[3px]">
                  <span className="text-[10.5px] tracking-[.06em] text-[var(--v2-text-ghost)]">승률</span>
                  <span className="flex items-baseline gap-[3px]">
                    {played && row.winRate !== null ? (
                      <>
                        <span className={`num text-[20px] font-extralight ${rateClass(row.winRate)}`}>
                          {formatRate(row.winRate)}
                        </span>
                        <span className="text-[10.5px] text-[var(--v2-text-ghost)]">%</span>
                      </>
                    ) : (
                      /* ★기록이 없으면 숫자를 만들지 않는다★ */
                      <span className="text-[13px] text-[var(--v2-text-ghost)]">기록 없음</span>
                    )}
                  </span>
                </span>
              </div>
            </div>
          </Panel>
        )
      })}
    </div>
  )
}
