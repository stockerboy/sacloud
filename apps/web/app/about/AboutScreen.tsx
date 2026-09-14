'use client'

/**
 * ★사이트 소개★ (2026-09-14 사장님).
 *
 *   «우리는 ★경기분석 및 선수분석 페이지이다 기록사이트가 아님★ 을 알려드립니다»
 *   «그 모든 그래프 진짜 있는 선수로 한명씩 다 (…) 6각 , day 누적 전부 다 보여줘.
 *     클랜 상대전적도 보여주고 (…) 마지막에 어느 리그에 참가하시겠습니까»
 *
 * ── 2026-09-14 저녁, 사장님이 화면을 보시고 주신 지적 다섯 (전부 반영했다)
 *   ```
 *   ① PC 공간낭비      육각형 오른쪽이 텅 비었다 → ★승률·킬뎃을 그 자리로★
 *   ② 리그 탭          «위 상단에 세개를 두고 클릭해서 화면전환» · 차례 IPL → LLM → YSL
 *   ③ 제공/미제공      «왼쪽오른쪽(피씨) 모바일은 위쪽 아래쪽 으로 구분해서 확실하게»
 *   ④ IPL 그래프       킬뎃도 보여 주되 ★K/D 마커 오른쪽에 안내문★
 *   ⑤ 리그 이름        SPL → ★LLM(Limitless Leagues Matches)★ · 10🏔 → ★YSL★
 *   ```
 *
 * ── ★꾸민 값이 아니다. 살아 있는 화면을 그대로 가져온다★
 *   육각형·추이·상대전적·경기분석표가 전부 ★실제 화면이 쓰는 그 부품★ 이고
 *   ★실제 API 가 만드는 그 값★ 이다. 소개용 숫자를 따로 짓지 않는다.
 *
 * ── ⚠ ④ 는 실제 리그 화면과 ★일부러 다르다★
 *   `/league/nolink/…` 에서는 지금도 K/D 선이 안 나간다. 여기는 «무엇이 빠지는가» 를
 *   보여 주는 자리라 그림을 띄우고 그 옆에 안내를 적는다. 두 곳이 다른 것이 맞다.
 *
 * ── 지금은 관리자만 본다
 *   자물쇠는 `lib/aboutGate.ts` 의 `ABOUT_PUBLIC` 한 줄이다.
 */
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import type { LeagueClanShow, LeaguePlayerDetail, MatchDetail } from '@sacloud/contract'
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
import { useApiReady } from '@/app/providers'
import { ABOUT_LEAGUES, IPL_KD_NOTICE, type AboutLeague } from './leagueCopy'

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
  const [slug, setSlug] = useState<string>(ABOUT_LEAGUES[0]?.slug ?? 'nolink')

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

  const league = useMemo(
    () => ABOUT_LEAGUES.find((l) => l.slug === slug) ?? ABOUT_LEAGUES[0],
    [slug],
  )
  const pick = useMemo(
    () => (picks.data?.leagues ?? []).find((p) => p.league === slug) ?? null,
    [picks.data, slug],
  )

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
  if (league === undefined) return null

  return (
    <div className="pc-container pb-[var(--section-gap)]">
      <Intro />

      {/* ② 리그 탭 — 누르면 그 리그만 보인다 */}
      <LeagueTabs slug={slug} onPick={setSlug} />

      <LeagueIntro league={league} />

      {/* ③ 제공 / 미제공 — PC 는 좌우, 폰은 위아래 */}
      <GivesAndLacks league={league} />

      {picks.isLoading ? (
        <p style={{ padding: '40px 2px', fontSize: 12.5, color: V3.textGhost }}>
          실제 기록을 불러오는 중입니다…
        </p>
      ) : pick === null ? null : (
        <Showcase pick={pick} league={league} />
      )}

      <HowWeMeasure />
      <Closing />
    </div>
  )
}

/* ── 첫 문장 ───────────────────────────────────────────────── */

function Intro() {
  return (
    <header style={{ padding: '38px 2px 24px' }}>
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
    </header>
  )
}

/* ── ② 리그 탭 ─────────────────────────────────────────────── */

