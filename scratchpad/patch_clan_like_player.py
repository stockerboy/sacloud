# -*- coding: utf-8 -*-
# 2026-09-23 저녁 사장님: 닉네임·마크 크게 · 래더 크게 · 기록실/지난시즌 탭 삭제 · 그래프 바로 붙이기 · 판 세로 더 줄이기
#                        · 클랜 페이지를 개인 페이지와 똑같은 양식으로
import io, re

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

# ── 계약: 클랜에도 trend ─────────────────────────────────────────────────
patch('packages/contract/src/entities/detail.ts', [
    ("""  main_lineup: z.array(ClanMainPlayer).default([]),
})
export type LeagueClanShow""",
     """  main_lineup: z.array(ClanMainPlayer).default([]),
  /**
   * ★승률 추이★ — 선수 페이지와 같은 모양(`PlayerTrendDay`) (2026-09-23 저녁 사장님 「클랜 페이지도 개인페이지랑 똑같이」).
   * 클랜은 킬·데스를 안 세므로 `kill`/`death`/`kd` 는 0 이고 화면은 승률 선만 그린다.
   */
  trend: z.array(PlayerTrendDay).default([]),
})
export type LeagueClanShow"""),
])

# ── 서버: clanMetrics 가 rows 를 내주고 records 가 접는다 ──────────────────
patch('apps/web/lib/server/queries/clanMetrics.ts', [
    ("""export interface ClanMetricsResult {
  metrics: ClanMetrics | null
  weekly: WeeklyTrend | null
}""",
     """export interface ClanMetricsResult {
  metrics: ClanMetrics | null
  weekly: WeeklyTrend | null
  /** 시즌 창 안의 경기 줄(오름차순) — 추이 그래프 재료 (2026-09-23). 같은 모집단이라 따로 안 읽는다 */
  rows: readonly ClanMatchRow[]
}"""),
])
s = io.open('apps/web/lib/server/queries/clanMetrics.ts', encoding='utf-8', newline='').read()
crlf = '\r\n' in s
s = s.replace('\r\n', '\n')
# return 문 — metrics/weekly 를 돌려주는 곳마다 rows 를 붙인다
n_before = s.count('return { metrics')
s = re.sub(r"return \{ metrics: null, weekly: null \}", "return { metrics: null, weekly: null, rows: [] }", s)
s = re.sub(r"return \{ metrics, weekly \}", "return { metrics, weekly, rows }", s)
assert 'rows }' in s or 'rows: [] }' in s, 'clanMetrics return 을 못 찾았다'
if crlf: s = s.replace('\n', '\r\n')
io.open('apps/web/lib/server/queries/clanMetrics.ts', 'w', encoding='utf-8', newline='').write(s)
print('ok clanMetrics returns', n_before)

patch('apps/web/lib/server/queries/records.ts', [
    ("""    max_win_streak: maxWinStreak,
    main_lineup: mainLineup ?? [],
    /*
     * ★목록과 같은 값★ (2026-09-16 밤)""",
     """    max_win_streak: maxWinStreak,
    main_lineup: mainLineup ?? [],
    /* ★승률 추이★ — 선수와 같은 접기(`buildPlayerTrend`). 클랜은 킬·데스가 없어 `null` 로 넘긴다 (2026-09-23) */
    trend: buildPlayerTrend(clanMetrics.rows.map((row) => ({ startAt: row.startAt, winnerSide: row.won ? 'red' : 'blue', side: 'red', kill: null, death: null }))),
    /*
     * ★목록과 같은 값★ (2026-09-16 밤)"""),
])

patch('packages/mock/src/store.ts', [
    ("""    head_to_head: [],
    max_win_streak: null,
    /* 주전 다섯 — 픽스처에는 실력 점수가 없어 빈 줄이다 (2026-09-12) */""",
     """    head_to_head: [],
    max_win_streak: null,
    trend: [],
    /* 주전 다섯 — 픽스처에는 실력 점수가 없어 빈 줄이다 (2026-09-12) */"""),
])

# ── 선수 머리 카드: 마크 64 · 이름 30 · 점수 30 ─────────────────────────────
patch('packages/ui/src/v3/PlayerHeaderV3.tsx', [
    ("""          <MarkCircle clan={data.clan} size={46} ring={theme} />
          <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
              <span style={{ fontSize: 23, fontWeight: 700,""",
     """          {/* 2026-09-23 저녁 사장님 「닉네임이랑 마크 더 크게」 — 마크 46→64 · 이름 23→30 */}
          <MarkCircle clan={data.clan} size={64} ring={theme} />
          <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
              <span style={{ fontSize: 30, fontWeight: 700,"""),
    ("""            <span style={{ fontSize: 21, fontWeight: 700, color: V3.textStrong, whiteSpace: 'nowrap' }}>
              {PLAYER_CARD_RANK_BY === 'ladder'
                ? formatRatingPoint(data.rating)""",
     """            {/* 2026-09-23 저녁 사장님 「래더는 오른쪽 상단에 조금 더 크게」 — 21→30 */}
            <span style={{ fontSize: 30, fontWeight: 700, color: V3.textStrong, whiteSpace: 'nowrap', lineHeight: 1.1 }}>
              {PLAYER_CARD_RANK_BY === 'ladder'
                ? formatRatingPoint(data.rating)"""),
    ("""            <span style={{ fontSize: 10, color: V3.textGhost2, letterSpacing: '.08em', whiteSpace: 'nowrap' }}>
              {PLAYER_CARD_RANK_BY === 'ladder'
                ? '래더'""",
     """            <span style={{ fontSize: 11, color: V3.textGhost2, letterSpacing: '.08em', whiteSpace: 'nowrap' }}>
              {PLAYER_CARD_RANK_BY === 'ladder'
                ? '래더'"""),
    ("""      <div className="v3-phead-id" style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)', alignItems: 'center', gap: 13, padding: '4px 18px 14px' }}>""",
     """      <div className="v3-phead-id" style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)', alignItems: 'center', gap: 13, padding: '6px 18px 16px' }}>"""),
])

