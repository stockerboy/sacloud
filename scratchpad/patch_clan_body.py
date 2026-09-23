# -*- coding: utf-8 -*-
# ClanDetailV3 본문을 선수 본문(PlayerDetailV3) 배치로 — 추이 그래프 → [클랜별전적 + 통합 기록실 | 상세정보 + 육각]
import io

def patch(path, edits):
    s = io.open(path, encoding='utf-8', newline='').read()
    crlf = '\r\n' in s
    s = s.replace('\r\n', '\n')
    for old, new in edits:
        assert s.count(old) == 1, ('count', path, old[:90], s.count(old))
        s = s.replace(old, new)
    if crlf:
        s = s.replace('\n', '\r\n')
    io.open(path, 'w', encoding='utf-8', newline='').write(s)
    print('ok', path)

# 재생 더 느리게 (사장님 「훨씬 더 느리게 너무 빨라」) — 라운드당 1.8초 → 5초
patch('packages/ui/src/v3/RoundFlowChartV3.tsx', [
    ("""const PLAY_MS_PER_ROUND = 1800""",
     """const PLAY_MS_PER_ROUND = 5000 /* 2026-09-23 저녁 사장님 「훨씬 더 느리게 너무 빨라」 — 옛 값 1800 */"""),
    ("""    const total = Math.max(6000, flow.rounds.length * PLAY_MS_PER_ROUND)""",
     """    const total = Math.max(20000, flow.rounds.length * PLAY_MS_PER_ROUND)"""),
])

patch('packages/ui/src/v3/ClanDetailV3.tsx', [
    ("""import { rankColor, statColor } from './rankColors'""",
     """import { floorColor, rankColor, statColor } from './rankColors'
import { Hexagon } from './Hexagon'
import { clanHexAxes } from './ClanCardV3'
import { TrendChartV3, type TrendMode } from './TrendChartV3'
import { formatRating } from '../common/format'"""),
    ("""import { WIN_LOSS, V3, cardStyle, fmt, pct1, spacerStyle } from './tokens'""",
     """import { WIN_LOSS, V3, V3_DARK, cardStyle, fmt, pct1, pillStyle, spacerStyle } from './tokens'"""),
    # 스위치
    ("""/** 상대전적 카드가 접힌 채로 보여 주는 경기 수 (2026-09-13 사장님) */
const VS_PREVIEW = 2""",
     """/** 상대전적 카드가 접힌 채로 보여 주는 경기 수 (2026-09-13 사장님) */
const VS_PREVIEW = 2
/**
 * ★본문을 선수 페이지 배치로★ (2026-09-23 저녁 사장님 「클랜 페이지도 개인페이지랑 똑같은 폼과 양식으로 — 토시 하나 다른 배치 없이」).
 *   추이 그래프(남색) → [클랜별전적 · 통합 기록실 | 상세정보 · 육각]  — `PlayerDetailV3` 와 같은 `.sac-prr-grid`.
 *   폰은 상세정보가 머리 카드로, 육각은 「플레이분석」 탭으로 — 선수와 같다.
 * false 면 옛 본문(접이식 클랜별전적 + 통합 기록실 한 줄). 코드는 그대로다 (`CLAUDE.md` 1-4).
 */
const BODY_LIKE_PLAYER = true"""),
    # return 앞에서 상태 추가 + 새 본문
    ("""  const [vsOpen, setVsOpen] = useState(true)""",
     """  const [vsOpen, setVsOpen] = useState(true)
  /* 폰 탭 — 기록실 | 플레이분석 (선수 페이지와 같다) */
  const [phoneTab, setPhoneTab] = useState<'record' | 'hex'>('record')
  const phoneHex = phoneTab === 'hex'
  const recordList = (
    <>
      <SectionBar
        title={
          <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 7, flexWrap: 'wrap' }}>
            <span>통합 기록실</span>
            {matches.length > 0 && matches[0] ? (
              <span style={{ fontSize: 11, fontWeight: 500, color: V3.textGhost2, whiteSpace: 'nowrap' }}>
                (마지막경기 {fullKst(matchShownAt(matches[0]))})
              </span>
            ) : null}
          </span>
        }
      />
      {matchesLoading ? (
        <div style={{ marginTop: 12, padding: 18, fontSize: 12, color: V3.textGhost, ...cardStyle }}>불러오는 중…</div>
      ) : matches.length === 0 ? (
        <div style={{ marginTop: 12, padding: 18, fontSize: 12, color: V3.textGhost, ...cardStyle }}>아직 경기가 없습니다.</div>
      ) : (
        <RecentRows data={data} matches={matches} expanded={props.expanded} onExpand={props.onExpand} />
      )}
      {hasMore ? (
        <button type="button" onClick={onLoadMore} disabled={loadingMore} style={{ marginTop: 10, width: '100%', padding: '11px 0', fontFamily: 'inherit', fontSize: 12.5, color: '#1d4fd6', background: 'rgba(91,141,255,.08)', border: '1px solid rgba(91,141,255,.35)', borderRadius: V3.radiusCard, cursor: 'pointer' }}>
          {loadingMore ? '불러오는 중…' : '더 불러오기'}
        </button>
      ) : null}
    </>
  )
  if (BODY_LIKE_PLAYER) {
    return (
      <div>
        <style>{`
          .sac-prr-grid { display: grid; grid-template-columns: minmax(0,1fr) 330px; gap: 10px; align-items: start; margin-top: 16px; }
          .sac-prr-main { min-width: 0; display: flex; flex-direction: column; }
          .sac-prr-aside { min-width: 0; display: flex; flex-direction: column; gap: 7px; position: sticky; top: 105px; }
          @media (max-width: 980px) { .sac-prr-grid { grid-template-columns: minmax(0,1fr); } .sac-prr-aside { position: static; } }
          .sac-pilltabs-phone { display: none; }
          @media (max-width: 767px) { .sac-prr-aside { display: none; } .sac-pilltabs-phone { display: flex; } .sac-phone-hide { display: none; } }
        `}</style>
        {/* ① 추이 그래프 — 머리 카드에 바로 붙는다 (선수와 같다) */}
        <div className="sac-trend-glued">
          <ClanTrendCard data={data} />
        </div>
        {/* 폰 탭 — 기록실 | 플레이분석 */}
        <div className="sac-pilltabs sac-pilltabs-phone" style={{ alignItems: 'stretch', gap: 6, flexWrap: 'wrap' }}>
          {([['record', '기록실'], ['hex', '플레이분석']] as const).map(([key, label]) => (
            <button key={key} type="button" onClick={() => setPhoneTab(key)} className={phoneTab === key ? 'sac-pilltab is-on' : 'sac-pilltab'} style={{ ...pillStyle(phoneTab === key), fontFamily: 'inherit', cursor: 'pointer' }} aria-current={phoneTab === key ? 'page' : undefined}>
              {label}
            </button>
          ))}
        </div>
        {phoneHex ? <div style={{ marginTop: 12 }}><ClanHexCard data={data} /></div> : null}
        <div className={phoneHex ? 'sac-phone-hide' : undefined}>
          {/* ② 2단 — 왼쪽 본문(클랜별전적 = 선수의 「최근매치」 자리 · 통합 기록실) · 오른쪽(상세정보 · 육각) */}
          <div className="sac-prr-grid">
            <div className="sac-prr-main">
              <ClanVsTiersCard data={data} h2h={h2h} tierClansOf={props.tierClansOf} selected={selected} onSelect={setSelected} />
              {opp ? (
                <HeadToHeadCard key={opp.clan.slug} data={data} opp={opp} vsMatches={props.vsMatches} expanded={props.expanded} onExpand={props.onExpand} />
              ) : null}
              {recordList}
            </div>
            <aside className="sac-prr-aside">
              <ClanSideInfoCard data={data} memberCount={data.member_count ?? null} />
              <ClanHexCard data={data} />
            </aside>
          </div>
        </div>
      </div>
    )
  }"""),
])

