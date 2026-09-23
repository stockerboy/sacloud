# -*- coding: utf-8 -*-
# 2026-09-23 오후 사장님: 「경기분석 누르면 진팀 명단 위에 넣어줘 · 너무 작아 · 육각이 명단에 딱 들어가게」
#   → 왼쪽 여백 기둥(PILLAR_HEX=false 로 남김) 대신, PC 에서 진 팀 명단 자리에 육각을 명단 크기로.
import io

def patch(path, edits):
    s = io.open(path, encoding='utf-8', newline='').read()
    crlf = '\r\n' in s
    s = s.replace('\r\n', '\n')
    for old, new, n in edits:
        assert s.count(old) == n, ('count', path, old[:80], s.count(old), n)
        s = s.replace(old, new)
    if crlf:
        s = s.replace('\n', '\r\n')
    io.open(path, 'w', encoding='utf-8', newline='').write(s)
    print('ok', path)

HEXIN = """          {/* ★PC — 경기분석을 누르면 ★진 팀 명단 자리★ 에 육각이 명단 크기로 들어온다★ (2026-09-23 오후 사장님:
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
"""

for path, list_old in [
    ('packages/ui/src/v3/ClanDetailV3.tsx',
     """          <div className={PHONE_ANALYSIS_IN_LIST && analysis === t.side ? 'v3-board-list v3-board-list--closed' : 'v3-board-list'}>
          <div className={showSaves ? 'v3-score-row v3-score-row--saves' : 'v3-score-row'}"""),
    ('packages/ui/src/v3/PlayerDetailV3.tsx',
     """          <div className={PHONE_ANALYSIS_IN_LIST && analysis === t.side ? 'v3-board-list v3-board-list--closed' : 'v3-board-list'}>
          {/* ★칸 이름★ — 서플라이 여섯 칸. 옛 넉 칸(플레이어·K/D/A·세이브·포지션)은 밑에 남겼다 */}"""),
]:
    list_new = list_old.replace(
        "<div className={PHONE_ANALYSIS_IN_LIST && analysis === t.side ? 'v3-board-list v3-board-list--closed' : 'v3-board-list'}>",
        "<div className={`v3-board-list${PHONE_ANALYSIS_IN_LIST && analysis === t.side ? ' v3-board-list--closed' : ''}${!t.won && canAnalyze && analysis !== null ? ' v3-board-list--hexin' : ''}`}>")
    patch(path, [
        (list_old, HEXIN + list_new, 1),
        # 왼쪽 기둥은 스위치 뒤로
        ("""      {canAnalyze && analysis !== null ? (
        <div className="v3-board-pillar">""",
         """      {PILLAR_HEX && canAnalyze && analysis !== null ? (
        <div className="v3-board-pillar">""", 1),
        ("""const PHONE_ANALYSIS_IN_LIST = false""",
         """const PHONE_ANALYSIS_IN_LIST = false
/**
 * ★왼쪽 여백 기둥 육각★ — 2026-09-23 오후 한때의 판. 사장님: 「너무 작아 · 진팀 명단 위에 넣어줘」 → 이제 진 팀 명단 자리(`.v3-board-hexin`).
 * `true` 로 되돌리면 기둥이 다시 선다 (CSS 는 supply-skin.css 에 그대로).
 */
const PILLAR_HEX = false""", 1),
    ])

# maxDamage — 옛 여섯 칸 줄만 쓰던 값. 안 지우고 참조만 남긴다
patch('packages/ui/src/v3/PlayerDetailV3.tsx', [
    ("""  const maxDamage = Math.max(0, ...[...detail.red_stats, ...detail.blue_stats].map((r) => r.damage ?? 0))""",
     """  const maxDamage = Math.max(0, ...[...detail.red_stats, ...detail.blue_stats].map((r) => r.damage ?? 0))
  /* 딜량 막대는 옛 여섯 칸 줄(`ScoreRowSupplySix`)만 썼다 — 값은 남긴다 */
  void maxDamage""", 1),
])

patch('packages/ui/src/v2/supply-skin.css', [
    ("""@media (min-width: 900px) {
  /* 명단 둘 아래 한 줄 전체 */
  .v3-board > .v3-board-flow { grid-column: 1 / -1; grid-row: 2; }
  /* 명단 밑 육각은 ★가운데 420★ 까지만 (서플라이 판 폭) */
  .v3-board-hexphone > svg { max-width: 420px; }
}""",
     """@media (min-width: 900px) {
  /* 명단 둘 아래 한 줄 전체 */
  .v3-board > .v3-board-flow { grid-column: 1 / -1; grid-row: 2; }
  /* 명단 밑 육각은 ★가운데 420★ 까지만 (서플라이 판 폭) */
  .v3-board-hexphone > svg { max-width: 420px; }
  /* ★★경기분석 → 진 팀 명단 자리에 육각★★ (2026-09-23 오후 사장님 「진팀 명단 위에 · 명단에 딱 들어가게」)
     명단 줄(머리 + 5줄 ≈ 300px)만큼 판을 잡고 svg 를 그 높이에 맞춘다. 명단은 그동안 숨는다 · 폰은 명단 밑 육각(hexphone)이 그대로 */
  .v3-board > .v3-board-lose:has(.v3-board-hexin) { display: flex; flex-direction: column; }
  .v3-board-hexin { flex: 1; min-height: 300px; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 8px 10px 10px; }
  .v3-board-hexin > svg { width: auto !important; height: 232px; max-width: 100%; }
  .v3-board-list--hexin { display: none; }
  /* PC 는 진 팀 명단 자리에 육각이 있으니 명단 밑 육각은 안 그린다 */
  .v3-board-hexphone { display: none; }
}""", 1),
])
