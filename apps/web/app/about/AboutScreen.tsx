'use client'

/**
 * ★사이트 소개★ (2026-09-14 사장님).
 *
 *   «그 모든 그래프 진짜 있는 선수로 한명씩 다 (애니메이트 적용해서 보여주고)
 *     6각 , day 누적 전부 다 보여줘. 클랜 상대전적도 보여주고 개인기록은
 *     실제 예시) 이렇게 해서 게임 제일 많이 한 사람걸로 보여줘. 클랜기록도 제일
 *     많이 한 클랜으로 보여줘 IPL SPL 각각 하나씩 개인 클랜 전부 총 4개(ipl2 spl2)
 *     그리고 경기분석표도 라운드 가장 오랜간거 IPL SPL 하나씩 뽑아서 보여줘
 *     그냥 모든 사이트의 기능을 설명 (…) 마지막에 어느 리그에 참가하시겠습니까»
 *
 *   «기록 사이트 느낌보다도 우리는 ★경기분석 및 선수분석 페이지이다 기록사이트가
 *     아님★ 을 알려드립니다 본인의 플레이, 상대의 반복적 플레이 패턴 우리클랜의
 *     취약점 등 모든 정보를 클라우드에서 제공받을 수 있다»
 *
 * ── ★꾸민 값이 아니다. 살아 있는 화면을 그대로 가져온다★
 *   여기 나오는 육각형·추이·상대전적·경기분석표는 전부 ★실제 화면이 쓰는 그 부품★ 이고
 *   ★실제 API 가 주는 그 값★ 이다. 소개용 숫자를 따로 만들지 않는다 —
 *   그러면 소개와 실물이 다른 말을 하게 된다.
 *
 * ── 누구를 보여 주나
 *   `/api/about/picks` 가 ★부를 때마다 다시 세어★ 고른다 —
 *   경기 최다 선수 · 경기 최다 클랜 · 라운드 최다 경기. 이름을 코드에 박으면
 *   내일 거짓말이 된다.
 *
 * ── 지금은 관리자만 본다
 *   사장님: «빼기전에 일단 관리자로 로그인해서 나부터 볼 수 있게 해줘 로그인 전에는 못보게».
 *   자물쇠는 `lib/aboutGate.ts` 한 줄이다.
 */
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import type { LeagueClanShow, LeaguePlayerDetail, MatchDetail } from '@sacloud/contract'
import { leagueScreen } from '@sacloud/contract'
import {
  AnalysisPanelV3,
  Card,
  CardHead,
  ClanScoreboardV3,
  H2HChartV3,
  Hexagon,
  MarkCircle,
  TrendChartV3,
  V3,
  clanHexAxes,
  clanThemeOf,
  strengthAxes,
} from '@sacloud/ui'
import { useState } from 'react'
import { useApiReady } from '@/app/providers'

/**
 * ★상세까지 한 덩어리로 받는다★ (2026-09-14 실측으로 이렇게 됐다).
 *
 * 처음에는 «누구를» 만 받고 선수·클랜·경기 상세를 ★각각 따로★ 불렀다. 그랬더니
 * 리그 둘 × 상세 셋 = ★여섯 번이 동시에★ 날아가 연결이 모자라 전부 멈췄고,
 * 화면이 «불러오는 중…» 여섯 개로 굳었다. 서버가 차례로 모아서 한 번에 준다.
 */
interface Pick {
  league: string
  label: string
  player: { player_id: string; name: string; games: number } | null
  clan: { slug: string; name: string; games: number } | null
  match: { id: string; rounds: number; red: string; blue: string; start_at: string } | null
  player_detail: LeaguePlayerDetail | null
  clan_detail: LeagueClanShow | null
  match_detail: MatchDetail | null
}

