# -*- coding: utf-8 -*-
# 라운드 흐름 — 진영판 (2026-09-23 오후 사장님 손그림 · 시안 확정). CRLF 보존.
import io
p = 'packages/ui/src/v3/RoundFlowChartV3.tsx'
s = io.open(p, encoding='utf-8', newline='').read()
crlf = '\r\n' in s
s = s.replace('\r\n', '\n')

def rep(old, new, count=1):
    global s
    assert s.count(old) >= 1, ('missing', old[:80])
    s = s.replace(old, new, count)

# 1) Pt 에 그 반의 점수
rep("""  /** 이 시점의 라운드 스코어 (이긴 클랜 : 진 클랜) */
  scoreW: number
  scoreL: number
""", """  /** 이 시점의 라운드 스코어 (이긴 클랜 : 진 클랜) — 경기 누적 */
  scoreW: number
  scoreL: number
  /** ★그 반의 점수★ (2026-09-23 오후 사장님: 「라운드 총스코어 X · 전반 끝나면 0:0 부터」). 후반 첫 라운드에서 0 으로 돌아간다 */
  halfScoreW: number
  halfScoreL: number
""")

# 2) 스위치
rep("""/** 깔끔한 판의 선 두께 (sleeper 참고) */
const CLEAN_W = 2.6
""", """/** 깔끔한 판의 선 두께 (sleeper 참고) */
const CLEAN_W = 2.6
/*
 * ★★2026-09-23 오후 — 진영판★★ (사장님 손그림 3장 + 시안 아티팩트 확정)
 *
 *   그래프 → 인원(사람 아이콘 · 레드 왼쪽/블루 오른쪽 · 가운데 전반전/후반전) → 「레드 클랜 n:n 클랜 블루」
 *   → 죽은 차례 두 칸(왼쪽 = 레드가 잡은 것 · 오른쪽 = 블루가 잡은 것)
 *
 *   HALF_SUMMARY   옛 「전후반 요약」 상자 (사장님 X) — false
 *   CREW_ABOVE     옛 인원 줄(○ 동그라미 · 그래프 위) — false. 아래 사람 아이콘 줄이 대신한다
 *   옛 판 코드는 그대로 두었다 (`CLAUDE.md` 1-4) — 두 값을 true 로 되돌리면 그대로 돌아온다.
 */
const HALF_SUMMARY = false
const CREW_ABOVE = false
""")

# 3) 루프에 반 점수
rep("""    let scoreW = 0
    let scoreL = 0
    /* 출발 — 옛 판은 이긴 클랜이 아래(0)에서 (상대전적 그래프와 같다). 지금은 1라운드 값에서 바로 시작 */
    if (START_AT_EDGES) pts.push({ x: xOf(0, 'A'), v: 0, round: 0, aliveW: sizeW, aliveL: sizeL, scoreW, scoreL, first: null, fallen: [], attack: null, est: false })
    for (const r of rounds) {
      const half: 'A' | 'B' = s !== null && r.round >= s ? 'B' : 'A'
      const halfKey: 'first' | 'second' = half === 'A' ? 'first' : 'second'
""", """    let scoreW = 0
    let scoreL = 0
    /* 그 반의 점수 — 후반 첫 라운드에서 0:0 으로 (사장님) */
    let halfScoreW = 0
    let halfScoreL = 0
    let lastHalf: 'A' | 'B' = 'A'
    /* 출발 — 옛 판은 이긴 클랜이 아래(0)에서 (상대전적 그래프와 같다). 지금은 1라운드 값에서 바로 시작 */
    if (START_AT_EDGES) pts.push({ x: xOf(0, 'A'), v: 0, round: 0, aliveW: sizeW, aliveL: sizeL, scoreW, scoreL, halfScoreW, halfScoreL, first: null, fallen: [], attack: null, est: false })
    for (const r of rounds) {
      const half: 'A' | 'B' = s !== null && r.round >= s ? 'B' : 'A'
      const halfKey: 'first' | 'second' = half === 'A' ? 'first' : 'second'
      if (half !== lastHalf) { halfScoreW = 0; halfScoreL = 0; lastHalf = half }
""")
rep("""      pts.push({ x: xOf(r.start, half), v: o.p * 100, round: r.round, aliveW, aliveL, scoreW, scoreL, first: null, fallen, attack, est: o.est })""",
    """      pts.push({ x: xOf(r.start, half), v: o.p * 100, round: r.round, aliveW, aliveL, scoreW, scoreL, halfScoreW, halfScoreL, first: null, fallen, attack, est: o.est })""")
