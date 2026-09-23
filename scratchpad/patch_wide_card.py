# -*- coding: utf-8 -*-
# 2026-09-23 밤 사장님: 「경기 카드 가로를 오른쪽 끝(1360)까지 · 예전 가운데 육각 + 양옆 명단 · 그 밑에 라운드 그래프 ·
#   세로도 비율대로 · 글씨 키워 · 폰은 그대로 · PC 는 이 한 카드로 통일」
import io

def rw(p):
    s = io.open(p, encoding='utf-8', newline='').read()
    return s.replace('\r\n', '\n'), ('\r\n' in s)

def save(p, s, crlf):
    io.open(p, 'w', encoding='utf-8', newline='').write(s.replace('\n', '\r\n') if crlf else s)

def rep(s, old, new, n=1):
    assert s.count(old) == n, ('count', old[:80], s.count(old), n)
    return s.replace(old, new)

# ── 선수 페이지: 최근 경기를 2단 밖(전체 폭)으로 ──
p = 'packages/ui/src/v3/PlayerDetailV3.tsx'; s, crlf = rw(p)
s = rep(s, "          <ClanTop3PanelV3 data={data} onMore={() => setTab('clan')} />\n          {matchList}\n",
        "          <ClanTop3PanelV3 data={data} onMore={() => setTab('clan')} />\n")
s = rep(s, "          {SHOW_TEAMMATES ? <TeammatesCard data={data} /> : null}\n        </aside>\n      </div>\n      </div>\n",
        "          {SHOW_TEAMMATES ? <TeammatesCard data={data} /> : null}\n        </aside>\n      </div>\n      {/* ★최근 경기는 2단 ★밖★ 전체 폭(1316)★ (2026-09-23 밤 사장님 「경기 카드 가로를 오른쪽 끝까지」). 옛 자리는 왼쪽 칸 안 */}\n      {matchList}\n      </div>\n")
# 경기분석 — PC 는 가운데 육각 + 그래프 늘 · 단추는 폰만
s = rep(s, "                {analysis === t.side ? '명단' : '경기분석'}\n              </span>",
        "                {analysis === t.side ? '명단' : '경기분석'}\n              </span>", 1)
s = s.replace("""              <span
                onClick={(e) => { e.stopPropagation(); setPick(t.won ? 'won' : 'lost'); setAnalysis((now) => (now === t.side ? null : t.side)) }}
                style={{ fontSize: 10.5, fontWeight: 700, whiteSpace: 'nowrap', flex: 'none', cursor: 'pointer', padding: '3px 9px', borderRadius: V3.radiusChip, color: analysis === t.side ? '#1d4fd6' : '#5c6479', border: `1px solid ${analysis === t.side ? 'rgba(159,192,255,.55)' : 'rgba(143,169,216,.32)'}`, background: analysis === t.side ? 'rgba(91,141,255,.16)' : 'transparent' }}
              >""", """              <span
                className="v3-analyze-btn"
                onClick={(e) => { e.stopPropagation(); setPick(t.won ? 'won' : 'lost'); setAnalysis((now) => (now === t.side ? null : t.side)) }}
                style={{ fontSize: 10.5, fontWeight: 700, whiteSpace: 'nowrap', flex: 'none', cursor: 'pointer', padding: '3px 9px', borderRadius: V3.radiusChip, color: analysis === t.side ? '#1d4fd6' : '#5c6479', border: `1px solid ${analysis === t.side ? 'rgba(159,192,255,.55)' : 'rgba(143,169,216,.32)'}`, background: analysis === t.side ? 'rgba(91,141,255,.16)' : 'transparent' }}
              >""")
assert s.count('className="v3-analyze-btn"') == 1, 'btn'
s = rep(s, "${!t.won && canAnalyze && analysis !== null ? ' v3-board-list--hexin' : ''}`}>",
        "${!HEX_CENTER_PC && !t.won && canAnalyze && analysis !== null ? ' v3-board-list--hexin' : ''}`}>")
s = rep(s, "          {!t.won && canAnalyze && analysis !== null ? (\n            <div className=\"v3-board-hexin\">",
        "          {!HEX_CENTER_PC && !t.won && canAnalyze && analysis !== null ? (\n            <div className=\"v3-board-hexin\">")
