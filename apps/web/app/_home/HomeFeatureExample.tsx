'use client'

import { useQuery } from '@tanstack/react-query'
import { ClanHexagonV2, Hexagon, MarkCircle, TrendChartV3, strengthAxes } from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { useApiReady } from '@/app/providers'

/**
 * ★기능 줄을 눌렀을 때 그 자리에서 펼쳐지는 예시★ (2026-09-16 사장님).
 *
 * > «그냥 보기 누르면 ★다른페이지로 넘어가지말고 그자리에서 밑으로 펼쳐서★
 * >  예시를 ★하나씩만★ 보여줘»
 * > «펼치면 ★경기분석카드, 그래프(day누적) 육각그래프 전부 다★ 각각 펼치기에 맞게
 * >  나와야지(★애니메이트도 나와야해★) 저렇게 나오면 누가 해»
 *
 * ── ★글자 요약이 아니라 진짜 화면★
 *   첫 판은 «1위 선수 승률 70.6%» 같은 ★글자★ 였다. 사장님이 바로 물리셨다 —
 *   «클랜 분석» 을 눌렀는데 글자 두 줄이 나오면 그게 무슨 클랜 분석인가.
 *
 *   그래서 ★실제 화면이 쓰는 그 컴포넌트를 그대로 심는다.★
 *     육각형   `Hexagon` · `ClanHexagonV2`   ← 선수·클랜 상세가 쓰는 바로 그것
 *     그래프   `TrendChartV3`                ← 선수 상세의 «그래프» 탭 그대로
 *     경기     실제 경기 한 판의 점수·맵
 *   따로 만든 흉내가 아니라서 ★화면이 바뀌면 예시도 같이 바뀐다.★
 *
 * ── ★지어내지 않는다★ (`CLAUDE.md` 2-1)
 *   예시는 운영 자료 그대로다. 견본 숫자를 그리지 않는다.
 *   자료가 아직 없으면 «아직 쌓인 기록이 없습니다» 라고 적는다.
 *
 * ── ★펼칠 때만 부른다★
 *   여덟 줄 × 세 리그를 미리 받으면 첫 화면이 무거워진다.
 *   이 조각은 펼쳐질 때 처음 그려진다 — 안 누르면 질의가 하나도 안 나간다.
 *
 * ── 질의 사슬
 * ```
 *   개인랭킹 1위 → 그 선수 상세   육각(플레이어 분석) · 그래프(킬뎃) · 기록 카드
 *   클랜랭킹 1위 → 그 클랜 상세   클랜 육각(클랜 분석)
 *   클랜랭킹                      클랜 랭킹 · 래더 점수
 *   경기 목록                     경기 분석
 * ```
 *   1위를 먼저 뽑아야 상세를 부를 수 있어 ★두 번 이어 부른다.★ 두 번째 질의는
 *   첫 번째가 온 뒤에만 켜진다(`enabled`) — 빈 주소로 부르지 않는다.
 */

/** 그 기능이 어느 자료를 쓰나 */
type Source = 'player' | 'clan' | 'clanRank' | 'match'

const SOURCE: Readonly<Record<string, Source>> = {
  match: 'match',
  kdGraph: 'player',
  recordCard: 'player',
  playerHex: 'player',
  clanHex: 'clan',
  playerRank: 'player',
  clanRank: 'clanRank',
  ladder: 'clanRank',
}

const box: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.028)',
  border: '1px solid var(--v2-head-divider, #1e2637)',
}

/** 작은 이름표 */
function Cap({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-[9px] text-[10.5px] tracking-[.12em] text-[var(--v2-text-ghost)]">
      {children}
    </div>
  )
}

function Empty({ what }: { what: string }) {
  return <div className="text-[12px] text-[var(--v2-text-ghost)]">아직 {what}이 없습니다</div>
}

