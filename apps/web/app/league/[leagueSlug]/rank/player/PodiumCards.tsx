'use client'

import Link from 'next/link'
import type { PlayerRankHexAxis, PlayerRankRow, RankColumns, RankWeapon } from '@sacloud/contract'
import {
  ClanMark,
  Hexagon,
  type HexAxisView,
  Panel,
  formatAverage,
  formatCount,
  formatRate,
  formatRating,
  formatRatingDelta,
  leagueClanPath,
  leaguePlayerPath,
  rankColor,
  rankColorHexAxis,
  rateClass,
} from '@sacloud/ui'

/**
 * ★★1~3위 포디움 카드★★ (2026-09-07 · Part 10 ⑤ · 시안)
 *
 * ```
 * ┌─────────────────────────────┐  ← 위 2px = ★순위 색★
 * │ [마크]  닉네임        3,800점│
 * │  54px   클랜         LADDER │
 * │ ─────────────────────────── │
 * │  1위   승률 77.3%   킬뎃 50.5%│
 * └─────────────────────────────┘
 * ```
 *
 * ── ★실제 랭킹 줄을 그대로 쓴다★
 *   표에 그리는 것과 ★같은 `PlayerRankRow`★ 다. 따로 조회하지 않고, 값을 새로
 *   계산하지도 않는다 — 표 첫 세 줄을 크게 그린 것뿐이다.
 *
 * ── ★색은 공통 함수가 정한다★
 *   순위·닉네임은 `rankColor()`, 수치는 `rateClass()`.
 *   ★여기서 경계값을 다시 적지 않는다★ (사장님 지시 — 화면마다 복제 금지).
 *
 * ── ★없는 값은 안 그린다★
 *   `10mountain` 은 래더도 킬뎃도 없다 (`leagueScreen`). 그 칸을 `0` 이나 `-` 로
 *   채우지 않고 ★요소 자체를 안 만든다★.
 *
 * ── ★1~3위가 아니면 안 그린다★
 *   무기 탭·다음 페이지에서는 첫 줄이 1위가 아니다. 그때는 포디움이 없다 —
 *   4위를 1등 카드에 올리지 않는다.
 */

/** 시안의 카드 빛 — 세 장이 어긋난 타이밍으로 지나간다 */
const SHEEN: Readonly<Record<number, { color: string; delay: string }>> = {
  1: { color: 'rgba(255,77,77,.16)', delay: '0s' },
  2: { color: 'rgba(255,216,61,.13)', delay: '2.4s' },
  3: { color: 'rgba(91,157,255,.13)', delay: '4.6s' },
}

export interface PodiumCardsProps {
  leagueSlug: string
  rows: readonly PlayerRankRow[]
  columns: RankColumns
  weapon: RankWeapon
}

/* 그림 배율은 CSS 변수 `--podium-hex` 가 정한다 (PC 0.82 · 폰 0.6) — `tokens.css` */

/** 계약의 여섯 축 → 그림 입력. 선수 상세(`strengthAxes`)와 ★같은 규칙★ 이다 */
function podiumAxes(axes: readonly PlayerRankHexAxis[]): HexAxisView[] {
  return axes.map((a) => ({
    label: a.label,
    value: a.percentile,
    note: a.rank === null ? '측정중' : `${a.rank}위`,
    /* ★싸움 3위 · 나머지 5위★ (2026-09-12 사장님). 배지와 같은 경계다 */
    noteColor: a.rank === null ? 'var(--v2-text-ghost)' : rankColorHexAxis(a.rank, a.key === 'duel'),
    note2: a.rank === null || a.total === null ? null : `${a.total.toLocaleString('ko-KR')}명중`,
    strong: a.rank !== null && a.rank <= 10,
  }))
}