rep("""        pts.push({ x, v: o.p * 100, round: r.round, aliveW, aliveL, scoreW, scoreL, first: firstSeen, fallen, attack, est: o.est })""",
    """        pts.push({ x, v: o.p * 100, round: r.round, aliveW, aliveL, scoreW, scoreL, halfScoreW, halfScoreL, first: firstSeen, fallen, attack, est: o.est })""")
rep("""        if (JUMP_ON_ROUND_END && r.winner !== null) pts.push({ x, v: r.winner === W ? 100 : 0, round: r.round, aliveW, aliveL, scoreW, scoreL, first: firstSeen, fallen, attack, est: false })
      }
      if (r.winner === W) scoreW += 1
      else if (r.winner === L) scoreL += 1
""", """        if (JUMP_ON_ROUND_END && r.winner !== null) pts.push({ x, v: r.winner === W ? 100 : 0, round: r.round, aliveW, aliveL, scoreW, scoreL, halfScoreW, halfScoreL, first: firstSeen, fallen, attack, est: false })
      }
      if (r.winner === W) { scoreW += 1; halfScoreW += 1 }
      else if (r.winner === L) { scoreL += 1; halfScoreL += 1 }
""")

# 4) 전후반 요약 상자 · 옛 인원 줄을 스위치 뒤로
rep("""      {/* ★전후반 요약★ — 가로 배열: [전반 공격 · 전반 수비] | [후반 공격 · 후반 수비] (2026-09-23 사장님) */}
      <div style={{ border: `1px solid ${tone.cardBorder}`, marginBottom: 6 }}>""",
    """      {/* ★전후반 요약★ — 가로 배열: [전반 공격 · 전반 수비] | [후반 공격 · 후반 수비] (2026-09-23 사장님)
          ⚠ 2026-09-23 오후 — 사장님이 시안에서 X 치셨다. HALF_SUMMARY=false 로 안 그린다 (코드는 남긴다) */}
      {HALF_SUMMARY ? (
      <div style={{ border: `1px solid ${tone.cardBorder}`, marginBottom: 6 }}>""")
rep("""      </div>
      {/* ★인원 줄★ — 축을 옮기면 따라온다 (시안 A) */}
      {hud ? (""", """      </div>
      ) : null}
      {/* ★인원 줄★ — 축을 옮기면 따라온다 (시안 A)
          ⚠ 2026-09-23 오후 — 옛 판(○ 동그라미 · 그래프 위). 지금은 그래프 ★아래★ 사람 아이콘 줄(CREW_ABOVE=false) */}
      {CREW_ABOVE && hud ? (""")

# 5) 죽은 차례 블록 — 새 진영판 + 옛 세로 판은 「진영 미상」 폴백
old_start = s.index("      {/*\n        ★★2026-09-23 오후 — 진영을 글자로 박는다★★")
old_end = s.index("    </div>\n  )\n}\n", old_start)
legacy = s[old_start:old_end]
legacy = legacy.replace("      {hud ? (\n        <div style={{ display: 'flex', flexDirection: 'column', gap: 3,",
                        "      {hud && !sidesKnown ? (\n        <div style={{ display: 'flex', flexDirection: 'column', gap: 3,")
assert 'hud && !sidesKnown' in legacy
new_block = io.open('scratchpad/patch_roundflow_block.tsx', encoding='utf-8').read()
s = s[:old_start] + new_block + legacy + s[old_end:]

# 6) sidesKnown
rep("""  const loseInk = LOSER_CLAN_COLOR ? loser.theme.main : '#ff6b6b'
""", """  const loseInk = LOSER_CLAN_COLOR ? loser.theme.main : '#ff6b6b'
  /* 진영판을 그릴 수 있나 — 그 라운드의 공격(레드) 팀을 알아야 한다 */
  const sidesKnown = hud !== null && hud.attack !== null
""")
# 7) 색 상수 · CrewIcons · SideTag — SideChip 앞에
helpers = io.open('scratchpad/patch_roundflow_helpers.tsx', encoding='utf-8').read()
rep("""/**
 * ★진영 칩★ — 「레드」(공격) 빨강 테두리 · 「블루」(수비) 파랑 테두리 (2026-09-23 오후 사장님).""",
    helpers + """
/**
 * ★진영 칩★ — 「레드」(공격) 빨강 테두리 · 「블루」(수비) 파랑 테두리 (2026-09-23 오후 사장님).""")

if crlf:
    s = s.replace('\n', '\r\n')
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('ok')