# 새 카드 셋 — 파일 끝에
s = io.open('packages/ui/src/v3/ClanDetailV3.tsx', encoding='utf-8', newline='').read()
crlf = '\r\n' in s
s = s.replace('\r\n', '\n')
s += """
/* ── 선수 페이지와 같은 오른쪽 칸 · 추이 카드 (2026-09-23 저녁 사장님 「똑같은 폼과 양식」) ── */

/** 상세정보 — 선수의 `SideInfoCard` 와 같은 줄 꼴. 제목은 ★클랜명★. 클랜은 킬뎃이 없어 그 줄은 없다 */
function ClanSideInfoCard({ data, memberCount }: { data: LeagueClanShow; memberCount: number | null }) {
  const games = data.win + data.lose
  const rank = data.rank
  return (
    <section style={{ ...cardStyle, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', borderBottom: `1px solid ${V3.divider}` }}>
        <span style={{ width: 22, height: 2, background: V3.blue, flex: 'none' }} />
        <span style={{ fontSize: 14, fontWeight: 700, color: V3.textStrong, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{data.clan.name}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <ClanInfoRow label="래더" sub={data.placement ? '배치 중' : ''}>
          <span style={{ fontSize: 22, fontWeight: 700, color: floorColor(data.rating), whiteSpace: 'nowrap' }}>{formatRating(data.rating)}</span>
        </ClanInfoRow>
        <ClanInfoRow label="승률" sub={`${fmt(data.win)}승 ${fmt(data.lose)}패`}>
          <span style={{ fontSize: 22, fontWeight: 700, color: data.win_rate === null ? V3.textMuted : statColor(data.win_rate), whiteSpace: 'nowrap' }}>{pct1(data.win_rate)}</span>
        </ClanInfoRow>
        <ClanInfoRow label="최다연승" sub={`${fmt(games)}전 중`}>
          {data.max_win_streak === null ? <span style={{ fontSize: 13, color: V3.textGhost }}>-</span> : (
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 2, whiteSpace: 'nowrap' }}><span style={{ fontSize: 22, fontWeight: 700, color: V3.gold }}>{fmt(data.max_win_streak)}</span><span style={{ fontSize: 12, color: V3.textDim }}>연승</span></span>
          )}
        </ClanInfoRow>
        <ClanInfoRow label="랭킹" sub={data.rank_count === null ? '' : `${fmt(data.rank_count)}팀 중`}>
          {rank === null ? <span style={{ fontSize: 13, color: V3.textGhost }}>{data.placement ? '배치 중' : '집계 없음'}</span> : (
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 2, whiteSpace: 'nowrap' }}><span style={{ fontSize: 22, fontWeight: 700, color: rankColor(rank) }}>{fmt(rank)}</span><span style={{ fontSize: 12, color: V3.textDim }}>위</span></span>
          )}
        </ClanInfoRow>
        <ClanInfoRow label="클랜원" last>
          {memberCount === null ? <span style={{ fontSize: 13, color: V3.textGhost }}>-</span> : (
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 2, whiteSpace: 'nowrap' }}><span style={{ fontSize: 22, fontWeight: 700, color: V3.text }}>{fmt(memberCount)}</span><span style={{ fontSize: 12, color: V3.textDim }}>명</span></span>
          )}
        </ClanInfoRow>
      </div>
    </section>
  )
}

function ClanInfoRow({ label, sub, last, children }: { label: string; sub?: string; last?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', borderBottom: last ? 'none' : `1px solid ${V3.rowDivider}`, minHeight: 46 }}>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: V3.textDim, whiteSpace: 'nowrap', flex: 'none' }}>{label}</span>
      <div style={spacerStyle} />
      {sub ? <span style={{ fontSize: 11, color: V3.textFaint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{sub}</span> : null}
      {children}
    </div>
  )
}

/** 육각 — 선수의 STRENGTH POINT 카드 자리. 값은 `hexagon_v2`(`ClanCardV3` 와 같은 `clanHexAxes`). 없으면 카드를 안 그린다 (D-106) */
function ClanHexCard({ data }: { data: LeagueClanShow }) {
  if (data.hexagon_v2 === null) return null
  return (
    <section style={{ ...cardStyle, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', borderBottom: `1px solid ${V3.divider}` }}>
        <span style={{ width: 22, height: 2, background: V3.blue, flex: 'none' }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: V3.textStrong, whiteSpace: 'nowrap' }}>플레이분석</span>
        <span style={{ fontSize: 11, color: V3.textFaint, whiteSpace: 'nowrap' }}>시즌 Cloud 0 · {fmt(data.win + data.lose)}전 기준</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 8px 16px' }}>
        <span className="v3-clanhex__box"><span className="v3-clanhex__inner"><Hexagon axes={clanHexAxes(data.hexagon_v2)} id="clanHexSide" /></span></span>
      </div>
    </section>
  )
}

/** 승률 추이 — 선수의 `TrendCard` 와 같은 남색 판. 클랜은 킬뎃 선이 없다(재료가 없다 · 지어내지 않는다) */
function ClanTrendCard({ data }: { data: LeagueClanShow }) {
  const [mode, setMode] = useState<TrendMode>('cum')
  const T = V3_DARK
  const today = data.trend.find((d) => d.today) ?? null
  const lastPlayed = [...data.trend].reverse().find((d) => !d.future && d.win + d.lose > 0) ?? null
  const dayRef = today && today.win + today.lose > 0 ? { d: today, name: '오늘' } : lastPlayed ? { d: lastPlayed, name: lastPlayed.label } : null
  const chip = (on: boolean): CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', padding: '5px 11px', borderRadius: V3.radiusCtl,
    cursor: 'pointer', whiteSpace: 'nowrap', fontSize: 11.5,
    color: on ? T.textStrong : T.textDim, background: on ? T.chip : 'transparent', border: `1px solid ${on ? T.chipBorder : 'transparent'}`,
  })
  return (
    <section style={{ background: T.card, border: `1px solid ${T.cardBorder}`, borderRadius: V3.radiusCard, overflow: 'hidden', fontFamily: V3.font }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 18px', borderBottom: `1px solid ${T.divider}`, flexWrap: 'wrap' }}>
        <span style={{ width: 22, height: 2, background: V3.red, flex: 'none' }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: T.textStrong, whiteSpace: 'nowrap' }}>승률 추이</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 4 }}><span style={{ width: 15, height: 2, background: '#7fa9ff' }} /><span style={{ fontSize: 11, color: T.textFaint }}>승률</span></span>
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
        seed={data.clan.id}
        markSlug={data.clan.slug}
        winLabel={mode === 'day' ? (dayRef ? `${dayRef.name} ${dayRef.d.win}승 ${dayRef.d.lose}패` : '아직 경기 없음') : `누적 ${fmt(data.win)}승 ${fmt(data.lose)}패`}
        kdLabel=""
        showsKd={false}
        tone={T}
      />
    </section>
  )
}
"""
if crlf:
    s = s.replace('\n', '\r\n')
io.open('packages/ui/src/v3/ClanDetailV3.tsx', 'w', encoding='utf-8', newline='').write(s)
print('ok ClanDetailV3 tail')