s = rep(s, "      {canAnalyze && analysis !== null ? (\n        <div className=\"v3-board-flow\">",
        """      {/* ★PC — 가운데 육각(예전 3단)★ (2026-09-23 밤 사장님 「예전에 쓰던 가운데 육각 + 양옆 명단」). 폰(<900)은 안 그린다(tokens.css) */}
      {HEX_CENTER_PC && canAnalyze ? (
        <div className="v3-board-hex" style={{ padding: '4px 0 0' }}>
          <MatchHexagonV3
            won={wonTeam ? hexOf(wonTeam.side) : null}
            lost={lostTeam ? hexOf(lostTeam.side) : null}
            wonName={wonTeam?.snap.clan.name ?? '승리'}
            lostName={lostTeam?.snap.clan.name ?? '패배'}
            id={`mhexPc-${detail.id}`}
          />
        </div>
      ) : null}
      {canAnalyze && (analysis !== null || HEX_CENTER_PC) ? (
        <div className={`v3-board-flow${analysis === null ? ' v3-board-flow--auto' : ''}`}>""")
s = rep(s, "const PILLAR_HEX = false", """const PILLAR_HEX = false
/**
 * ★PC — 가운데 육각 · 그 밑에 라운드 그래프 · 둘 다 ★늘★ 보인다★ (2026-09-23 밤 사장님 「예전에 쓰던 가운데 육각 + 양옆 명단 · 그 밑에 라운드볼 그래프」).
 * 경기분석 단추는 폰에서만 뜻이 있다(CSS `.v3-analyze-btn` 이 PC 에서 숨긴다). false 면 낮 판(진 팀 명단 자리 육각 · 단추로 열기).
 */
const HEX_CENTER_PC = true""")
save(p, s, crlf); print('ok player')

# ── 클랜 페이지: 통합 기록실을 2단 밖으로 · 같은 스코어보드 규칙 ──
p = 'packages/ui/src/v3/ClanDetailV3.tsx'; s, crlf = rw(p)
s = rep(s, "              {recordList}\n            </div>\n            <aside className=\"sac-prr-aside\">",
        "            </div>\n            <aside className=\"sac-prr-aside\">")
s = rep(s, "              <ClanHexCard data={data} />\n            </aside>\n          </div>\n        </div>\n",
        "              <ClanHexCard data={data} />\n            </aside>\n          </div>\n          {/* ★통합 기록실은 2단 밖 전체 폭★ (2026-09-23 밤 사장님) */}\n          {recordList}\n        </div>\n")
s = s.replace("""              <span
                onClick={(e) => { e.stopPropagation(); setPick(t.won ? 'won' : 'lost'); setAnalysis((now) => (now === t.side ? null : t.side)) }}
                style={{ fontSize: 10.5, fontWeight: 700, whiteSpace: 'nowrap', flex: 'none', cursor: 'pointer', padding: '3px 9px', borderRadius: V3.radiusChip, color: analysis === t.side ? '#1d4fd6' : '#5c6479', border: `1px solid ${analysis === t.side ? 'rgba(159,192,255,.55)' : 'rgba(143,169,216,.32)'}`, background: analysis === t.side ? 'rgba(91,141,255,.16)' : 'transparent' }}
              >""", """              <span
                className="v3-analyze-btn"
                onClick={(e) => { e.stopPropagation(); setPick(t.won ? 'won' : 'lost'); setAnalysis((now) => (now === t.side ? null : t.side)) }}
                style={{ fontSize: 10.5, fontWeight: 700, whiteSpace: 'nowrap', flex: 'none', cursor: 'pointer', padding: '3px 9px', borderRadius: V3.radiusChip, color: analysis === t.side ? '#1d4fd6' : '#5c6479', border: `1px solid ${analysis === t.side ? 'rgba(159,192,255,.55)' : 'rgba(143,169,216,.32)'}`, background: analysis === t.side ? 'rgba(91,141,255,.16)' : 'transparent' }}
              >""")
assert s.count('className="v3-analyze-btn"') == 1, 'btn clan'
s = rep(s, "${!t.won && canAnalyze && analysis !== null ? ' v3-board-list--hexin' : ''}`}>",
        "${!HEX_CENTER_PC && !t.won && canAnalyze && analysis !== null ? ' v3-board-list--hexin' : ''}`}>")
