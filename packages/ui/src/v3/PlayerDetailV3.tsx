'use client'

/**
 * ★선수 상세 v3 본문★ (2026-09-10 · 사장님 시안 `PlayerDetailV3.tsx` 를 실데이터로)
 *
 *   ├ 2단 (높이 stretch)
 *   │   ├ 좌: 구간별 전적 — 점수 · 등수 → 구간 칩 → VS 구간 → 승률/킬뎃 → 판킬 → MVP → 🚨핵의심
 *   │   └ 우: STRENGTH POINT — 여섯 축 + 10위 이내 특성 배지
 *   ├ 승률 및 킬뎃 추이 (DAY = 최근 날짜별 · WEEK = 주간)
 *   └ 최근 경기 (행 클릭 → 스코어보드)
 *
 * 없는 값은 비운다. 라운드 점수·세이브 횟수는 경기 API 에 없어 그리지 않는다 (지어내지 않는다).
 * 옛 화면(`LeaguePlayerRecordScreen` 의 `TierBreakdown` · `WeeklyTrendCard` · `MatchCard`)은
 * 지우지 않았다 — 부르지 않을 뿐이다 (`CLAUDE.md` 1-4).
 */
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import type { LeaguePlayerDetail, MatchDetail, MatchLineupEntry, MatchListItem, MatchPlayerStat, PlayerDayRecord, WeeklyPoint } from '@sacloud/contract'
import { showsTier, badgeArtSmallPath, badgeOfAxis } from '@sacloud/contract'
import { leagueBadgePath } from '../common/paths'
import { floorColor, rankColor, rankColorOf, statColor } from './rankColors'
import { Hexagon } from './Hexagon'
import { CompareSearchV3, type CompareCandidate } from './CompareSearchV3'
import { strengthAxes } from './playerHexAxes'
import { AnalysisPanelV3 } from './AnalysisPanelV3'
import { MatchHexagonV3 } from './MatchHexagonV3'
import { MvpWhy } from './MvpWhy'
import { RoundFlowChartV3 } from './RoundFlowChartV3'
import { Card, CardHead, Kda, MarkCircle, MvpMark, RankText, SectionBar, SniperMark, TierText, clanThemeOf, fitMarkUrl, hasFitMark, relativeKst, matchShownAt } from './primitives'
import { teamFirstSideLabel } from '../record/matchDetailView'
import { WIN_LOSS, V3, V3_DARK, type V3Tone, cardStyle, chipStyle, fmt, pct1, pillStyle, spacerStyle } from './tokens'
import { formatRating } from '../common/format'
import { TrendChartV3, type TrendMode } from './TrendChartV3'
import { teamSnapOf } from './ClanDetailV3'
import { PlayerMatchHexV3 } from './PlayerMatchHexV3'
import { ClanTop3PanelV3 } from './ClanTop3PanelV3'
import { MatchCardListV3 } from './MatchCardV3'

/**
 * ★★본문 탭 셋을 껐다★★ (2026-09-22 사장님)
 *
 * > 「우리 원래 페이지에있던 ★세개의 섹터로 나뉜 그래프/플레이스타일/클랜별전적
 * >   이건 전부 없애★ 그것들을 서플라이 원본에 녹인다고 생각하면 돼」
 *
 * 세 칸이 어디로 녹아 들어갔는가 —
 *   · 그래프      → ★맨 위★ 남색 추이 카드 (서플라이의 광고 자리)
 *   · 플레이분석  → ★오른쪽 칸★ 기록카드 밑 육각형
 *   · 클랜별전적  → ★최근매치 카드★ 안 (`ClanTop3PanelV3`)
 *
 * ★코드는 지우지 않는다★ (`CLAUDE.md` 1-4) — 이 상수를 `true` 로 되돌리면 탭이
 * 그대로 돌아온다. `AnalysisPanelV3`(플레이분석 설명 칸)도 그때 같이 살아난다.
 */
const BODY_TABS = false

/**
 * ★추이 그래프는 남색 판★ (2026-09-22 사장님: 「하얀색버전말고 ★남색버전★」).
 * 값은 `tokens.ts` 가 살려 둔 흰 UI 이전 팔레트 그대로다 — 새로 지은 색이 없다.
 */
const TREND_TONE = V3_DARK

const MVP_LEGACY_UNKNOWN_NOTICE = false
/** 스코어보드 명단을 킬 순으로 (2026-09-23 사장님). false 면 원문 순서 */
const LINEUP_BY_KILLS = true
/**
 * ★MVP 이유 상자를 화면에서 내린다★ (2026-09-23 오후 사장님 지시 ①-1).
 * ⚠ 컴포넌트(`MvpWhy`)는 ★안 지웠다★ — `true` 로 되돌리면 옛 화면 그대로다 (`CLAUDE.md` 1-4).
 * 클랜 화면(`ClanDetailV3`)에도 같은 이름의 스위치가 있다 — 두 파일에 같은 칸이 있다.
 */
const SHOW_MVP_WHY = false
/**
 * ★폰에서 경기분석을 「명단 자리」에 넣을까★ — 옛 판(2026-09-23 낮)이 `true` 였다.
 * 오후 지시(「육각은 명단 밑 · 그래프는 명단 바로 밑」)로 ★명단을 그대로 두고 아래로★ 붙인다.
 */
const PHONE_ANALYSIS_IN_LIST = false
/**
 * ★왼쪽 여백 기둥 육각★ — 2026-09-23 오후 한때의 판. 사장님: 「너무 작아 · 진팀 명단 위에 넣어줘」 → 이제 진 팀 명단 자리(`.v3-board-hexin`).
 * `true` 로 되돌리면 기둥이 다시 선다 (CSS 는 supply-skin.css 에 그대로).
 */
const PILLAR_HEX = false
/* 2026-09-11 사장님 목업: 구간 카드(승률·킬뎃·MVP·핵의심)는 ★머리 카드★(PlayerHeaderV3 · 레이아웃)로 올라갔다.
   true 로 되돌리면 옛 두 장 배치가 그대로 돌아온다 (`CLAUDE.md` 1-4) */
const TIER_CARD_IN_BODY = false
/* 2026-09-11 사장님: «누가 스나이퍼인지 안 떠 — 워터마크 폐지, 닉 옆에 빨간 (S)». 워터마크(SNIPER·ME)는 스위치로만 남긴다 */
const SCORE_WATERMARKS = false
/**
 * ★「최근 같이한 플레이어」 표를 내린다★ (2026-09-23 오후 사장님: 「피시랑 모바일 둘 다에서 없애 필요없어」).
 * 컴포넌트(`TeammatesCard`)와 자료(`data.teammates`)는 그대로다 — `true` 로 되돌리면 그대로 나온다 (`CLAUDE.md` 1-4).
 */
const SHOW_TEAMMATES = false

/**
 * ★스코어보드 줄의 인식표★ — 지금은 안 그린다 (2026-09-16 사장님: «인식표 아직도 안없어졌네»).
 *
 * 랭킹 표에서는 이미 껐는데(`RankTable` 의 `CLAN_PLATE_ON`) ★경기 상세★ 에 남아 있었다.
 * 줄 뒤에 구름·산 그림이 깔려 숫자가 그림 위로 읽혀 지저분했다.
 * ★지우지 않는다★ (`CLAUDE.md` 1-4) — `true` 로 두면 그대로 돌아온다.
 */
const SCORE_PLATE_ON: boolean = false

const halfStyle: CSSProperties = { marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(360px,1fr))', gap: 16, alignItems: 'stretch' }
const halfCardStyle: CSSProperties = { display: 'flex', flexDirection: 'column', ...cardStyle }
const statRowStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr)', alignItems: 'baseline', gap: 12, padding: '9px 0', borderTop: `1px solid ${V3.rowDivider2}` }
/* 2026-09-11 사장님: 경기 카드를 폰 모양 한 가지로 통일한다 — 두 칸 × 세 줄.
   1줄 승패·맵·시각 / 자리   2줄 양 팀 / MVP·킬뎃   3줄 상대 티어 / 펼치기 */
const matchRowStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', alignItems: 'center', rowGap: 7, columnGap: 12, padding: '13px 18px', cursor: 'pointer' }
/** ★마지막 칸이 MVP★ — 까닭은 ClanDetailV3 의 같은 상수 주석에 (2026-09-12 사장님) */
/*
 * ★★이름 칸에 최소 폭을 준다★★ (2026-09-20 사장님: 「닉네임 또 이렇게 된다 좀 고쳐줘」)
 *
 * ── 무엇이 문제였나
 *   이름 칸이 `minmax(0,1fr)` 이었다. ★최소 0★ 이라는 뜻이라, 옆 칸(K/D/A ·
 *   세이브 · 포지션)이 고정폭으로 자리를 차지하면 ★이름이 한 글자까지 줄어든다.★
 *   화면에 「오」 「마」 「임」 「라」 처럼 ★첫 글자만★ 남았다.
 *
 * ── 어떻게 고쳤나
 *   ★이름에 최소 96px 을 보장한다★ (`minmax(96px,1fr)`). 한글 일곱 자쯤 들어간다.
 *   대신 옆 칸을 조금씩 줄였다 — 숫자와 짧은 말이라 줄여도 안 잘린다.
 *   ```
 *     K/D/A   94~96px → 86px      「19 / 9 / 0」 이 넉넉히 들어간다
 *     세이브   50~52px → 44px      「0/3」
 *     포지션   64~66px → 58px      「라플수」
 *   ```
 * ⚠ 그래도 긴 닉은 ★말줄임(…)★ 으로 끝난다 — 칸을 넘겨 줄을 깨뜨리지 않는다.
 */
const playerRowStyle: CSSProperties = { position: 'relative', overflow: 'hidden', display: 'grid', gridTemplateColumns: 'minmax(96px,1fr) 86px 58px 22px', gap: 8, alignItems: 'center', padding: '9px 14px', borderBottom: `1px solid ${V3.rowDivider2}` }
const playerRowSavesStyle: CSSProperties = { ...playerRowStyle, gridTemplateColumns: 'minmax(96px,1fr) 86px 44px 58px 22px' }

export interface PlayerDetailV3Props {
  data: LeaguePlayerDetail
  leagueSlug: string
  matches: readonly MatchListItem[]
  matchesLoading: boolean
  /**
   * ★최근 경기를 못 불러왔다★ (2026-09-19 · 사장님: «이거 개인페이지 들어가서 최근경기 보면 스코어가 안떠»)
   *
   * 그전에는 이 칸이 할 수 있는 말이 ★둘뿐★ 이었다 —
   * 「불러오는 중…」 과 「아직 경기가 없습니다」. 그래서
   *   · 조회가 ★실패★ 하면 → 경기가 있는데도 ★「아직 경기가 없습니다」★ 라고 거짓말을 했고
   *   · 재시도가 ★멈춰 서면★ → ★영원히 「불러오는 중…」★ 이었다.
   * 둘 다 사람에게 ★아무것도 알려 주지 않는다.★ 못 불러왔으면 못 불러왔다고 적는다.
   *
   * 안 넘기면 지금까지와 ★똑같이★ 동작한다 (`CLAUDE.md` 1-4).
   */
  matchesError?: boolean
  /** 재시도가 멈춰 선 상태 (연결 끊김 등) — `useCursorQuery` 의 `stalled` */
  matchesStalled?: boolean
  /** 「다시 시도」 단추. 안 주면 단추가 안 뜬다 */
  onRetryMatches?: () => void
  hasMore: boolean
  loadingMore: boolean
  onLoadMore: () => void
  expanded: Readonly<Record<string, MatchDetail>>
  onExpand: (match: MatchListItem) => void
  report: { count: number; reported: boolean; pending: boolean; message: string | null; onReport: () => void }
  /** ★비교분석★ (2026-09-12 사장님). 안 주면 검색칸이 안 뜨고 옛 제목이 나온다 */
  compare?: StrengthCompare
  /**
   * ★킬데스를 화면에서만 가린다★ (2026-09-14 사장님).
   *
   *   «IPL - 개인 , 클랜 승률만 기록, 개인 킬데스 정보 제공x»
   *   «킬데스를 써라 킬데스는 숨기는거 뿐이다 우리가 몰래 랭킹계산할때 써야하는 자료이다»
   *
   *   그래서 ★수집·저장·점수 계산은 한 글자도 안 바뀐다.★ 값은 계약에 그대로 실려 오고,
   *   이 깃발은 ★칸을 그리느냐★ 만 정한다. 기본 `true` 라 옛 화면은 그대로다 (`CLAUDE.md` 1-4).
   *   진실의 출처는 `leagueScreen(slug).playerColumns.kd` 하나뿐이다 — 여기서 지어내지 않는다.
   */
  showsKd?: boolean
}

/* ── 구간별 전적 ─────────────────────────────────────────────── */

function TierRecordCard({ data, report, ownTier, showsKd }: { data: LeaguePlayerDetail; report: PlayerDetailV3Props['report']; ownTier: number | null; showsKd: boolean }) {
  const rows = data.tier_breakdown
  const played = rows.filter((r) => r.games > 0)
  /* 기본 칩 = ★내 클랜의 티어★(최근 경기에서 읽음 · QA 교차검토 9-14). 모르면 가장 많이 뛴 티어. 누르면 그것이 우선 */
  const [picked, setPicked] = useState<number | null>(null)
  const mostPlayed = played.length > 0 ? played.reduce((a, b) => (b.games > a.games ? b : a)).tier : rows[0]?.tier ?? 1
  const tier = picked ?? (ownTier !== null && rows.some((r) => r.tier === ownTier) ? ownTier : mostPlayed)
  const setTier = setPicked
  const sel = rows.find((r) => r.tier === tier) ?? null
  const hex = data.hex
  const score = hex?.score ?? null
  /*
   * ★통합 순위★ (2026-09-20 비판 검수) — `score_rank` 는 무기 안에서만의 등수이고
   * ★판수 문턱을 안 거른★ 값이다. 머리 카드와 어긋나던 자리다.
   */
  const scoreRank = hex?.score_rank_all ?? hex?.score_rank ?? null
  const games = sel?.games ?? 0
  const hasData = games >= 10
  const mvpRate = sel && games > 0 ? (sel.mvp / games) * 100 : null
  /* MVP 자료가 있는 리그인가 — 시즌 전체 MVP 가 0 이고 판이 있으면 원본에 MVP 가 없는 것 (IPL 병영 로그). 0 으로 찍지 않는다 */
  /* 2026-09-11: MVP 규칙(세이브 2회↑ → 킬↑데스↓)이 모든 리그·모든 판에 붙었다 — «자료에 MVP 없음» 안내는 접는다.
     옛 판단은 LEGACY 스위치로 남긴다 (QA 교차검토 3번: 0회 선수에게 «자료에 MVP 가 없습니다» 가 떴다) */
  const mvpKnown = MVP_LEGACY_UNKNOWN_NOTICE ? data.mvp_count > 0 || rows.every((r) => r.games === 0) : true
  /*
   * ★티어는 리그가 정한다★ (2026-09-14 사장님: «아직도 IPL에 층수가 나와있고
   *   ASTRA CHALLENGER 다 안없어졌어 SPL도 마찬가지 1티어 2티어 왜있는지»).
   *
   *   옛 값은 `data.league.division_count >= 2` 뿐이었다 — 부리그가 둘이면 무조건
   *   티어를 그렸다. 그런데 «부리그가 몇 개인가» 와 «티어를 화면에 쓰는가» 는
   *   ★다른 물음★ 이다. 계약(`showsTier`)이 정하고 화면은 따른다.
   */
  const tieredLeague = showsTier(data.league.slug) && data.league.division_count >= 2
  return (
    <div style={halfCardStyle}>
      <CardHead>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 9, whiteSpace: 'nowrap' }}>
          {score !== null ? (
            <>
              <span style={{ fontSize: 15, fontWeight: 700, color: V3.textStrong }}>{formatRating(score)}</span>
              {scoreRank !== null ? <RankText rank={scoreRank} color={rankColor(scoreRank)} /> : null}
            </>
          ) : hex ? (
            /* 점수 리그인데 아직 10판 미만 — 래더로 떨어지지 않는다 (QA 회차 2 · 띠와 같은 규칙) */
            <span style={{ fontSize: 13, fontWeight: 700, color: V3.textMuted }}>실력 점수 측정 중 · {fmt(hex.games)}판</span>
          ) : (
            <>
              <span style={{ fontSize: 15, fontWeight: 700, color: V3.textStrong }}>{formatRating(data.rating)}</span>
              {data.rank !== null ? <RankText rank={data.rank} color={rankColor(data.rank)} /> : null}
            </>
          )}
        </span>
      </CardHead>
      {tieredLeague ? (
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, padding: '10px 18px 12px', borderBottom: `1px solid ${V3.rowDivider}` }}>
          {rows.map((r) => (
            <span key={r.tier} onClick={() => setTier(r.tier)} style={chipStyle(r.tier === tier)}>
              <TierText division={r.tier} leagueCategory={data.league.category} size={11} />
            </span>
          ))}
        </div>
      ) : null}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: `1px solid ${V3.rowDivider}` }}>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 7, whiteSpace: 'nowrap', minWidth: 0 }}>
          <span style={{ fontSize: 11, color: V3.textGhost2, letterSpacing: '.1em' }}>VS</span>
          {tieredLeague && sel ? <TierText division={sel.tier} leagueCategory={data.league.category} size={16} /> : <span style={{ fontSize: 15, color: V3.textMuted }}>전체</span>}
        </span>
        <div style={spacerStyle} />
        <span style={{ fontSize: 11.5, color: games === 0 ? '#b6bece' : hasData ? V3.textMuted : V3.textFaint, whiteSpace: 'nowrap' }}>{fmt(games)}판</span>
      </div>
      {sel && hasData ? (
        <div style={{ display: 'flex', flexDirection: 'column', padding: '0 18px 6px' }}>
          <StatRow label="승률">
            <Pair sub={`${sel.win}승 ${sel.lose}패`} value={pct1(sel.win_rate)} color={sel.win_rate === null ? V3.textMuted : statColor(sel.win_rate)} />
          </StatRow>
          {/* 킬뎃은 어느 구간이든 스나·라플로 나눠 적는다 (2026-09-11 사장님: «라플킬뎃 스나킬뎃 분리»).
             ★킬데스를 안 주는 리그에서는 이 줄 자체를 안 그린다★ (2026-09-14) — 값은 계약에 그대로 실려 온다 */}
          {showsKd ? (
            <StatRow label="킬뎃">
              <Pair tag="스나" sub={`${sel.sniper_kill}/${sel.sniper_death}`} value={pct1(sel.sniper_kd)} color={sel.sniper_kd === null ? V3.textMuted : statColor(sel.sniper_kd)} small />
              <Pair tag="라플" sub={`${sel.rifle_kill}/${sel.rifle_death}`} value={pct1(sel.rifle_kd)} color={sel.rifle_kd === null ? V3.textMuted : statColor(sel.rifle_kd)} small />
            </StatRow>
          ) : null}
        </div>
      ) : (
        <div style={{ padding: '14px 18px 8px', fontSize: 11.5, color: V3.textGhost2 }}>10판 이상 기록이 쌓이면 {showsKd ? '승률·킬뎃' : '승률'}을 표시합니다</div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'flex-end', padding: '0 18px 16px' }}>
        <StatRow label="판킬">
          {sel && (sel.sniper_kill_per_match !== null || sel.rifle_kill_per_match !== null) ? (
            <>
              <Pair tag="스나" sub="" value={sel.sniper_kill_per_match === null ? '-' : sel.sniper_kill_per_match.toFixed(1)} color={V3.text} small />
              <Pair tag="라플" sub="" value={sel.rifle_kill_per_match === null ? '-' : sel.rifle_kill_per_match.toFixed(1)} color={V3.text} small />
            </>
          ) : (
            <Pair sub="시즌 전체" value={data.kill_per_match.toFixed(1)} color={V3.text} />
          )}
        </StatRow>
        <StatRow label={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ fontSize: 10.5, color: V3.mvp }}>★</span><span>MVP</span></span>}>
          {mvpKnown ? (
            <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: 9, minWidth: 0 }}>
              <span style={{ fontSize: 11, color: V3.textGhost2, whiteSpace: 'nowrap' }}>{fmt(games)}판 중</span>
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 2, whiteSpace: 'nowrap' }}>
                <span style={{ fontSize: 17, fontWeight: 700, color: V3.mvp /* ⚠ 옛값 V3.gold */ }}>{sel?.mvp ?? 0}</span>
                <span style={{ fontSize: 10.5, fontWeight: 600, color: '#8a6a12' }}>회</span>
              </span>
              <span style={{ fontSize: 11, color: V3.textDim, whiteSpace: 'nowrap' }}>{pct1(mvpRate)}</span>
            </span>
          ) : (
            <span style={{ display: 'flex', justifyContent: 'flex-end', fontSize: 11, color: V3.textGhost, whiteSpace: 'nowrap' }}>이 리그 자료에 MVP 가 없습니다</span>
          )}
        </StatRow>
        <ReportButton report={report} />
      </div>
    </div>
  )
}

function StatRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div style={statRowStyle}>
      <span style={{ fontSize: 12, color: V3.textDim, whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: 10, minWidth: 0, flexWrap: 'nowrap' }}>{children}</span>
    </div>
  )
}

function Pair({ tag, sub, value, color, small }: { tag?: string; sub: string; value: string; color: string; small?: boolean }) {
  return (
    <span style={{ display: 'flex', alignItems: 'baseline', gap: small ? 5 : 9, whiteSpace: 'nowrap', flex: 'none' }}>
      {tag ? <span style={{ fontSize: 9.5, color: V3.textGhost, letterSpacing: '.06em' }}>{tag}</span> : null}
      <span style={{ fontSize: small ? 10 : 11, color: V3.textGhost2 }}>{sub}</span>
      <span style={{ fontSize: small ? 15 : 17, fontWeight: 600, color }}>{value}</span>
    </span>
  )
}

function ReportButton({ report }: { report: PlayerDetailV3Props['report'] }) {
  const on = report.reported
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 12 }}>
      <button
        type="button"
        onClick={report.onReport}
        disabled={report.pending}
        style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px', borderRadius: 8, cursor: report.pending ? 'wait' : 'pointer', fontFamily: 'inherit', background: on ? 'rgba(224,27,36,.12)' : 'rgba(224,27,36,.05)', border: `1px solid ${on ? 'rgba(255,90,99,.55)' : 'rgba(224,27,36,.3)'}`, boxShadow: on ? '0 0 16px rgba(224,27,36,.22)' : 'none', width: '100%' }}
      >
        <span style={{ fontSize: 16, lineHeight: 1, flex: 'none' }}>🚨</span>
        <span style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', color: on ? '#ff6b6b' : '#b3555c' }}>핵의심</span>
        <div style={spacerStyle} />
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 2, whiteSpace: 'nowrap' }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: on ? '#ff6b6b' : '#b3555c' }}>{fmt(report.count)}</span>
          <span style={{ fontSize: 10.5, fontWeight: 600, color: on ? '#c9575f' : V3.textDim }}>회</span>
        </span>
      </button>
      {report.message ? <span style={{ fontSize: 10.5, color: V3.textDim }}>{report.message}</span> : null}
    </div>
  )
}

/* ── STRENGTH POINT ───────────────────────────────────────────── */

/* ★`strengthAxes` 는 `playerHexAxes.ts` 로 옮겼다★ (2026-09-12) —
   머리 카드도 같은 그림을 그려서 규칙이 두 곳에 있으면 안 된다 */

/**
 * ★비교분석★ — STRENGTH POINT 제목 자리에 검색칸 (2026-09-12 사장님).
 *
 * > «없애고 비교분석하기 버튼 만들고 (…) 검색 후 클릭 누르면 그 선수 그래프 불러와서
 * >  여기에 겹쳐줘 색깔 다르게 해서 (…) 스나수 라플수 구분없이 그래프 대볼 수 있게»
 *
 * 찾기·불러오기는 ★화면(앱) 쪽★ 이 넘겨준다 — `packages/ui` 는 API 를 모른다.
 * 넘겨주지 않으면 검색칸이 안 뜨고 옛 제목이 그대로 나온다 (기존 화면이 안 깨진다).
 */
export interface StrengthCompare {
  picked: { id: string; name: string } | null
  /** 겹쳐 그릴 여섯 값 (0~100). 축 차례는 주인과 같다 */
  values: readonly (number | null)[] | null
  results: readonly CompareCandidate[]
  loading: boolean
  onQueryChange: (query: string) => void
  onPick: (candidate: CompareCandidate) => void
  onClear: () => void
}

function StrengthCard({ data, compare, leagueSlug }: { data: LeaguePlayerDetail; compare?: StrengthCompare; leagueSlug: string }) {
  const hex = data.hex
  const axes = strengthAxes(data)
  /*
   * ★부여된 배지만 진열한다★ (2026-09-17 사장님: «부여된것만 들고있어야하는데»).
   *
   * ⚠ 같은 날 제가 「여섯을 다 걸어라」 로 잘못 읽고 전부 그렸었다. 사장님 말씀은
   *   ★딴 것만★ 이다. 배지 컷은 스나싸움 3위 · 나머지 5위다 (2026-09-12 사장님).
   *   배지가 없는 선수는 이 줄 자체가 안 그려진다 — 그게 맞는 모양이다.
   */
  const badges = hex ? hex.axes.filter((a) => a.badge !== null && a.rank !== null) : []
  const overlay =
    compare && compare.picked !== null && compare.values !== null
      ? { values: compare.values, label: compare.picked.name }
      : null
  return (
    <div style={halfCardStyle}>
      <CardHead
        title={
          compare ? (
            <CompareSearchV3
              picked={compare.picked}
              results={compare.results}
              loading={compare.loading}
              onQueryChange={compare.onQueryChange}
              onPick={compare.onPick}
              onClear={compare.onClear}
            />
          ) : (
            <span style={{ letterSpacing: '.06em' }}>STRENGTH POINT</span>
          )
        }
        right={
        <span style={{ fontSize: 10.5, color: V3.textGhost2, letterSpacing: '.08em', whiteSpace: 'nowrap' }}>
          {hex ? `시즌 Cloud 0 · ${fmt(hex.games)}전 기준` : '시즌 Cloud 0'}
        </span>
      } />
      <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', padding: '8px 18px 14px', flexWrap: 'wrap', gap: 12 }}>
        {hex && !hex.measuring ? (
          /* 2026-09-11: 머리 카드가 빠져 이 카드가 한 줄을 다 쓴다 → 육각형을 키운다 (300px 고정 그림을 배율로) */
          /*
           * ⚠ ★2026-09-22 밤 — 배율을 칸에 맡긴다★
           *   본문 2단으로 바꾸면서 오른쪽 칸이 ★271px★ 이 됐는데 이 그림은 1.55배라
           *   ★465px★ 이었다 — 축 이름(세이브·스나싸움…)이 칸 밖으로 잘려 나갔다
           *   (운영 화면을 재서 잡았다: svg 가 x=1009 에서 1474 까지 뻗어 있었다).
           *   배율을 `--hex-zoom` 으로 빼고 좁은 칸에서만 줄인다 —
           *   넓은 자리(옛 탭 판)는 기본값 1.55 그대로다.
           */
          <span className="v3-hex-zoom" style={{ display: 'block', width: 'calc(300px * var(--hex-zoom, 1.55))', height: 'calc(262px * var(--hex-zoom, 1.55))' }}>
            <span style={{ display: 'block', transform: 'scale(var(--hex-zoom, 1.55))', transformOrigin: 'top left' }}>
              <Hexagon axes={axes} id="playerHex" overlay={overlay} />
            </span>
          </span>
        ) : (
          <div style={{ padding: '28px 8px', fontSize: 12, color: V3.textGhost, textAlign: 'center', lineHeight: 1.7 }}>
            {hex ? (
              <>한 무기로 10판 이상 쌓이면 여섯 축을 잽니다<br /><span style={{ color: V3.textGhost2 }}>지금 {fmt(hex.weapon_games)}판</span></>
            ) : (
              <>여섯 축은 30분마다 접힙니다 · 아직 이 선수의 줄이 없습니다</>
            )}
          </div>
        )}
      </div>
      {/* ★범례★ — 겹쳐 놓았을 때만. 어느 선이 누구인지 그림 안에 적을 자리가 없다 */}
      {overlay !== null ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, flexWrap: 'wrap', padding: '0 18px 10px' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <span aria-hidden style={{ width: 12, height: 3, borderRadius: 2, background: '#7c3aed', flex: 'none' }} />
            <span style={{ fontSize: 11.5, fontWeight: 700, color: V3.text, whiteSpace: 'nowrap' }}>{data.player.name}</span>
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <span aria-hidden style={{ width: 12, height: 3, borderRadius: 2, background: '#0891b2', flex: 'none' }} />
            <span style={{ fontSize: 11.5, fontWeight: 700, color: '#0891b2', whiteSpace: 'nowrap' }}>{overlay.label}</span>
          </span>
          {/* 잣대가 다른 축이 하나 있다 — 숨기지 않고 적어 둔다 */}
          <span style={{ fontSize: 10, color: V3.textGhost2, whiteSpace: 'nowrap' }}>
            싸움 축은 무기별로 따로 잰 값입니다
          </span>
        </div>
      ) : null}
      {badges.length > 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '0 18px 16px' }}>
          <span style={{ fontSize: 9.5, color: V3.textGhost2, letterSpacing: '.1em', whiteSpace: 'nowrap' }}>특성</span>
          {/*
                * ★배지 그림★ (2026-09-17 사장님) — 손으로 그리던 것이 아니라 ★사장님이 주신 일곱 장★ 이다.
                *   누르면 그 배지를 가진 사람 전부가 나오는 페이지로 간다
                *   («뱃지 클릭하면 (…) 누구누구가 이 뱃지 가지고있는지»).
                *   그림을 못 찾으면 ★글자만 남는다★ — 빈칸을 만들지 않는다.
                */}
          {badges.map((a) => {
            const art = hex?.weapon === null || hex?.weapon === undefined ? null : badgeOfAxis(a.key, hex.weapon)
            /* ★딴 배지★ — 계약이 이름을 채워 준 것만이다 (5위 컷 · 스나싸움 3위) */
            /*
             * ★배지는 상위 2% 안에만★ · ★그중 TOP 5 는 금빛으로 빛난다★ (2026-09-18 사장님).
             *   got  배지를 땄나 (계약이 이름을 채워 준 것)
             *   glow 그중에서도 TOP 5 인가 — 테두리와 그림자가 한 단계 더 세진다
             */
            const got = a.badge !== null
            const glow = got && a.badge_glow === true
            const pill = (
              <span title={a.desc} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 11px 5px 8px', borderRadius: 999, whiteSpace: 'nowrap', background: got ? 'linear-gradient(100deg,rgba(255,216,61,.16),rgba(255,216,61,.04))' : 'rgba(16,24,40,.03)', border: glow ? '1px solid rgba(255,216,61,.95)' : got ? '1px solid rgba(255,216,61,.5)' : '1px solid rgba(16,24,40,.08)', boxShadow: glow ? '0 0 22px rgba(255,216,61,.55), inset 0 0 12px rgba(255,216,61,.16)' : got ? '0 0 14px rgba(255,216,61,.18)' : 'none' }}>
                {art === null ? <BadgeIcon kind={a.key === 'save' ? 'shield' : 'trend'} />
                  : <img src={badgeArtSmallPath(art)} alt="" width={30} height={30} style={{ width: 30, height: 30, display: 'block', filter: glow ? 'drop-shadow(0 0 7px rgba(255,216,61,1))' : got ? 'drop-shadow(0 0 3px rgba(255,216,61,.8))' : 'grayscale(1) opacity(.55)' }} />}
                <span style={{ fontSize: 11.5, fontWeight: 700, color: got ? '#8a6a12' : '#767f96' }}>{art?.label ?? a.badge ?? a.label}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: got ? '#8a6a12' : '#96a0b5' }}>{a.rank}위</span>
              </span>
            )
            return art === null ? <span key={a.key}>{pill}</span> : (
              <a key={a.key} href={leagueBadgePath(leagueSlug, art.key)} style={{ textDecoration: 'none' }}>{pill}</a>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

function BadgeIcon({ kind }: { kind: 'shield' | 'trend' }) {
  return (
    <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, flex: 'none', display: 'block' }} aria-hidden>
      {kind === 'shield' ? (
        <>
          <path d="M12 2.6 L20 6 V12.4 C20 17 16.6 20.4 12 21.6 C7.4 20.4 4 17 4 12.4 V6 Z" fill="rgba(255,216,61,.14)" stroke={V3.gold} strokeWidth={1.5} strokeLinejoin="round" />
          <path d="M8.4 12.2 L11.2 15 L16 9.6" fill="none" stroke={V3.gold} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <>
          <path d="M3.5 17.5 L9 11.4 L13 14.6 L20.5 6.5" fill="none" stroke={V3.gold} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
          <path d="M15.4 6.2 H20.8 V11.6" fill="none" stroke={V3.gold} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="9" cy="11.4" r="1.7" fill={V3.gold} />
        </>
      )}
    </svg>
  )
}

/* ── 추이 차트 ────────────────────────────────────────────────── */

const KX0 = 44
const KX1 = 500
/* 세로축 — 기본 20~80 (시안). 값이 그 밖이면 0~100 까지 넓힌다. 잘라서 거짓말하지 않는다 */
function yScaleOf(points: readonly TrendPoint[]): { lo: number; hi: number; ticks: number[] } {
  const vals = points.flatMap((p) => [p.winRate, p.kd]).filter((v): v is number => v !== null)
  const lo = vals.some((v) => v < 20) ? 0 : 20
  const hi = vals.some((v) => v > 80) ? 100 : 80
  const ticks = lo === 0 && hi === 100 ? [0, 25, 50, 75, 100] : lo === 0 ? [0, 20, 40, 60, 80] : hi === 100 ? [20, 40, 60, 80, 100] : [20, 40, 60, 80]
  return { lo, hi, ticks }
}

interface TrendPoint {
  label: string
  winRate: number | null
  kd: number | null
}

function TrendChart({ points, markSlug, clan, winLabel, kdLabel }: { points: TrendPoint[]; markSlug: string | null; clan: LeaguePlayerDetail['clan']; winLabel: string; kdLabel: string }) {
  const n = points.length
  const scale = yScaleOf(points)
  const ky = (v: number) => 236 - ((Math.max(scale.lo, Math.min(scale.hi, v)) - scale.lo) / (scale.hi - scale.lo)) * 210
  const xOf = (i: number) => (n <= 1 ? KX1 : KX0 + ((KX1 - KX0) * i) / (n - 1))
  const line = (pick: (p: TrendPoint) => number | null) => {
    const segs: string[] = []
    let cur: string[] = []
    points.forEach((p, i) => {
      const v = pick(p)
      if (v === null) { if (cur.length) segs.push(cur.join(' ')); cur = []; return }
      cur.push(`${xOf(i).toFixed(1)},${ky(v).toFixed(1)}`)
    })
    if (cur.length) segs.push(cur.join(' '))
    return segs
  }
  const wr = line((p) => p.winRate)
  const kd = line((p) => p.kd)
  const lastWr = [...points].reverse().find((p) => p.winRate !== null)?.winRate ?? null
  const lastKd = [...points].reverse().find((p) => p.kd !== null)?.kd ?? null
  const labelIdx = n <= 6 ? points.map((_, i) => i) : [0, Math.round(n / 4), Math.round(n / 2), Math.round((3 * n) / 4), n - 1]
  return (
    <div style={{ padding: '6px 12px 10px', background: V3.plot }}>
      <svg viewBox="0 0 640 300" style={{ width: '100%', height: 300, display: 'block' }}>
        <defs>
          <filter id="kdGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="7" result="g1" />
            <feGaussianBlur stdDeviation="16" result="g2" />
            <feMerge><feMergeNode in="g2" /><feMergeNode in="g1" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <rect x="0" y="0" width="640" height="300" fill={V3.plot} />
        <text x="272" y="150" textAnchor="middle" fontSize="62" fontWeight="900" fill="#124a56" opacity="0.05" letterSpacing="6">CLOUD 0</text>
        {scale.ticks.map((g) => (
          <g key={g}>
            <line x1={KX0} y1={ky(g)} x2={KX1} y2={ky(g)} stroke={V3.divider} />
            <text x={KX0 - 8} y={ky(g) + 4} textAnchor="end" fill={V3.textDim} fontSize="11">{g}</text>
          </g>
        ))}
        {labelIdx.map((i, k) => (
          <g key={`${i}-${k}`}>
            {k > 0 && k < labelIdx.length - 1 ? <line x1={xOf(i)} y1={26} x2={xOf(i)} y2={236} stroke={V3.divider} strokeDasharray="3 5" /> : null}
            <text x={xOf(i)} y={264} textAnchor={k === 0 ? 'start' : k === labelIdx.length - 1 ? 'end' : 'middle'} fill={V3.textDim} fontSize="11">{points[i]?.label ?? ''}</text>
          </g>
        ))}
        <line x1={KX1} y1={20} x2={KX1} y2={242} stroke="#e3e6ee" />
        <text x={KX1} y={16} textAnchor="middle" fill="#5c6479" fontSize="13" fontWeight="700">today</text>
        {n === 0 ? <text x="272" y="140" textAnchor="middle" fill={V3.textGhost} fontSize="13">아직 찍힌 날이 없습니다</text> : null}
        {wr.map((p, i) => (
          <g key={`w${i}`}>
            <polyline points={p} fill="none" stroke={V3.blue} strokeWidth={11} strokeLinejoin="round" strokeLinecap="round" filter="url(#kdGlow)" opacity={0.42} />
            <polyline points={p} fill="none" stroke="#7fa9ff" strokeWidth={6} strokeLinejoin="round" strokeLinecap="round" opacity={0.45} />
            <polyline points={p} fill="none" stroke="#1c2f6b" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" opacity={0.95} />
          </g>
        ))}
        {kd.map((p, i) => (
          <g key={`k${i}`}>
            <polyline points={p} fill="none" stroke={V3.red} strokeWidth={12} strokeLinejoin="round" strokeLinecap="round" filter="url(#kdGlow)" opacity={0.5} />
            <polyline points={p} fill="none" stroke="#ff5a63" strokeWidth={6.5} strokeLinejoin="round" strokeLinecap="round" opacity={0.45} />
            <polyline points={p} fill="none" stroke="#c81e28" strokeWidth={3.2} strokeLinejoin="round" strokeLinecap="round" opacity={0.95} />
          </g>
        ))}
        {lastWr !== null ? (
          <>
            {markSlug && hasFitMark(markSlug) ? (
              <image href={fitMarkUrl(markSlug)} x={KX1 - 10} y={ky(lastWr) - 10} width="20" height="20" clipPath="circle(10px at 10px 10px)" />
            ) : (
              <circle cx={KX1} cy={ky(lastWr)} r={10} fill={V3.chip} stroke="#7fa9ff" strokeWidth={1.6} />
            )}
            <text x={KX1 + 16} y={ky(lastWr) + 5} textAnchor="start" fill="#1c2f6b" fontSize="15" fontWeight="700">{lastWr.toFixed(1)}%</text>
            <text x={KX1 + 16} y={ky(lastWr) + 19} textAnchor="start" fill="#5c6479" fontSize="9.5" fontWeight="700">{winLabel}</text>
          </>
        ) : null}
        {lastKd !== null ? (
          <>
            <circle cx={KX1} cy={ky(lastKd)} r={10} fill={V3.chip} stroke="#ff5a63" strokeWidth={1.6} />
            <text x={KX1} y={ky(lastKd) + 3} textAnchor="middle" fill="#c81e28" fontSize="8.5" fontWeight="700">K/D</text>
            <text x={KX1 + 16} y={ky(lastKd) + 5} textAnchor="start" fill="#c81e28" fontSize="15" fontWeight="700">{lastKd.toFixed(1)}%</text>
            <text x={KX1 + 16} y={ky(lastKd) + 19} textAnchor="start" fill="#b3555c" fontSize="9.5" fontWeight="700">{kdLabel}</text>
          </>
        ) : null}
        {clan === null ? null : null}
      </svg>
    </div>
  )
}