# ── 선수 본문: 추이 판 1/2 · 탭 없이 바로 붙임 · 상세정보 카드(닉네임 · 판킬 · MVP n판 중 · 핵의심+신고) ──
patch('packages/ui/src/v3/TrendChartV3.tsx', [
    ("""const TREND_H_SCALE = 2 / 3""",
     """/* 2026-09-23 저녁 사장님 「그래프 판 세로 크기 줄이기」(한 번 더) — 2/3 → 1/2 */
const TREND_H_SCALE = 1 / 2"""),
])

patch('packages/ui/src/v3/PlayerDetailV3.tsx', [
    ("""function SideInfoCard({ data, showsKd }: { data: LeaguePlayerDetail; showsKd: boolean }) {
  const kdKnown = showsKd && data.kill !== null && data.death !== null
  return (
    <section style={{ ...cardStyle, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', borderBottom: `1px solid ${V3.divider}` }}>
        <span style={{ width: 22, height: 2, background: V3.blue, flex: 'none' }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: V3.textStrong, whiteSpace: 'nowrap' }}>상세정보</span>
      </div>""",
     """function SideInfoCard({ data, showsKd, report }: { data: LeaguePlayerDetail; showsKd: boolean; report?: PlayerDetailV3Props['report'] }) {
  const kdKnown = showsKd && data.kill !== null && data.death !== null
  const reportCount = report?.reported ? report.count : data.report_count
  return (
    <section style={{ ...cardStyle, overflow: 'hidden' }}>
      {/* 제목은 「상세정보」 가 아니라 ★선수 닉네임★ (인계서 ③-8 · 2026-09-23) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', borderBottom: `1px solid ${V3.divider}` }}>
        <span style={{ width: 22, height: 2, background: V3.blue, flex: 'none' }} />
        <span style={{ fontSize: 14, fontWeight: 700, color: V3.textStrong, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{data.player.name}</span>
      </div>"""),
    ("""        <InfoRow label="평균킬" sub="판당">""",
     """        {/* 「평균킬 · 판당」 → ★「판킬」★ (인계서 ③-10) */}
        <InfoRow label="판킬">"""),
    ("""        <InfoRow label="MVP">
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 2, whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: V3.mvp /* ⚠ 옛값 V3.gold */ }}>{fmt(data.mvp_count)}</span>""",
     """        {/* MVP ★「n판 중 k회」★ (인계서 ③-10) */}
        <InfoRow label="MVP" sub={`${fmt(data.win + data.lose)}판 중`}>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 2, whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: V3.mvp /* ⚠ 옛값 V3.gold */ }}>{fmt(data.mvp_count)}</span>"""),
    ("""        {/* ★클랜마크는 이름 앞에 항상★ */}
        <InfoRow label="소속" last>""",
     """        {/* ★클랜마크는 이름 앞에 항상★ */}
        <InfoRow label="소속">"""),
    ("""              <span style={{ fontSize: 13.5, fontWeight: 700, color: V3.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{data.clan.name}</span>
            </span>
          )}
        </InfoRow>
      </div>
    </section>
  )
}""",
     """              <span style={{ fontSize: 13.5, fontWeight: 700, color: V3.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{data.clan.name}</span>
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
}"""),
    ("""          <SideInfoCard data={data} showsKd={showsKd} />""",
     """          <SideInfoCard data={data} showsKd={showsKd} report={props.report} />"""),
    # 그래프를 머리 카드에 바로 붙인다 — 탭이 사라져 남는 틈을 0 으로
    ("""      {/* ① 서플라이의 상단 광고 자리 — 이 선수의 추이 그래프 (남색 판) */}
      <TrendCard data={data} showsKd={showsKd} tone={TREND_TONE} />""",
     """      {/* ① 서플라이의 상단 광고 자리 — 이 선수의 추이 그래프 (남색 판).
          2026-09-23 저녁 사장님 「기록실/지난시즌 버튼 삭제하고 그 사이 공간 없이 그래프판 바로 갖다 붙이고」 → 위 틈 0 (`.sac-trend-glued`) */}
      <div className="sac-trend-glued">
        <TrendCard data={data} showsKd={showsKd} tone={TREND_TONE} />
      </div>"""),
])