/** 도는 점 — 「멈춘 건가」를 없앤다 */
function Loading() {
  return (
    <div className="flex items-center gap-[8px] text-[12px] text-[var(--v2-text-ghost)]">
      <span aria-hidden className="home-ex-spin" />
      불러오는 중…
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
  const source = SOURCE[featureKey] ?? 'player'

  /* ── ① 1위를 뽑는다 ─────────────────────────────────── */
  const players = useQuery({
    queryKey: ['home-ex-players', leagueSlug],
    queryFn: () =>
      apiGet('leagueRankPlayers', {
        params: { leagueId: leagueSlug },
        search: { weapon: 'all', page: 1 },
      }),
    enabled: ready && source === 'player',
    staleTime: 10 * 60 * 1000,
  })

  const clans = useQuery({
    queryKey: ['home-ex-clans', leagueSlug],
    queryFn: () =>
      apiGet('leagueRankClans', { params: { leagueId: leagueSlug }, search: { size: 3 } }),
    enabled: ready && (source === 'clan' || source === 'clanRank'),
    staleTime: 10 * 60 * 1000,
  })

  const matches = useQuery({
    queryKey: ['home-ex-matches', leagueSlug],
    queryFn: () => apiGet('leagueMatches', { params: { leagueId: leagueSlug } }),
    enabled: ready && source === 'match',
    staleTime: 10 * 60 * 1000,
  })

  /* ── ② 1위의 상세 — 육각·그래프가 여기 들어 있다 ────── */
  const topPlayerId = players.data?.data[0]?.player.id ?? ''
  const player = useQuery({
    queryKey: ['home-ex-player', leagueSlug, topPlayerId],
    queryFn: () => apiGet('leaguePlayerShow', { params: { leagueSlug, playerId: topPlayerId } }),
    enabled: ready && source === 'player' && topPlayerId !== '',
    staleTime: 10 * 60 * 1000,
  })

  const topClanSlug = clans.data?.data[0]?.clan.slug ?? ''
  const clan = useQuery({
    queryKey: ['home-ex-clan', leagueSlug, topClanSlug],
    queryFn: () => apiGet('leagueClanShow', { params: { leagueSlug, clanSlug: topClanSlug } }),
    enabled: ready && source === 'clan' && topClanSlug !== '',
    staleTime: 10 * 60 * 1000,
  })

  const busy =
    (source === 'player' && (players.isPending || player.isPending)) ||
    (source === 'clan' && (clans.isPending || clan.isPending)) ||
    (source === 'clanRank' && clans.isPending) ||
    (source === 'match' && matches.isPending)

  /* 펼쳐질 때 부드럽게 — 사장님: «애니메이트도 나와야해» */
  const wrap = (inner: React.ReactNode) => (
    <div
      className="home-ex mt-[10px] px-[13px] py-[12px] max-md:px-[11px] max-md:py-[10px]"
      style={box}
    >
      {inner}
    </div>
  )

  if (busy) return wrap(<Loading />)

  /* ══ 선수 쪽 ═══════════════════════════════════════════ */
  if (source === 'player') {
    const rows = players.data?.data ?? []
    const top = rows[0]
    const detail = player.data?.data ?? null
    if (!top) return wrap(<Empty what="쌓인 개인 기록" />)

    /* ★플레이어 분석 — 진짜 육각형★ */
    if (featureKey === 'playerHex') {
      const axes = detail ? strengthAxes(detail) : []
      if (axes.length === 0) return wrap(<Empty what="잴 수 있는 여섯 축" />)
      return wrap(
        <>
          <Cap>
            1위 <b style={{ color: 'var(--v2-text-strong)' }}>{top.player.name}</b> 의 여섯 축
          </Cap>
          <div className="home-ex-draw flex justify-center">
            <Hexagon axes={axes} id="homeExPlayerHex" />
          </div>
        </>,
      )
    }

    /* ★킬뎃 그래프 — 진짜 그래프★ (날짜별 누적) */
    if (featureKey === 'kdGraph') {
      const days = detail?.trend ?? []
      if (days.length === 0) return wrap(<Empty what="날짜별 기록" />)
      return wrap(
        <>
          <Cap>
            1위 <b style={{ color: 'var(--v2-text-strong)' }}>{top.player.name}</b> 의 날짜별 누적
          </Cap>
          <div className="home-ex-draw">
            <TrendChartV3
              days={days}
              mode="cum"
              markSlug={top.clan?.slug ?? null}
              winLabel="승률"
              kdLabel="킬뎃"
              seed={topPlayerId}
            />
          </div>
        </>,
      )
    }

    /* 개인 랭킹 — 실제 줄 세 개 */
    if (featureKey === 'playerRank') {
      return wrap(
        <>
          <Cap>지금 이 리그 1~3위</Cap>
          <div className="flex flex-col gap-[9px]">
            {rows.slice(0, 3).map((r) => (
              <div key={r.league_player_id} className="flex items-center gap-[9px]">
                <span
                  className="num w-[20px] shrink-0 text-[13px] font-bold"
                  style={{ color: tone }}
                >
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

    /* 기록 카드 — 한 장에 승률·킬뎃·전적 */
    return wrap(
      <>
        <Cap>1위 선수의 기록 카드</Cap>
        <div className="flex items-center gap-[9px]">
          {top.clan ? <MarkCircle clan={top.clan} size={22} /> : null}
          <span className="min-w-0 flex-1 truncate text-[14px] font-bold text-[var(--v2-text-strong)]">
            {top.player.name}
          </span>
          <span className="num shrink-0 text-[12px]" style={{ color: tone }}>
            {top.rank}위
          </span>
        </div>
        <div className="mt-[11px] grid grid-cols-3 gap-[10px]">
          <div className="flex flex-col gap-[2px]">
            <span className="text-[10.5px] text-[var(--v2-text-ghost)]">승률</span>
            <span className="num text-[15px] font-bold" style={{ color: tone }}>
              {pct(top.win_rate)}
            </span>
          </div>
          <div className="flex flex-col gap-[2px]">
            <span className="text-[10.5px] text-[var(--v2-text-ghost)]">킬뎃</span>
            <span className="num text-[15px] font-bold text-[var(--v2-text-strong)]">
              {pct(top.kd_rate)}
            </span>
          </div>
          <div className="flex flex-col gap-[2px]">
            <span className="text-[10.5px] text-[var(--v2-text-ghost)]">전적</span>
            <span className="num text-[15px] font-bold text-[var(--v2-text-strong)]">
              {top.win}승 {top.lose}패
            </span>
          </div>
        </div>
      </>,
    )
  }

  /* ══ 클랜 분석 — 진짜 클랜 육각형 ═══════════════════════ */
  if (source === 'clan') {
    const top = clans.data?.data[0]
    const hexagon = clan.data?.data.hexagon_v2 ?? null
    if (!top) return wrap(<Empty what="쌓인 클랜 기록" />)
    if (!hexagon) return wrap(<Empty what="잴 수 있는 여섯 축" />)
    return wrap(
      <>
        <Cap>
          1위 <b style={{ color: 'var(--v2-text-strong)' }}>{top.clan.name}</b> 의 여섯 축
        </Cap>
        <div className="home-ex-draw">
          <ClanHexagonV2 hexagon={hexagon} name={top.clan.name} />
        </div>
      </>,
    )
  }

  /* ══ 클랜 랭킹 · 래더 ═══════════════════════════════════ */
  if (source === 'clanRank') {
    const rows = clans.data?.data ?? []
    if (rows.length === 0) return wrap(<Empty what="쌓인 클랜 기록" />)
    const ladder = featureKey === 'ladder'
    return wrap(
      <>
        <Cap>
          {ladder ? '래더 점수 — 센 상대를 이길수록 크게 오릅니다' : '지금 이 리그 1~3위 클랜'}
        </Cap>
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
              <span
                className="num shrink-0 text-[13px] font-bold"
                style={{ color: ladder ? tone : 'var(--v2-text-dim)' }}
              >
                {ladder ? Math.round(r.rating) : pct(r.win_rate)}
              </span>
            </div>
          ))}
        </div>
      </>,
    )
  }

  /* ══ 경기 분석 ═════════════════════════════════════════ */
  const m = matches.data?.data[0]
  if (!m) return wrap(<Empty what="분석된 경기" />)
  /*
   * ★점수를 보는 쪽 기준으로 돌려 놓는다★ — `red_rounds`/`blue_rounds` 는 ★진영★ 점수다.
   *   `league_clan_side` 가 그 경기에서 보는 쪽이 어느 진영이었는지를 알려 준다.
   *   모르면(null) 돌리지 않는다 — ★뒤집힌 점수를 지어내지 않는다.★
   */
  const flip = m.league_clan_side === 'blue'
  const mine = flip ? m.blue_rounds : m.red_rounds
  const yours = flip ? m.red_rounds : m.blue_rounds
  const known = m.league_clan_side !== null && mine !== null && yours !== null
  const share = known ? ((mine as number) / Math.max(1, (mine as number) + (yours as number))) * 100 : 0

  return wrap(
    <>
      <Cap>가장 최근 경기 한 판</Cap>
      <div className="home-ex-draw flex items-center gap-[10px]">
        <MarkCircle clan={m.league_clan.clan} size={26} />
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold text-[var(--v2-text-strong)]">
          {m.league_clan.clan.name}
        </span>
        {known ? (
          <span className="num shrink-0 text-[19px] font-bold" style={{ color: tone }}>
            {mine} : {yours}
          </span>
        ) : (
          <span className="shrink-0 text-[12px] text-[var(--v2-text-ghost)]">vs</span>
        )}
        <span className="min-w-0 flex-1 truncate text-right text-[13.5px] font-bold text-[var(--v2-text-strong)]">
          {m.opponent.clan.name}
        </span>
        <MarkCircle clan={m.opponent.clan} size={26} />
      </div>
      {/* 라운드 막대 — 점수를 눈으로 본다. 펼칠 때 왼쪽에서 자란다 */}
      {known ? (
        <div className="mt-[10px] flex h-[6px] overflow-hidden rounded-[3px] bg-[rgba(255,255,255,.06)]">
          <span className="home-ex-bar" style={{ width: `${share}%`, background: tone }} />
        </div>
      ) : null}
      <div className="mt-[9px] text-[11.5px] leading-[1.6] text-[var(--v2-text-ghost)]">
        {m.map.name} · 라운드마다 누가 먼저 쓰러졌는지까지 펼쳐 볼 수 있습니다
      </div>
    </>,
  )
}