/* 서버는 최근 것이 먼저다 — 그래프는 왼쪽이 옛날이어야 하므로 날짜로 오름차순 정렬한다 */
function dayPoints(days: readonly PlayerDayRecord[]): TrendPoint[] {
  return [...days]
    .filter((d) => d.played && d.games >= 2)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({ label: d.label, winRate: d.win_rate, kd: d.kd_rate }))
}
function weekPoints(points: readonly WeeklyPoint[]): TrendPoint[] {
  return [...points]
    .filter((p) => p.played)
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((p) => ({ label: p.start.slice(5).replace('-', '/'), winRate: p.win_rate, kd: p.kd }))
}

/** ⚠ 옛 추이 카드(`TrendChart` · 최근 3일/주간)는 아래에 그대로 있다. 2026-09-10 부터는 사장님 지시서대로 `TrendChartV3` 가 그린다 */
function TrendCard({ data, showsKd, tone = V3 }: { data: LeaguePlayerDetail; showsKd: boolean; tone?: V3Tone }) {
  /* 기본 탭 「누적」 (2026-09-23 저녁 사장님 「누적을 먼저 보여줘」 · 인계서 ②-6). 옛 기본값 'day' */
  const [mode, setMode] = useState<TrendMode>('cum')
  const today = data.trend.find((d) => d.today) ?? null
  /* DAY 마커는 «경기가 있던 마지막 날» 값을 잇는다 — 오늘 0판이면 «오늘 0승 0패 83%» 처럼 읽혀 헷갈렸다 (QA 교차검토 16번)
     → 오늘 판이 있으면 «오늘», 없으면 그 날짜를 적는다 */
  const lastPlayed = [...data.trend].reverse().find((d) => !d.future && d.win + d.lose > 0) ?? null
  const dayRef = today && today.win + today.lose > 0 ? { d: today, name: '오늘' } : lastPlayed ? { d: lastPlayed, name: lastPlayed.label } : null
  const T = tone
  const chip = (on: boolean): CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', padding: '5px 11px', borderRadius: V3.radiusCtl,
    cursor: 'pointer', whiteSpace: 'nowrap', fontSize: 11.5,
    color: on ? T.textStrong : T.textDim,
    background: on ? T.chip : 'transparent',
    border: `1px solid ${on ? T.chipBorder : 'transparent'}`,
  })
  return (
    <section style={{ background: T.card, border: `1px solid ${T.cardBorder}`, borderRadius: V3.radiusCard, overflow: 'hidden', fontFamily: V3.font }}>
      {/* 머리줄 — `CardHead` 와 같은 꼴을 색판만 바꿔 손으로 적었다 (공용 `CardHead` 는 흰 카드 전용이다) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 18px', borderBottom: `1px solid ${T.divider}`, flexWrap: 'wrap' }}>
        <span style={{ width: 22, height: 2, background: V3.red, flex: 'none' }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: T.textStrong, whiteSpace: 'nowrap' }}>{showsKd ? '승률 및 킬뎃 추이' : '승률 추이'}</span>
        {showsKd ? <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 4 }}><span style={{ width: 15, height: 2, background: '#ff5a63' }} /><span style={{ fontSize: 11, color: T.textFaint }}>킬뎃</span></span> : null}
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: showsKd ? 0 : 4 }}><span style={{ width: 15, height: 2, background: '#7fa9ff' }} /><span style={{ fontSize: 11, color: T.textFaint }}>승률</span></span>
        <span style={{ fontSize: 10.5, color: T.textGhost2, minWidth: 0 }}>오늘은 경기가 끝날 때마다 바로 움직입니다 · 지난 날은 2판 미만이면 찍히지 않습니다 · 그래프를 움직여 날짜별 기록을 봅니다</span>
        <div style={spacerStyle} />
        <span style={{ display: 'flex', gap: 5 }}>
          <span onClick={() => setMode('day')} style={chip(mode === 'day')}>DAY</span>
          <span onClick={() => setMode('cum')} style={chip(mode === 'cum')}>누적</span>
        </span>
      </div>
      <TrendChartV3
        days={data.trend}
        mode={mode}
        seed={data.player.id}
        markSlug={data.clan?.slug ?? null}
        winLabel={mode === 'day' ? (dayRef ? `${dayRef.name} ${dayRef.d.win}승 ${dayRef.d.lose}패` : '아직 경기 없음') : `누적 ${data.win}승 ${data.lose}패`}
        kdLabel={mode === 'day' ? (dayRef ? `${dayRef.name} ${dayRef.d.kill}킬 ${dayRef.d.death}데스` : '') : data.kill !== null && data.death !== null ? `누적 ${fmt(data.kill)}킬 ${fmt(data.death)}데스` : ''}
        showsKd={showsKd}
        tone={T}
      />
    </section>
  )
}

function TrendCardLegacy({ data }: { data: LeaguePlayerDetail }) {
  const [range, setRange] = useState<'DAY' | 'WEEK'>('DAY')
  const points = useMemo(() => (range === 'DAY' ? dayPoints(data.recent_days) : weekPoints(data.weekly?.points ?? [])), [range, data])
  return (
    <Card style={{ marginTop: 16 }}>
      <CardHead title="승률 및 킬뎃 추이" ribbon={V3.red} right={
        <span style={{ display: 'flex', gap: 5 }}>
          {(['DAY', 'WEEK'] as const).map((r) => (
            <span key={r} onClick={() => setRange(r)} style={chipStyle(range === r)}>{r}</span>
          ))}
        </span>
      }>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 4 }}><span style={{ width: 15, height: 2, background: '#ff5a63' }} /><span style={{ fontSize: 11, color: V3.textFaint }}>킬뎃</span></span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 15, height: 2, background: '#7fa9ff' }} /><span style={{ fontSize: 11, color: V3.textFaint }}>승률</span></span>
        <span style={{ fontSize: 10.5, color: V3.textGhost2, whiteSpace: 'nowrap' }}>{range === 'DAY' ? '2판 미만인 날은 찍히지 않습니다' : '경기가 있던 주만 찍힙니다'}</span>
      </CardHead>
      <TrendChart
        points={points}
        markSlug={data.clan?.slug ?? null}
        clan={data.clan}
        winLabel={`${data.win}승 ${data.lose}패`}
        kdLabel={data.kill !== null && data.death !== null ? `${fmt(data.kill)}킬 ${fmt(data.death)}데스` : ''}
      />
    </Card>
  )
}
export { TrendCardLegacy }

/* ── 최근 경기 · 스코어보드 ───────────────────────────────────── */

/* ── 경기 상세 스코어보드 — 서플라이 대조 (2026-09-22) ─────────── */

/**
 * ★★경기상세카드를 서플라이와 똑같이★★ (2026-09-22 사장님:
 *   「경기상세카드도 서플라이랑 똑같이 고쳐 ★정확하게 꼼꼼하게 하나하나 대조하면서★ 만들어」
 *    「경기상세 카드 ★모바일★ 은 앞쪽 두장 ★피씨★ 는 뒤쪽두장 처럼 생겼음」)
 *
 * ★★폰과 PC 가 다르다.★★ 사장님이 넉 장을 보내 주셔서 둘을 따로 쟀다.
 *
 * ── PC (사진 4 · `3rd.supply/league/supply/player/1074574325`)
 * ```
 *  제3보급창고  5 vs 5            게임시작시간: 2026년 6월 5일 오전 12시 6분
 *  승리 ◉ des`per@do.   (선레드)  -  1부리그 1,508점
 *  플레이어      래더      kda        무기      딜량       헤드샷
 *  ◉ 성쉴       배치고사   6 / 5 / 1  스나이퍼  ▮1,088     0
 *                         (54.5%)                        (0%)
 * ```
 *
 * ── 폰 (사진 2)
 * ```
 *  제3보급창고  5 vs 5                                22분 10초
 *               게임시작 - 2026년 4월 13일 오전 12시 21분
 *  패배 ◉ saint                                        선레드
 *  플레이어        kda         무기   딜량
 *  ◉ 부리♡        7 / 8 / 1   스나   ▮1,272
 *    2,565점      (46.7%)
 * ```
 *
 * ── ★폰에서 달라지는 것 넷★ (그래서 칸을 CSS 로 갈아 끼운다)
 *   ① ★래더 칸이 없다.★ 점수가 ★닉네임 바로 밑★ 작은 글씨로 내려간다
 *   ② ★헤드샷 칸이 없다.★ 폭이 모자라 서플라이도 뺐다 (값은 계약에 그대로 있다)
 *   ③ 무기가 ★「스나」·「라플」★ 로 줄어든다 (PC 는 「스나이퍼」·「라이플」)
 *   ④ 선레드/선블루가 ★팀줄 오른쪽 끝★ 이다. PC 는 클랜명 바로 뒤 `(선레드)` 다
 *   ⑤ 머리줄이 ★두 줄★ 이다 — 위에 맵·NvN·경기시간, 아래에 게임시작
 *
 * ── 대조표 (PC 여섯 칸)
 *   | 서플라이 | 우리 값 | 비고 |
 *   |---|---|---|
 *   | 플레이어 | `row.name` + 마크 | 마크는 ★이름 앞★ · 스나는 `[S]` |
 *   | 래더     | `row.rating` / `row.placement` | 배치고사면 「배치고사」 · 색은 `floorColor` |
 *   | kda      | `kill/death/assist` + `kd_rate` | 두 줄 · 퍼센트에 ★색깔시스템★ |
 *   | 무기     | `row.weapon` (0 라이플 · 1 스나이퍼) | 그 판에 든 총이다 |
 *   | 딜량     | `row.damage` + 막대 | ★숫자가 막대 안★ · 그 경기 최대값이 100% |
 *   | 헤드샷   | `row.headshot` + `headshot_percent` | 두 줄 |
 *
 * ── 우리가 ★더 하는 것★ 둘 (지우면 이미 있던 기능이 죽는다)
 *   ① 닉네임을 누르면 ★그 판 육각★ 이 펼쳐진다 (2026-09-15 사장님)
 *   ② 내 줄에 하늘색 띠 — 열 명 중 나를 찾는 표시 (서플라이도 같은 띠를 쓴다)
 *
 * ── ★없는 값은 「알수없음」★ (D-034 · D-106)
 *   3rd.supply 라인업으로 명단만 복원한 참가자는 넥슨 상세가 없어 KDA·딜량·헤드샷이
 *   `null` 이다. 0 으로 채우면 「0킬을 했다」는 ★거짓★ 이다. 서플라이도 「알수없음」이라 적는다.
 */
const SUPPLY_SCORE_COLUMNS = true

/** 폰/PC 칸 갈아 끼우기 — 한 군데에만 적는다 (머리줄과 줄이 같은 격자를 써야 칸이 맞는다)
 * 2026-09-23 오후 사장님 ①-4 — 「플레이어 · 순위 · kda · 세이브 · 포지션」 다섯 칸. 클랜 화면 스코어보드와 같은 폭.
 * ⚠ 옛 여섯 칸(래더·kda·무기·딜량·헤드샷)의 격자: PC 'minmax(92px,1fr) 66px 92px 64px 104px 66px' · 폰 'minmax(84px,1fr) 88px 46px 88px' (`ScoreRowSupplySix`) */
const SB_COLS_PC = 'minmax(92px,1fr) 44px 86px 40px 50px'
const SB_COLS_PHONE = 'minmax(80px,1fr) 40px 78px 36px 46px'
/** 폰에서 칸이 바뀌는 지점 — 서플라이 폰 실측(390px)과 태블릿 사이 */
const SB_PHONE_MAX = 700

/**
 * ★스코어보드 전용 CSS★ — 폰/PC 를 갈아 끼운다.
 *
 * ⚠ ★왜 `v2/tokens.css` 가 아니라 여기인가★ — 이 규칙은 스코어보드 한 곳에서만 쓴다.
 *   공용 CSS 에 넣으면 다른 세션과 같은 파일을 동시에 고치게 되고, 규칙이 어느 화면에
 *   걸리는지 추적이 어려워진다. 이 컴포넌트가 죽으면 이 규칙도 같이 사라지는 편이 낫다.
 */
const SCOREBOARD_CSS = `
.sac-sb-row { display: grid; grid-template-columns: ${SB_COLS_PC}; gap: 8px; align-items: center; }
.sac-sb-phone-only { display: none; }
@media (max-width: ${SB_PHONE_MAX}px) {
  .sac-sb-row { grid-template-columns: ${SB_COLS_PHONE}; gap: 6px; }
  .sac-sb-pc-only { display: none !important; }
  .sac-sb-phone-only { display: block; }
  .sac-sb-phone-only.sac-sb-inline { display: inline; }
}
`

/** 「알수없음」 한 칸 — 값이 없을 때만 쓴다. 0 으로 채우지 않는다 (D-106) */
function Unknown() {
  return <span style={{ fontSize: 10.5, color: V3.textGhost, whiteSpace: 'nowrap' }}>알수없음</span>
}

/**
 * ★게임시작 시각★ — 서플라이는 ★오전/오후 12시간제★ 다 («오전 12시 6분»).
 *
 * ⚠ 공용 `fullKst` 는 24시간제(«0시 6분»)이고 다른 화면이 그걸 쓴다. ★거기는 안 건드린다★ —
 *   이 카드만 서플라이 말씨를 따른다 (`CLAUDE.md` 1-4). 시각 자체는 같은 값이다.
 */
function gameStartKst(iso: string): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return iso
  const kst = new Date(at.getTime() + 9 * 3_600_000)
  const h24 = kst.getUTCHours()
  const ampm = h24 < 12 ? '오전' : '오후'
  /* 0시 → 「오전 12시」 · 12시 → 「오후 12시」 · 13시 → 「오후 1시」 (서플라이 표기 그대로) */
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  const mm = String(kst.getUTCMinutes()).padStart(2, '0')
  return `${kst.getUTCFullYear()}년 ${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일 ${ampm} ${h12}시 ${Number(mm)}분`
}

/**
 * ★명단 한 줄 — 다섯 칸★ (2026-09-23 오후 사장님 ①-4):
 *   플레이어 · 순위(리그 개인랭킹 · 모르면 「-」) · kda · 세이브(「2회」 · 0 이면 「0회」) · 포지션(라플수/스나수/알수없음)
 * 딜량·헤드샷·래더 칸은 뺐다 — 「알수없음」 글자가 화면에서 사라져야 한다는 지시.
 * ⚠ 옛 여섯 칸 줄은 바로 아래 `ScoreRowSupplySix` 로 ★그대로 남겼다★ (`CLAUDE.md` 1-4).
 */
function ScoreRow({ row, me, mvp, weaponKnown, leagueSlug, side }: { row: MatchPlayerStat; me: boolean; mvp: boolean; weaponKnown: boolean; leagueSlug: string; side: 'red' | 'blue' }) {
  const [openHex, setOpenHex] = useState(false)
  const hex = row.hexagon ?? []
  const sniper = weaponKnown && row.weapon === 1
  const clan = row.match_time_clan
  return (
    <>
    <div className="v3-score-row sac-sb-row" style={{ position: 'relative', overflow: 'hidden', padding: '8px 12px', minHeight: 44, borderBottom: `1px solid ${V3.rowDivider2}`, background: me ? 'linear-gradient(100deg,rgba(143,240,255,.14),rgba(143,240,255,.04) 55%,transparent)' : 'transparent', boxShadow: me ? 'inset 3px 0 0 #0891b2' : 'none' }}>
      {SCORE_PLATE_ON && row.nameplate ? <span aria-hidden className={`v3-plate-row v3-plate-row--${row.nameplate}`} /> : null}
      {/* ① 플레이어 — ★클랜마크는 이름 앞에 항상★ */}
      <span style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <MarkCircle clan={clan ? { slug: clan.slug, mark: clan.mark } : null} size={20} />
        {hex.length > 0 ? (
          <button
            type="button"
            aria-expanded={openHex}
            onClick={(e) => { e.stopPropagation(); setOpenHex((v) => !v) }}
            style={{ all: 'unset', cursor: 'pointer', fontSize: 12.5, fontWeight: me ? 700 : 500, color: me ? '#124a56' : V3.text, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', borderBottom: `1px dotted ${openHex ? V3.blueSoft : 'rgba(120,136,170,.35)'}` }}
          >{row.name}</button>
        ) : (
          <a href={`/league/${leagueSlug}/player/${row.player_id}`} onClick={(e) => e.stopPropagation()} style={{ fontSize: 12.5, fontWeight: me ? 700 : 500, color: 'inherit', textDecoration: 'none', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <span style={{ color: me ? '#124a56' : V3.text }}>{row.name}</span>
          </a>
        )}
        {sniper ? <SniperMark /> : null}
        {mvp ? <MvpMark size={15} /> : null}
      </span>
      {/* ② 순위 — 리그 개인랭킹 등수. 문턱 미달·배치고사·집계 전이면 「-」 */}
      <span style={{ position: 'relative', textAlign: 'right', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', color: row.league_rank === null ? V3.textGhost : V3.textDim }}>{row.league_rank === null ? '-' : `${row.league_rank}위`}</span>
      {/* ③ kda — 「7 / 5 / 4」 밑에 「(58.3%)」 */}
      <span style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.25 }}>
        <Kda kill={row.kill} death={row.death} assist={row.assist} size={13} />
        {row.kd_rate === null ? null : (
          <span style={{ fontSize: 10, fontWeight: 600, color: statColor(row.kd_rate), whiteSpace: 'nowrap' }}>({row.kd_rate.toFixed(1)}%)</span>
        )}
      </span>
      {/* ④ 세이브 — 「2회」. 배틀로그 없으면 「-」 */}
      <span style={{ position: 'relative', textAlign: 'right', fontSize: 12.5, fontWeight: 500, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', color: (row.saves ?? 0) >= 3 ? V3.cyan : (row.saves ?? 0) > 0 ? V3.textMuted : V3.textDim }}>{row.saves === null ? '-' : `${row.saves}회`}</span>
      {/* ⑤ 포지션 — 주무기(`main_weapon`). 그 판에 든 총이 아니다 */}
      <span style={{ position: 'relative', textAlign: 'right', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', color: row.main_weapon === null || row.main_weapon === undefined ? V3.textGhost : V3.textDim }}>
        {row.main_weapon === 1 ? '스나수' : row.main_weapon === 0 ? '라플수' : '알수없음'}
      </span>
    </div>
    {openHex ? (
      <PlayerMatchHexV3 axes={hex} name={row.name} side={side} href={`/league/${leagueSlug}/player/${row.player_id}`} />
    ) : null}
    </>
  )
}

/**
 * ⚠ ★옛 판 — 서플라이 여섯 칸 줄★ (2026-09-22 ~ 2026-09-23 낮). 지금은 안 부른다 — `ScoreRow`(다섯 칸)가 대신한다.
 *   되살리려면 `t.stats.map` 에서 이 이름으로 바꾸고 `SB_COLS_*` 를 위 주석의 옛 격자로 (`CLAUDE.md` 1-4).
 */
function ScoreRowSupplySix({ row, me, mvp, weaponKnown, leagueSlug, side, maxDamage }: { row: MatchPlayerStat; me: boolean; mvp: boolean; weaponKnown: boolean; leagueSlug: string; side: 'red' | 'blue'; maxDamage: number }) {
  /* ★열림은 줄마다 따로★ — 다른 줄을 눌러도 안 접힌다 (2026-09-15 사장님) */
  const [openHex, setOpenHex] = useState(false)
  const hex = row.hexagon ?? []
  const sniper = weaponKnown && row.weapon === 1
  const clan = row.match_time_clan
  /* 딜량 막대는 ★그 경기 스무 명 중 최대★ 를 100% 로 잡는다 (서플라이와 같은 모양).
     분모가 0 이면 막대를 안 그린다 — 0 으로 나누지 않는다 */
  const damageBar = row.damage !== null && maxDamage > 0 ? Math.max(6, Math.round((row.damage / maxDamage) * 100)) : 0
  /* 래더 — 배치고사 중이면 점수가 없다. 색은 사이트 공통 층수 색(`floorColor`) */
  const ratingNode = row.placement || row.rating === null
    ? <span style={{ fontSize: 10.5, color: V3.textFaint, whiteSpace: 'nowrap' }}>배치고사</span>
    : <span style={{ fontSize: 11.5, fontWeight: 600, color: floorColor(row.rating), whiteSpace: 'nowrap' }}>{formatRating(row.rating)}</span>

  return (
    <>
    <div className="v3-score-row sac-sb-row" style={{ position: 'relative', overflow: 'hidden', padding: '8px 12px', borderBottom: `1px solid ${V3.rowDivider2}`, background: me ? 'linear-gradient(100deg,rgba(143,240,255,.14),rgba(143,240,255,.04) 55%,transparent)' : 'transparent', boxShadow: me ? 'inset 3px 0 0 #0891b2' : 'none' }}>
      {/* ★인식표★ — 지금은 안 그린다 (`SCORE_PLATE_ON`). 자리는 남긴다 */}
      {SCORE_PLATE_ON && row.nameplate ? <span aria-hidden className={`v3-plate-row v3-plate-row--${row.nameplate}`} /> : null}

      {/* ① 플레이어 — ★클랜마크는 이름 앞에 항상★. 폰에서는 밑에 래더가 붙는다 */}
      <span style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <MarkCircle clan={clan ? { slug: clan.slug, mark: clan.mark } : null} size={20} />
        <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, gap: 1 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
            {/* 닉네임을 누르면 그 판 육각이 펼쳐진다 (2026-09-15). 잴 재료가 없으면 옛날처럼 링크다 */}
            {hex.length > 0 ? (
              <button
                type="button"
                aria-expanded={openHex}
                onClick={(e) => { e.stopPropagation(); setOpenHex((v) => !v) }}
                style={{ all: 'unset', cursor: 'pointer', fontSize: 12.5, fontWeight: me ? 700 : 500, color: me ? '#124a56' : V3.text, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', borderBottom: `1px dotted ${openHex ? V3.blueSoft : 'rgba(120,136,170,.35)'}` }}
              >{row.name}</button>
            ) : (
              <a href={`/league/${leagueSlug}/player/${row.player_id}`} onClick={(e) => e.stopPropagation()} style={{ fontSize: 12.5, fontWeight: me ? 700 : 500, color: 'inherit', textDecoration: 'none', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <span style={{ color: me ? '#124a56' : V3.text }}>{row.name}</span>
              </a>
            )}
            {sniper ? <SniperMark /> : null}
            {mvp ? <MvpMark size={15} /> : null}
          </span>
          {/* ★폰에서만★ — 래더가 닉네임 밑으로 내려온다 (사진 2) */}
          <span className="sac-sb-phone-only">{ratingNode}</span>
        </span>
      </span>

      {/* ② 래더 — ★PC 에서만★ 따로 한 칸 (사진 4) */}
      <span className="sac-sb-pc-only" style={{ position: 'relative', textAlign: 'right', whiteSpace: 'nowrap' }}>{ratingNode}</span>

      {/* ③ kda — 「7 / 5 / 4」 밑에 「(58.3%)」. 퍼센트는 색깔시스템 */}
      <span style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.25 }}>
        <Kda kill={row.kill} death={row.death} assist={row.assist} size={13} />
        {row.kd_rate === null ? null : (
          <span style={{ fontSize: 10, fontWeight: 600, color: statColor(row.kd_rate), whiteSpace: 'nowrap' }}>({row.kd_rate.toFixed(1)}%)</span>
        )}
      </span>

      {/* ④ 무기 — ★그 판에 든 총★ 이다 (주무기 `main_weapon` 과 다르다). 폰은 줄여 쓴다 */}
      <span style={{ position: 'relative', textAlign: 'center', fontSize: 11.5, whiteSpace: 'nowrap', color: row.weapon === null ? V3.textGhost : V3.textDim }}>
        {row.weapon === null ? '알수없음' : (
          <>
            <span className="sac-sb-pc-only">{row.weapon === 1 ? '스나이퍼' : '라이플'}</span>
            <span className="sac-sb-phone-only sac-sb-inline">{row.weapon === 1 ? '스나' : '라플'}</span>
          </>
        )}
      </span>

      {/* ⑤ 딜량 — ★숫자가 막대 안★ (서플라이와 같은 모양). 트랙은 회색, 채움은 빨강 */}
      <span style={{ position: 'relative', minWidth: 0 }}>
        {row.damage === null ? <span style={{ display: 'block', textAlign: 'center' }}><Unknown /></span> : (
          <span style={{ position: 'relative', display: 'block', width: '100%', height: 18, borderRadius: 3, background: '#8d94a8', overflow: 'hidden' }}>
            <span aria-hidden style={{ position: 'absolute', inset: 0, width: `${damageBar}%`, background: '#f2727c' }} />
            <span style={{ position: 'relative', display: 'block', lineHeight: '18px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#ffffff' }}>{fmt(row.damage)}</span>
          </span>
        )}
      </span>

      {/* ⑥ 헤드샷 — ★PC 에서만★. 「1」 밑에 「(14.3%)」 */}
      <span className="sac-sb-pc-only" style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.25, whiteSpace: 'nowrap' }}>
        {row.headshot === null ? <Unknown /> : (
          <>
            <span style={{ fontSize: 12, fontWeight: 600, color: V3.text }}>{fmt(row.headshot)}</span>
            {row.headshot_percent === null ? null : (
              <span style={{ fontSize: 10, color: V3.textFaint }}>({row.headshot_percent.toFixed(1)}%)</span>
            )}
          </>
        )}
      </span>
    </div>
    {openHex ? (
      <PlayerMatchHexV3 axes={hex} name={row.name} side={side} href={`/league/${leagueSlug}/player/${row.player_id}`} />
    ) : null}
    </>
  )
}

/**
 * ★옛 줄★ — 플레이어 · K/D/A · 세이브 · 포지션 (2026-09-12 ~ 2026-09-22).
 *
 * 2026-09-22 에 서플라이 여섯 칸으로 갈아 끼우면서 ★이름만 바꿔 남겼다★ (`CLAUDE.md` 1-4).
 * `SUPPLY_SCORE_COLUMNS` 를 `false` 로 되돌리면 이 줄이 다시 그려진다.
 *
 * ⚠ ★세이브 칸과 포지션 칸은 여기에만 있다.★ 둘 다 서플라이 원본에 없는 칸이라
 *   새 줄에서 뺐다. ★값은 계약에 그대로 실려 온다★ (`row.saves` · `row.main_weapon`) —
 *   주무기는 새 줄에서도 스나 표시(`[S]`)로 남아 있고, 세이브만 화면에서 쉰다.
 */
function ScoreRowLegacy({ row, me, mvp, weaponKnown, showSaves, leagueSlug, side }: { row: MatchPlayerStat; me: boolean; mvp: boolean; weaponKnown: boolean; showSaves: boolean; leagueSlug: string; side: 'red' | 'blue' }) {
  /* ★열림은 줄마다 따로★ — 다른 줄을 눌러도 안 접힌다 (2026-09-15 사장님) */
  const [openHex, setOpenHex] = useState(false)
  const hex = row.hexagon ?? []
  const sniper = weaponKnown && row.weapon === 1
  /* 킬뎃은 포지션이 자리를 가져갔다 (2026-09-12 사장님). 값은 계약에 그대로 있다 */
  const kd = row.kd_rate
  void kd
  const clan = row.match_time_clan
  return (
    <>
    <div className={showSaves ? 'v3-score-row v3-score-row--saves' : 'v3-score-row'} style={{ ...(showSaves ? playerRowSavesStyle : playerRowStyle), background: me ? 'linear-gradient(100deg,rgba(143,240,255,.10),rgba(143,240,255,.02) 55%,transparent)' : 'transparent', boxShadow: me ? 'inset 3px 0 0 #0891b2, inset 0 0 26px rgba(143,240,255,.10)' : 'none' }}>
      {/* ★인식표★ — ASTRA 1~3위 먹구름 · 4~100위 흰구름 (2026-09-11 사장님). 글자 뒤에 깐다 */}
      {SCORE_PLATE_ON && row.nameplate ? <span aria-hidden className={`v3-plate-row v3-plate-row--${row.nameplate}`} /> : null}
      {SCORE_WATERMARKS && sniper ? <span aria-hidden style={{ position: 'absolute', left: '34%', top: '50%', transform: 'translate(-50%,-50%) skewX(-16deg) scaleY(0.9) scaleX(1.16)', fontSize: 25, fontWeight: 900, fontStyle: 'italic', letterSpacing: '.5em', color: V3.red, opacity: 0.17, WebkitTextStroke: `3.4px ${V3.red}`, whiteSpace: 'nowrap', pointerEvents: 'none' }}>SNIPER</span> : null}
      {SCORE_WATERMARKS && me ? <span aria-hidden style={{ position: 'absolute', left: '66%', top: '50%', transform: 'translateY(-50%) skewX(-12deg) scaleY(0.92)', fontSize: 24, fontWeight: 900, fontStyle: 'italic', letterSpacing: '.24em', color: '#0891b2', opacity: 0.14, WebkitTextStroke: '2.2px #0891b2', whiteSpace: 'nowrap', pointerEvents: 'none' }}>ME</span> : null}
      <span style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <MarkCircle clan={clan ? { slug: clan.slug, mark: clan.mark } : null} size={20} />
        {/* ★닉네임을 누르면 그 판 육각이 펼쳐진다★ (2026-09-15 사장님).
            ⚠ 옛 판은 ★선수 화면으로 가는 링크★ 였다 (2026-09-11). 그 길은 없어지지 않았다 —
              펼친 칸 안의 «기록실 →» 버튼으로 옮겼다.
            잴 재료가 없는 경기는 옛날처럼 링크다 — 눌러도 안 열리는 글자를 만들지 않는다 */}
        {hex.length > 0 ? (
          <button
            type="button"
            aria-expanded={openHex}
            onClick={(e) => { e.stopPropagation(); setOpenHex((v) => !v) }}
            style={{ all: 'unset', cursor: 'pointer', fontSize: 12.5, fontWeight: me ? 700 : 500, color: me ? '#124a56' : '#96a0b5', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', borderBottom: `1px dotted ${openHex ? V3.blueSoft : 'rgba(255,255,255,.22)'}` }}
          >{row.name}</button>
        ) : (
          <a href={`/league/${leagueSlug}/player/${row.player_id}`} onClick={(e) => e.stopPropagation()} style={{ ...{ fontSize: 12.5, fontWeight: me ? 700 : 500, color: me ? '#124a56' : '#96a0b5' }, ...{ color: 'inherit', textDecoration: 'none', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }}>{row.name}</a>
        )}
        {sniper ? <SniperMark /> : null}
        {/*
          ★MVP 는 닉네임 오른쪽★ (2026-09-20 사장님).
          ⚠ ★스나 표시가 있으면 그 오른쪽★ 이다 — 사장님이 그렇게 정하셨다.
            그래서 `SniperMark` 바로 뒤에 둔다.
          ⚠ 옛 자리(줄 맨 오른쪽 금색 ★)는 아래에서 지웠다 — 두 군데에 뜨면 지저분하다.
        */}
        {mvp ? <MvpMark size={15} /> : null}
      </span>
      <span style={{ position: 'relative' }}><Kda kill={row.kill} death={row.death} assist={row.assist} /></span>
      {showSaves ? (
        <span style={{ position: 'relative', textAlign: 'right', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', color: (row.saves ?? 0) >= 3 ? V3.cyan : (row.saves ?? 0) > 0 ? V3.textMuted : '#b6bece' }}>{row.saves === null ? '-' : `${row.saves}/${row.save_chances ?? 0}`}</span>
      ) : null}
      {/* ★포지션★ (2026-09-12 사장님) — 킬뎃 % 대신 스나수 / 라플수. 아직 못 잰 선수는 «알수없음».
          그 판에 든 총이 아니라 ★주무기★ 다. 판수가 차면 옛 경기 화면에도 소급해서 뜬다 */}
      <span style={{ position: 'relative', textAlign: 'right', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', color: row.main_weapon === null || row.main_weapon === undefined ? '#96a0b5' : '#96a0b5' }}>
        {row.main_weapon === 1 ? '스나수' : row.main_weapon === 0 ? '라플수' : '알수없음'}
      </span>
      {/*
        ⚠ ★옛 자리★ — 여기 금색 ★ 이 있었다 (2026-09-12). 2026-09-20 에 사장님이
          「닉네임 오른쪽에 넣어」 라고 하셔서 위로 옮겼다. ★칸은 남긴다★ —
          격자가 5칸이라 하나를 빼면 줄이 어긋난다.
      */}
      <span aria-hidden style={{ position: 'relative' }} />
    </div>
    {openHex ? (
      <PlayerMatchHexV3 axes={hex} name={row.name} side={side} href={`/league/${leagueSlug}/player/${row.player_id}`} />
    ) : null}
    </>
  )
}

/** 스코어보드의 «우리 팀» — API 가 준 `viewer_side`. 없으면 명단의 소속으로 찾고, 그것도 없으면 red (2026-09-10 사장님 지적 — 팀이 뒤바뀌던 버그) */
export function viewerSideOf(detail: MatchDetail): 'red' | 'blue' {
  if (detail.viewer_side) return detail.viewer_side
  const ours = detail.league_clan.league_clan_id
  const redOurs = detail.red_stats.filter((s) => s.match_time_clan?.league_clan_id === ours).length
  const blueOurs = detail.blue_stats.filter((s) => s.match_time_clan?.league_clan_id === ours).length
  if (redOurs !== blueOurs) return redOurs > blueOurs ? 'red' : 'blue'
  return detail.player_stat?.side ?? 'red'
}

function Scoreboard({ detail, me, leagueCategory, leagueSlug }: { detail: MatchDetail; me: string; leagueCategory: string; leagueSlug: string }) {
  const mySide = viewerSideOf(detail)
  /* 2026-09-11 사장님: 집계 전 경기라고 세이브 칸이 통째로 사라지면 «없는 화면» 처럼 보인다 →
     칸은 늘 두고 아직 모르는 값만 «-» 로 적는다 (0 으로 채우지 않는다). 옛 판: [...].some((s) => s.saves !== null) */
  const showSaves = detail.red_stats.length + detail.blue_stats.length > 0
  /**
   * 라운드 스코어 — 지금은 머리줄에서 뺐다 (2026-09-12 사장님: «경기분석 옆에 라운드
   * 스코어 없애줘»). 함수는 ★남긴다★ — 되살릴 때 쓴다 (CLAUDE.md 1-4).
   */
  const roundsOf = (side: 'red' | 'blue') => (side === 'red' ? detail.red_rounds : detail.blue_rounds)
  void roundsOf
  const teams = ([mySide, mySide === 'red' ? 'blue' : 'red'] as const).map((side) => {
    const raw = side === 'red' ? detail.red_stats : detail.blue_stats
    /* ★킬 많은 순★ 위→아래 (2026-09-23 사장님 「명단 킬 많이한 순서대로」). 같으면 데스 적은 쪽. 킬 모르면 맨 아래. 옛 순서는 LINEUP_BY_KILLS=false */
    const stats = LINEUP_BY_KILLS ? [...raw].sort((a, b) => ((b.kill ?? -1) - (a.kill ?? -1)) || ((a.death ?? 999) - (b.death ?? 999))) : raw
    const ours = side === mySide
    const snap = teamSnapOf(detail, side, ours ? detail.league_clan : detail.opponent)
    const won = ours ? detail.win : !detail.win
    const theme = clanThemeOf(snap.clan.slug)
    return { side, stats, snap, won, theme }
  })
  /* ★경기분석★ (2026-09-11 사장님) — 누르면 그 팀 명단을 접고 그 자리에 이 판 육각형을 그린다.
     이긴 팀 파랑 · 진 팀 빨강 한 판 위에 겹쳐서. 버튼은 ★양 팀 다★ 달되 한 번에 하나만 펴진다.
     자료는 이미 이 응답에 실려 온다(`red_hexagon_v2`/`blue_hexagon_v2`) — 왕복이 늘지 않는다 */
  const [analysis, setAnalysis] = useState<'red' | 'blue' | null>(null)
  /**
   * ★폰에서 무엇을 그릴지 고르개★ (2026-09-12 사장님).
   *
   * > «모바일에서는 승리팀클랜명/진팀클랜명/겹쳐서보기 이렇게 세개 선택 해서 볼 수 있게»
   *
   * PC 는 가운데에 겹친 판이 늘 떠 있어서 고를 것이 없다. 폰은 그 자리가 없으니
   * 한 그림을 놓고 ★칩 세 개★ 로 갈아 끼운다. 칩은 900px 미만에서만 보인다.
   * 처음 켤 때는 ★누른 팀★ 이 골라져 있다.
   */
  const [pick, setPick] = useState<'won' | 'lost' | 'both'>('won')
  const hexOf = (side: 'red' | 'blue') => (side === 'red' ? detail.red_hexagon_v2 : detail.blue_hexagon_v2)?.hexagon ?? null
  /* 배틀로그가 없는 옛 경기는 버튼을 아예 안 그린다 (지어내지 않는다) */
  const canAnalyze = hexOf('red') !== null && hexOf('blue') !== null
  const wonTeam = teams.find((t) => t.won) ?? teams[0]
  const lostTeam = teams.find((t) => !t.won) ?? teams[1]
  /* 딜량 막대의 분모 — ★그 경기 스무 명 중 최대★. 한쪽 팀만으로 재면 팀끼리 길이가 안 맞는다 */
  const maxDamage = Math.max(0, ...[...detail.red_stats, ...detail.blue_stats].map((r) => r.damage ?? 0))
  /* 딜량 막대는 옛 여섯 칸 줄(`ScoreRowSupplySix`)만 썼다 — 값은 남긴다 */
  void maxDamage
  /* ★경기 길이★ — 폰 머리줄의 「22분 10초」. 끝난 때를 모르면 안 적는다 (지어내지 않는다).
     접힌 줄(PC)도 ★같은 함수★ 를 쓴다 — 두 곳이 다른 수를 적을 일이 없다 */
  const duration = durationOf(detail.start_at, detail.end_at)
  return (
    <div className="v3-board" style={{ background: V3.plot, borderTop: `1px solid ${V3.divider}`, padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <style>{SCOREBOARD_CSS}</style>
      {/*
        ★머리줄★ — 서플라이 실측: 「제3보급창고  5 vs 5 ... 게임시작시간: 2026년 6월 4일 오후 9시 59분」.
        ⚠ 우리 `fullKst` 는 24시간 표기(「21시 59분」)다. 서플라이는 「오후 9시 59분」 이다 —
          ★같은 시각★ 이고 말씨만 다르다. 사이트 전체가 24시간 표기라 여기만 바꾸지 않는다.
      */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 2px 4px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: V3.textStrong, whiteSpace: 'nowrap' }}>{detail.map.name}</span>
          <span style={{ fontSize: 11.5, color: V3.textDim, whiteSpace: 'nowrap' }}>{Math.round(detail.player_count / 2)} vs {Math.round(detail.player_count / 2)}</span>
          <div style={spacerStyle} />
          {/* ★폰은 여기에 경기 길이★ (사진 2 의 「22분 10초」). PC 는 접힌 줄에 이미 있다 */}
          {duration === null ? null : <span className="sac-sb-phone-only sac-sb-inline" style={{ fontSize: 11, color: V3.textFaint, whiteSpace: 'nowrap' }}>{duration}</span>}
          {/* ★PC 는 한 줄 오른쪽 끝★ (사진 4) */}
          <span className="sac-sb-pc-only" style={{ fontSize: 11, color: V3.textFaint, whiteSpace: 'nowrap' }}>게임시작시간: {gameStartKst(detail.start_at)}</span>
        </div>
        {/* ★폰은 둘째 줄★ (사진 2 의 「게임시작 - 2026년 4월 13일 오전 12시 21분」) */}
        <span className="sac-sb-phone-only" style={{ fontSize: 11, color: V3.textFaint, textAlign: 'right' }}>게임시작 - {gameStartKst(detail.start_at)}</span>
      </div>
      {teams.map((t) => (
        /* ★이긴 팀 하늘색 · 진 팀 빨강★ (2026-09-12 사장님) */
        <div key={t.side} className={t.won ? 'v3-board-win' : 'v3-board-lose'} style={{ border: `1px solid ${t.won ? WIN_LOSS.winLine : WIN_LOSS.loseLine}`, borderRadius: 8, background: t.won ? WIN_LOSS.winBg : WIN_LOSS.loseBg }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0, overflow: 'hidden', padding: '9px 14px', borderBottom: `1px solid ${V3.rowDivider}`, borderLeft: `2px solid ${t.theme.deep}` }}>
            {/*
              ★서플라이 차례★ (2026-09-22) — 「패배  ◉ des`per@do.  (선레드)  -  1부리그 1,508점」.
              ⚠ 옛 차례는 «마크 · 이름 · 티어 · 승패» 였다. 값은 하나도 안 없앴다 —
                ★승패를 맨 앞으로★ 옮기고 ★(선레드/선블루)★ 와 ★클랜 점수★ 를 더했다.
            */}
            <span style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', flex: 'none', color: t.won ? WIN_LOSS.winInk : WIN_LOSS.loseInk }}>{t.won ? '승리' : '패배'}</span>
            <MarkCircle clan={t.snap.clan} size={22} />
            {/* ★넘치면 이름이 줄어든다★ (2026-09-12 사장님: «저 버튼이 튀어나가지 않게해줘»).
                minWidth:0 이 없으면 flex 칸이 안 줄어들어 단추가 화면 밖으로 밀린다 */}
            <span style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, color: t.won ? WIN_LOSS.winInk : WIN_LOSS.loseInk }}>{t.snap.clan.name}</span>
            {/*
              ★선레드 / 선블루★ — ★슬롯 이름으로 적지 않는다.★ 우리 red/blue 는 수집 때
              `team_id` 오름차순으로 정한 내부 슬롯이라 진영이 아니다 (D-207). 근거인
              `first_side`(보는 쪽 기준)에서 만든다 — 이미 있는 `teamFirstSideLabel` 을 쓴다.
              화면마다 다시 세지 않는다.
            */}
            {/* ★PC 는 클랜명 바로 뒤 괄호★ (사진 4). 폰은 줄 오른쪽 끝이라 아래에서 그린다 */}
            {teamFirstSideLabel(t.side === mySide, detail.first_side) ? (
              <span className="sac-sb-pc-only" style={{ fontSize: 10.5, color: V3.textFaint, whiteSpace: 'nowrap', flex: 'none' }}>({teamFirstSideLabel(t.side === mySide, detail.first_side)})</span>
            ) : null}
            {/* ★PC 만★ — 「- 1부리그 1,508점」. 폰 사진(2)의 팀줄에는 티어도 점수도 없다 */}
            <span className="sac-sb-pc-only" style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
              {t.snap.division !== null || t.snap.rating !== null ? <span style={{ fontSize: 10.5, color: V3.textGhost }}>-</span> : null}
              {t.snap.division !== null ? <TierText division={t.snap.division} leagueCategory={leagueCategory} size={10} /> : null}
              {t.snap.rating !== null ? (
                <span style={{ fontSize: 11.5, fontWeight: 600, color: V3.textMuted, whiteSpace: 'nowrap' }}>{formatRating(t.snap.rating)}</span>
              ) : t.snap.placement ? (
                <span style={{ fontSize: 10.5, color: V3.textFaint, whiteSpace: 'nowrap' }}>배치고사</span>
              ) : null}
            </span>
            <div style={spacerStyle} />
            {/* ★폰은 선레드/선블루가 줄 오른쪽 끝★ · 괄호 없음 (사진 2) */}
            {teamFirstSideLabel(t.side === mySide, detail.first_side) ? (
              <span className="sac-sb-phone-only sac-sb-inline" style={{ fontSize: 11.5, fontWeight: 600, color: V3.textDim, whiteSpace: 'nowrap', flex: 'none' }}>{teamFirstSideLabel(t.side === mySide, detail.first_side)}</span>
            ) : null}
            {/*
              ★아직 못 잰 경기는 «경기분석중»★ (2026-09-12 사장님: «아직 경기분석 안된 경기는
              경기분석중 이라고 표시해줘»). 배틀로그가 안 들어오면 육각형을 못 그린다 —
              단추가 그냥 사라지면 «이 경기는 원래 없는 기능» 처럼 보인다. 그래서 자리를 남긴다.
            */}
            {!canAnalyze ? (
              <span style={{ fontSize: 10.5, fontWeight: 700, whiteSpace: 'nowrap', flex: 'none', padding: '3px 9px', borderRadius: V3.radiusChip, color: '#767f96', border: '1px dashed rgba(93,107,138,.45)' }}>
                경기분석중
              </span>
            ) : null}
            {canAnalyze ? (
              <span
                onClick={(e) => { e.stopPropagation(); setPick(t.won ? 'won' : 'lost'); setAnalysis((now) => (now === t.side ? null : t.side)) }}
                style={{ fontSize: 10.5, fontWeight: 700, whiteSpace: 'nowrap', flex: 'none', cursor: 'pointer', padding: '3px 9px', borderRadius: V3.radiusChip, color: analysis === t.side ? '#1d4fd6' : '#5c6479', border: `1px solid ${analysis === t.side ? 'rgba(159,192,255,.55)' : 'rgba(143,169,216,.32)'}`, background: analysis === t.side ? 'rgba(91,141,255,.16)' : 'transparent' }}
              >
                {analysis === t.side ? '명단' : '경기분석'}
              </span>
            ) : null}
            {/*
              ★라운드 스코어를 뺐다★ (2026-09-12 사장님: «경기분석 옆에 라운드 스코어 없애줘»).

              그 줄은 이미 카드 머리에 «7:5» 로 적혀 있다. 팀 칸마다 또 적으니 같은 수가
              한 화면에 세 번 나왔고, 폰에서는 그 글자 때문에 경기분석 단추가 오른쪽으로 밀려
              화면 밖으로 튀어나갔다.

              ⚠ 옛 판 — 여기에 «7:5» 를 적었다. 그 앞에는 «RED» · «BLUE» 였다.
                되살리려면 아래 한 줄을 쓰면 된다 (`CLAUDE.md` 1-4) —
                {roundsOf(t.side) !== null && roundsOf(other) !== null ? `${roundsOf(t.side)}:${roundsOf(other)}` : null}
            */}
          </div>
          {/* ⚠ ★옛 판★ (2026-09-23 낮) — 폰에서 경기분석이 ★명단 자리★ 에 들어왔다.
              오후 지시로 ★명단을 그대로 두고 아래로★ 옮겼다 (`PHONE_ANALYSIS_IN_LIST` 로 되돌린다) */}
          {PHONE_ANALYSIS_IN_LIST && analysis === t.side ? (
            <div className="v3-board-inline" style={{ padding: '14px 10px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              {/*
                ★칩 셋★ — 승리팀 · 진팀 · 겹쳐서 (2026-09-12 사장님). 폰에서만 보인다.
                `id` 에 고른 값을 넣어 갈아 끼울 때마다 ★다시 그려지게★ 한다.
              */}
              <div className="v3-hexpick">
                {([['won', wonTeam?.snap.clan.name ?? '승리'], ['lost', lostTeam?.snap.clan.name ?? '패배'], ['both', '겹쳐서']] as const).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setPick(key) }}
                    className={`v3-hexpick__chip v3-hexpick__chip--${key} ${pick === key ? 'is-on' : ''}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <MatchHexagonV3
                won={wonTeam ? hexOf(wonTeam.side) : null}
                lost={lostTeam ? hexOf(lostTeam.side) : null}
                wonName={wonTeam?.snap.clan.name ?? '승리'}
                lostName={lostTeam?.snap.clan.name ?? '패배'}
                /* ★고른 것만★ (2026-09-12 사장님). 「겹쳐서」면 옛 판대로 두 팀을 겹친다 */
                only={pick === 'both' ? null : pick}
                id={`mhex-${detail.id}-${t.side}-${pick}`}
              />
              {SHOW_MVP_WHY ? <MvpWhy detail={detail} /> : null}
              {detail.round_flow && wonTeam && lostTeam ? (
                <div style={{ width: '100%' }}>
                  <RoundFlowChartV3
                    flow={detail.round_flow}
                    winner={{ side: wonTeam.side, name: wonTeam.snap.clan.name, slug: wonTeam.snap.clan.slug, theme: wonTeam.theme }}
                    loser={{ side: lostTeam.side, name: lostTeam.snap.clan.name, slug: lostTeam.snap.clan.slug, theme: lostTeam.theme }}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
          {/* ★명단은 늘 펴 둔다★ (2026-09-23 오후) — 경기분석은 명단을 접지 않고 ★밑으로★ 붙는다 */}
          {/* ★PC — 경기분석을 누르면 ★진 팀 명단 자리★ 에 육각이 명단 크기로 들어온다★ (2026-09-23 오후 사장님:
              「왼쪽 기둥은 너무 작아 · 진팀 명단 위에 넣어줘 · 육각이 명단에 딱 들어가게」). 폰(<900)은 안 그린다 — 명단 밑 육각이 있다 */}
          {!t.won && canAnalyze && analysis !== null ? (
            <div className="v3-board-hexin">
              <MatchHexagonV3
                won={wonTeam ? hexOf(wonTeam.side) : null}
                lost={lostTeam ? hexOf(lostTeam.side) : null}
                wonName={wonTeam?.snap.clan.name ?? '승리'}
                lostName={lostTeam?.snap.clan.name ?? '패배'}
                id={`mhexIn-${detail.id}`}
              />
            </div>
          ) : null}
          <div className={`v3-board-list${PHONE_ANALYSIS_IN_LIST && analysis === t.side ? ' v3-board-list--closed' : ''}${!t.won && canAnalyze && analysis !== null ? ' v3-board-list--hexin' : ''}`}>
          {/* ★칸 이름★ — 서플라이 여섯 칸. 옛 넉 칸(플레이어·K/D/A·세이브·포지션)은 밑에 남겼다 */}
          {SUPPLY_SCORE_COLUMNS ? (
            /* ★줄과 ★같은 격자★(`sac-sb-row`)를 써야 칸이 어긋나지 않는다 */
            <div className="v3-score-row sac-sb-row" style={{ padding: '7px 12px', borderBottom: `1px solid ${V3.rowDivider}`, fontSize: 10, color: '#98a1b5', whiteSpace: 'nowrap' }}>
              {/* 2026-09-23 오후 사장님 ①-4 — 순위·kda·세이브·포지션. 옛 머리(래더·kda·무기·딜량·헤드샷)는 `ScoreRowSupplySix` 주석 참조 */}
              <span>플레이어</span>
              <span style={{ textAlign: 'right' }}>순위</span>
              <span style={{ textAlign: 'center' }}>kda</span>
              <span style={{ textAlign: 'right' }}>세이브</span>
              <span style={{ textAlign: 'right' }}>포지션</span>
            </div>
          ) : (
            <div className={showSaves ? 'v3-score-row v3-score-row--saves' : 'v3-score-row'} style={{ display: 'grid', gridTemplateColumns: showSaves ? 'minmax(96px,1fr) 86px 44px 58px' : 'minmax(96px,1fr) 86px 58px', gap: 10, padding: '8px 14px', borderBottom: `1px solid ${V3.rowDivider}`, fontSize: 9.5, color: '#b6bece', letterSpacing: '.08em', whiteSpace: 'nowrap' }}>
              <span>플레이어</span><span>K / D / A</span>{showSaves ? <span style={{ textAlign: 'right' }}>세이브</span> : null}<span style={{ textAlign: 'right' }}>포지션</span><span />
            </div>
          )}
          {t.stats.length === 0 ? <div style={{ padding: '10px 14px', fontSize: 11, color: V3.textGhost }}>기록이 없습니다</div> : null}
          {t.stats.map((row) => (
            SUPPLY_SCORE_COLUMNS ? (
              <ScoreRow key={row.player_id} row={row} me={row.player_id === me} mvp={row.mvp === true} weaponKnown={row.weapon !== null} leagueSlug={leagueSlug} side={t.side} />
            ) : (
              <ScoreRowLegacy key={row.player_id} row={row} me={row.player_id === me} mvp={row.mvp === true} weaponKnown={row.weapon !== null} showSaves={showSaves} leagueSlug={leagueSlug} side={t.side} />
            )
          ))}
          </div>
        </div>
      ))}
      {/*
        ★★2026-09-23 오후 — 경기분석 칸을 다시 앉혔다★★ (사장님 지시 ①-2 · ①-3).
        육각은 ★본문 바깥 왼쪽 여백 기둥★ 에 sticky 로 · 라운드 흐름은 ★명단 바로 밑★.
        자세한 그림과 옛 판 설명은 `ClanDetailV3.tsx` 의 같은 자리에 적어 뒀다 — 두 파일이 같은 칸이다.
      */}
      {PILLAR_HEX && canAnalyze && analysis !== null ? (
        <div className="v3-board-pillar">
          <div className="v3-board-pillar__in">
            <MatchHexagonV3
              won={wonTeam ? hexOf(wonTeam.side) : null}
              lost={lostTeam ? hexOf(lostTeam.side) : null}
              wonName={wonTeam?.snap.clan.name ?? '승리'}
              lostName={lostTeam?.snap.clan.name ?? '패배'}
              id={`mhexPc-${detail.id}`}
            />
          </div>
        </div>
      ) : null}
      {canAnalyze && analysis !== null ? (
        <div className="v3-board-flow">
          {/* ★폰(과 좁은 PC)의 육각★ — 명단 밑 · 그래프 앞 */}
          <div className="v3-board-hexphone">
            <div className="v3-hexpick">
              {([['won', wonTeam?.snap.clan.name ?? '승리'], ['lost', lostTeam?.snap.clan.name ?? '패배'], ['both', '겹쳐서']] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setPick(key) }}
                  className={`v3-hexpick__chip v3-hexpick__chip--${key} ${pick === key ? 'is-on' : ''}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <MatchHexagonV3
              won={wonTeam ? hexOf(wonTeam.side) : null}
              lost={lostTeam ? hexOf(lostTeam.side) : null}
              wonName={wonTeam?.snap.clan.name ?? '승리'}
              lostName={lostTeam?.snap.clan.name ?? '패배'}
              only={pick === 'both' ? null : pick}
              id={`mhexPhone-${detail.id}-${pick}`}
            />
          </div>
          {SHOW_MVP_WHY ? <MvpWhy detail={detail} /> : null}
          {/* ★라운드 흐름★ — 명단 바로 밑 (2026-09-23 오후) */}
          {detail.round_flow && wonTeam && lostTeam ? (
            <RoundFlowChartV3
              flow={detail.round_flow}
              winner={{ side: wonTeam.side, name: wonTeam.snap.clan.name, slug: wonTeam.snap.clan.slug, theme: wonTeam.theme }}
              loser={{ side: lostTeam.side, name: lostTeam.snap.clan.name, slug: lostTeam.snap.clan.slug, theme: lostTeam.theme }}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/**
 * ★★접힌 경기 줄 — 폰과 PC 가 다르다★★ (2026-09-22 사장님:
 *   「경기상세 카드 ★모바일★ 은 앞쪽 두장 ★피씨★ 는 뒤쪽두장 처럼 생겼음」)
 *
 * ── 폰 (사진 1)
 * ```
 *  ┌ 제3보급창고  -  5달 전                        -14점 ┐  ← 머리줄
 *  │▌ 패배   3 / 10 / 4      ◉ galactico-           ⌄  │
 *  │▌       (23.1%)           vs                       │
 *  │▌                        ◉ saint                   │
 *  └───────────────────────────────────────────────────┘
 *     ↑ 왼쪽 굵은 세로 바 (승 파랑 · 패 빨강) · 카드 전체가 연한 승패색
 * ```
 *
 * ── PC (사진 3)
 * ```
 *  ▌제3보급창고 │ 래더 │ 7 / 5 / 4 │ ◉des`per@do. vs ◉saint    │ 성쉴[S] 갱욱      │ 상세
 *  ▌10분 36초  │ +9점 │ (58.3%)   │ 1부리그1,508점 1부리그1,484점│ flare  울산KKW[S] │ 보기
 *  ▌승리       │      │           │                            │ 근면   규엉       │  ⌄
 *  ▌3달 전     │      │           │                            │ palry  vddv       │
 *  ▌           │      │           │                            │ igoya  bok        │
 * ```
 *
 * ── ★두 판을 따로 그린다★ (한 격자를 접는 대신)
 *   폰과 PC 는 ★칸 수도 차례도 다르다.★ 한 격자를 미디어쿼리로 접으면 규칙이 열 줄을
 *   넘고, 2026-09-17 무한 QA 때 이미 그 방식으로 ★이름이 한 글자까지 눌린 사고★ 가 났다
 *   (아래 `matchRowStyle` 주석). 그래서 markup 을 둘로 나누고 CSS 로 하나만 보인다.
 *   ⚠ 값은 ★같은 곳★ 에서 읽는다 — 두 판이 다른 수를 적을 일이 없다.
 *
 * ⚠ ★옛 판(한 격자 · 세 줄)은 `MatchRowsLegacy` 로 남겼다★ (`CLAUDE.md` 1-4).
 *   `SUPPLY_MATCH_ROWS` 를 `false` 로 되돌리면 그대로 돌아온다.
 */
/**
 * ★★경기 카드를 하나로★★ (2026-09-22 밤 · 사장님: 「경기카드는 무조건 통일이다 /
 * Pc에서도 한가지 형식 / 모바일에서도 한가지 형식」).
 * `true` 면 공용 `MatchCardV3` 를 그린다. `false` 로 두면 이 화면의 옛 카드가 그대로 돌아온다 (`CLAUDE.md` 1-4).
 */
const UNIFIED_MATCH_CARD: boolean = true
const SUPPLY_MATCH_ROWS = true

/** 폰/PC 갈림목 — 스코어보드(`SB_PHONE_MAX`)와 ★같은 값★ 이다. 두 곳이 갈라지면 카드가 반쪽씩 바뀐다 */
const MATCH_ROW_CSS = `
.sac-pm-phone { display: none; }
@media (max-width: ${SB_PHONE_MAX}px) {
  .sac-pm-pc { display: none !important; }
  .sac-pm-phone { display: block; }
}
`

/**
 * ★「5달 전」★ — 서플라이는 달까지 센다. 공용 `relativeKst` 는 「N일 전 HH:MM」 이라
 * 150일이 넘으면 「152일 전」 이 된다. ★거기는 안 건드린다★ — 다른 화면이 그 꼴을 쓴다.
 */
function shortAgo(iso: string): string {
  const at = Date.parse(iso)
  if (!Number.isFinite(at)) return ''
  const min = Math.floor((Date.now() - at) / 60_000)
  if (min < 1) return '방금'
  if (min < 60) return `${min}분 전`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}시간 전`
  const d = Math.floor(h / 24)
  if (d < 31) return `${d}일 전`
  const mo = Math.floor(d / 30)
  return mo < 12 ? `${mo}달 전` : `${Math.floor(mo / 12)}년 전`
}

/** 래더 증감 — 「+9점」 파랑 · 「-14점」 빨강. 0 이나 모르면 안 적는다 (지어내지 않는다) */
function RatingDelta({ value, size = 12 }: { value: number | null | undefined; size?: number }) {
  if (value === null || value === undefined || value === 0) return null
  return (
    <span style={{ fontSize: size, fontWeight: 700, whiteSpace: 'nowrap', color: value > 0 ? WIN_LOSS.winInk : WIN_LOSS.loseInk }}>
      {value > 0 ? '+' : ''}{fmt(value)}점
    </span>
  )
}

/** 명단 한 칸 — PC 접힌 줄의 오른쪽 두 열 (사진 3). 내 이름은 굵게 */
function LineupCol({ rows, meId }: { rows: readonly MatchLineupEntry[]; meId: string }) {
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
      {rows.map((r) => (
        <span key={r.player_id} style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
          <MarkCircle clan={r.match_time_clan ? { slug: r.match_time_clan.slug, mark: r.match_time_clan.mark } : null} size={15} />
          <span style={{ fontSize: 11, fontWeight: r.player_id === meId ? 700 : 400, color: r.player_id === meId ? V3.textStrong : V3.textDim, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{r.name}</span>
          {r.weapon === 1 ? <span style={{ fontSize: 9, fontWeight: 700, color: V3.red, flex: 'none' }}>[S]</span> : null}
        </span>
      ))}
    </span>
  )
}

function MatchRows({ data, leagueSlug, matches, expanded, onExpand }: Pick<PlayerDetailV3Props, 'data' | 'leagueSlug' | 'matches' | 'expanded' | 'onExpand'>) {
  const [open, setOpen] = useState<string | null>(null)
  if (UNIFIED_MATCH_CARD) {
    return (
      <MatchCardListV3
        style={{ marginTop: 12 }}
        matches={matches}
        league={{ category: data.league.category, slug: data.league.slug }}
        viewer={{ playerId: data.player.id }}
        expanded={expanded}
        onExpand={onExpand}
        /* 펼치면 스코어보드 — 경기분석 단추도 그 안에 있다 */
        renderDetail={(d) => <Scoreboard detail={d} me={data.player.id} leagueCategory={data.league.category} leagueSlug={leagueSlug} />}
      />
    )
  }
  if (!SUPPLY_MATCH_ROWS) return <MatchRowsLegacy data={data} leagueSlug={leagueSlug} matches={matches} expanded={expanded} onExpand={onExpand} />
  return (
    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <style>{MATCH_ROW_CSS}</style>
      {matches.map((m) => {
        const isOpen = open === m.id
        const edge = m.win ? V3.blue : V3.red
        const my = m.player_stat
        const mvpIsMe = m.mvp_player_id !== null && m.mvp_player_id === data.player.id
        const detail = expanded[m.id]
        /* 명단이 아직 안 들어온 경기 — 펼치지 않는다 (2026-09-10 사장님: «킬데스 수집중») */
        const pending = m.red.length === 0 && m.blue.length === 0
        const toggle = () => { if (pending) return; setOpen(isOpen ? null : m.id); if (!isOpen) onExpand(m) }
        /* 내 팀이 어느 쪽인가 — 명단 두 열의 왼쪽이 ★내 팀★ 이다 (사진 3) */
        const mySide = my?.side ?? 'red'
        const mine = mySide === 'red' ? m.red : m.blue
        const theirs = mySide === 'red' ? m.blue : m.red
        const kda = my ? <Kda kill={my.kill} death={my.death} assist={my.assist} size={16} /> : <span style={{ fontSize: 11, color: V3.textGhost }}>기록 없음</span>
        const kdPct = my && my.kd_rate !== null
          ? <span style={{ fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap', color: statColor(my.kd_rate) }}>({my.kd_rate.toFixed(1)}%)</span>
          : null
        const chevron = <span style={{ fontSize: 13, color: pending ? '#b6bece' : edge }}>{isOpen ? '⌃' : '⌄'}</span>

        return (
          <div key={m.id} style={{ border: `1px solid ${m.win ? V3.winFaceLine : V3.loseFaceLine}`, borderRadius: V3.radiusCard, overflow: 'hidden', background: m.win ? V3.winFace : V3.loseFace, opacity: pending ? 0.75 : 1 }}>

            {/* ══ 폰 (사진 1) ══ */}
            <div className="sac-pm-phone" onClick={toggle} style={{ cursor: pending ? 'default' : 'pointer' }}>
              {/* 머리줄 — 맵 · N달 전 / 오른쪽에 래더 증감 */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '9px 13px', borderBottom: `1px solid ${m.win ? V3.winFaceLine : V3.loseFaceLine}`, background: 'transparent' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: V3.textStrong, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{m.map.name}</span>
                <span style={{ fontSize: 11.5, color: V3.textFaint, whiteSpace: 'nowrap' }}>- {shortAgo(matchShownAt(m))}</span>
                <div style={spacerStyle} />
                <RatingDelta value={m.rating_update} size={12.5} />
              </div>
              {/* 본문 — 승패 / K·D·A / 양 팀 세로 / 펼치기 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr) auto 30px', alignItems: 'center', gap: 8, padding: '12px 4px 12px 13px' }}>
                <span style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', color: edge }}>{m.win ? '승리' : '패배'}</span>
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, minWidth: 0 }}>
                  {pending ? <span style={{ fontSize: 11.5, color: V3.textFaint }}>킬데스 수집중</span> : kda}
                  {kdPct}
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, minWidth: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <MarkCircle clan={m.league_clan.clan} size={20} />
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: m.win ? WIN_LOSS.winInk : WIN_LOSS.loseInk, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{m.league_clan.clan.name}</span>
                  </span>
                  <span style={{ fontSize: 10, color: V3.textGhost, paddingLeft: 26 }}>vs</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <MarkCircle clan={m.opponent.clan} size={20} />
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: m.win ? WIN_LOSS.loseInk : WIN_LOSS.winInk, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{m.opponent.clan.name}</span>
                  </span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', borderLeft: `1px solid ${m.win ? V3.winFaceLine : V3.loseFaceLine}` }}>{chevron}</span>
              </div>
            </div>

            {/* ══ PC (사진 3) ══ */}
            <div className="sac-pm-pc" onClick={toggle} style={{ display: 'grid', gridTemplateColumns: '108px 62px 92px minmax(180px,1fr) minmax(210px,260px) 52px', alignItems: 'center', gap: 12, padding: '11px 14px', cursor: pending ? 'default' : 'pointer' }}>
              {/* ① 맵 · 경기길이 · 승패 · N달 전 */}
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: V3.textStrong, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.map.name}</span>
                {m.end_at ? <span style={{ fontSize: 10.5, color: V3.textFaint, whiteSpace: 'nowrap' }}>{durationOf(m.start_at, m.end_at) ?? ''}</span> : null}
                <span style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', color: edge }}>{m.win ? '승리' : '패배'}</span>
                <span style={{ fontSize: 10.5, color: V3.textFaint, whiteSpace: 'nowrap' }}>{shortAgo(matchShownAt(m))}</span>
              </span>
              {/* ② 래더 증감 */}
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, whiteSpace: 'nowrap' }}>
                <span style={{ fontSize: 10.5, color: V3.textGhost2 }}>래더</span>
                <RatingDelta value={m.rating_update} size={12.5} />
              </span>
              {/* ③ 내 K/D/A */}
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, minWidth: 0 }}>
                {pending ? <span style={{ fontSize: 11.5, color: V3.textFaint, whiteSpace: 'nowrap' }}>킬데스 수집중</span> : kda}
                {kdPct}
                {mvpIsMe ? <MvpMark size={15} /> : null}
              </span>
              {/* ④ 양 팀 — 이름 밑에 티어·점수 (사진 3) */}
              <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <ClanSide snap={m.league_clan} ink={m.win ? WIN_LOSS.winInk : WIN_LOSS.loseInk} league={data.league} />
                <span style={{ fontSize: 10.5, color: V3.textGhost, flex: 'none' }}>vs</span>
                <ClanSide snap={m.opponent} ink={m.win ? WIN_LOSS.loseInk : WIN_LOSS.winInk} league={data.league} />
              </span>
              {/* ⑤ 명단 두 열 — 왼쪽이 내 팀 */}
              {pending ? <span style={{ fontSize: 10.5, color: V3.textGhost }}>명단 수집중</span> : (
                <span style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 10, minWidth: 0 }}>
                  <LineupCol rows={mine} meId={data.player.id} />
                  <LineupCol rows={theirs} meId={data.player.id} />
                </span>
              )}
              {/* ⑥ 상세보기 */}
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, whiteSpace: 'nowrap', fontSize: 10.5, color: pending ? '#b6bece' : isOpen ? '#1d4fd6' : V3.textDim }}>
                {pending ? <span>수집중</span> : <><span>상세</span><span>보기</span>{chevron}</>}
              </span>
            </div>

            {isOpen ? (
              detail ? <Scoreboard detail={detail} me={data.player.id} leagueCategory={data.league.category} leagueSlug={data.league.slug} /> : <div style={{ padding: '14px 16px', fontSize: 11.5, color: V3.textGhost, borderTop: `1px solid ${V3.divider}` }}>불러오는 중…</div>
            ) : null}
          </div>
        )
      })}
      <span style={{ display: 'none' }}>{leagueSlug}</span>
    </div>
  )
}

/** 경기 길이 — 「10분 36초」. 끝난 때를 모르면 `null` (지어내지 않는다) */
function durationOf(startAt: string, endAt: string | null): string | null {
  if (!endAt) return null
  const ms = Date.parse(endAt) - Date.parse(startAt)
  if (!Number.isFinite(ms) || ms <= 0) return null
  const sec = Math.round(ms / 1000)
  return `${Math.floor(sec / 60)}분 ${sec % 60}초`
}

/** 접힌 줄의 한쪽 클랜 — 마크 + 이름, 그 밑에 「1부리그 1,508점」 (사진 3) */
function ClanSide({ snap, ink, league }: { snap: MatchListItem['league_clan']; ink: string; league: LeaguePlayerDetail['league'] }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, flex: '1 1 0' }}>
      <MarkCircle clan={snap.clan} size={20} />
      <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{snap.clan.name}</span>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 5, whiteSpace: 'nowrap' }}>
          {snap.division !== null ? <TierText division={snap.division} leagueCategory={league.category} leagueSlug={league.slug} size={10} /> : null}
          {snap.rating !== null ? <span style={{ fontSize: 10.5, color: V3.textFaint }}>{formatRating(snap.rating)}</span> : null}
        </span>
      </span>
    </span>
  )
}

/**
 * ★옛 접힌 줄★ — 한 격자 · 세 줄 (2026-09-11 ~ 2026-09-22).
 * 2026-09-22 에 서플라이 폰/PC 두 판으로 갈아 끼우면서 ★이름만 바꿔 남겼다★ (`CLAUDE.md` 1-4).
 * `SUPPLY_MATCH_ROWS` 를 `false` 로 되돌리면 이 줄이 다시 그려진다.
 */
function MatchRowsLegacy({ data, leagueSlug, matches, expanded, onExpand }: Pick<PlayerDetailV3Props, 'data' | 'leagueSlug' | 'matches' | 'expanded' | 'onExpand'>) {
  const [open, setOpen] = useState<string | null>(null)
  /* 클랜 색은 이제 승패 색이 대신한다 (2026-09-12 사장님) — 지우지 않고 void 로 남긴다 */
  const theme = clanThemeOf(data.clan?.slug)
  void theme
  return (
    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {matches.map((m) => {
        const isOpen = open === m.id
        const edge = m.win ? V3.blue : V3.red
        const my = m.player_stat
        const mvpIsMe = m.mvp_player_id !== null && m.mvp_player_id === data.player.id
        const detail = expanded[m.id]
        /* 명단이 아직 안 들어온 경기 — 펼치지 않는다 (2026-09-10 사장님: «킬데스 수집중») */
        const pending = m.red.length === 0 && m.blue.length === 0
        return (
          <div key={m.id} style={{ border: `1px solid ${m.win ? V3.winFaceLine : V3.loseFaceLine}`, borderRadius: V3.radiusCard, overflow: 'hidden', background: (m.win ? V3.winFace : V3.loseFace), opacity: pending ? 0.75 : 1 }}>
            {/*
              ★`v3-prow--stack` — 폰에서 여섯 칸을 쌓는다★ (2026-09-17 무한 QA).

                PC 격자는 고정폭 다섯(70·150·1fr·108·62)이라 폰 390px 에서는 ★`1fr` 칸이 0 으로 눌린다.★
                그 칸에 양 팀 이름이 들어 있어서 실측 «lunatic`Gaming» 98px 필요 / ★61px 받음★,
                «recent.wct» 66 / 56, «One.PoinT» 64 / 56 — 여섯 줄이 «…» 로 끊겼다.
                `tokens.css` 의 767px 아래에서 두 칸으로 갈고 양 팀 줄에 한 줄을 통째로 준다.
                ★PC 는 한 픽셀도 안 바뀐다★ · 값도 하나 안 없앴다.
                (`tokens.css` 에 «선수 기록실은 폰 전용 규칙이 필요 없다» 고 적혀 있었는데
                 ★사실이 아니었다★ — 그 줄도 같이 고쳤다)
            */}
            <div onClick={() => { if (pending) return; setOpen(isOpen ? null : m.id); if (!isOpen) onExpand(m) }} style={{ ...matchRowStyle, cursor: pending ? 'default' : 'pointer' }} className="v3-prow v3-prow--stack">
              {/* 1줄 — 승패 · 맵 · 시각 / 오른쪽엔 그 경기에서 내 자리 */}
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 9, minWidth: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', color: edge }}>{m.win ? '승리' : '패배'}</span>
                <span style={{ fontSize: 12, color: V3.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.map.name}</span>
                <span style={{ fontSize: 10.5, color: V3.textGhost2, whiteSpace: 'nowrap' }}>{relativeKst(matchShownAt(m))}</span>
              </span>
              {/*
                ★MVP 는 1줄 · 「클랜전」 알약 왼쪽★ (2026-09-12 사장님:
                «mvp 클랜전 표시 왼쪽에 배치해줘»).

                옛 자리는 ★2줄 오른쪽 끝★ 이었다 (킬뎃 옆). 거기서는 킬뎃·킬데스와
                한 줄에 몰려 좁았고, 사장님 PC 화면에서 잘 안 보였다.
                1줄 오른쪽은 알약 하나뿐이라 자리가 남는다 — 거기로 옮긴다.
              */}
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 7 }}>
                {/*
                  ⚠ ★2026-09-21 — `v3-mvp-wide` 를 뗐다★ (사장님: 「MVP고쳐라 뭐냐 저게..」)

                    그 CSS(`padding: 4px 16px !important`)는 ★옛 알약★(`MvpBadge` — ★ + 「MVP」 글자)
                    을 PC 에서 가로로 늘이려고 만든 것이다. 2026-09-20 에 표를 ★16px 원★
                    (`MvpMark`)으로 바꿨는데 ★클래스만 그대로 남았다.★

                    `box-sizing: border-box` 라 ★16px 안에 좌우 16px 패딩★ 이 들어가면서
                    안쪽 폭이 ★0★ 이 됐다 — ★흰 별이 사라지고 빨간 타원만★ 남았다.
                    (사장님 화면: 경기 줄 오른쪽에 속 빈 빨간 알약)

                  ⚠ CSS 규칙 자체는 ★안 지웠다★ — 옛 `MvpBadge` 를 되살리면 그대로 쓴다
                    (`CLAUDE.md` 1-4).
                */}
                {mvpIsMe ? <MvpMark size={16} /> : null}
                {my?.participant_role ? (
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.02em', whiteSpace: 'nowrap', padding: '3px 8px', borderRadius: 5, color: my.participant_role === 'mercenary' ? '#8a6a12' : V3.textMuted, background: my.participant_role === 'mercenary' ? 'rgba(201,163,91,.10)' : V3.chip, border: `1px solid ${my.participant_role === 'mercenary' ? 'rgba(201,163,91,.45)' : V3.chipBorder}` }}>
                    {my.participant_role === 'mercenary' ? '용병' : '클랜전'}
                  </span>
                ) : null}
              </span>
              {/* 2줄 — 양 팀 / 오른쪽엔 MVP · 킬뎃 */}
              {/*
                ⚠ ★2026-09-17 — PC 에서 두 이름이 양끝으로 벌어져 있었다★ (무한 QA).
                  이 칸은 격자에서 `1fr` 이라 1440px 에서 ★600px 가까이★ 된다. 그 안에서
                  두 이름이 `flex: 1 1 0` 으로 반씩 가지니 «MiraGe.» 와 «vs One.PoinT» 사이가
                  ★300px 넘게 비었다.★ 사장님: «한눈에 들어오는건 굳이 새로 배열해서
                  떨어뜨려서 빈공간을 만들어 왜».
                  경기목록(`MatchListV3`)이 2026-09-15 밤에 같은 자리를 이렇게 고쳤다 —
                  ★칸은 그대로 두고 안쪽만 가운데로 모은다.★ 같은 값(520px)을 쓴다.
                  ★폰은 이 폭보다 좁아 한 픽셀도 안 바뀐다.★
              */}
              <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, width: '100%', maxWidth: 520, marginInline: 'auto' }}>
                {/*
                  * ★클랜명은 승패 색★ (2026-09-12 사장님)
                  *
                  * ⚠ ★두 이름에 `flex: 1 1 0` 이 있어야 한다★ (2026-09-15 · 무한 QA).
                  *   없으면 폭이 «내용 크기» 로 잡혀 ★앞쪽만 먼저 쭈그러든다★ —
                  *   폰 390px 에서 «MiraGe.» 가 «Mira···» 로, «lunatic`Gaming» 이
                  *   «lunatic`Ga···» 로 잘렸다. 상대 이름은 멀쩡했다.
                  *   `1 1 0` 이면 남는 자리를 ★똑같이 나눠 갖는다.★
                  */}
                <MarkCircle clan={m.league_clan.clan} size={20} />
                <span style={{ fontSize: 12.5, fontWeight: 600, color: m.win ? WIN_LOSS.winInk : WIN_LOSS.loseInk, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: '1 1 0', minWidth: 0 }}>{m.league_clan.clan.name}</span>
                <span style={{ fontSize: 10.5, color: '#b6bece', flex: 'none' }}>VS</span>
                <MarkCircle clan={m.opponent.clan} size={20} />
                <span style={{ fontSize: 12.5, fontWeight: 600, color: m.win ? WIN_LOSS.loseInk : WIN_LOSS.winInk, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: '1 1 0', minWidth: 0 }}>{m.opponent.clan.name}</span>
              </span>
              <span className="v3-match-right" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, minWidth: 0 }}>
                {pending ? <span style={{ fontSize: 11.5, color: '#5c6479', whiteSpace: 'nowrap' }}>킬데스 수집중</span> : my ? <Kda kill={my.kill} death={my.death} assist={my.assist} /> : <span style={{ fontSize: 11, color: V3.textGhost }}>기록 없음</span>}
                {my && my.kd_rate !== null ? <span style={{ fontSize: 13, fontWeight: 600, flex: 'none', whiteSpace: 'nowrap', color: statColor(my.kd_rate) }}>{my.kd_rate.toFixed(1)}%</span> : null}
              </span>
              {/* 3줄 — 상대 티어 / 오른쪽엔 펼치기 */}
              {/* ⚠ «vs» 를 ★TierText 안으로★ 넣었다 (2026-09-15 밤) — 티어를 안 그리는
                  리그에서 «vs» 만 혼자 떠 있었다 */}
              <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5, minWidth: 0 }}>
                <TierText
                  division={m.opponent.division}
                  leagueCategory={data.league.category}
                  leagueSlug={data.league.slug}
                  size={10}
                  prefix="vs"
                />
              </span>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5, whiteSpace: 'nowrap', fontSize: 10.5, color: pending ? '#b6bece' : isOpen ? '#1d4fd6' : V3.textGhost }}>
                {pending ? '수집중' : <>상세 <span style={{ fontSize: 9 }}>{isOpen ? '▲' : '▼'}</span></>}
              </span>
            </div>
            {isOpen ? (
              detail ? <Scoreboard detail={detail} me={data.player.id} leagueCategory={data.league.category} leagueSlug={data.league.slug} /> : <div style={{ padding: '14px 16px', fontSize: 11.5, color: V3.textGhost, borderTop: `1px solid ${V3.divider}` }}>불러오는 중…</div>
            ) : null}
          </div>
        )
      })}
      <span style={{ display: 'none' }}>{leagueSlug}</span>
    </div>
  )
}


/* ── 클랜별 전적 (2026-09-11 사장님 목업) ─────────────────────── */

/**
 * 구간마다 한 칸. 밑의 마크 줄에서 상대를 누르면 ★제목이 그 클랜으로 바뀌고★ 숫자가 그 상대와의 기록이 된다.
 * 마크 줄은 ★많이 붙은 순★ 이다 (사장님: «상대로 많이 한 순서대로 앞쪽에»).
 * 킬뎃은 그 선수 무기 것 · 승률은 통합이다 (같은 날 확정).
 */
function ClanVsCard({ data }: { data: LeaguePlayerDetail }) {
  const tieredCard = showsTier(data.league.slug) && data.league.division_count >= 2
  /*
   * ⚠ ★2026-09-16 — 티어를 안 쓰면 구간을 안 나눈다★ (사장님: «두개 합쳐야지
   *   티어 구분이 없는데»).
   *
   *   `tier_breakdown` 은 ★구간마다 한 줄★ 인데, 티어를 안 쓰는 리그는 줄마다 이름을
   *   «전체» 라고 적는다. 그래서 같은 이름이 두 줄 서고 무엇이 다른지 알 수 없었다
   *   (실측 saylove — «VS 전체 1승1패» 와 «VS 전체 9승2패»).
   *   어제 ★클랜★ 화면에서 같은 것을 고쳤는데 ★선수★ 화면을 빠뜨렸다.
   *
   *   합칠 때 ★비율은 다시 센다★ — 두 줄의 승률을 평균 내면 판수가 다른 구간이
   *   같은 무게를 갖는다 (D-235 Q8 와 같은 함정).
   */
  const rows = useMemo(() => {
    const live = data.tier_breakdown.filter((r) => r.games > 0)
    if (tieredCard || live.length <= 1) return live
    const first = live[0] as (typeof live)[number]
    const sum = (f: (r: (typeof live)[number]) => number) => live.reduce((a, r) => a + f(r), 0)
    /* 같은 상대는 한 줄로 — 구간이 갈려 있어도 같은 클랜이다 */
    const byFoe = new Map<string, (typeof first.opponents)[number]>()
    for (const r of live) {
      for (const o of r.opponents) {
        const now = byFoe.get(o.league_clan_id)
        if (now === undefined) {
          byFoe.set(o.league_clan_id, { ...o })
          continue
        }
        now.games += o.games
        now.win += o.win
        now.lose += o.lose
        now.rifle_games += o.rifle_games
        now.sniper_games += o.sniper_games
        /*
         * 킬뎃은 판수로 무게를 준다. 한쪽만 알면 그쪽 값을 쓴다.
         *
         * ⚠ ★이것은 근사값이다★ (2026-09-20에 적어 둔다). 킬뎃은 킬÷(킬+뎃)이라
         *   ★퍼센트를 평균 내면 참값이 아니다.★ 상대별 기록(`PlayerTierOpponent`)에
         *   ★킬·데스 원본이 없어서★ 지금은 이렇게 섞을 수밖에 없다.
         *   제대로 고치려면 서버가 상대별 킬·데스를 같이 내보내야 한다 —
         *   `docs/ORDERS.md` 에 남긴다.
         *   ⚠ ★합계 줄(`merged`)은 원재료로 다시 계산한다★ — 아래를 보라.
         */
        const mix = (a: number | null, an: number, b: number | null, bn: number): number | null => {
          if (a === null && b === null) return null
          if (a === null) return b
          if (b === null) return a
          const n = an + bn
          return n === 0 ? null : Math.round(((a * an + b * bn) / n) * 10) / 10
        }
        now.kd = mix(now.kd, now.games - o.games, o.kd, o.games)
        now.rifle_kd = mix(now.rifle_kd, now.rifle_games - o.rifle_games, o.rifle_kd, o.rifle_games)
        now.sniper_kd = mix(now.sniper_kd, now.sniper_games - o.sniper_games, o.sniper_kd, o.sniper_games)
        now.win_rate = now.games === 0 ? null : Math.round((now.win / now.games) * 1000) / 10
      }
    }
    const games = sum((r) => r.games)
    const win = sum((r) => r.win)
    /*
     * ★★킬뎃은 「킬과 데스를 더해서」 다시 센다★★ (2026-09-20 사장님: 「에는 뭐야 킬뎃이」)
     *
     * ── 무엇이 틀렸나 (실측 · 플옴뭉 IPL)
     *     명부 계산      킬 1241 · 뎃 851 → ★59.3%★
     *     이 카드        ★48.0%★
     *
     *   `...first` 로 ★첫 구간의 킬뎃을 그대로 물려받고 있었다.★ 승·패는 더하면서
     *   킬뎃만 한 구간 것을 썼으니 ★같은 카드 안에서 승패와 킬뎃이 다른 판을 가리켰다.★
     *
     * ── ⚠ ★퍼센트를 평균 내면 안 된다★
     *   윗줄의 `mix` 도 판수로 무게를 준 ★퍼센트의 평균★ 이다. 그건 근사값이지
     *   참값이 아니다 — 킬뎃은 ★킬÷(킬+뎃)★ 이라 분모가 판마다 다르다.
     *   ★원재료(킬·데스)를 더해서 나누는 것★ 만이 맞다.
     */
    const kdOf = (k: number, d: number) => (k + d === 0 ? null : Math.round((k / (k + d)) * 1000) / 10)
    const rk = sum((r) => r.rifle_kill)
    const rd = sum((r) => r.rifle_death)
    const sk = sum((r) => r.sniper_kill)
    const sd = sum((r) => r.sniper_death)
    const merged: (typeof live)[number] = {
      ...first,
      /* 구간을 안 나눌 때의 단 하나뿐인 열쇠. 실제 `tier`(1부터)와 안 겹친다 */
      tier: 0,
      games,
      win,
      lose: sum((r) => r.lose),
      win_rate: games === 0 ? null : Math.round((win / games) * 1000) / 10,
      known_games: sum((r) => r.known_games),
      rifle_games: sum((r) => r.rifle_games),
      sniper_games: sum((r) => r.sniper_games),
      rifle_kill: rk,
      rifle_death: rd,
      sniper_kill: sk,
      sniper_death: sd,
      kd: kdOf(rk + sk, rd + sd),
      rifle_kd: kdOf(rk, rd),
      sniper_kd: kdOf(sk, sd),
      opponents: [...byFoe.values()].sort((a, b) => b.games - a.games),
      /*
       * ★★`...first` 가 물려주는 칸은 ★남김없이★ 다시 센다★★ (2026-09-20 비판 검수)
       *
       *   바로 위 주석이 「`...first` 로 첫 구간 킬뎃을 물려받고 있었다」 고 적어 뒀는데,
       *   ★고친 것은 킬뎃뿐★ 이었다. 판킬·무기별 승패·MVP 는 ★여전히 1구간 값★ 이다.
       *   지금은 이 카드가 그 칸들을 안 읽어서 안 보일 뿐이고, ★누가 한 줄 읽는 순간
       *   같은 사고가 그대로 난다.★ 그래서 지금 막는다.
       */
      mvp: sum((r) => r.mvp),
      sniper_win: sum((r) => r.sniper_win),
      sniper_lose: sum((r) => r.sniper_lose),
      rifle_win: sum((r) => r.rifle_win),
      rifle_lose: sum((r) => r.rifle_lose),
      sniper_kill_per_match: sum((r) => r.sniper_games) > 0 ? sk / sum((r) => r.sniper_games) : null,
      rifle_kill_per_match: sum((r) => r.rifle_games) > 0 ? rk / sum((r) => r.rifle_games) : null,
      /* 구간마다 천적이 다르다 — 합치는 규칙이 없으므로 ★물려받지 않고 비운다★ */
      nemeses: [],
    }
    return [merged]
  }, [data.tier_breakdown, tieredCard])
  const weapon = data.hex?.weapon ?? null
  const [picked, setPicked] = useState<Record<number, string | null>>({})
  const theme = clanThemeOf(data.clan?.slug)
  const tiered = tieredCard
  /* ★자기 구간★ = 가장 많이 뛴 구간 (워커의 homeTier 와 같은 규칙 — 같으면 높은 티어) */
  const homeTier = useMemo(() => {
    let best: number | null = null
    for (const r of rows) if (best === null || r.games > (rows.find((x) => x.tier === best)?.games ?? 0)) best = r.tier
    return best
  }, [rows])
  const [open, setOpen] = useState<number | null>(null)
  /* 아직 아무것도 안 건드렸으면 자기 구간을 편다 */
  const openTier = open === null ? homeTier : open
  return (
    <div style={{ marginTop: 16, ...cardStyle }}>
      <CardHead title="클랜별 전적" right={
        <span style={{ fontSize: 10.5, color: V3.textGhost2, letterSpacing: '.06em', whiteSpace: 'nowrap' }}>시즌 Cloud 0 · {fmt(data.win + data.lose)}전 기준</span>
      } />
      {rows.length === 0 ? (
        <div style={{ padding: 18, fontSize: 12, color: V3.textGhost }}>아직 경기가 없습니다.</div>
      ) : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px 16px' }}>
        {rows.map((r) => {
          const opened = openTier === r.tier
          const toggle = () => {
            setPicked({})
            setOpen(opened ? -1 : r.tier)
          }
          if (!opened) {
            return (
              <div
                key={r.tier}
                onClick={toggle}
                style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, cursor: 'pointer', border: `1px solid ${V3.cardBorder}`, borderRadius: V3.radiusCard, background: V3.card, padding: '8px 12px' }}
              >
                <MarkCircle clan={data.clan} size={18} />
                <span style={{ fontSize: 12, fontWeight: 700, color: theme.deep, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{data.player.name}</span>
                <span style={{ fontSize: 9.5, color: '#b6bece', flex: 'none' }}>VS</span>
                {tiered ? (
                  <TierText division={r.tier} leagueCategory={data.league.category} size={11} />
                ) : (
                  <span style={{ fontSize: 11.5, color: V3.textMuted }}>전체</span>
                )}
                <div style={spacerStyle} />
                <span style={{ fontSize: 10.5, color: V3.textDim, whiteSpace: 'nowrap' }}>{fmt(r.win)}승 {fmt(r.lose)}패</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: r.win_rate === null ? V3.textGhost : statColor(r.win_rate) }}>{pct1(r.win_rate)}</span>
                <span style={{ fontSize: 9, color: V3.textGhost, flex: 'none' }}>▼</span>
              </div>
            )
          }
          const sel = picked[r.tier] ?? null
          const opp = sel === null ? null : r.opponents.find((o) => o.league_clan_id === sel) ?? null
          /* 고른 상대가 있으면 그 상대 숫자, 없으면 구간 전체 */
          const win = opp ? opp.win : r.win
          const lose = opp ? opp.lose : r.lose
          const winRate = opp ? opp.win_rate : r.win_rate
          const kd = weapon === 1
            ? (opp ? opp.sniper_kd : r.sniper_kd)
            : weapon === 0
              ? (opp ? opp.rifle_kd : r.rifle_kd)
              : (opp ? opp.kd : r.kd)
          return (
            <div key={r.tier} style={{ border: `1px solid ${V3.cardBorder}`, borderRadius: V3.radiusCard, background: V3.card, padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <MarkCircle clan={data.clan} size={22} />
                <span style={{ fontSize: 13, fontWeight: 700, color: theme.deep, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{data.player.name}</span>
                <span style={{ fontSize: 10.5, color: '#b6bece', flex: 'none' }}>VS</span>
                {opp ? (
                  <>
                    <span style={{ fontSize: 13, fontWeight: 700, color: clanThemeOf(opp.clan.slug).deep, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{opp.clan.name}</span>
                    <MarkCircle clan={opp.clan} size={22} />
                    <div style={spacerStyle} />
                    <span onClick={() => setPicked((p) => ({ ...p, [r.tier]: null }))} style={{ fontSize: 10.5, color: V3.textGhost, cursor: 'pointer', whiteSpace: 'nowrap' }}>구간 전체</span>
                  </>
                ) : (
                  <>
                    {tiered ? (
                      <TierText division={r.tier} leagueCategory={data.league.category} size={12} />
                    ) : (
                      <span style={{ fontSize: 12.5, color: V3.textMuted }}>전체</span>
                    )}
                    <div style={spacerStyle} />
                  </>
                )}
                <span onClick={toggle} style={{ fontSize: 9, color: V3.textGhost, cursor: 'pointer', flex: 'none', marginLeft: 8 }}>▲</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap', marginTop: 8 }}>
                <span style={{ fontSize: 10, color: V3.textGhost, letterSpacing: '.06em' }}>K/D</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: kd === null ? V3.textGhost : statColor(kd) }}>{pct1(kd)}</span>
                <span style={{ width: 1, height: 11, background: V3.rowDivider }} />
                <span style={{ fontSize: 11, color: V3.textDim, whiteSpace: 'nowrap' }}>{fmt(win)}승 {fmt(lose)}패</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: winRate === null ? V3.textGhost : statColor(winRate) }}>{pct1(winRate)}</span>
              </div>
              {r.opponents.length > 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginTop: 10 }}>
                  {r.opponents.map((o) => (
                    <span
                      key={o.league_clan_id}
                      onClick={() => setPicked((p) => ({ ...p, [r.tier]: p[r.tier] === o.league_clan_id ? null : o.league_clan_id }))}
                      title={`${o.clan.name} · ${o.games}전`}
                      style={{ display: 'inline-flex', cursor: 'pointer', borderRadius: '50%', padding: 2, background: o.league_clan_id === sel ? 'rgba(91,141,255,.28)' : 'transparent', boxShadow: o.league_clan_id === sel ? '0 0 0 1px rgba(127,169,255,.8)' : undefined }}
                    >
                      <MarkCircle clan={o.clan} size={26} />
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── 페이지 본문 ──────────────────────────────────────────────── */

/* ── 상세정보 (오른쪽 칸) ─────────────────────────────────────── */

/**
 * ★상세정보★ — 서플라이 오른쪽 카드를 그대로 옮긴 것 (2026-09-22 사장님:
 * 「오른쪽 카드랑 ★최대한 더 비슷하게★ 개인기록정보 저렇게 달아줘」).
 *
 * 서플라이 실측(사장님 사진 · `3rd.supply/league/supply/player/1074574325`) —
 * ```
 *   상세정보
 *   래더      3432점
 *   승률      1,302승 851패      60.5%
 *   킬뎃      17,855킬 17,422데스 50.6%
 *   평균킬    판당              8.3킬
 *   MVP                        213회
 *   랭킹      5,646명중          1위
 *   소속      ◉ des`per@do.
 * ```
 * 줄 이름 · 줄 차례 · 「N명중 N위」 같은 말씨까지 그대로다. ★다른 점 하나★ —
 * 승률·킬뎃 숫자에 우리 ★색깔시스템★(`statColor`)이, 등수에 `rankColorOf` 가 붙는다.
 *
 * ⚠ 없는 값은 ★지어내지 않는다.★ 무소속리그는 킬·데스가 `null` 로 온다(D-107) —
 *   그때는 그 줄을 안 그린다. 0 으로 채우면 「0킬을 했다」는 거짓이 된다.
 */
function SideInfoCard({ data, showsKd, report }: { data: LeaguePlayerDetail; showsKd: boolean; report?: PlayerDetailV3Props['report'] }) {
  const kdKnown = showsKd && data.kill !== null && data.death !== null
  const reportCount = report?.reported ? report.count : data.report_count
  return (
    <section style={{ ...cardStyle, overflow: 'hidden' }}>
      {/* 제목은 「상세정보」 가 아니라 ★선수 닉네임★ (인계서 ③-8 · 2026-09-23) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', borderBottom: `1px solid ${V3.divider}` }}>
        <span style={{ width: 22, height: 2, background: V3.blue, flex: 'none' }} />
        <span style={{ fontSize: 14, fontWeight: 700, color: V3.textStrong, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{data.player.name}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <InfoRow label="래더">
          <span style={{ fontSize: 22, fontWeight: 700, color: V3.textStrong, whiteSpace: 'nowrap' }}>{formatRating(data.rating)}</span>
        </InfoRow>
        <InfoRow label="승률" sub={`${fmt(data.win)}승 ${fmt(data.lose)}패`}>
          <span style={{ fontSize: 22, fontWeight: 700, color: statColor(data.win_rate), whiteSpace: 'nowrap' }}>{pct1(data.win_rate)}</span>
        </InfoRow>
        {kdKnown ? (
          <InfoRow label="킬뎃" sub={`${fmt(data.kill as number)}킬 ${fmt(data.death as number)}데스`}>
            <span style={{ fontSize: 22, fontWeight: 700, color: data.kd_rate === null ? V3.textMuted : statColor(data.kd_rate), whiteSpace: 'nowrap' }}>{pct1(data.kd_rate)}</span>
          </InfoRow>
        ) : null}
        {/* 「평균킬 · 판당」 → ★「판킬」★ (인계서 ③-10) */}
        <InfoRow label="판킬">
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 2, whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: V3.text }}>{data.kill_per_match.toFixed(1)}</span>
            <span style={{ fontSize: 12, color: V3.textDim }}>킬</span>
          </span>
        </InfoRow>
        {/* MVP ★「n판 중 k회」★ (인계서 ③-10) */}
        <InfoRow label="MVP" sub={`${fmt(data.win + data.lose)}판 중`}>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 2, whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: V3.mvp /* ⚠ 옛값 V3.gold */ }}>{fmt(data.mvp_count)}</span>
            <span style={{ fontSize: 12, color: V3.textDim /* ⚠ 옛값 '#8a6a12' */ }}>회</span>
          </span>
        </InfoRow>
        {/* ★등수는 모르면 안 적는다★ — 배치고사 중이거나 판이 모자라면 `rank` 가 null 이다 */}
        <InfoRow label="랭킹" sub={data.rank_count === null ? '' : `${fmt(data.rank_count)}명중`}>
          {data.rank === null ? (
            <span style={{ fontSize: 13, color: V3.textGhost, whiteSpace: 'nowrap' }}>{data.placement ? '배치고사' : '집계 없음'}</span>
          ) : (
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 2, whiteSpace: 'nowrap' }}>
              <span style={{ fontSize: 22, fontWeight: 700, color: rankColorOf(data.rank, data.rank_count) }}>{fmt(data.rank)}</span>
              <span style={{ fontSize: 12, color: V3.textDim }}>위</span>
            </span>
          )}
        </InfoRow>
        {/* ★클랜마크는 이름 앞에 항상★ */}
        <InfoRow label="소속">
          {data.clan === null ? (
            <span style={{ fontSize: 13, color: V3.textGhost, whiteSpace: 'nowrap' }}>무소속</span>
          ) : (
            <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
              <MarkCircle clan={data.clan} size={22} />
              <span style={{ fontSize: 13.5, fontWeight: 700, color: V3.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{data.clan.name}</span>
            </span>
          )}
        </InfoRow>
        {/* ★핵의심 n회 + 신고★ — 머리 카드 발 줄(MVP·핵의심)을 접으면서 여기로 (인계서 ③-10 · 2026-09-23 저녁 사장님 X) */}
        <InfoRow label="핵의심" last>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, whiteSpace: 'nowrap' }}>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
              <span style={{ fontSize: 22, fontWeight: 700, color: reportCount > 0 ? '#ff6b6b' : V3.textGhost }}>{fmt(reportCount)}</span>
              <span style={{ fontSize: 12, color: V3.textDim }}>회</span>
            </span>
            {report ? (
              <button
                type="button"
                onClick={report.pending ? undefined : report.onReport}
                style={{ fontFamily: 'inherit', fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: V3.radiusChip, cursor: report.pending ? 'wait' : 'pointer', color: report.reported ? '#ff6b6b' : '#b3555c', background: 'transparent', border: `1px solid ${report.reported ? 'rgba(255,107,107,.55)' : 'rgba(179,85,92,.45)'}` }}
              >
                {report.pending ? '…' : report.reported ? '신고함' : '신고'}
              </button>
            ) : null}
          </span>
        </InfoRow>
        {report?.message ? <div style={{ padding: '0 16px 9px', fontSize: 10.5, color: V3.textDim }}>{report.message}</div> : null}
      </div>
    </section>
  )
}

/**
 * ★최근 같이한 플레이어★ — 서플라이 오른쪽 칸의 마지막 표 (2026-09-22).
 *
 * 서플라이 실측 — 「닉네임 / 승 / 패 / 승률」 네 칸, 승률에 색이 붙는다.
 * 자료는 이미 `data.teammates` 로 온다(옛 화면 `LeaguePlayerRecordScreen` 의
 * `TeammateTable` 이 쓰던 것과 같은 원천) — ★새 API 를 만들지 않았다.★
 *
 * ⚠ 빈 배열이면 카드를 ★안 그린다★ — 빈 표를 만들지 않는다.
 */
function TeammatesCard({ data }: { data: LeaguePlayerDetail }) {
  const rows = data.teammates.slice(0, 10)
  if (rows.length === 0) return null
  return (
    <section style={{ ...cardStyle, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', borderBottom: `1px solid ${V3.divider}` }}>
        <span style={{ width: 22, height: 2, background: V3.blue, flex: 'none' }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: V3.textStrong, whiteSpace: 'nowrap' }}>최근 같이한 플레이어</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 42px 42px 56px', gap: 6, padding: '8px 16px', borderBottom: `1px solid ${V3.rowDivider}`, fontSize: 9.5, color: '#b6bece', letterSpacing: '.08em', whiteSpace: 'nowrap' }}>
        <span>닉네임</span>
        <span style={{ textAlign: 'right' }}>승</span>
        <span style={{ textAlign: 'right' }}>패</span>
        <span style={{ textAlign: 'right' }}>승률</span>
      </div>
      {rows.map((t, i) => (
        <div key={t.player.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 42px 42px 56px', gap: 6, alignItems: 'center', padding: '8px 16px', borderBottom: i === rows.length - 1 ? 'none' : `1px solid ${V3.rowDivider2}` }}>
          {/*
            ★클랜마크는 이름 앞에 항상★ — 모르면 `MarkCircle` 이 구름을 깐다.
            ⚠ `TeammateStat.player` 는 `PlayerSummary`(id·name)뿐이라 ★클랜을 모른다.★
              서플라이는 여기에 마크를 그리는데 우리는 자료가 없다 — ★지어내지 않고★
              구름을 깐다 (D-106). 마크를 띄우려면 계약에 클랜을 실어야 한다.
          */}
          <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
            <MarkCircle clan={null} size={18} />
            <span style={{ fontSize: 12, color: V3.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{t.player.name}</span>
          </span>
          <span style={{ textAlign: 'right', fontSize: 11.5, color: V3.textDim, whiteSpace: 'nowrap' }}>{fmt(t.win)}승</span>
          <span style={{ textAlign: 'right', fontSize: 11.5, color: V3.textDim, whiteSpace: 'nowrap' }}>{fmt(t.lose)}패</span>
          <span style={{ textAlign: 'right', fontSize: 12.5, fontWeight: 700, color: statColor(t.win_rate), whiteSpace: 'nowrap' }}>{pct1(t.win_rate)}</span>
        </div>
      ))}
    </section>
  )
}

function InfoRow({ label, sub, last, children }: { label: string; sub?: string; last?: boolean; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', borderBottom: last ? 'none' : `1px solid ${V3.rowDivider}`, minHeight: 46 }}>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: V3.textDim, whiteSpace: 'nowrap', flex: 'none' }}>{label}</span>
      <div style={spacerStyle} />
      {sub ? <span style={{ fontSize: 11, color: V3.textFaint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{sub}</span> : null}
      {children}
    </div>
  )
}

/* 옛 여섯 칸 줄은 지우지 않는다 — 안 부르는 동안 noUnusedLocals 를 피하려는 참조 */
void ScoreRowSupplySix

export function PlayerDetailV3(props: PlayerDetailV3Props) {
  const { data, matches, matchesLoading, hasMore, loadingMore, onLoadMore } = props
  /* ★탭은 껐다★ (`BODY_TABS`) — 상태는 남긴다. 되살리면 그대로 돈다 (`CLAUDE.md` 1-4) */
  const [tab, setTab] = useState<'graph' | 'play' | 'clan'>('graph')
  /*
   * ★폰 탭 — 기록실 | 플레이분석★ (2026-09-23 오후 사장님: 「육각을 지난시즌 대신 넣어버려」).
   * PC 는 레이아웃의 링크 탭(기록실/지난시즌)이 그대로고 이 탭은 ≤767px 에서만 보인다.
   * 「플레이분석」 을 고르면 본문(추이 · 최근매치 · 경기 목록) 대신 ★육각(비교분석하기)★ 이 선다.
   */
  const [phoneTab, setPhoneTab] = useState<'record' | 'hex'>('record')
  const phoneHex = phoneTab === 'hex'
  const showsKd = props.showsKd ?? true
  const matchList = (
    <>
      <SectionBar title="최근 경기" />
      {/*
        * ★못 불러온 것을 「불러오는 중」 보다 ★먼저★ 본다★ (2026-09-19).
        *
        *   재시도가 멈춰 선(`stalled`) 동안에는 react-query 의 `isPending` 이 ★그대로 참★ 이라
        *   `matchesLoading` 도 참이다. 그래서 「불러오는 중…」 을 먼저 보면 ★영영 그 글자★ 다.
        *   ★이 순서가 고침의 핵심이다.★ 순서를 되돌리면 버그가 그대로 돌아온다.
        */}
      {(props.matchesError || props.matchesStalled) && matches.length === 0 ? (
        /*
         * ★못 불러왔으면 못 불러왔다고 적는다★ (2026-09-19 · 위 `matchesError` 주석 참조).
         * 「아직 경기가 없습니다」 로 덮지 않는다 — 경기는 있는데 우리가 못 받아온 것이다.
         */
        <div style={{ marginTop: 12, padding: 18, fontSize: 12, color: V3.textGhost, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', ...cardStyle }}>
          <span>최근 경기를 불러오지 못했습니다.</span>
          {props.onRetryMatches ? (
            <button
              type="button"
              onClick={props.onRetryMatches}
              style={{ padding: '7px 14px', fontFamily: 'inherit', fontSize: 12, color: '#1d4fd6', background: 'rgba(91,141,255,.08)', border: '1px solid rgba(91,141,255,.35)', borderRadius: V3.radiusCard, cursor: 'pointer' }}
            >
              다시 시도
            </button>
          ) : null}
        </div>
      ) : matchesLoading ? (
        <div style={{ marginTop: 12, padding: 18, fontSize: 12, color: V3.textGhost, ...cardStyle }}>불러오는 중…</div>
      ) : matches.length === 0 ? (
        <div style={{ marginTop: 12, padding: 18, fontSize: 12, color: V3.textGhost, ...cardStyle }}>아직 경기가 없습니다.</div>
      ) : (
        <MatchRows data={data} leagueSlug={props.leagueSlug} matches={matches} expanded={props.expanded} onExpand={props.onExpand} />
      )}
      {hasMore ? (
        <button type="button" onClick={onLoadMore} disabled={loadingMore} style={{ marginTop: 10, width: '100%', padding: '11px 0', fontFamily: 'inherit', fontSize: 12.5, color: '#1d4fd6', background: 'rgba(91,141,255,.08)', border: '1px solid rgba(91,141,255,.35)', borderRadius: V3.radiusCard, cursor: 'pointer' }}>
          {loadingMore ? '불러오는 중…' : '더 불러오기'}
        </button>
      ) : null}
    </>
  )
  return (
    <div>
      {/*
        ★★2026-09-22 — 서플라이 기록실 배치로 갈아 끼웠다★★ (사장님)

          ┌ 승률 및 킬뎃 추이 (★남색★) ───────────────────────────┐  ← 서플라이의 광고 자리
          ├───────────────────────────────┬──────────────────────┤
          │ 최근매치 (클랜별 전적 TOP3)     │ 상세정보              │
          │ 최근 경기 목록 · 더 불러오기     │ 플레이분석 육각형      │
          └───────────────────────────────┴──────────────────────┘

        ⚠ 서플라이는 맨 위와 좌우 구석에 ★광고★ 를 깐다. 우리는 광고를 만들지 않는다
          (`CLAUDE.md` 2장 3번) — 그 자리를 ★값이 있는 카드★ 로 채운다.
      */}
      <style>{`
        /* ★서플라이 실측★ — 본문 840 · 틈 7 · 오른쪽 271 (docs/SUPPLY_MEASURED.md §4).
           옛 값은 330px 에 틈 16px 이었다 — 오른쪽이 넓어 본문이 좁았다.
           ⚠ 이 블록은 템플릿 리터럴 안이다 — 백틱 기호를 쓰면 문자열이 끊긴다. */
        /* 2026-09-23 저녁 사장님: 「카드 가로를 조금씩 더 — 경기상세 카드랑 상세기록 카드 너무 작아 답답」
           → 선수 페이지 컨테이너를 1400 으로(supply-skin.css 의 sac-player-page) · 오른쪽 271→330. 옛 값 271 */
        .sac-prr-grid { display: grid; grid-template-columns: minmax(0,1fr) 330px; gap: 10px; align-items: start; margin-top: 16px; }
        .sac-prr-main { min-width: 0; display: flex; flex-direction: column; }
        .sac-prr-aside { min-width: 0; display: flex; flex-direction: column; gap: 7px; position: sticky; top: 105px; --hex-zoom: .78; } /* 105 = 상단바 63 + 리그 띠 42 — 래더를 안 가린다 (인계서 ③-12) */
        @media (max-width: 980px) {
          .sac-prr-grid { grid-template-columns: minmax(0,1fr); }
          .sac-prr-aside { position: static; }
        }
        /* ★폰★ (2026-09-23 오후 사장님) — 오른쪽 칸(상세정보·육각·같이한 플레이어)은 안 그린다:
           상세정보는 머리 카드로(PlayerHeaderV3) · 육각은 「플레이분석」 탭으로 옮겼다. 폰 탭은 여기서만 보인다 */
        .sac-pilltabs-phone { display: none; }
        @media (max-width: 767px) {
          .sac-prr-aside { display: none; }
          .sac-pilltabs-phone { display: flex; }
          .sac-phone-hide { display: none; }
        }
      `}</style>

      {/* ★폰 탭★ — 기록실 | 플레이분석 (지난시즌 자리). 모양은 레이아웃의 `.sac-pilltabs` 폰 규칙(supply-skin.css)을 그대로 탄다 */}
      <div className="sac-pilltabs sac-pilltabs-phone" style={{ alignItems: 'stretch', gap: 6, flexWrap: 'wrap' }}>
        {([['record', '기록실'], ['hex', '플레이분석']] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setPhoneTab(key)}
            className={phoneTab === key ? 'sac-pilltab is-on' : 'sac-pilltab'}
            style={{ ...pillStyle(phoneTab === key), fontFamily: 'inherit', cursor: 'pointer' }}
            aria-current={phoneTab === key ? 'page' : undefined}
          >
            {label}
          </button>
        ))}
      </div>
      {phoneHex ? (
        <div style={{ marginTop: 12 }}>
          <StrengthCard data={data} compare={props.compare} leagueSlug={props.leagueSlug} />
        </div>
      ) : null}
      <div className={phoneHex ? 'sac-phone-hide' : undefined}>

      {TIER_CARD_IN_BODY ? (
        <div style={halfStyle}>
          <TierRecordCard data={data} report={props.report} ownTier={matches.find((m) => m.league_clan.clan.id === data.clan?.id)?.league_clan.division ?? null} showsKd={showsKd} />
          <StrengthCard data={data} compare={props.compare} leagueSlug={props.leagueSlug} />
        </div>
      ) : null}

      {/* ① 서플라이의 상단 광고 자리 — 이 선수의 추이 그래프 (남색 판).
          2026-09-23 저녁 사장님 「기록실/지난시즌 버튼 삭제하고 그 사이 공간 없이 그래프판 바로 갖다 붙이고」 → 위 틈 0 (`.sac-trend-glued`) */}
      <div className="sac-trend-glued">
        <TrendCard data={data} showsKd={showsKd} tone={TREND_TONE} />
      </div>

      {/* ② 2단 — 왼쪽 본문 · 오른쪽 기록카드 */}
      <div className="sac-prr-grid">
        <div className="sac-prr-main">
          {/* 서플라이 「최근매치」 자리. 원그래프 대신 클랜별 전적이 들어간다 */}
          <ClanTop3PanelV3 data={data} onMore={() => setTab('clan')} />
          {matchList}
        </div>
        <aside className="sac-prr-aside">
          <SideInfoCard data={data} showsKd={showsKd} report={props.report} />
          {/* 기록카드 밑에 플레이분석 육각 (사장님 지시) */}
          <StrengthCard data={data} compare={props.compare} leagueSlug={props.leagueSlug} />
          {/* 서플라이 오른쪽 칸의 마지막 표. 2026-09-23 오후 사장님 「필요없어」 → SHOW_TEAMMATES=false */}
          {SHOW_TEAMMATES ? <TeammatesCard data={data} /> : null}
        </aside>
      </div>
      </div>

      {/*
        ★옛 판 — 본문 탭 셋★ (2026-09-11 사장님 목업 · 2026-09-22 에 껐다).
        `BODY_TABS` 를 `true` 로 되돌리면 그대로 돌아온다 (`CLAUDE.md` 1-4).
      */}
      {BODY_TABS ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 10, marginTop: 16 }}>
            {([['graph', '그래프'], ['play', '플레이분석'], ['clan', '클랜별전적']] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                style={{
                  padding: '12px 0', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  borderRadius: V3.radiusCard, whiteSpace: 'nowrap',
                  color: tab === key ? '#1c2f6b' : V3.textMuted,
                  background: tab === key ? 'rgba(91,141,255,.12)' : V3.card,
                  border: `1px solid ${tab === key ? 'rgba(127,169,255,.7)' : V3.cardBorder}`,
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === 'graph' ? <TrendCard data={data} showsKd={showsKd} /> : null}
          {tab === 'play' ? (
            /*
             * ⚠ ★육각형을 먼저, 설명을 뒤로★ (2026-09-19 사장님:
             *   「플레이분석 파트 이렇게 잽니다 저거 밑으로 내려 육각먼저 보여주고 저걸 보여줘」).
             */
            <div className="v3-play-split" style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
              <StrengthCard data={data} compare={props.compare} leagueSlug={props.leagueSlug} />
              <AnalysisPanelV3 />
            </div>
          ) : null}
          {tab === 'clan' ? <ClanVsCard data={data} /> : null}
        </>
      ) : null}
    </div>
  )
}
