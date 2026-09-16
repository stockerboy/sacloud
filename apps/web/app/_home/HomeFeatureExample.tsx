'use client'

import { useQuery } from '@tanstack/react-query'
import { MarkCircle } from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { useApiReady } from '@/app/providers'

/**
 * ★기능 줄을 눌렀을 때 그 자리에서 펼쳐지는 예시★ (2026-09-16 사장님).
 *
 * > «그냥 보기 누르면 ★다른페이지로 넘어가지말고 그자리에서 밑으로 펼쳐서★
 * >  예시를 ★하나씩만★ 보여줘»
 *
 * ── 왜 «보기 →» 를 없앴나
 *   첫 화면에서 «이 사이트가 뭘 해 주나» 를 보려던 사람을 다른 화면으로 보내면
 *   ★돌아오지 않는다.★ 여덟 가지를 다 보려면 여덟 번 나갔다 들어와야 했다.
 *
 * ── ★지어내지 않는다★ (`CLAUDE.md` 2-1)
 *   예시는 ★운영 자료 그대로★ 다. 견본 숫자를 그리지 않는다 —
 *   «예시» 라고 적힌 가짜 순위표는 사이트 전체의 숫자를 의심하게 만든다.
 *   자료가 아직 없으면 «아직 쌓인 기록이 없습니다» 라고 적는다.
 *
 * ── ★펼칠 때만 부른다★
 *   여덟 줄 × 세 리그 = 스물넷을 미리 받으면 첫 화면이 무거워진다.
 *   이 조각은 ★펼쳐질 때 처음 그려진다★ — 안 누르면 질의가 하나도 안 나간다.
 *
 * ── 어느 질의가 어느 예시를 먹이나
 * ```
 *   개인랭킹   킬뎃 그래프 · 기록 카드 · 개인 랭킹
 *   클랜랭킹   클랜 랭킹 · 래더 점수
 *   경기목록   경기 분석
 *   육각 1위   플레이어 분석 · 클랜 분석
 * ```
 */

/** 그 기능이 어느 질의를 쓰나 */
type Source = 'players' | 'clans' | 'matches' | 'hex'

const SOURCE: Readonly<Record<string, Source>> = {
  match: 'matches',
  kdGraph: 'players',
  recordCard: 'players',
  playerHex: 'hex',
  clanHex: 'hex',
  playerRank: 'players',
  clanRank: 'clans',
  ladder: 'clans',
}

const box: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.028)',
  border: '1px solid var(--v2-head-divider, #1e2637)',
}

/** 작은 이름표 — «예시» 라고 분명히 적는다. 실제 자료지만 ★한 줄만★ 보여 주기 때문이다 */
function Cap({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-[8px] text-[10.5px] tracking-[.12em] text-[var(--v2-text-ghost)]">
      {children}
    </div>
  )
}

function Empty({ what }: { what: string }) {
  return <div className="text-[12px] text-[var(--v2-text-ghost)]">아직 {what}이 없습니다</div>
}

function Loading() {
  return <div className="text-[12px] text-[var(--v2-text-ghost)]">불러오는 중…</div>
}

/** 승률·킬뎃 같은 비율 한 칸 */
function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex flex-col gap-[2px]">
      <span className="text-[10.5px] text-[var(--v2-text-ghost)]">{label}</span>
      <span className="num text-[15px] font-bold" style={{ color: tone ?? 'var(--v2-text-strong)' }}>
        {value}
      </span>
    </div>
  )
}

const pct = (n: number | null | undefined): string =>
  typeof n === 'number' ? `${n.toFixed(1)}%` : '알수없음'

