'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ClanCardV3,
  ClanScoreboardV3,
  Hexagon,
  MarkCircle,
  MatchHexagonV3,
  PlayerHeaderV3,
  TrendChartV3,
  mainWeaponFromStats,
  ourSideOf,
  strengthAxes,
} from '@sacloud/ui'
import { leagueScreen } from '@sacloud/contract'
import { PlayerRankTable } from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { useApiReady } from '@/app/providers'

/**
 * ★기능 줄을 눌렀을 때 그 자리에서 펼쳐지는 예시★ (2026-09-16 사장님).
 *
 * > «그냥 보기 누르면 다른페이지로 넘어가지말고 그자리에서 밑으로 펼쳐서
 * >  예시를 하나씩만 보여줘»
 * > «펼치면 경기분석카드, 그래프(day누적) 육각그래프 전부 다 각각 펼치기에 맞게
 * >  나와야지(애니메이트도 나와야해) 저렇게 나오면 누가 해»
 * > «★실제 이 자료들을 전부 넣으라는거야 니가 만들지말고★ 하나씩 예시로 넣으라고»
 *
 * ── ★내가 만들지 않는다★
 *   사장님이 화면 사진을 하나씩 보내 주시며 못 박으셨다. 그래서 이 파일은
 *   ★새로 그리는 것이 하나도 없다.★ 실제 화면이 쓰는 그 컴포넌트를 그대로 부른다.
 *
 * ```
 *   경기 분석      `ClanScoreboardV3` + `MatchHexagonV3`   경기 상세 그대로
 *   킬뎃 그래프    `TrendChartV3`                          선수 «그래프» 탭 그대로
 *   기록 카드      `PlayerHeaderV3`                        선수 머리 카드 그대로
 *   플레이어 분석  `Hexagon`                               선수 여섯 축 그대로
 *   클랜 분석      `ClanCardV3`                            클랜 머리 카드 그대로
 *                                                          (육각 + 플레이스타일 + 승률·순위)
 *   개인/클랜 랭킹 · 래더                                   랭킹 줄 셋
 * ```
 *   흉내가 아니므로 ★화면이 바뀌면 예시도 저절로 같이 바뀐다.★
 *
 * ── ★지어내지 않는다★ (`CLAUDE.md` 2-1)
 *   예시는 운영 자료 그대로다. 자료가 없으면 «아직 쌓인 기록이 없습니다» 라고 적는다.
 *
 * ── ★펼칠 때만 부른다★
 *   여덟 줄 × 세 리그를 미리 받으면 첫 화면이 무거워진다.
 *   안 누르면 질의가 하나도 안 나간다.
 *
 * ── 질의 사슬
 *   1위를 먼저 뽑아야 상세를 부를 수 있어 ★두 번 이어 부른다.★
 *   두 번째는 첫 번째가 온 뒤에만 켜진다(`enabled`) — 빈 주소로 부르지 않는다.
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

  /* ── ② 상세 — 육각·그래프·스코어보드가 여기 들어 있다 ─ */
  const topPlayerId = players.data?.data[0]?.player.id ?? ''
  const player = useQuery({
    queryKey: ['home-ex-player', leagueSlug, topPlayerId],
    queryFn: () => apiGet('leaguePlayerShow', { params: { leagueSlug, playerId: topPlayerId } }),
    enabled: ready && source === 'player' && topPlayerId !== '',
    staleTime: 10 * 60 * 1000,
  })

  /*
   * ★클랜 예시는 고정한다★ (2026-09-16 사장님: «이거 tsarntc 클랜 걸어 여기다가»).
   *
   *   1위는 날마다 바뀌는데, 마침 오늘 1위는 육각 재계산 중이라 여섯 축이 전부
   *   «측정중» 이고 주요멤버가 «없음» 이었다. 예시로 보여 줄 화면이 아니다.
   *   ★없는 리그에서는 1위로 떨어진다★ — 그 리그에 이 클랜이 없을 수 있다.
   */
  const PINNED_CLAN: Readonly<Record<string, string>> = { supply: 'tsarntc' }
  const pinned = PINNED_CLAN[leagueSlug] ?? null
  const topClanSlug = pinned ?? clans.data?.data[0]?.clan.slug ?? ''
  const clan = useQuery({
    queryKey: ['home-ex-clan', leagueSlug, topClanSlug],
    queryFn: () => apiGet('leagueClanShow', { params: { leagueSlug, clanSlug: topClanSlug } }),
    enabled: ready && source === 'clan' && topClanSlug !== '',
    staleTime: 10 * 60 * 1000,
  })

  /*
   * ★예시로 쓸 경기 한 판★ (2026-09-16 사장님: «경기 분석이 완료된 경기를 가지고와
   *   예시니까 그냥 ★라운드 가장 많이한★ ex 9:9 이런 라운드 가져와서 걸고»).
   *
   *   여태는 ★가장 최근★ 판을 그냥 집었다. 그래서 «경기분석중» 이 뜨는 판이 걸렸다 —
   *   배틀로그가 아직 안 들어와 육각을 못 그리는 경기다. 예시로는 쓸모가 없다.
   *
   *   이제 ★라운드 합이 가장 큰 판★ 을 고른다 (9:9 면 18). 접전일수록 스코어보드가
   *   꽉 차고 볼 게 많다. 라운드를 모르는 판은 아예 안 고른다 — 지어내지 않는다.
   */
  const ranked = (() => {
    const list = [...(matches.data?.data ?? [])]
    const roundsOf = (m: (typeof list)[number]) =>
      m.red_rounds === null || m.blue_rounds === null ? -1 : m.red_rounds + m.blue_rounds
    /* 라운드 많은 순 — 접전일수록 스코어보드가 꽉 차고 볼 게 많다 */
    list.sort((a, b) => roundsOf(b) - roundsOf(a))
    return list
  })()
  /*
   * ★기록이 빈 판은 건너뛴다★ — 라운드는 많은데 선수 기록이 아직 안 들어온 판이 있다.
   *   목록만 봐서는 알 수 없어서(인원수가 전부 10 으로 찍힌다) 상세를 받아 보고 옮긴다.
   *   ★다섯 번까지만★ 시도한다 — 그 이상은 그날 자료가 통째로 덜 들어온 것이다.
   */
  const [tryIdx, setTryIdx] = useState(0)
  /*
   * ★다 훑어도 비면 가장 최근 판으로 되돌아간다★ (2026-09-16 실측).
   *   라운드가 가장 많은 판들이 오히려 ★아직 기록이 안 들어온 최신 경기★ 인 경우가 있다.
   *   빈 칸을 보여 주느니 «라운드는 좀 적지만 제대로 찬» 판이 낫다.
   */
  const TRY_LIMIT = 8
  const fallback = matches.data?.data[0] ?? null
  const topMatch = tryIdx >= TRY_LIMIT ? fallback : (ranked[tryIdx] ?? fallback)
  const matchDetail = useQuery({
    queryKey: ['home-ex-match', leagueSlug, topMatch?.id ?? ''],
    queryFn: () =>
      apiGet('matchShow', {
        params: { leagueId: leagueSlug, matchId: topMatch?.id ?? '' },
        search: { league_clan_id: topMatch?.league_clan.league_clan_id ?? '' },
      }),
    enabled: ready && source === 'match' && topMatch !== null,
    staleTime: 10 * 60 * 1000,
  })

  /* 받아 보니 비었으면 다음 후보로 — 그리기 전에 옮긴다 */
  const md = matchDetail.data?.data ?? null
  useEffect(() => {
    if (md === null) return
    /*
     * ★«분석 완료» 는 둘 다 있어야 한다★ (2026-09-16 사장님: «경기 분석이 완료된
     *   경기를 가지고와»). 명단만 있고 육각이 없으면 화면에 «경기분석중» 이 뜬다.
     */
    const empty =
      (md.red_stats.length === 0 && md.blue_stats.length === 0) ||
      (md.red_hexagon_v2 === null && md.blue_hexagon_v2 === null)
    if (empty && tryIdx < TRY_LIMIT) setTryIdx((i) => i + 1)
  }, [md, tryIdx, ranked.length])

  const busy =
    (source === 'player' && (players.isPending || player.isPending)) ||
    (source === 'clan' && (clans.isPending || clan.isPending)) ||
    (source === 'clanRank' && clans.isPending) ||
    (source === 'match' && (matches.isPending || matchDetail.isPending))

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

    /* ★기록 카드 — 선수 머리 카드 그대로★ (사장님 사진 ⑤) */
    if (featureKey === 'recordCard') {
      if (!detail) return wrap(<Empty what="선수 기록" />)
      return wrap(
        <>
          <Cap>1위 선수의 기록 카드 — 실제 선수 화면 그대로입니다</Cap>
          <div className="home-ex-draw">
            <PlayerHeaderV3
              showsKd={leagueScreen(leagueSlug).playerColumns.kd}
              data={detail}
              infoHref={`/player/${topPlayerId}`}
              seasonLabel={`SEASON ${detail.league.name.toUpperCase()}`}
              mainWeapon={detail.hex?.weapon ?? mainWeaponFromStats(detail.weapon_stats)}
            />
          </div>
        </>,
      )
    }

    /* ★플레이어 분석 — 선수 여섯 축 육각형 그대로★ */
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

    /* ★킬뎃 그래프 — 선수 「그래프」 탭 그대로★ (날짜별 누적) */
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
              showsKd={leagueScreen(leagueSlug).playerColumns.kd}
            />
          </div>
        </>,
      )
    }

    /*
     * ★개인 랭킹 — 실제 랭킹 표 그대로★ (2026-09-16 사장님: «개인랭킹 화면을 이걸 넣어야지»).
     *   내가 만든 세 줄(순위·마크·이름·승률)을 걷어냈다. 진짜 표는 클랜명·승패·평균킬까지
     *   나오고, 순위 색도 «상위 몇 %» 로 칠해진다 — 그게 사장님이 보여 주신 화면이다.
     */
    return wrap(
      <>
        <Cap>지금 이 리그 1~3위 — 실제 개인랭킹 화면 그대로입니다</Cap>
        <div className="home-ex-draw">
          <PlayerRankTable
            leagueSlug={leagueSlug}
            weapon="all"
            rows={rows.slice(0, 3)}
            columns={leagueScreen(leagueSlug).playerColumns}
            /* 소속 클랜명은 닉네임 아래 줄 — 랭킹 화면과 같은 배치다 */
            clanName="line"
            rankTone
            rankTotal={players.data?.metadata.total ?? null}
          />
        </div>
      </>,
    )
  }

  /* ══ 클랜 분석 — 클랜 머리 카드 그대로 ═══════════════════ */
  if (source === 'clan') {
    const detail = clan.data?.data ?? null
    if (!detail) return wrap(<Empty what="클랜 기록" />)
    return wrap(
      <>
        <Cap>{detail.clan.name} 의 기록실 — 실제 클랜 화면 그대로입니다</Cap>
        <div className="home-ex-draw">
          <ClanCardV3
            data={detail}
            infoHref={`/clan/${topClanSlug}`}
            seasonLabel={`SEASON ${detail.league.name.toUpperCase()}`}
            memberCount={null}
            /* 첫 화면에서는 손대는 단추를 안 준다 — 보여 주기만 한다 */
            renewedNote={null}
            renewAction={null}
          />
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

  /* ══ 경기 분석 — 스코어보드 + 경기 육각 그대로 ══════════ */
  const detail = md
  if (!topMatch || !detail) return wrap(<Empty what="분석된 경기" />)
  /* 다섯 번을 옮겨도 비어 있으면 그날 자료가 덜 들어온 것이다 — 그렇게 적는다 */
  if (detail.red_stats.length === 0 && detail.blue_stats.length === 0) {
    return wrap(<Empty what="기록이 들어온 경기" />)
  }

  /*
   * 육각은 ★승패★ 로 넘긴다 — 색이 승패를 뜻하기 때문이다 (`MatchHexagonV3` 주석).
   * 어느 슬롯이 우리인지는 `ourSideOf` 가 정한다.
   */
  const ourSide = ourSideOf(detail)
  const weWon = detail.win
  const ourHex = (ourSide === 'red' ? detail.red_hexagon_v2 : detail.blue_hexagon_v2)?.hexagon ?? null
  const foeHex = (ourSide === 'red' ? detail.blue_hexagon_v2 : detail.red_hexagon_v2)?.hexagon ?? null
  const ourName = detail.league_clan.clan.name
  const foeName = detail.opponent.clan.name

  return wrap(
    <>
      <Cap>
        가장 최근 경기 — {ourName} vs {foeName} · 실제 경기 화면 그대로입니다
      </Cap>
      <div className="home-ex-draw">
        <ClanScoreboardV3
          detail={detail}
          /*
           * ★리그 종류★ — 층 이름표()가 이 값을 본다.
           *   경기 상세 응답에는 리그 종류가 안 담겨 있어 ★기본값 그대로★ 둔다
           *   (다른 화면도 값이 없으면  로 떨어진다).
           *   ⚠ 지어내지 않는다 — 틀린 종류를 넘기면 층 이름이 엉뚱해진다.
           */
          leagueCategory="independent"
          leagueSlug={leagueSlug}
        />
      </div>
      {/* 여섯 축을 양 팀 겹쳐서 — 경기 상세의 「경기분석」과 같은 그림 */}
      {ourHex || foeHex ? (
        <div className="home-ex-draw mt-[12px]">
          <MatchHexagonV3
            won={weWon ? ourHex : foeHex}
            lost={weWon ? foeHex : ourHex}
            wonName={weWon ? ourName : foeName}
            lostName={weWon ? foeName : ourName}
            id="homeExMatchHex"
          />
        </div>
      ) : null}
    </>,
  )
}
