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
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import type {
  LeagueClanShow,
  LeaguePlayerDetail,
  MatchDetail,
  MatchListItem,
} from '@sacloud/contract'
/* ★킬뎃은 계약이 정한다★ — «킬 ÷ (킬+데스)». 화면에서 다시 계산하지 않는다 (2026-09-14) */
import { kdRateOrNull } from '@sacloud/contract'
import {
  AnalysisPanelV3,
  Card,
  CardHead,
  ClanScoreboardV3,
  H2HChartV3,
  Hexagon,
  MarkCircle,
  MatchListV3,
  TrendChartV3,
  V3,
  clanHexAxes,
  clanThemeOf,
  strengthAxes,
} from '@sacloud/ui'
import { apiGet } from '@/lib/api'
import { useCursorQuery } from '@/lib/useCursorQuery'
import { useApiReady } from '@/app/providers'
import { ABOUT_LEAGUES, IPL_KD_NOTICE, type AboutLeague } from './leagueCopy'

/** 상대전적 마크를 몇 개 보여 주나 (사장님: «클랜마크 5개정도») */
const H2H_COUNT = 5
/** 몇 판 이상 붙은 상대만 — 한두 판으로는 «엎치락뒤치락» 을 말할 수 없다 */
const H2H_MIN_GAMES = 5

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

/**
 * ★클랜 칸을 보여 주지 않는 리그★ (2026-09-14 밤 사장님:
 * «YSL은 클랜 분석 필요없어 클랜별전적도 필요없고»).
 *
 * 클랜 칸 하나에 ★둘이 같이★ 들어 있다 — 상대전적(클랜별 전적)과 여섯 축(클랜 분석).
 * 사장님이 사진 두 장에 각각 X 를 치셨고, 세 번째 「경기 분석」에는 동그라미를 치셨다.
 * 그래서 ★클랜 칸만 통째로 빼고★ 선수 칸과 경기 분석은 그대로 둔다.
 *
 * ⚠ 지우지 않고 ★감춘다★ (`CLAUDE.md` 1-4). 이 목록에서 slug 만 빼면 도로 나온다.
 */
const ABOUT_CLAN_HIDDEN_LEAGUES = new Set(['sanply'])