export function HomeFeatureExample({
  leagueSlug,
  featureKey,
  tone,
}: {
  leagueSlug: string
  featureKey: string
  tone: string
}) {
  const ready = useApiReady()
  const source = SOURCE[featureKey] ?? 'players'

  const players = useQuery({
    queryKey: ['home-ex-players', leagueSlug],
    queryFn: () =>
      apiGet('leagueRankPlayers', {
        params: { leagueId: leagueSlug },
        search: { weapon: 'all', page: 1 },
      }),
    enabled: ready && source === 'players',
    staleTime: 10 * 60 * 1000,
  })

  const clans = useQuery({
    queryKey: ['home-ex-clans', leagueSlug],
    queryFn: () => apiGet('leagueRankClans', { params: { leagueId: leagueSlug }, search: { size: 3 } }),
    enabled: ready && source === 'clans',
    staleTime: 10 * 60 * 1000,
  })

  const matches = useQuery({
    queryKey: ['home-ex-matches', leagueSlug],
    queryFn: () => apiGet('leagueMatches', { params: { leagueId: leagueSlug } }),
    enabled: ready && source === 'matches',
    staleTime: 10 * 60 * 1000,
  })

  const hex = useQuery({
    queryKey: ['home-ex-hex', leagueSlug],
    queryFn: () => apiGet('leagueHexTop', { params: { leagueId: leagueSlug } }),
    enabled: ready && source === 'hex',
    staleTime: 10 * 60 * 1000,
  })

  const busy =
    (source === 'players' && players.isPending) ||
    (source === 'clans' && clans.isPending) ||
    (source === 'matches' && matches.isPending) ||
    (source === 'hex' && hex.isPending)

  const wrap = (inner: React.ReactNode) => (
    <div className="mt-[10px] px-[13px] py-[12px] max-md:px-[11px] max-md:py-[10px]" style={box}>
      {inner}
    </div>
  )

  if (busy) return wrap(<Loading />)

  /* ── 개인랭킹을 쓰는 셋 ─────────────────────────────── */
  if (source === 'players') {
    const rows = players.data?.data ?? []
    const top = rows[0]
    if (!top) return wrap(<Empty what="쌓인 개인 기록" />)

    if (featureKey === 'playerRank') {
      return wrap(
        <>
          <Cap>지금 이 리그 1~3위</Cap>
          <div className="flex flex-col gap-[9px]">
            {rows.slice(0, 3).map((r) => (
              <div key={r.league_player_id} className="flex items-center gap-[9px]">
                <span className="num w-[20px] shrink-0 text-[13px] font-bold" style={{ color: tone }}>
                  {r.rank}
                </span>
                {r.clan ? <MarkCircle clan={r.clan} size={17} /> : null}
                <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--v2-text-strong)]">
                  {r.player.name}
                </span>
                <span className="num shrink-0 text-[12.5px] text-[var(--v2-text-dim)]">
                  {pct(r.win_rate)}
                </span>
              </div>
            ))}
          </div>
        </>,
      )
    }

    /* 킬뎃 그래프 · 기록 카드 — 1위 한 명을 카드로 */
    return wrap(
      <>
        <Cap>{featureKey === 'kdGraph' ? '1위 선수의 지금 수치' : '1위 선수의 기록 카드'}</Cap>
        <div className="flex items-center gap-[9px]">
          {top.clan ? <MarkCircle clan={top.clan} size={20} /> : null}
          <span className="min-w-0 flex-1 truncate text-[14px] font-bold text-[var(--v2-text-strong)]">
            {top.player.name}
          </span>
          <span className="num shrink-0 text-[12px]" style={{ color: tone }}>
            {top.rank}위
          </span>
        </div>
        <div className="mt-[11px] grid grid-cols-3 gap-[10px]">
          <Stat label="승률" value={pct(top.win_rate)} tone={tone} />
          <Stat label="킬뎃" value={pct(top.kd_rate)} />
          <Stat label="전적" value={`${top.win}승 ${top.lose}패`} />
        </div>
      </>,
    )
  }

  /* ── 클랜랭킹을 쓰는 둘 ─────────────────────────────── */
  if (source === 'clans') {
    const rows = clans.data?.data ?? []
    const top = rows[0]
    if (!top) return wrap(<Empty what="쌓인 클랜 기록" />)

    if (featureKey === 'ladder') {
      return wrap(
        <>
          <Cap>래더 점수 — 센 상대를 이길수록 크게 오릅니다</Cap>
          <div className="flex flex-col gap-[9px]">
            {rows.slice(0, 3).map((r) => (
              <div key={r.league_clan_id} className="flex items-center gap-[9px]">
                <span className="num w-[20px] shrink-0 text-[13px] font-bold" style={{ color: tone }}>
                  {r.rank}
                </span>
                <MarkCircle clan={r.clan} size={17} />
                <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--v2-text-strong)]">
                  {r.clan.name}
                </span>
                <span className="num shrink-0 text-[13px] font-bold" style={{ color: tone }}>
                  {Math.round(r.rating)}
                </span>
              </div>
            ))}
          </div>
        </>,
      )
    }

    return wrap(
      <>
        <Cap>지금 이 리그 1~3위 클랜</Cap>
        <div className="flex flex-col gap-[9px]">
          {rows.slice(0, 3).map((r) => (
            <div key={r.league_clan_id} className="flex items-center gap-[9px]">
              <span className="num w-[20px] shrink-0 text-[13px] font-bold" style={{ color: tone }}>
                {r.rank}
              </span>
              <MarkCircle clan={r.clan} size={17} />
              <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--v2-text-strong)]">
                {r.clan.name}
              </span>
              <span className="num shrink-0 text-[12.5px] text-[var(--v2-text-dim)]">
                {pct(r.win_rate)}
              </span>
            </div>
          ))}
        </div>
      </>,
    )
  }

  /* ── 경기 한 판 ─────────────────────────────────────── */
  if (source === 'matches') {
    const rows = matches.data?.data ?? []
    const m = rows[0]
    if (!m) return wrap(<Empty what="분석된 경기" />)
    /*
     * ★점수를 보는 쪽 기준으로 돌려 놓는다★ — `red_rounds`/`blue_rounds` 는 ★진영★ 점수다.
     *   `league_clan_side` 가 그 경기에서 보는 쪽이 어느 진영이었는지를 알려 준다.
     *   모르면(null) 돌리지 않는다 — ★뒤집힌 점수를 지어내지 않는다.★
     */
    const flip = m.league_clan_side === 'blue'
    const mine = flip ? m.blue_rounds : m.red_rounds
    const yours = flip ? m.red_rounds : m.blue_rounds
    const score =
      m.league_clan_side !== null && mine !== null && yours !== null
        ? `${mine} : ${yours}`
        : null

    return wrap(
      <>
        <Cap>가장 최근 경기 한 판</Cap>
        <div className="flex items-center gap-[8px]">
          <MarkCircle clan={m.league_clan.clan} size={19} />
          <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--v2-text-strong)]">
            {m.league_clan.clan.name}
          </span>
          {score !== null ? (
            <span className="num shrink-0 text-[14px] font-bold" style={{ color: tone }}>
              {score}
            </span>
          ) : (
            <span className="shrink-0 text-[12px] text-[var(--v2-text-ghost)]">vs</span>
          )}
          <span className="min-w-0 flex-1 truncate text-right text-[13px] text-[var(--v2-text-strong)]">
            {m.opponent.clan.name}
          </span>
          <MarkCircle clan={m.opponent.clan} size={19} />
        </div>
        <div className="mt-[8px] text-[11.5px] text-[var(--v2-text-ghost)]">
          {m.map.name}
          {' · '}
          라운드마다 누가 먼저 쓰러졌는지까지 펼쳐 볼 수 있습니다
        </div>
      </>,
    )
  }

  /* ── 육각 1위 ───────────────────────────────────────── */
  const board = hex.data?.data
  const axes = (featureKey === 'clanHex' ? board?.clan : board?.player) ?? []
  /* ★축 하나만 보여 준다★ — 사장님: «예시를 하나씩만» */
  const axis = axes.find((a) => a.rows.length > 0)
  const first = axis?.rows[0]
  if (!axis || !first) return wrap(<Empty what="잴 수 있는 기록" />)
  const who = featureKey === 'clanHex' ? first.clan?.name : first.player?.name

  return wrap(
    <>
      <Cap>
        여섯 축 가운데 하나 — 「{axis.label}」 1위
        {axis.total !== null ? ` (${axis.total}${featureKey === 'clanHex' ? '팀' : '명'} 중)` : ''}
      </Cap>
      <div className="flex items-center gap-[9px]">
        {first.clan ? <MarkCircle clan={first.clan} size={20} /> : null}
        <span className="min-w-0 flex-1 truncate text-[14px] font-bold text-[var(--v2-text-strong)]">
          {who ?? '알수없음'}
        </span>
        <span className="num shrink-0 text-[15px] font-bold" style={{ color: tone }}>
          {first.value}
        </span>
      </div>
      <div className="mt-[8px] text-[11.5px] leading-[1.6] text-[var(--v2-text-ghost)]">
        {featureKey === 'clanHex'
          ? '클랜마다 이런 축이 여섯 개 — 육각형 한 장으로 강약이 보입니다'
          : '선수마다 이런 축이 여섯 개 — 육각형 한 장으로 강약이 보입니다'}
      </div>
    </>,
  )
}