export function AboutScreen() {
  const ready = useApiReady()
  const picks = useQuery({
    queryKey: ['about', 'picks'],
    queryFn: async () => {
      const res = await fetch('/api/about/picks', { credentials: 'same-origin' })
      const payload = (await res.json()) as { message: string; data: { leagues: Pick[] } | null }
      if (!res.ok) throw new Error(payload.message)
      return payload.data
    },
    enabled: ready,
    retry: false,
  })

  if (picks.isError) {
    return (
      <div className="pc-container" style={{ padding: '80px 2px', textAlign: 'center' }}>
        <p style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>아직 공개 전입니다</p>
        <p style={{ marginTop: 10, fontSize: 12.5, color: V3.textFaint }}>
          관리자로 로그인하면 미리 볼 수 있습니다.
        </p>
      </div>
    )
  }

  return (
    <div className="pc-container pb-[var(--section-gap)]">
      <Intro />
      {picks.isLoading ? (
        <p style={{ padding: '40px 2px', fontSize: 12.5, color: V3.textGhost }}>불러오는 중…</p>
      ) : (
        (picks.data?.leagues ?? []).map((pick) => <LeagueShowcase key={pick.league} pick={pick} />)
      )}
      <HowWeMeasure />
      <Closing />
    </div>
  )
}

/* ── 첫 문장 ───────────────────────────────────────────────── */

function Intro() {
  return (
    <header style={{ padding: '38px 2px 26px' }}>
      <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.14em', color: '#9cc0ff' }}>
        SA CLOUD
      </p>
      <h1
        style={{
          marginTop: 12,
          fontSize: 27,
          fontWeight: 800,
          lineHeight: 1.35,
          color: '#fff',
          letterSpacing: '-.02em',
        }}
      >
        여기는 <span style={{ color: '#ffd98a' }}>경기 분석</span>과{' '}
        <span style={{ color: '#ffd98a' }}>선수 분석</span>을 하는 곳입니다.
        <br />
        기록 사이트가 아닙니다.
      </h1>
      <p style={{ marginTop: 16, fontSize: 13.5, lineHeight: 2, color: V3.textMuted }}>
        내 플레이가 어디서 무너지는지, 상대가 매판 똑같이 반복하는 버릇이 무엇인지,
        <br />
        우리 클랜이 어느 구간에서 계속 지고 있는지 —
        <br />
        <b style={{ color: '#fff' }}>그 모든 것을 클라우드에서 받아 보실 수 있습니다.</b>
      </p>
      <p style={{ marginTop: 18, fontSize: 12, lineHeight: 1.9, color: V3.textGhost2 }}>
        아래에 나오는 그래프·표는 예시 그림이 아닙니다.
        <br />
        <b style={{ color: '#9cc0ff' }}>지금 이 리그에서 실제로 뛰고 있는 선수와 클랜</b>의 기록을
        그대로 가져온 것입니다.
      </p>
    </header>
  )
}

/* ── 리그 하나치 ───────────────────────────────────────────── */

function LeagueShowcase({ pick }: { pick: Pick }) {
  return (
    <section style={{ marginTop: 34 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '0 2px 14px' }}>
        <h2 style={{ fontSize: 19, fontWeight: 800, color: '#fff' }}>{pick.label}</h2>
        <span style={{ fontSize: 11.5, color: V3.textGhost2 }}>실제 기록으로 보여 드립니다</span>
      </div>

      {pick.player === null || pick.player_detail === null ? null : (
        <PlayerShowcase
          leagueSlug={pick.league}
          playerId={pick.player.player_id}
          name={pick.player.name}
          games={pick.player.games}
          data={pick.player_detail}
        />
      )}
      {pick.clan === null || pick.clan_detail === null ? null : (
        <ClanShowcase
          leagueSlug={pick.league}
          clanSlug={pick.clan.slug}
          name={pick.clan.name}
          games={pick.clan.games}
          data={pick.clan_detail}
        />
      )}
      {pick.match === null || pick.match_detail === null ? null : (
        <MatchShowcase leagueSlug={pick.league} pick={pick} detail={pick.match_detail} />
      )}
    </section>
  )
}

/* ── 선수 — 육각 + 추이(DAY/누적) ───────────────────────────── */