s = rep(s, "          {!t.won && canAnalyze && analysis !== null ? (\n            <div className=\"v3-board-hexin\">",
        "          {!HEX_CENTER_PC && !t.won && canAnalyze && analysis !== null ? (\n            <div className=\"v3-board-hexin\">")
s = rep(s, "      {canAnalyze && analysis !== null ? (\n        <div className=\"v3-board-flow\">",
        """      {/* ★PC — 가운데 육각(예전 3단)★ (2026-09-23 밤 사장님). 폰(<900)은 안 그린다(tokens.css) */}
      {HEX_CENTER_PC && canAnalyze ? (
        <div className="v3-board-hex" style={{ padding: '4px 0 0' }}>
          <MatchHexagonV3
            won={wonTeam ? hexOf(wonTeam.side) : null}
            lost={lostTeam ? hexOf(lostTeam.side) : null}
            wonName={wonTeam?.snap.clan.name ?? '승리'}
            lostName={lostTeam?.snap.clan.name ?? '패배'}
            id={`mhexPc-${detail.id}`}
          />
        </div>
      ) : null}
      {canAnalyze && (analysis !== null || HEX_CENTER_PC) ? (
        <div className={`v3-board-flow${analysis === null ? ' v3-board-flow--auto' : ''}`}>""")
s = rep(s, "const PILLAR_HEX = false", """const PILLAR_HEX = false
/** ★PC — 가운데 육각 · 그 밑 라운드 그래프 늘 보임★ (2026-09-23 밤 사장님). 설명은 PlayerDetailV3 의 같은 이름 */
const HEX_CENTER_PC = true""")
save(p, s, crlf); print('ok clan')

# ── 라운드 흐름 HUD — PC 글자 키움 ──
p = 'packages/ui/src/v3/RoundFlowChartV3.tsx'; s, crlf = rw(p)
s = rep(s, "<div style={{ fontSize: 10, letterSpacing: '.08em', color: tone.textGhost, marginBottom: 3, textAlign: align, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{teamOf(k).name}가 잡음</div>",
        "<div style={{ fontSize: phone ? 10 : 11.5, letterSpacing: '.08em', color: tone.textGhost, marginBottom: 3, textAlign: align, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{teamOf(k).name}가 잡음</div>")
s = rep(s, "<div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12.5 }}>", "<div style={{ display: 'flex', flexDirection: 'column', gap: phone ? 3 : 5, fontSize: phone ? 12.5 : 14.5 }}>")
s = rep(s, "fontWeight: 800, fontSize: 13.5, color: RED_INK,", "fontWeight: 800, fontSize: phone ? 13.5 : 17, color: RED_INK,")
s = rep(s, "fontWeight: 800, fontSize: 13.5, color: BLUE_INK,", "fontWeight: 800, fontSize: phone ? 13.5 : 17, color: BLUE_INK,")
s = rep(s, "<div style={{ fontWeight: 800, fontSize: 20, fontVariantNumeric: 'tabular-nums'", "<div style={{ fontWeight: 800, fontSize: phone ? 20 : 26, fontVariantNumeric: 'tabular-nums'")
s = rep(s, "borderTop: `1px solid ${tone.cardBorder}`, paddingTop: 8, height: 152, overflow: 'hidden'", "borderTop: `1px solid ${tone.cardBorder}`, paddingTop: 8, height: phone ? 152 : 176, overflow: 'hidden'")
# 사람 아이콘 PC 20
s = rep(s, "<svg key={i} viewBox=\"0 0 16 16\" style={{ width: 16, height: 16, display: 'block', filter: on ? glow : undefined }} aria-hidden>",
        "<svg key={i} viewBox=\"0 0 16 16\" style={{ width: size16 ? 16 : 20, height: size16 ? 16 : 20, display: 'block', filter: on ? glow : undefined }} aria-hidden>")
s = rep(s, "function CrewIcons({ alive, size, ink, glow, fromRight }: { alive: number; size: number; ink: string; glow: string; fromRight: boolean }) {",
        "function CrewIcons({ alive, size, ink, glow, fromRight, size16 = true }: { alive: number; size: number; ink: string; glow: string; fromRight: boolean; /** 폰 16 · PC 20 (2026-09-23 밤) */ size16?: boolean }) {")