function LeagueTabs({ slug, onPick }: { slug: string; onPick: (s: string) => void }) {
  return (
    <div
      style={{
        position: 'sticky',
        top: 'var(--spacing-nav, 0px)',
        zIndex: 5,
        display: 'grid',
        gridTemplateColumns: `repeat(${ABOUT_LEAGUES.length}, minmax(0,1fr))`,
        gap: 6,
        padding: '8px 0 14px',
        background: 'linear-gradient(180deg, rgba(7,13,28,.96) 70%, rgba(7,13,28,0))',
      }}
    >
      {ABOUT_LEAGUES.map((l) => {
        const on = l.slug === slug
        return (
          <button
            key={l.slug}
            type="button"
            onClick={() => onPick(l.slug)}
            style={{
              cursor: 'pointer',
              padding: '10px 6px 9px',
              borderRadius: 10,
              background: on ? 'rgba(156,192,255,.10)' : 'rgba(16,26,44,.62)',
              border: `1px solid ${on ? l.tone : V3.divider}`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 3,
              minWidth: 0,
            }}
          >
            <span style={{ fontSize: 16, fontWeight: 800, color: on ? l.tone : V3.textMuted }}>
              {l.tab}
            </span>
            <span
              style={{
                fontSize: 10.5,
                color: on ? V3.textFaint : V3.textGhost2,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '100%',
              }}
            >
              {l.sub}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function LeagueIntro({ league }: { league: AboutLeague }) {
  return (
    <section style={{ padding: '4px 2px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: league.tone, letterSpacing: '-.01em' }}>
          {league.tab}
        </h2>
        {league.full === null ? null : (
          <span style={{ fontSize: 11.5, color: V3.textGhost2, letterSpacing: '.02em' }}>
            {league.full}
          </span>
        )}
      </div>
      {league.body.map((line) => (
        <p key={line} style={{ marginTop: 10, fontSize: 12.5, lineHeight: 1.9, color: V3.textMuted }}>
          {line}
        </p>
      ))}
    </section>
  )
}

/* ── ③ 제공 / 미제공 ────────────────────────────────────────── */

/**
 * 사장님: «제공되는것 안되는것을 ★왼쪽오른쪽(피씨) 모바일은 위쪽 아래쪽★ 으로
 * 구분해서 확실하게 알려줘».
 *
 * `auto-fit` 같은 눈치 보는 격자를 쓰지 않는다 — ★칸 수가 화면 폭에 따라 달라지면★
 * «왼쪽·오른쪽» 이라는 약속이 깨진다. 폰은 한 줄, PC 는 두 줄로 ★못 박는다.★
 */
function GivesAndLacks({ league }: { league: AboutLeague }) {
  return (
    <section className="about-split" style={{ marginBottom: 22 }}>
      <Panel
        title="제공합니다"
        mark="✓"
        tone="#7ee0a8"
        items={league.gives}
        edge="rgba(126,224,168,.42)"
      />
      <Panel
        title="제공하지 않습니다"
        mark="✕"
        tone="#ff8a90"
        items={league.lacks}
        edge="rgba(255,138,144,.42)"
        empty="없습니다 — 모든 기록을 제공합니다"
      />
    </section>
  )
}

function Panel({
  title,
  mark,
  tone,
  items,
  edge,
  empty,
}: {
  title: string
  mark: string
  tone: string
  items: readonly string[]
  edge: string
  empty?: string
}) {
  return (
    <div
      style={{
        borderRadius: 12,
        border: `1px solid ${edge}`,
        background: 'rgba(16,26,44,.62)',
        padding: '14px 16px 15px',
        minWidth: 0,
      }}
    >
      <p style={{ fontSize: 12.5, fontWeight: 800, color: tone, marginBottom: 10 }}>{title}</p>
      {items.length === 0 ? (
        <p style={{ fontSize: 11.5, lineHeight: 1.7, color: V3.textGhost2 }}>{empty ?? '—'}</p>
      ) : (
        <ul style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {items.map((it) => (
            <li key={it} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', minWidth: 0 }}>
              <span style={{ flex: 'none', fontSize: 11, fontWeight: 800, color: tone, lineHeight: 1.6 }}>
                {mark}
              </span>
              <span style={{ fontSize: 12, lineHeight: 1.6, color: V3.textMuted }}>{it}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* ── 실제 기록 ─────────────────────────────────────────────── */

function Showcase({ pick, league }: { pick: Pick; league: AboutLeague }) {
  return (
    <section>
      <p style={{ padding: '0 2px 12px', fontSize: 11.5, lineHeight: 1.8, color: V3.textGhost2 }}>
        아래 그래프·표는 예시 그림이 아닙니다.
        <br />
        <b style={{ color: '#9cc0ff' }}>지금 이 리그에서 실제로 뛰고 있는 선수와 클랜</b>의 기록을
        그대로 가져온 것입니다.
      </p>

      {pick.player === null || pick.player_detail === null ? null : (
        <PlayerShowcase
          leagueSlug={pick.league}
          playerId={pick.player.player_id}
          name={pick.player.name}
          games={pick.player.games}
          data={pick.player_detail}
          league={league}
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

/* ── 선수 — 육각(왼쪽) + 그날 숫자(오른쪽) ────────────────────── */

function PlayerShowcase({
  leagueSlug,
  playerId,
  name,
  games,
  data,
  league,
}: {
  leagueSlug: string
  /** ★`Player.id` 다★ — 선수 상세 API 가 그것으로 찾는다 (`aboutPicks.ts` 주석 참조) */
  playerId: string
  name: string
  games: number
  data: LeaguePlayerDetail
  league: AboutLeague
}) {
  const [mode, setMode] = useState<'day' | 'cum'>('day')

  /**
   * ★소개 페이지에서는 킬뎃 그래프를 ★언제나★ 보여 준다★ (2026-09-14 사장님:
   * «IPL (…) 킬뎃 승률 다 그래프로 보여주는데 마지막에 K/D 원마크 멈출때 오른쪽에 써놔»).
   * 대신 IPL 에는 안내문이 붙는다 — 아래 `kdNotice`.
   */
  const kdNotice = league.slug === 'nolink' ? IPL_KD_NOTICE : null

  const axes = strengthAxes(data)
  const today = data.trend.find((d) => d.today) ?? null
  const lastPlayed = [...data.trend].reverse().find((d) => !d.future && d.win + d.lose > 0) ?? null
  const ref =
    today && today.win + today.lose > 0
      ? { d: today, name: '오늘' }
      : lastPlayed
        ? { d: lastPlayed, name: lastPlayed.label }
        : null

  const winRate = data.win + data.lose === 0 ? null : (data.win / (data.win + data.lose)) * 100
  const kd = data.kill !== null && data.death !== null && data.death > 0 ? (data.kill / data.death) * 100 : null

  return (
    <Card style={{ marginBottom: 14 }}>
      <CardHead
        title="선수 분석"
        ribbon={league.tone}
        right={
          <span style={{ fontSize: 11, color: V3.textGhost2 }}>
            이 리그에서 가장 많이 뛴 선수 · {games}판
          </span>
        }
      />
      <div style={{ padding: '4px 18px 10px', display: 'flex', alignItems: 'center', gap: 9 }}>
        <MarkCircle
          clan={data.clan === null ? null : { slug: data.clan.slug, mark: data.clan.mark }}
          size={26}
        />
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

      {/* ① PC 는 육각형 왼쪽 · 숫자 오른쪽. 폰은 위아래 */}
      <div className="about-hexrow">
        <div style={{ minWidth: 0 }}>
          <p style={{ padding: '0 4px 6px', fontSize: 11.5, lineHeight: 1.8, color: V3.textMuted }}>
            여섯 축은 <b style={{ color: '#fff' }}>이 선수가 무엇으로 이기는가</b>를 말합니다.
          </p>
          {axes.length === 0 ? null : <Hexagon axes={axes} id={`aboutHex-${playerId}`} />}
        </div>

        <div className="about-hexside">
          <SideStat label="승률" value={winRate === null ? '—' : `${winRate.toFixed(1)}%`} sub={`${data.win}승 ${data.lose}패`} tone="#7fa9ff" />
          <SideStat label="킬뎃" value={kd === null ? '—' : `${kd.toFixed(1)}%`} sub={data.kill === null || data.death === null ? '' : `${data.kill}킬 ${data.death}데스`} tone="#ff8a90" />
          <SideStat label="판수" value={`${games}판`} sub="이 시즌" tone={V3.textMuted} />
          {kdNotice === null ? null : (
            <p
              style={{
                marginTop: 4,
                fontSize: 10.5,
                lineHeight: 1.7,
                color: '#ffb9bd',
                background: 'rgba(255,138,144,.08)',
                border: '1px solid rgba(255,138,144,.32)',
                borderRadius: 8,
                padding: '9px 11px',
              }}
            >
              {kdNotice}
            </p>
          )}
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${V3.divider}` }}>
        <CardHead
          title="승률 및 킬뎃 추이"
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
            mode === 'day'
              ? ref
                ? `${ref.name} ${ref.d.kill}킬 ${ref.d.death}데스`
                : ''
              : data.kill !== null && data.death !== null
                ? `누적 ${data.kill}킬 ${data.death}데스`
                : ''
          }
        />
        {/* ④ K/D 마커 오른쪽 안내 — 그래프 바로 밑에 이어 붙인다 */}
        {kdNotice === null ? null : (
          <p
            style={{
              margin: '0 14px 14px',
              fontSize: 11,
              lineHeight: 1.75,
              color: '#ffb9bd',
              background: 'rgba(255,138,144,.08)',
              border: '1px solid rgba(255,138,144,.32)',
              borderRadius: 8,
              padding: '10px 12px',
            }}
          >
            <b style={{ color: '#ff8a90' }}>K/D</b> — {kdNotice}
          </p>
        )}
      </div>
    </Card>
  )
}

function SideStat({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
  sub: string
  tone: string
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 10,
        padding: '10px 12px',
        borderRadius: 10,
        background: 'rgba(10,17,30,.5)',
        border: `1px solid ${V3.divider}`,
        minWidth: 0,
      }}
    >
      <span style={{ flex: 'none', fontSize: 11, fontWeight: 700, color: V3.textFaint, width: 32 }}>
        {label}
      </span>
      <span style={{ fontSize: 19, fontWeight: 800, color: tone, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </span>
      <span style={{ flex: 1 }} />
      <span style={{ fontSize: 10.5, color: V3.textGhost2, whiteSpace: 'nowrap' }}>{sub}</span>
    </div>
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
  /* 계약에 `games` 칸은 없다 — 승+패가 판수다 */
  const h2h = [...(data.head_to_head ?? [])]
    .filter((o) => o.win + o.lose > 0)
    .sort((a, b) => b.win + b.lose - (a.win + a.lose))[0]
  const theme = clanThemeOf(data.clan.slug)
  const winRate = data.win + data.lose === 0 ? null : (data.win / (data.win + data.lose)) * 100

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

      <div className="about-hexrow">
        <div style={{ minWidth: 0 }}>
          <p style={{ padding: '0 4px 6px', fontSize: 11.5, lineHeight: 1.8, color: V3.textMuted }}>
            클랜의 여섯 축은 <b style={{ color: '#fff' }}>이 팀이 어떻게 싸우는가</b>입니다.
          </p>
          {data.hexagon_v2 === null ? null : (
            <Hexagon axes={clanHexAxes(data.hexagon_v2)} id={`aboutClanHex-${clanSlug}`} />
          )}
        </div>
        <div className="about-hexside">
          <SideStat
            label="승률"
            value={winRate === null ? '—' : `${winRate.toFixed(1)}%`}
            sub={`${data.win}승 ${data.lose}패`}
            tone="#7fa9ff"
          />
          <SideStat label="판수" value={`${games}판`} sub="이 시즌" tone={V3.textMuted} />
          <p style={{ fontSize: 10.5, lineHeight: 1.8, color: V3.textGhost2, padding: '2px 2px 0' }}>
            스나싸움 · 소수싸움 · 세이브 · 게임템포 · 선짤 · 교환 — 전부 배틀로그를 다시 세어 만든
            값입니다.
          </p>
        </div>
      </div>

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
        <br />한 판을 열면 <b style={{ color: '#fff' }}>누가 어디서 몇 번 죽었는지</b>까지 나옵니다.
      </p>
      {/* 카테고리는 클랜 구분 표기에만 쓰인다 (D-165). 경기 상세에는 그 칸이 없어 기본값을 쓴다 */}
      <ClanScoreboardV3 detail={detail} leagueCategory="official" leagueSlug={leagueSlug} />
    </Card>
  )
}

/* ── 어떻게 재는가 ─────────────────────────────────────────── */

/**
 * ★배틀로그 분석 방법★ (2026-09-14 사장님: «배틀로그 분석방법 간지나게 (…)
 * 픽셀 날라오면서 하는거 더 간지나게 만들어서 설명해줘»).
 *
 * ★선수 상세의 플레이분석 탭과 같은 부품★ 이다 — 거기 적힌 숫자(268칸 · 2초 · 30분)는
 * 전부 실제 코드에서 온 값이라 소개용으로 다시 만들면 어긋난다.
 * 다른 점은 ★폰에서도 보인다★ 는 것뿐이다.
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
        {ABOUT_LEAGUES.map((l) => l.tab).join(' · ')} — 리그마다 제공하는 기록이 다릅니다.
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