function PlayerShowcase({
  leagueSlug,
  playerId,
  name,
  games,
  data,
}: {
  leagueSlug: string
  /** ★`Player.id` 다★ — 선수 상세 API 가 그것으로 찾는다 (`aboutPicks.ts` 주석 참조) */
  playerId: string
  name: string
  games: number
  data: LeaguePlayerDetail
}) {
  const [mode, setMode] = useState<'day' | 'cum'>('day')
  /**
   * ⚠ ★소개 페이지도 리그 규칙을 따른다★ (2026-09-14 실측으로 잡았다).
   *   IPL 은 개인 킬데스를 화면에 안 낸다. 그런데 소개 페이지가 추이 그래프에
   *   ★붉은 K/D 선을 그리고 있었다★ — «225킬 174데스» 까지 적혀 있었다.
   *   소개가 규칙을 어기면 그게 제일 눈에 띄는 자리다.
   */
  const showsKd = leagueScreen(leagueSlug).playerColumns.kd

  const axes = strengthAxes(data)
  const today = data.trend.find((d) => d.today) ?? null
  const lastPlayed = [...data.trend].reverse().find((d) => !d.future && d.win + d.lose > 0) ?? null
  const ref = today && today.win + today.lose > 0 ? { d: today, name: '오늘' } : lastPlayed ? { d: lastPlayed, name: lastPlayed.label } : null

  return (
    <Card style={{ marginBottom: 14 }}>
      <CardHead
        title="선수 분석"
        ribbon="#9cc0ff"
        right={
          <span style={{ fontSize: 11, color: V3.textGhost2 }}>
            이 리그에서 가장 많이 뛴 선수 · {games}판
          </span>
        }
      />
      <div style={{ padding: '4px 18px 10px', display: 'flex', alignItems: 'center', gap: 9 }}>
        <MarkCircle clan={data.clan === null ? null : { slug: data.clan.slug, mark: data.clan.mark }} size={26} />
        <Link
          href={`/league/${leagueSlug}/player/${playerId}`}
          style={{ fontSize: 15, fontWeight: 700, color: '#fff', textDecoration: 'none' }}
        >
          {name}
        </Link>
        {data.clan === null ? null : (
          <span style={{ fontSize: 11.5, color: V3.textFaint }}>{data.clan.name}</span>
        )}
      </div>

      <p style={{ padding: '0 18px 8px', fontSize: 11.5, lineHeight: 1.8, color: V3.textMuted }}>
        여섯 축은 <b style={{ color: '#fff' }}>이 선수가 무엇으로 이기는가</b>를 말합니다.
        세이브·싸움·캐리력·선짤·연속킬·소수싸움 — 리그 전체와 견준 자리입니다.
      </p>
      {axes.length === 0 ? null : (
        <div style={{ padding: '4px 10px 14px' }}>
          <Hexagon axes={axes} id={`aboutHex-${playerId}`} />
        </div>
      )}

      <div style={{ borderTop: `1px solid ${V3.divider}` }}>
        <CardHead
          title={showsKd ? '승률 및 킬뎃 추이' : '승률 추이'}
          ribbon={V3.red}
          right={
            <span style={{ display: 'flex', gap: 5 }}>
              {(['day', 'cum'] as const).map((m) => (
                <span
                  key={m}
                  onClick={() => setMode(m)}
                  style={{
                    cursor: 'pointer',
                    padding: '3px 9px',
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 700,
                    color: mode === m ? '#0b1220' : V3.textFaint,
                    background: mode === m ? '#9cc0ff' : 'transparent',
                    border: `1px solid ${mode === m ? '#9cc0ff' : V3.divider}`,
                  }}
                >
                  {m === 'day' ? 'DAY' : '누적'}
                </span>
              ))}
            </span>
          }
        >
          <span style={{ fontSize: 10.5, color: V3.textGhost2 }}>
            DAY 는 그날그날, 누적은 시즌 전체입니다
          </span>
        </CardHead>
        <TrendChartV3
          showsKd={showsKd}
          days={data.trend}
          mode={mode}
          seed={`about-${playerId}`}
          markSlug={data.clan?.slug ?? null}
          winLabel={
            mode === 'day'
              ? ref
                ? `${ref.name} ${ref.d.win}승 ${ref.d.lose}패`
                : '아직 경기 없음'
              : `누적 ${data.win}승 ${data.lose}패`
          }
          kdLabel={
            !showsKd
              ? ''
              : mode === 'day'
                ? ref
                  ? `${ref.name} ${ref.d.kill}킬 ${ref.d.death}데스`
                  : ''
                : data.kill !== null && data.death !== null
                  ? `누적 ${data.kill}킬 ${data.death}데스`
                  : ''
          }
        />
      </div>
    </Card>
  )
}