s = rep(s, "<CrewIcons alive={aliveOf(leftKey)} size={sizeOf(leftKey)} ink={RED_INK} glow={RED_GLOW} fromRight={true} />", "<CrewIcons alive={aliveOf(leftKey)} size={sizeOf(leftKey)} ink={RED_INK} glow={RED_GLOW} fromRight={true} size16={phone} />")
s = rep(s, "<CrewIcons alive={aliveOf(rightKey)} size={sizeOf(rightKey)} ink={BLUE_INK} glow={BLUE_GLOW} fromRight={false} />", "<CrewIcons alive={aliveOf(rightKey)} size={sizeOf(rightKey)} ink={BLUE_INK} glow={BLUE_GLOW} fromRight={false} size16={phone} />")
save(p, s, crlf); print('ok roundflow')

# ── 경기 상세 · 리그홈 최근경기 페이지도 1360 ──
p = 'apps/web/app/league/[leagueSlug]/match/[matchId]/MatchDetailScreen.tsx'; s, crlf = rw(p)
s = rep(s, '    <div className="pc-container sac-v3-page pb-[40px]">', '    /* `sac-player-page` — 경기 카드 폭을 선수 페이지와 같은 1360 으로 (2026-09-23 밤 사장님 「모든 경기카드는 이 크기로 통일」) */\n    <div className="sac-player-page"><div className="pc-container sac-v3-page pb-[40px]">')
# 닫는 div — 파일 끝 return 의 마지막 </div>
idx = s.rfind("    </div>\n  )\n}")
assert idx > 0
s = s[:idx] + "    </div></div>\n  )\n}" + s[idx + len("    </div>\n  )\n}"):]
save(p, s, crlf); print('ok match screen')

# ── CSS ──
p = 'packages/ui/src/v2/supply-skin.css'; s, crlf = rw(p)
s += """
/* ══════════════════════════════════════════════════════════════════════════
   ★★PC 경기 카드 한 판으로 통일★★ (2026-09-23 밤 사장님)
   「경기 카드 가로를 오른쪽 끝(1360)까지 · 예전 가운데 육각 + 양옆 명단 · 그 밑에 라운드 그래프 · 세로도 비율대로 · 글씨 키워 ·
    폰은 그대로 · 모든 경기카드는 이 크기로 통일」
   선수·클랜 페이지는 경기 목록이 2단 밖(전체 폭)으로 나갔고, 경기 상세 페이지도 1360 이다. 폰(<900)은 한 글자도 안 바뀐다.
   ══════════════════════════════════════════════════════════════════════════ */
@media (min-width: 900px) {
  .mc-card { max-width: none !important; }
  .v3-analyze-btn { display: none !important; }                 /* PC 는 육각·그래프가 늘 떠 있다 */
  .v3-board { grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) !important; column-gap: 18px !important; }
  .v3-board > .v3-board-win { grid-column: 1; grid-row: 1; }
  .v3-board > .v3-board-hex { grid-column: 2; grid-row: 1; display: block !important; width: 440px; justify-self: center; }
  .v3-board > .v3-board-hex > * { grid-column: auto !important; grid-row: auto !important; margin-top: 0 !important; }
  .v3-board > .v3-board-hex svg { max-width: 440px !important; }
  .v3-board > .v3-board-lose { grid-column: 3; grid-row: 1; }
  .v3-board > .v3-board-flow { grid-column: 1 / -1; grid-row: 2; }
  .v3-board-hexin { display: none !important; }
  .v3-board-list--hexin { display: block !important; }
  /* 명단 글자 키움 — 1316 카드에서 명단 한 칸이 ~410 이라 자리가 있다 */
  .v3-board .v3-score-row { font-size: 14px !important; padding-top: 11px !important; padding-bottom: 11px !important; }
  .v3-board .v3-score-row--saves { grid-template-columns: minmax(120px, 1fr) 44px 92px 44px 56px 0px !important; gap: 12px !important; }
  .v3-board .v3-score-row button, .v3-board .v3-score-row a { font-size: 14px !important; }
  .v3-board .v3-score-row > span:nth-child(2), .v3-board .v3-score-row > span:nth-child(4), .v3-board .v3-score-row > span:nth-child(5) { font-size: 13.5px !important; }
}
@media (max-width: 899px) {
  /* 폰은 경기분석을 눌러야 그래프가 열린다 — PC 용 「늘 보임」 판은 폰에서 숨긴다 */
  .v3-board-flow--auto { display: none !important; }
}
"""
save(p, s, crlf); print('ok css')