export function PodiumCards({ leagueSlug, rows, columns, weapon }: PodiumCardsProps) {
  /*
   * ★순위를 안 쓰는 리그에는 포디움이 없다★ (2026-09-07 실측으로 찾았다).
   *
   * `10mountain`(`sanply`)은 비공식이라 래더도 순위도 없다 (`leagueScreen`).
   * 그런데 API 응답에는 정렬용 `rank` 가 그대로 들어 있어서, 그 값을 크게 찍으면
   * ★순위가 없는 리그에 1위·2위·3위가 생긴다.★ 표에서 감춘 것을 카드로 되살리는 셈이다.
   */
  if (!columns.rank) return null

  /* ★1·2·3위가 다 있을 때만 그린다★ — 반쪽 포디움을 만들지 않는다 */
  const podium = [1, 2, 3].map((rank) => rows.find((row) => row.rank === rank))
  if (podium.some((row) => row === undefined)) return null

  return (
    <div className="mt-[26px] grid grid-cols-3 gap-[14px] max-md:grid-cols-1">
      {podium.map((row) => (
        <PodiumCard
          key={row!.league_player_id}
          leagueSlug={leagueSlug}
          row={row!}
          columns={columns}
          weapon={weapon}
        />
      ))}
    </div>
  )
}

function PodiumCard({
  leagueSlug,
  row,
  columns,
  weapon,
}: {
  leagueSlug: string
  row: PlayerRankRow
  columns: RankColumns
  weapon: RankWeapon
}) {
  const ink = rankColor(row.rank) ?? 'var(--v2-text-strong)'
  const sheen = SHEEN[row.rank]
  const played = row.win + row.lose > 0

  return (
    <Panel
      edge={ink}
      sweep={sheen !== undefined}
      sweepColor={sheen?.color}
      /* ⚠ 2026-09-12 사장님: «카드 모서리 전부 둥글고 세련되게». 시안은 각졌었다 */
      style={{ padding: '20px 20px 18px', borderRadius: 14, overflow: 'hidden' }}
    >
      <div className="relative flex items-start gap-4">
        <Link
          href={leaguePlayerPath(leagueSlug, row.player.id)}
          tabIndex={-1}
          aria-hidden="true"
          /* ⚠ 2026-09-12 사장님: «클랜마크 주변에 사각형 없애줘» (클랜 카드와 같게) */
          className="flex h-[54px] w-[54px] shrink-0 items-center justify-center"
        >
          <ClanMark clan={row.clan} alt={row.clan?.name ?? ''} />
        </Link>

        <span className="flex min-w-0 flex-col gap-[5px] pt-1">
          <Link href={leaguePlayerPath(leagueSlug, row.player.id)} className="min-w-0">
            {/* `a { color: inherit }` — 색은 안쪽 span 에 준다 (D-231) */}
            <span
              className="block truncate text-[19px] font-bold"
              style={{ color: ink }}
              title={row.player.name}
            >
              {row.player.name}
            </span>
          </Link>
          {row.clan ? (
            <Link href={leagueClanPath(leagueSlug, row.clan.slug)} className="min-w-0">
              <span className="block truncate text-[11.5px] text-[var(--v2-text-faint)]">
                {row.clan.name}
              </span>
            </Link>
          ) : (
            /* 계약이 `null` 을 「무소속」으로 정해 뒀다. `-` 로 감추지 않는다 */
            <span className="text-[11.5px] text-[var(--v2-text-ghost)]">무소속</span>
          )}
        </span>

        <span className="flex-1" />

        {/* 래더가 없는 리그(10mountain)에서는 ★이 칸을 안 만든다★ */}
        {columns.rating ? (
          <span className="flex shrink-0 flex-col items-end gap-[2px]">
            <span className="num-strong text-[22px] leading-none text-[var(--v2-text-strong)]">
              {/* ★`점` 을 여기서 붙이지 않는다★ — 두 함수가 이미 붙여서 준다 */}
              {weapon === 'all'
                ? formatRating(row.score ?? row.rating)
                : formatRatingDelta(row.rating_delta ?? 0)}
            </span>
            <span className="text-[10.5px] tracking-[.06em] text-[var(--v2-text-ghost)]">
              {/* ★실력 점수★ (2026-09-10 · 사장님 확정) — 점수가 오면 SCORE, 아니면 옛 래더 */}
              {weapon === 'all' && row.score !== null && row.score !== undefined ? 'SCORE' : 'LADDER'}
            </span>
          </span>
        ) : null}
      </div>

      {/*
        ★1·2·3위 플레이스타일★ (2026-09-12 사장님: «저 사이에 1,2,3등 선수들의
        플레이스타일 분석 그래프를 보여줘 여기도 그래프 그려지는 애니메이트 똑같이 적용»).

        그림은 선수 상세와 ★같은 컴포넌트★ 다 — 그리는 애니메이션도 그래서 같다.
        `id` 가 카드마다 달라야 셋이 따로 그려진다.
        못 잰 선수(주무기 10판 미만)는 축이 안 와서 ★그림 자리를 통째로 비운다★ —
        빈 육각형을 그리지 않는다 (D-106).
      */}
      {/*
        ★폰에서는 그림이 오른쪽 · 숫자가 왼쪽★ (2026-09-12 사장님:
        «공간이 너무 많이 비어서 모바일 기준 효율이 너무 떨어져 그래프를 오른쪽끝에
        밀어넣고 밑에 숫자정보를 오른쪽에 띄워서 카드세로크기를 좀 줄여»).

        옛 판은 그림 아래에 숫자 줄이 가로로 붙어 카드가 세로로 길었다.
        900px 미만에서는 두 칸으로 눕히고 그림도 한 단 줄인다 — 자리는 CSS 가 정한다.
      */}
      <div className="v3-podium-body relative">
        {row.hex_axes && row.hex_axes.length > 0 ? (
          <div className="v3-podium-hex">
            <span className="v3-podium-hex__box">
              <span className="v3-podium-hex__inner">
                <Hexagon axes={podiumAxes(row.hex_axes)} id={`podiumHex-${row.league_player_id}`} />
              </span>
            </span>
          </div>
        ) : null}

        <div className="v3-podium-stats relative flex items-baseline gap-[22px] border-t border-[var(--v2-card-divider)] pt-[14px]">
        <span className="flex items-baseline gap-[2px]" style={{ color: ink }}>
          <span className="num-strong text-[34px] leading-none tracking-[-.02em]">
            {row.rank}
          </span>
          <span className="text-[15px] font-bold">위</span>
        </span>

        {columns.winRate ? (
          <StatBlock
            cap="승률"
            /* 한 판도 안 뛰었으면 승률을 지어내지 않는다 (O-033 과 같은 규칙) */
            value={played ? `${formatRate(row.win_rate)}%` : null}
            tone={played ? rateClass(row.win_rate) : ''}
            sub={played ? `${formatCount(row.win)}승 ${formatCount(row.lose)}패` : null}
          />
        ) : null}

        {/* 무소속리그는 누적 킬뎃을 공개하지 않는다 — `null` 이면 칸을 안 만든다 (D-107) */}
        {columns.kd && row.kd_rate !== null ? (
          <StatBlock
            cap="킬뎃"
            value={`${formatRate(row.kd_rate)}%`}
            tone={rateClass(row.kd_rate)}
            sub={`${formatAverage(row.kill_per_match)}킬`}
          />
        ) : null}
        </div>
      </div>
    </Panel>
  )
}