function Showcase({ pick, league }: { pick: Pick; league: AboutLeague }) {
  const hideClan = ABOUT_CLAN_HIDDEN_LEAGUES.has(league.slug)
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
      {hideClan || pick.clan === null || pick.clan_detail === null ? null : (
        <ClanShowcase
          leagueSlug={pick.league}
          clanSlug={pick.clan.slug}
          name={pick.clan.name}
          games={pick.clan.games}
          data={pick.clan_detail}
          league={league}
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
  /** ★기록을 숫자로 안 적는 리그★ — 그 자리에 «-미제공-» 을 쓴다 (2026-09-14 사장님) */
  const hideRecord = league.slug === 'nolink'

  /* 순위는 선수 머리 카드(`PlayerHeaderV3`)와 ★같은 규칙★ 으로 고른다 — 통합 등수가 먼저다 */
  const hex = data.hex
  const rank = hex?.score_rank_all ?? (hex ? hex.score_rank : data.rank)
  const rankTotal = hex?.score_total_all ?? (hex ? hex.score_total : data.rank_count)
  const winRate = data.win + data.lose === 0 ? null : (data.win / (data.win + data.lose)) * 100
  /*
   * ⚠ ★킬뎃은 «킬 ÷ (킬+데스)» 다★ — «킬 ÷ 데스» 가 아니다 (2026-09-14 저녁 정정).
   *   내가 «킬÷데스» 로 적어서 ★124.7%★ 같은 값이 나왔다.
   *   사장님: «킬뎃 이상해 120프로가 뭐야 55% 이런게 정상인데».
   *   ★계약의 `kdRate` 를 쓴다★ — 랭킹표·선수 상세가 쓰는 그 함수다.
   */
  const kd = kdRateOrNull(data.kill, data.death)

  const axes = strengthAxes(data)
  const today = data.trend.find((d) => d.today) ?? null
  const lastPlayed = [...data.trend].reverse().find((d) => !d.future && d.win + d.lose > 0) ?? null
  const ref =
    today && today.win + today.lose > 0
      ? { d: today, name: '오늘' }
      : lastPlayed
        ? { d: lastPlayed, name: lastPlayed.label }
        : null

  return (
    <Card style={{ marginBottom: 14 }}>
      <CardHead
        /*
         * ★제목에도 닉네임을 적는다★ (2026-09-14 저녁 사장님: «선수닉네임 위 아래 다 써주고»).
         * 그래프 아래에도 있지만, 스크롤로 내려오면 ★누구 기록인지★ 를 위에서 먼저 봐야 한다.
         * 클랜 카드가 «vuvuzela vs 상대» 로 제목을 쓰는 것과 같은 규칙이다.
         */
        title={`선수 분석 — ${name}`}
        ribbon={league.tone}
        right={
          <span style={{ fontSize: 11, color: V3.textGhost2 }}>
            {data.clan === null ? '무소속' : data.clan.name} · {games}판
          </span>
        }
      />
      {/* ⚠ 이름 줄은 ★육각형 위★ 로 옮겼다 (2026-09-14 저녁 사장님이 빨간 화살표로 그 자리를 가리키셨다) */}

      {/*
        ★한 가로 카드 안에 그래프(왼쪽) + 육각형(오른쪽)★ (2026-09-14 저녁 사장님이
        사진에 직접 그려 주셨다 — 숫자 카드에 X, 육각형에 «오른쪽으로» 화살표).
        폰은 위아래로 내려간다.

        ⚠ 승률·킬뎃을 따로 안 적는다 — ★그래프가 이미 끝에 적어 준다★ («56.5% / 56.4%»).
          두 번 적으면 그게 사장님이 X 치신 공간낭비다.
      */}
      <div className="about-record">
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '0 2px 6px',
              flexWrap: 'wrap',
            }}
          >
            <span style={{ fontSize: 12.5, fontWeight: 800, color: '#fff' }}>승률 및 킬뎃 추이</span>
            <span style={{ fontSize: 10.5, color: V3.textGhost2 }}>
              DAY 는 그날그날, 누적은 시즌 전체입니다
            </span>
            <span style={{ flex: 1 }} />
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
          </div>
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
            /*
             * ★K/D 마커 오른쪽에 «제공하지 않습니다» 를 적는다★ (2026-09-14 저녁 사장님이
             *   빨간 펜으로 그 자리를 찍어 주셨다).
             *
             * ⚠ 킬데스 ★숫자★ 를 그 자리에 그대로 두면 안 된다 — IPL 은 «킬데스 미제공» 인데
             *   «225킬 174데스» 가 찍혀 있었다. 안내로 ★갈아 끼운다.★
             *   선과 비율(56.4%)은 남긴다 — 사장님: «킬뎃 승률 다 그래프로 보여주는데».
             */
            kdLabel={
              kdNotice !== null
                ? 'K/D 는 제공하지 않습니다'
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

        {/*
          ★그래프 판 위 오른쪽 빈 자리에 얹는다★ (2026-09-14 저녁 사장님).
          «닉네임 순위 킬뎃 승률 그런정도 오른쪽에 6각 그래프 위에 잘 보이게 배치해줘
            (★ipl도 형식은 똑같은데 킬뎃 승률 그쪽에 기록 쓰지말고 걍 -미제공- 이렇게 써놔★)»
        */}
        <div className="about-hexover">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 2px 6px', minWidth: 0 }}>
            <MarkCircle
              clan={data.clan === null ? null : { slug: data.clan.slug, mark: data.clan.mark }}
              size={24}
            />
            <Link prefetch={false}
              href={`/league/${leagueSlug}/player/${playerId}`}
              style={{
                fontSize: 15,
                fontWeight: 800,
                color: '#fff',
                textDecoration: 'none',
                pointerEvents: 'auto',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {name}
            </Link>
            {data.clan === null ? null : (
              <span
                style={{
                  fontSize: 11,
                  color: V3.textFaint,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {data.clan.name}
              </span>
            )}
          </div>
          <HeadStats
            rank={rank}
            rankTotal={rankTotal}
            winRate={hideRecord ? null : winRate}
            kd={hideRecord ? null : kd}
            hidden={hideRecord}
          />
          {axes.length === 0 ? null : <Hexagon axes={axes} id={`aboutHex-${playerId}`} />}
        </div>
      </div>
      <p style={{ padding: '0 16px 8px', fontSize: 11.5, lineHeight: 1.8, color: V3.textMuted }}>
        여섯 축은 <b style={{ color: '#fff' }}>이 선수가 무엇으로 이기는가</b>를 말합니다.
      </p>

      {/* ④ K/D 안내 — 그래프 바로 밑 (2026-09-14 사장님: «K/D 원마크 멈출때 오른쪽에 써놔») */}
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
    </Card>
  )
}

/**
 * ⚠ ★지금은 아무도 안 쓴다★ (2026-09-14 저녁) — 육각형 옆에 승률·킬뎃·판수를
 *   적던 옛 방식의 부품이다. 사장님이 사진에 ★X★ 를 치시고 그 자리를 그래프에
 *   내주라고 하셨다 (숫자는 그래프가 이미 끝에 적어 준다).
 *   지우지 않는다 (`CLAUDE.md` 1-4) — `.about-hexside` 와 짝이고, 되돌릴 때 쓴다.
 */
export function SideStat({
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

/**
 * ★육각형 위에 붙는 한 줄★ — 순위 · 승률 · 킬뎃 (2026-09-14 저녁 사장님).
 *
 * ⚠ ★IPL 은 숫자를 안 적는다★ — «킬뎃 승률 그쪽에 기록 쓰지말고 걍 -미제공- 이렇게 써놔».
 *   칸을 없애지 않고 ★자리는 그대로 두고 글자만 바꾼다★ — 형식이 같아야 리그를 견줄 수 있다.
 *   순위는 IPL 도 적는다 (사장님: «개인랭킹도 은글슬쩍 유지해»).
 */
function HeadStats({
  rank,
  rankTotal,
  winRate,
  kd,
  hidden,
  showKd = true,
}: {
  rank: number | null
  rankTotal: number | null
  winRate: number | null
  kd: number | null
  hidden: boolean
  /** 클랜은 킬뎃 칸이 아예 없다 — 계약에 그 값이 없다 (2026-09-14) */
  showKd?: boolean
}) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 14,
        flexWrap: 'wrap',
        padding: '0 2px 8px',
        alignItems: 'baseline',
      }}
    >
      <HeadStat
        label="순위"
        value={rank === null ? '—' : `${rank}위`}
        sub={rankTotal === null ? '' : `/ ${rankTotal.toLocaleString()}명`}
        tone="#ffd98a"
      />
      <HeadStat
        label="승률"
        value={hidden ? '-미제공-' : winRate === null ? '—' : `${winRate.toFixed(1)}%`}
        sub=""
        tone={hidden ? V3.textGhost2 : '#7fa9ff'}
        muted={hidden}
      />
      {!showKd ? null : (
        <HeadStat
          label="킬뎃"
          value={hidden ? '-미제공-' : kd === null ? '—' : `${kd.toFixed(1)}%`}
          sub=""
          tone={hidden ? V3.textGhost2 : '#ff8a90'}
          muted={hidden}
        />
      )}
    </div>
  )
}

function HeadStat({
  label,
  value,
  sub,
  tone,
  muted = false,
}: {
  label: string
  value: string
  sub: string
  tone: string
  muted?: boolean
}) {
  return (
    <span style={{ display: 'flex', alignItems: 'baseline', gap: 5, minWidth: 0 }}>
      <span style={{ fontSize: 10.5, color: V3.textFaint }}>{label}</span>
      <span
        style={{
          fontSize: muted ? 12 : 15,
          fontWeight: muted ? 600 : 800,
          color: tone,
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </span>
      {sub === '' ? null : (
        <span style={{ fontSize: 10, color: V3.textGhost2, whiteSpace: 'nowrap' }}>{sub}</span>
      )}
    </span>
  )
}

/* ── 클랜 — 육각 + 상대전적 ────────────────────────────────── */

function ClanShowcase({
  leagueSlug,
  clanSlug,
  name,
  games,
  data,
  league,
}: {
  leagueSlug: string
  clanSlug: string
  name: string
  games: number
  data: LeagueClanShow
  league: AboutLeague
}) {
  /**
   * ★많이 붙고 + 엎치락뒤치락한 상대 다섯★ (2026-09-14 저녁 사장님:
   * «부젤이랑 가장많이 하고 가장많이 엎치락뒷치락 한 클랜마크 5개정도 주고
   *   누르면 그래프로 승률 추이 보여줘(기본으로 클랜 하나 골라서 펼쳐놔)»).
   *
   * ── 「엎치락뒤치락」 을 어떻게 쟀나
   *   ★승률이 50% 에 얼마나 가까운가★ 다. 판수가 아무리 많아도 한쪽이 계속 이겼으면
   *   그건 엎치락뒤치락이 아니다 (실측: vuvuzela 는 igloo 와 249판을 붙었지만 36% —
   *   많이 붙은 상대이긴 해도 «엎치락뒤치락» 은 아니다).
   *
   *   ```
   *   점수 = 판수 비중 × 0.55 + (50% 에 가까운 정도) × 0.45
   *   ```
   *   판수가 조금 더 무겁다 — «가장 많이 하고» 를 먼저 적으셨다.
   *   실측으로 나온 vuvuzela 의 다섯: evermore 274판 49% · amaryllis 229판 53% ·
   *   hardcores 255판 46% · methodcrew 176판 48% · deluxe 125판 49%
   */
  const h2hList = useMemo(() => {
    const rows = [...(data.head_to_head ?? [])].filter((o) => o.win + o.lose >= H2H_MIN_GAMES)
    if (rows.length === 0) return []
    const maxGames = Math.max(...rows.map((o) => o.win + o.lose))
    return rows
      .map((o) => {
        const games = o.win + o.lose
        const winRate = (o.win / games) * 100
        /* 50% 에서 멀수록 0에 가까워진다 */
        const even = 1 - Math.min(1, Math.abs(winRate - 50) / 50)
        return { o, games, winRate, score: (games / maxGames) * 0.55 + even * 0.45 }
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, H2H_COUNT)
  }, [data.head_to_head])

  /* ★기본으로 하나는 펼쳐 둔다★ (사장님) — 가장 앞선 상대다 */
  const [oppSlug, setOppSlug] = useState<string | null>(null)
  const opp = useMemo(
    () => h2hList.find((x) => x.o.clan.slug === oppSlug) ?? h2hList[0] ?? null,
    [h2hList, oppSlug],
  )
  const h2h = opp?.o
  const theme = clanThemeOf(data.clan.slug)
  /** ★기록을 숫자로 안 적는 리그★ — 그 자리에 «-미제공-» 을 쓴다 (2026-09-14 사장님) */
  const hideRecord = league.slug === 'nolink'
  const winRate = data.win + data.lose === 0 ? null : (data.win / (data.win + data.lose)) * 100
  /* ⚠ 클랜 상세에는 ★킬뎃 칸이 없다★ (계약 실측) — 선수와 달리 클랜은 킬/데스를 안 싣는다.
     그래서 킬뎃 자리를 아예 안 그린다 (`kd={null}` + `showKd={false}`).
     없는 값을 «—» 로 그리면 «잴 수 있는데 비었다» 로 읽힌다 (D-106) */

  return (
    <Card style={{ marginBottom: 14 }}>
      <CardHead
        /*
         * ★제목에 고른 상대를 넣는다★ (2026-09-14 저녁 사장님이 사진에 빨간 펜으로
         * 그 자리를 가리키시며 «vuvuzela vs ooo 해서 누르면 거기에 누른 클랜명 넣어주고»).
         * 상대를 바꾸면 제목도 같이 바뀐다 — 지금 무엇을 보고 있는지가 제목에 있다.
         */
        title={h2h === undefined || h2h === null ? '클랜 분석' : `${name} vs ${h2h.clan.name}`}
        ribbon="#a6e3c4"
        right={
          <span style={{ fontSize: 11, color: V3.textGhost2 }}>
            이 리그에서 가장 많이 뛴 클랜 · {games}판
          </span>
        }
      />
      {/* ⚠ 이름 줄은 ★육각형 위★ 로 옮겼다 — 선수 카드와 같은 형식이다 (2026-09-14 저녁) */}

      {/*
        ★상대전적(왼쪽) + 육각형(오른쪽)★ — 선수 카드와 같은 규칙이다
        (2026-09-14 사장님: «개인, 클랜 기록 전부 이렇게 보여줘 (…) 그래프 왼쪽 / 육각형 오른쪽»).
        폰은 위아래로 내려간다.
      */}
      <div className="about-record">
        <div style={{ minWidth: 0 }}>
          {h2h === undefined || h2h === null || opp === null ? (
            <p style={{ padding: '18px 2px', fontSize: 11.5, color: V3.textGhost2 }}>
              아직 맞붙은 기록이 없습니다
            </p>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, padding: '0 2px 6px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: '#fff' }}>상대전적</span>
                <span style={{ fontSize: 10.5, color: V3.textGhost2 }}>
                  많이 붙고 엎치락뒤치락한 상대 — 눌러서 바꿔 보세요
                </span>
              </div>

              {/* ★마크 다섯★ — 누르면 그 상대의 승률 추이로 바뀐다 */}
              <div style={{ display: 'flex', gap: 8, padding: '0 2px 10px', flexWrap: 'wrap' }}>
                {h2hList.map((x) => {
                  const on = x.o.clan.slug === h2h.clan.slug
                  return (
                    <button
                      key={x.o.clan.slug}
                      type="button"
                      onClick={() => setOppSlug(x.o.clan.slug)}
                      title={`${x.o.clan.name} · ${x.games}판 · ${x.winRate.toFixed(0)}%`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        cursor: 'pointer',
                        padding: '5px 10px 5px 6px',
                        borderRadius: 999,
                        background: on ? 'rgba(255,217,138,.10)' : 'rgba(10,17,30,.5)',
                        border: `1px solid ${on ? '#ffd98a' : V3.divider}`,
                        minWidth: 0,
                      }}
                    >
                      <MarkCircle
                        clan={{
                          slug: x.o.clan.slug,
                          mark: { bg: x.o.clan.mark_bg_url, front: x.o.clan.mark_front_url },
                        }}
                        size={20}
                      />
                      <span
                        style={{
                          fontSize: 11.5,
                          fontWeight: on ? 800 : 600,
                          color: on ? '#ffd98a' : V3.textMuted,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {x.o.clan.name}
                      </span>
                      <span style={{ fontSize: 10, color: V3.textGhost2, whiteSpace: 'nowrap' }}>
                        {x.games}판 {x.winRate.toFixed(0)}%
                      </span>
                    </button>
                  )
                })}
              </div>
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
            </>
          )}
        </div>

        {/* ★그래프 판 위 오른쪽 빈 자리에 얹는다★ — 선수 카드와 같은 형식 (2026-09-14 저녁) */}
        <div className="about-hexover">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 2px 6px', minWidth: 0 }}>
            <MarkCircle clan={{ slug: data.clan.slug, mark: data.clan.mark }} size={24} />
            <Link prefetch={false}
              href={`/league/${leagueSlug}/clan/${clanSlug}`}
              style={{
                fontSize: 15,
                fontWeight: 800,
                color: '#fff',
                textDecoration: 'none',
                pointerEvents: 'auto',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {name}
            </Link>
          </div>
          <HeadStats
            rank={data.rank}
            rankTotal={data.rank_count}
            winRate={hideRecord ? null : winRate}
            kd={null}
            hidden={hideRecord}
            showKd={false}
          />
          {data.hexagon_v2 === null ? null : (
            <Hexagon axes={clanHexAxes(data.hexagon_v2)} id={`aboutClanHex-${clanSlug}`} />
          )}
        </div>
      </div>
      <p style={{ padding: '0 16px 8px', fontSize: 11.5, lineHeight: 1.8, color: V3.textMuted }}>
        클랜의 여섯 축은 <b style={{ color: '#fff' }}>이 팀이 어떻게 싸우는가</b>입니다.
      </p>

      {/*
        ★고른 상대와의 경기 모음★ (2026-09-14 저녁 사장님:
        «vs methodcrew 경기모음 (경기카드 하나만 나와있고 상세보기 누르면 경기 분석
          버튼 누를 수 있음 그리고 더 불러오기 누르면 9/3이후 모든 경기 카드 나옴)»).

        ★경기 목록 부품을 그대로 쓴다★ (`MatchListV3`) — 경기 화면과 같은 카드이고,
        펼치면 같은 스코어보드가 나오고 «경기분석» 단추도 그 안에 있다.
        소개용으로 다시 만들면 두 곳이 어긋난다.
      */}
      {h2h === undefined || h2h === null ? null : (
        <div style={{ borderTop: `1px solid ${V3.divider}`, padding: '12px 14px 4px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: '#fff' }}>
              vs {h2h.clan.name} 경기모음
            </span>
            <span style={{ fontSize: 10.5, color: V3.textGhost2 }}>
              카드를 누르면 펼쳐집니다 · 더 불러오면 이 시즌 전부가 나옵니다
            </span>
          </div>
          <VsMatches
            leagueSlug={leagueSlug}
            leagueClanId={data.id}
            leagueCategory={data.league.category}
            opponentLeagueClanId={h2h.league_clan_id}
          />
        </div>
      )}
    </Card>
  )
}

/* ── 고른 상대와의 경기 모음 ─────────────────────────────────── */

/**
 * ★처음에는 한 판만 보여 준다★ (사장님: «경기카드 하나만 나와있고 (…)
 * 더 불러오기 누르면 9/3이후 모든 경기 카드 나옴»).
 *
 * 소개 페이지는 ★맛보기★ 자리라 목록이 길면 읽는 흐름이 끊긴다.
 * 더 보고 싶은 사람만 펼친다.
 */
function VsMatches({
  leagueSlug,
  leagueClanId,
  leagueCategory,
  opponentLeagueClanId,
}: {
  leagueSlug: string
  leagueClanId: string
  leagueCategory: string
  opponentLeagueClanId: string
}) {
  const [expanded, setExpanded] = useState<Record<string, MatchDetail>>({})
  /** 접혀 있는 동안은 한 장만 */
  const [showAll, setShowAll] = useState(false)

  const vs = useCursorQuery<MatchListItem>(
    'leagueClanMatches',
    ['about', 'clan', leagueClanId, 'vs', opponentLeagueClanId],
    { params: { leagueClanId }, search: { opponent: opponentLeagueClanId } },
    leagueClanId !== '' && opponentLeagueClanId !== '',
  )

  /* 상대를 바꾸면 펼친 것을 접는다 — 다른 상대의 펼침이 남으면 헷갈린다 */
  useEffect(() => {
    setExpanded({})
    setShowAll(false)
  }, [opponentLeagueClanId])

  const shown = showAll ? vs.items : vs.items.slice(0, 1)

  async function onExpand(match: MatchListItem) {
    if (expanded[match.id] !== undefined) return
    const res = await apiGet('matchShow', {
      params: { leagueId: leagueSlug, matchId: match.id },
    })
    setExpanded((prev) => ({ ...prev, [match.id]: res.data as MatchDetail }))
  }

  return (
    <MatchListV3
      leagueSlug={leagueSlug}
      leagueCategory={leagueCategory}
      matches={shown}
      matchesLoading={vs.loading}
      /* 접혀 있으면 «더 불러오기» 가 곧 «전부 보기» 다 */
      hasMore={showAll ? vs.hasMore : vs.items.length > 1 || vs.hasMore}
      loadingMore={vs.loadingMore}
      onLoadMore={() => {
        if (!showAll) {
          setShowAll(true)
          return
        }
        vs.loadMore()
      }}
      expanded={expanded}
      onExpand={(m) => void onExpand(m)}
    />
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
      <Link prefetch={false}
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
