# -*- coding: utf-8 -*-
# 인계서 ③-11 「최근 20전 승률 + 킬뎃」 · ③-12 sticky 105
import io

def patch(path, edits):
    s = io.open(path, encoding='utf-8', newline='').read()
    crlf = '\r\n' in s
    s = s.replace('\r\n', '\n')
    for old, new in edits:
        assert s.count(old) == 1, ('count', path, old[:80], s.count(old))
        s = s.replace(old, new)
    if crlf:
        s = s.replace('\n', '\r\n')
    io.open(path, 'w', encoding='utf-8', newline='').write(s)
    print('ok', path)

if False: patch('packages/contract/src/entities/match.ts', [
    ("""export const MatchSummary = z.object({
  recent_count: Count,
  win: Count,
  lose: Count,
  win_rate: Percent,
  streak: Streak,
  opponents: z.array(OpponentSummaryEntry),
})""",
     """export const MatchSummary = z.object({
  recent_count: Count,
  win: Count,
  lose: Count,
  win_rate: Percent,
  streak: Streak,
  opponents: z.array(OpponentSummaryEntry),
  /**
   * ★그 최근 n전의 킬·데스·킬뎃★ (인계서 ③-11 · 2026-09-23) — 선수 기록실 「최근매치」 오른쪽에
   * 「20전 16승 4패 (80%) · 킬뎃 55.2%」. 킬뎃 = 킬/(킬+데스). 킬을 모르는 판은 안 더한다.
   * 클랜 기록실은 팀 열 명의 합이라 ★뜻이 다르다★ — 화면이 선수에서만 적는다. 옛 응답과 호환되게 기본값 null.
   */
  kill: Count.nullable().default(null),
  death: Count.nullable().default(null),
  kd_rate: Percent.nullable().default(null),
})"""),
])

patch('apps/web/lib/server/queries/records.ts', [
    ("""  let win = 0
  let lose = 0
  const opponentMap = new Map<""",
     """  let win = 0
  let lose = 0
  /* 최근 n전 킬·데스 — 선수(playerId)면 그 사람, 클랜이면 우리 편 열 명 합 (인계서 ③-11) */
  let kill = 0
  let death = 0
  let kdKnown = false
  const opponentMap = new Map<"""),
    ("""      entry.kill += stat.kill ?? 0
      entry.death += stat.death ?? 0
    }
    opponentMap.set(opponentId, entry)""",
     """      entry.kill += stat.kill ?? 0
      entry.death += stat.death ?? 0
      if (stat.kill !== null && stat.death !== null) { kill += stat.kill; death += stat.death; kdKnown = true }
    }
    opponentMap.set(opponentId, entry)"""),
    ("""  return {
    recent_count: matches.length,
    win,
    lose,
    win_rate: winRate(win, lose),
    streak,
    opponents,
  }
}""",
     """  return {
    recent_count: matches.length,
    win,
    lose,
    win_rate: winRate(win, lose),
    streak,
    opponents,
    kill: kdKnown ? kill : null,
    death: kdKnown ? death : null,
    kd_rate: kdKnown ? kdRate(kill, death) : null,
  }
}"""),
])

patch('packages/mock/src/store.ts', [
    ("""  return {
    recent_count: recent.length,
    win,
    lose,
    win_rate: winRate(win, lose),
    streak: { type: streakType, count: streakCount },
    opponents,
  }""",
     """  return {
    recent_count: recent.length,
    win,
    lose,
    win_rate: winRate(win, lose),
    streak: { type: streakType, count: streakCount },
    opponents,
    kill: null,
    death: null,
    kd_rate: null,
  }"""),
])

patch('packages/ui/src/v3/ClanTop3PanelV3.tsx', [
    ("""          <span style={{ fontSize: 10.5, color: V3.textGhost2, whiteSpace: 'nowrap' }}>최근 {fmt(s.recent_count)}전</span>
          <span style={{ fontSize: 26, fontWeight: 700, lineHeight: 1, color: statColor(s.win_rate) }}>{pct1(s.win_rate)}</span>
          <span style={{ fontSize: 12, color: V3.textDim, whiteSpace: 'nowrap' }}>{fmt(s.win)}승 {fmt(s.lose)}패</span>""",
     """          <span style={{ fontSize: 10.5, color: V3.textGhost2, whiteSpace: 'nowrap' }}>최근 {fmt(s.recent_count)}전</span>
          <span style={{ fontSize: 26, fontWeight: 700, lineHeight: 1, color: statColor(s.win_rate) }}>{pct1(s.win_rate)}</span>
          <span style={{ fontSize: 12, color: V3.textDim, whiteSpace: 'nowrap' }}>{fmt(s.win)}승 {fmt(s.lose)}패</span>
          {/* ★그 n전의 킬뎃★ (인계서 ③-11 · 2026-09-23). 킬을 모르는 판뿐이면 안 적는다 (D-106) */}
          {s.kd_rate !== null && s.kill !== null && s.death !== null ? (
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 5, whiteSpace: 'nowrap' }}>
              <span style={{ fontSize: 10.5, color: V3.textGhost2 }}>킬뎃</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: statColor(s.kd_rate) }}>{pct1(s.kd_rate)}</span>
              <span style={{ fontSize: 10.5, color: V3.textFaint }}>{fmt(s.kill)}킬 {fmt(s.death)}데스</span>
            </span>
          ) : null}"""),
])

# sticky 105 — 상단바 63 + 리그 띠 42 (인계서 ③-12)
patch('packages/ui/src/v3/PlayerDetailV3.tsx', [
    ("""position: sticky; top: 12px; --hex-zoom: .78; }""",
     """position: sticky; top: 105px; --hex-zoom: .78; } /* 105 = 상단바 63 + 리그 띠 42 — 래더를 안 가린다 (인계서 ③-12) */"""),
])