/**
 * ★값 밑에 세부정보를 가로로★ (2026-09-12 사장님:
 * «퍼센 옆에 세부정보 밑에 가로로 깔아줘»).
 *
 * 옛 판은 «58.1 % · 36승 26패» 를 ★한 줄에★ 붙였다. 폰에서 칸이 좁아
 * «36승 / 26패» 가 세로로 접혀 줄이 어긋났다. 이제 값은 값끼리, 잔글씨는 그 밑에 한 줄로.
 */
function StatBlock({
  cap,
  value,
  tone,
  sub,
}: {
  cap: string
  value: string | null
  tone: string
  sub: string | null
}) {
  return (
    <span className="flex min-w-0 flex-col gap-[2px]">
      <span className="text-[10.5px] tracking-[.06em] text-[var(--v2-text-ghost)]">{cap}</span>
      {value === null ? (
        /* ★기록이 없으면 숫자를 만들지 않는다★ */
        <span className="text-[13px] text-[var(--v2-text-ghost)]">기록 없음</span>
      ) : (
        <>
          <span className={`num-strong text-[20px] leading-none ${tone}`}>{value}</span>
          {sub ? (
            <span className="whitespace-nowrap text-[10.5px] leading-none text-[var(--v2-text-ghost)]">
              {sub}
            </span>
          ) : null}
        </>
      )}
    </span>
  )
}