/* ── 클랜 — 육각 + 상대전적 ────────────────────────────────── */

function ClanShowcase({
  leagueSlug,
  clanSlug,
  name,
  games,
  data,
}: {
  leagueSlug: string
  clanSlug: string
  name: string
  games: number
  data: LeagueClanShow
}) {
  /* 상대전적 — 가장 많이 붙은 상대 하나를 그린다 */
  /* 계약에 `games` 칸은 없다 — 승+패가 판수다 */
  const h2h = [...(data.head_to_head ?? [])]
    .filter((o) => o.win + o.lose > 0)
    .sort((a, b) => b.win + b.lose - (a.win + a.lose))[0]
  const theme = clanThemeOf(data.clan.slug)

  return (
    <Card style={{ marginBottom: 14 }}>
      <CardHead
        title="클랜 분석"
        ribbon="#a6e3c4"
        right={
          <span style={{ fontSize: 11, color: V3.textGhost2 }}>
            이 리그에서 가장 많이 뛴 클랜 · {games}판
          </span>
        }
      />
      <div style={{ padding: '4px 18px 10px', display: 'flex', alignItems: 'center', gap: 9 }}>
        <MarkCircle clan={{ slug: data.clan.slug, mark: data.clan.mark }} size={28} />
        <Link
          href={`/league/${leagueSlug}/clan/${clanSlug}`}
          style={{ fontSize: 15, fontWeight: 700, color: '#fff', textDecoration: 'none' }}
        >
          {name}
        </Link>
      </div>

      <p style={{ padding: '0 18px 8px', fontSize: 11.5, lineHeight: 1.8, color: V3.textMuted }}>
        클랜의 여섯 축은 <b style={{ color: '#fff' }}>이 팀이 어떻게 싸우는가</b>입니다.
        스나싸움·소수싸움·세이브·게임템포·선짤·교환 — 전부 배틀로그를 다시 세어 만든 값입니다.
      </p>
      {data.hexagon_v2 === null ? null : (
        <div style={{ padding: '4px 10px 14px' }}>
          <Hexagon axes={clanHexAxes(data.hexagon_v2)} id={`aboutClanHex-${clanSlug}`} />
        </div>
      )}

      {h2h === undefined ? null : (
        <div style={{ borderTop: `1px solid ${V3.divider}` }}>
          <CardHead title="상대전적" ribbon="#ffd98a">
            <span style={{ fontSize: 10.5, color: V3.textGhost2 }}>
              가장 많이 붙은 상대 — {h2h.clan.name} 와 {h2h.win + h2h.lose}판
            </span>
          </CardHead>
          <div style={{ padding: '0 8px 14px' }}>
            <H2HChartV3
              /* 계약의 `recent` 를 그래프가 아는 모양으로 옮긴다 — 아직 안 끝난 판은 뺀다 */
              games={(h2h.recent ?? [])
                .filter((g): g is typeof g & { won: boolean } => g.won !== null)
                .map((g) => ({ at: g.start_at, won: g.won }))}
              theme={theme}
              oppTheme={clanThemeOf(h2h.clan.slug)}
              mineName={data.clan.name}
              mineSlug={data.clan.slug}
              oppName={h2h.clan.name}
              oppSlug={h2h.clan.slug}
            />
          </div>
        </div>
      )}
    </Card>
  )
}

/* ── 경기 — 라운드가 가장 길었던 한 판 ───────────────────────── */

