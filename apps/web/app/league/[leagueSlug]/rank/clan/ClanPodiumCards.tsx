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
import type { CSSProperties } from 'react'
import Link from 'next/link'
import { useQueries } from '@tanstack/react-query'
import {
  ClanMark,
  Hexagon,
  Panel,
  clanHexAxes,
  clanStyleNote,
  divisionLabel,
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

/**
 * ★테두리 카드★ (2026-09-13 사장님: «테두리카드 만들어줘 너무 밋밋해»).
 *
 * 반투명으로 바꾼 뒤 카드 가장자리가 사라져 «벽에 칠한 것» 처럼 보였다.
 * 토큰만 고쳐서는 부족해서 이 카드에는 ★등수 색 테두리★ 를 직접 준다 —
 * 1위 금색 · 2위 은색 · 3위 동색 띠가 카드를 감싼다.
 *
 *   ① 등수 색 1px 테두리 + 같은 색 바깥 번짐 (네온)
 *   ② 안쪽 윗선 1px — 유리에 두께를 준다
 *   ③ 짙은 그림자 — 바탕에서 떠오른다
 */
function podiumCardStyle(ink: string): CSSProperties {
  return {
    padding: '20px 20px 18px',
    borderRadius: 16,
    overflow: 'hidden',
    border: `1px solid ${ink}66`,
    background: 'linear-gradient(160deg, rgba(46,66,110,.55) 0%, rgba(26,40,70,.55) 100%)',
    boxShadow: `inset 0 1px 0 rgba(255,255,255,.09), 0 12px 30px rgba(0,0,0,.42), 0 0 26px ${ink}26`,
  }
}

/** 카드 한 칸 — 값이 없으면 「기록 없음」이라고 적는다 (숫자를 지어내지 않는다) */
function ClanStat({ cap, value, unit, tone, sub }: { cap: string; value: string | null; unit: string; tone: string; sub: string | null }) {
  return (
    <span className="flex flex-col gap-[3px]">
      <span className="text-[10.5px] tracking-[.06em] text-[var(--v2-text-ghost)]">{cap}</span>
      <span className="flex min-w-0 flex-col gap-[2px]">
        {value === null ? (
          <span className="text-[13px] text-[var(--v2-text-ghost)]">기록 없음</span>
        ) : (
          <>
            <span className={`num-strong text-[20px] leading-none ${tone}`}>
              {value}
              <span className="text-[11px]">{unit}</span>
            </span>
            {sub ? (
              <span className="whitespace-nowrap text-[10.5px] leading-none text-[var(--v2-text-ghost)]">
                {sub}
              </span>
            ) : null}
          </>
        )}
      </span>
    </span>
  )
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
        const detail = details[index]?.data?.data ?? null
        const hex = detail?.hexagon_v2 ?? null
        /* 클랜원 수는 상세 응답에 없다 — 지어내지 않고 구간(티어)을 대신 적는다 */
        const division = detail?.division ?? null
        /* 클랜평의 유형 한 마디만 빌려 온다 — 카드에 긴 글을 넣지 않는다 */
        const styleNote = clanStyleNote(hex)?.type ?? null
        const played = row.win + row.lose > 0
        return (
          <Panel
            key={row.leagueClanId}
            edge={ink}
            sweep
            sweepColor={SHEEN[row.rank ?? 0]}
            style={podiumCardStyle(ink)}
          >
            <div className="relative flex items-start gap-4">
              <Link
                href={leagueClanPath(leagueSlug, row.clan.slug)}
                tabIndex={-1}
                aria-hidden="true"
                /* ⚠ 2026-09-12 사장님: «클랜마크 주변에 사각형 없애줘». 옛 판은 1px 네모였다 */
                className="flex h-[54px] w-[54px] shrink-0 items-center justify-center"
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
                <span className="num-strong text-[22px] leading-none text-[var(--v2-text-strong)]">
                  {formatRating(row.rating)}
                </span>
                <span className="text-[10.5px] tracking-[.06em] text-[var(--v2-text-ghost)]">LADDER</span>
              </span>
            </div>

            {/* ★클랜 카드는 폰에서 한 장이 한 줄을 다 쓴다★ — 그림을 크게 놓을 자리가 있다.
                개인랭킹은 세 장이 나뉘어 좁아서 눕혔다 (`is-wide` 가 그 차이다) */}
            <div className="v3-podium-body v3-podium-body--wide relative">
              {hex ? (
                <div className="v3-podium-hex">
                  <span className="v3-podium-hex__box">
                    <span className="v3-podium-hex__inner">
                      <Hexagon axes={clanHexAxes(hex)} id={`clanPodiumHex-${row.leagueClanId}`} />
                    </span>
                  </span>
                </div>
              ) : null}

              <div className="v3-podium-stats relative flex flex-wrap items-baseline gap-x-[20px] gap-y-[10px] border-t border-[var(--v2-card-divider)] pt-[14px]">
                <span className="flex items-baseline gap-[2px]" style={{ color: ink }}>
                  <span className="num-strong text-[34px] leading-none tracking-[-.02em]">
                    {row.rank ?? '-'}
                  </span>
                  <span className="text-[15px] font-bold">위</span>
                </span>

                <ClanStat
                  cap="승률"
                  value={played && row.winRate !== null ? formatRate(row.winRate) : null}
                  unit="%"
                  tone={played && row.winRate !== null ? rateClass(row.winRate) : ''}
                  sub={played ? `${row.win}승 ${row.lose}패` : null}
                />

                {/* ★숫자를 더★ (2026-09-12 사장님). 값은 이미 받아 둔 클랜 상세에서 온다 */}
                <ClanStat
                  cap="최다연승"
                  value={detail?.max_win_streak === null || detail?.max_win_streak === undefined ? null : String(detail.max_win_streak)}
                  unit="연승"
                  tone=""
                  sub={detail ? `${detail.win + detail.lose}전` : null}
                />

                <ClanStat
                  cap="구간"
                  value={division === null ? null : divisionLabel(division, detail?.league.category)}
                  unit=""
                  tone=""
                  sub={styleNote}
                />
              </div>
            </div>
          </Panel>
        )
      })}
    </div>
  )
}