# ── 선수 레이아웃: 링크 탭 안 그림 ─────────────────────────────────────────
patch('apps/web/app/league/[leagueSlug]/player/[playerId]/layout.tsx', [
    ("""const PROFILE_LAYOUT_V3: boolean = true""",
     """const PROFILE_LAYOUT_V3: boolean = true
/** 기록실/지난시즌 링크 탭 — 2026-09-23 저녁 사장님 「삭제하고 그래프판 바로 붙여」. true 로 되돌리면 다시 선다 (`CLAUDE.md` 1-4) */
const PLAYER_LINK_TABS = false"""),
    ("""          <div className="sac-pilltabs-pc">
            <PillTabs tabs={leaguePlayerTabs(leagueSlug, playerId)} current={pathname} />
          </div>""",
     """          {PLAYER_LINK_TABS ? (
            <div className="sac-pilltabs-pc">
              <PillTabs tabs={leaguePlayerTabs(leagueSlug, playerId)} current={pathname} />
            </div>
          ) : null}"""),
])

# ── 클랜 레이아웃: 선수와 같은 머리 카드 · 탭 없음 · 1400 ──────────────────
patch('apps/web/app/league/[leagueSlug]/clan/[clanSlug]/layout.tsx', [
    ("""import { ClanCardV3, GhostButton, PillTabs, ProfileEmpty, ProfileSkeleton, RelativeTime, clanThemeOf, useSeasonLabel } from '@sacloud/ui'""",
     """import { ClanCardV3, ClanHeaderV3, GhostButton, PillTabs, ProfileEmpty, ProfileSkeleton, RelativeTime, clanThemeOf, useSeasonLabel } from '@sacloud/ui'"""),
    ("""const PROFILE_LAYOUT_V3: boolean = true""",
     """const PROFILE_LAYOUT_V3: boolean = true
/**
 * ★클랜 페이지를 선수 페이지와 같은 양식으로★ (2026-09-23 저녁 사장님 「토시 하나 다른 배치 없이」).
 * true — 선수와 같은 머리 카드(`ClanHeaderV3`) · 링크 탭 없음 · 본문은 `ClanDetailV3` 가 선수 본문 배치로.
 * false — 옛 판(필 탭 + `ClanCardV3` KPI·육각 카드). 코드는 그대로다 (`CLAUDE.md` 1-4).
 */
const CLAN_HEADER_LIKE_PLAYER = true"""),
    ("""      {data ? (
        <div className="pc-container">
          <PillTabs tabs={leagueClanTabs(leagueSlug, clanSlug)} current={pathname} top={22} />
          <ClanCardV3""",
     """      {data && CLAN_HEADER_LIKE_PLAYER ? (
        <div className="sac-player-page">
          <div className="pc-container">
            <ClanHeaderV3
              data={data}
              infoHref={`/clan/${clanSlug}`}
              seasonLabel={`SEASON ${(season ?? 'CLOUD 0').toUpperCase()}`}
              memberCount={data.member_count ?? null}
              renewAction={
                <GhostButton onClick={refresh.run} disabled={refresh.state === 'pending'} theme={clanThemeOf(data.clan.slug)}>
                  {refresh.state === 'pending' ? '갱신중' : refresh.state === 'failed' ? '갱신 실패' : '전적갱신'}
                </GhostButton>
              }
            />
          </div>
        </div>
      ) : data ? (
        <div className="pc-container">
          <PillTabs tabs={leagueClanTabs(leagueSlug, clanSlug)} current={pathname} top={22} />
          <ClanCardV3"""),
    ("""      {children}
    </>
  )
}""",
     """      {CLAN_HEADER_LIKE_PLAYER ? <div className="sac-player-page">{children}</div> : children}
    </>
  )
}"""),
])

patch('packages/ui/src/v3/index.ts', [
    ("""export * from './ClanCardV3'""",
     """export * from './ClanCardV3'
export * from './ClanHeaderV3'"""),
])

# ── CSS ──────────────────────────────────────────────────────────────────
patch('packages/ui/src/v2/supply-skin.css', [
    ("""/* ★선수 페이지 컨테이너 1400★ (2026-09-23 저녁 사장님:""",
     """/* ★머리 카드 발 줄(MVP·핵의심) 은 PC 에서도 접는다★ (2026-09-23 저녁 사장님이 X). MVP 는 오른쪽 카드에, 핵의심+신고도 거기로 옮겼다.
   폰은 `.v3-phead-info-phone` 줄 안에 있다. DOM 은 남긴다 */
.v3-phead-foot { display: none !important; }
/* ★그래프판을 머리 카드에 바로 붙인다★ — 탭이 사라진 자리 (2026-09-23 저녁 사장님) */
.sac-trend-glued { margin-top: 0; }
.sac-trend-glued > section { border-top-left-radius: 0; border-top-right-radius: 0; border-top: 0; }
.v3-phead { border-bottom-left-radius: 0; border-bottom-right-radius: 0; }

/* ★선수 페이지 컨테이너 1400★ (2026-09-23 저녁 사장님:"""),
])