function MatchShowcase({
  leagueSlug,
  pick,
  detail,
}: {
  leagueSlug: string
  pick: Pick
  detail: MatchDetail
}) {
  const match = pick.match
  if (match === null) return null

  return (
    <Card style={{ marginBottom: 14 }}>
      <CardHead
        title="경기 분석"
        ribbon="#ff8a90"
        right={
          <span style={{ fontSize: 11, color: V3.textGhost2 }}>
            가장 길었던 경기 · {match.rounds}라운드
          </span>
        }
      />
      <p style={{ padding: '4px 18px 10px', fontSize: 11.5, lineHeight: 1.8, color: V3.textMuted }}>
        {match.red} vs {match.blue} — {match.start_at.slice(0, 10)}
        <br />
        한 판을 열면 <b style={{ color: '#fff' }}>누가 어디서 몇 번 죽었는지</b>까지 나옵니다.
        배틀로그를 라운드 단위로 다시 세어 만든 표입니다.
      </p>
      {/* 카테고리는 클랜 구분 표기에만 쓰인다 (D-165). 경기 상세에는 그 칸이 없어 기본값을 쓴다 */}
      <ClanScoreboardV3 detail={detail} leagueCategory="official" leagueSlug={leagueSlug} />
    </Card>
  )
}

/* ── 어떻게 재는가 — 배틀로그가 좌표가 되는 그림 ───────────── */

/**
 * ★배틀로그 분석 방법★ (2026-09-14 사장님:
 * «배틀로그 분석방법 간지나게 우리 페이지에 있는 그 위치정보 픽셀 날라오면서
 *   하는거 더 간지나게 만들어서 설명해줘»).
 *
 * ★선수 상세의 플레이분석 탭과 같은 부품★ 을 그대로 쓴다. 소개용으로 다시 만들면
 * 두 곳이 어긋난다 — 거기 적힌 숫자(268칸 · 2초 · 30분)는 전부 실제 코드에서 온 값이다.
 * 다른 점은 ★폰에서도 보인다★ 는 것뿐이다 (소개 페이지는 설명이 본문이다).
 */
function HowWeMeasure() {
  return (
    <section style={{ marginTop: 34 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '0 2px 14px' }}>
        <h2 style={{ fontSize: 19, fontWeight: 800, color: '#fff' }}>어떻게 재는가</h2>
        <span style={{ fontSize: 11.5, color: V3.textGhost2 }}>배틀로그 한 줄이 좌표가 됩니다</span>
      </div>
      <Card>
        <div style={{ padding: '14px 14px 4px' }}>
          <AnalysisPanelV3 always />
        </div>
      </Card>
    </section>
  )
}

/* ── 마지막 — 어느 리그에 참가하시겠습니까 ─────────────────── */

function Closing() {
  return (
    <section style={{ marginTop: 40, padding: '30px 2px 10px', textAlign: 'center' }}>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: '#fff', letterSpacing: '-.01em' }}>
        어느 리그에 참가하시겠습니까?
      </h2>
      <p style={{ marginTop: 12, fontSize: 12.5, lineHeight: 1.9, color: V3.textFaint }}>
        IPL · SPL · 10mountain — 리그마다 제공하는 기록이 다릅니다.
        <br />
        <b style={{ color: '#9cc0ff' }}>로그인 없이</b> 신청하실 수 있습니다.
      </p>
      <Link
        href="/apply"
        style={{
          display: 'inline-block',
          marginTop: 20,
          padding: '13px 34px',
          borderRadius: 999,
          fontSize: 14,
          fontWeight: 800,
          color: '#0b1220',
          background: '#9cc0ff',
          textDecoration: 'none',
        }}
      >
        참가 신청하러 가기
      </Link>
    </section>
  )
}

/**
 * ⚠ ★지금은 아무도 안 쓴다★ (2026-09-14) — 상세를 한 덩어리로 받게 되면서
 *   칸마다 기다릴 일이 없어졌다. 지우지 않는다 (`CLAUDE.md` 1-4) —
 *   칸을 다시 따로 부르게 되면 이 자리가 필요하다.
 */
export function Loading({ label }: { label: string }) {
  return (
    <Card style={{ marginBottom: 14 }}>
      <p style={{ padding: '22px 18px', fontSize: 12, color: V3.textGhost }}>{label} 불러오는 중…</p>
    </Card>
  )
}
