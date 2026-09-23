# -*- coding: utf-8 -*-
# 2026-09-23 밤 사장님 명세 「3rd.supply 상세정보 UI 스타일 기준」 — 상세정보 카드(선수·클랜 오른쪽 · 폰 머리 줄)만
import io

def rw(p):
    s = io.open(p, encoding='utf-8', newline='').read()
    return s.replace('\r\n', '\n'), ('\r\n' in s)

def save(p, s, crlf):
    io.open(p, 'w', encoding='utf-8', newline='').write(s.replace('\n', '\r\n') if crlf else s)

def seg(s, start, end):
    a = s.index(start); b = s.index(end, a); return a, b

def rep(blk, old, new):
    assert old in blk, ('missing', old[:70])
    return blk.replace(old, new)

# ── rankColors.ts — 새 팔레트 + 두 함수 (공통 statColor/rankColor 는 안 건드림) ──
p = 'packages/ui/src/v3/rankColors.ts'; s, crlf = rw(p)
if 'export const SUPPLY_INFO' not in s:
    s += """
/* ══════════════════════════════════════════════════════════════════════════
   ★상세정보 카드 전용 — 3rd.supply 색 체계★ (2026-09-23 밤 사장님 명세)
   ⚠ 사이트 공통 statColor · rankColor 는 ★안 건드린다★ (CLAUDE.md 4절 — 순위 3/20/40/100 · 승률 40/50/55/60/65).
     상세정보 카드(선수·클랜 오른쪽 카드 · 폰 머리 카드 줄)만 이 둘을 쓴다.
   ══════════════════════════════════════════════════════════════════════════ */
export const SUPPLY_INFO = {
  red: '#E84C44', green: '#4CA834', orange: '#E07834', blue: '#4080C8', yellow: '#F8E44C',
  white: '#D8DEE8', sub: '#D0D7E2', card: '#1E293B', line: '#35445A',
} as const

/** 승률·킬뎃 % → 색. 39.9 이하 빨강 · 40~49.9 흰 · 50~54.9 초록 · 55~59.9 주황 · 60~64.9 파랑 · 65 이상 노랑 */
export function supplyRateColor(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return SUPPLY_INFO.white
  if (value < 40) return SUPPLY_INFO.red
  if (value < 50) return SUPPLY_INFO.white
  if (value < 55) return SUPPLY_INFO.green
  if (value < 60) return SUPPLY_INFO.orange
  if (value < 65) return SUPPLY_INFO.blue
  return SUPPLY_INFO.yellow
}

/** 등수 → 색. 1~100 노랑 · 101~200 파랑 · 201~300 주황 · 301~400 초록 · 401 이하 흰 */
export function supplyRankColor(rank: number | null | undefined): string {
  if (rank === null || rank === undefined) return SUPPLY_INFO.white
  if (rank <= 100) return SUPPLY_INFO.yellow
  if (rank <= 200) return SUPPLY_INFO.blue
  if (rank <= 300) return SUPPLY_INFO.orange
  if (rank <= 400) return SUPPLY_INFO.green
  return SUPPLY_INFO.white
}
"""
    save(p, s, crlf); print('ok rankColors')

LABEL_OLD = "fontSize: 12.5, fontWeight: 700, color: V3.textDim, whiteSpace: 'nowrap', flex: 'none'"
LABEL_NEW = "fontSize: 12.5, fontWeight: 600, color: SUPPLY_INFO.white, whiteSpace: 'nowrap', flex: 'none'"
SUB_OLD = "fontSize: 11, color: V3.textFaint, whiteSpace: 'nowrap', overflow: 'hidden'"
SUB_NEW = "fontSize: 11, color: SUPPLY_INFO.sub, whiteSpace: 'nowrap', overflow: 'hidden'"

# ── PlayerDetailV3 ──
p = 'packages/ui/src/v3/PlayerDetailV3.tsx'; s, crlf = rw(p)
s = rep(s, "import { floorColor, rankColor, rankColorOf, statColor } from './rankColors'",
        "import { SUPPLY_INFO, floorColor, rankColor, rankColorOf, statColor, supplyRankColor, supplyRateColor } from './rankColors'")
a, b = seg(s, "function SideInfoCard(", "function TeammatesCard(")
blk = s[a:b]
blk = rep(blk, "<section style={{ ...cardStyle, overflow: 'hidden' }}>", "<section className=\"sac-info-card\" style={{ ...cardStyle, overflow: 'hidden' }}>")
blk = rep(blk, "<span style={{ fontSize: 22, fontWeight: 700, color: V3.textStrong, whiteSpace: 'nowrap' }}>{formatRating(data.rating)}</span>",
          "<span style={{ fontSize: 22, fontWeight: 700, color: SUPPLY_INFO.red, whiteSpace: 'nowrap' }}>{formatRating(data.rating)}</span>")
blk = rep(blk, "color: statColor(data.win_rate)", "color: supplyRateColor(data.win_rate)")
blk = rep(blk, "color: data.kd_rate === null ? V3.textMuted : statColor(data.kd_rate)", "color: supplyRateColor(data.kd_rate)")
blk = rep(blk, "color: rankColorOf(data.rank, data.rank_count)", "color: supplyRankColor(data.rank)")
s = s[:a] + blk + s[b:]
a, b = seg(s, "function InfoRow(", "export function PlayerDetailV3(")
blk = s[a:b]
blk = rep(blk, LABEL_OLD, LABEL_NEW); blk = rep(blk, SUB_OLD, SUB_NEW)
s = s[:a] + blk + s[b:]
save(p, s, crlf); print('ok player')

# ── ClanDetailV3 ──
p = 'packages/ui/src/v3/ClanDetailV3.tsx'; s, crlf = rw(p)
s = rep(s, "import { floorColor, rankColor, statColor } from './rankColors'",
        "import { SUPPLY_INFO, floorColor, rankColor, statColor, supplyRankColor, supplyRateColor } from './rankColors'")
a, b = seg(s, "function ClanSideInfoCard(", "function ClanHexCard(")
blk = s[a:b]
blk = rep(blk, "<section style={{ ...cardStyle, overflow: 'hidden' }}>", "<section className=\"sac-info-card\" style={{ ...cardStyle, overflow: 'hidden' }}>")
blk = rep(blk, "color: floorColor(data.rating)", "color: SUPPLY_INFO.red")
blk = rep(blk, "color: data.win_rate === null ? V3.textMuted : statColor(data.win_rate)", "color: supplyRateColor(data.win_rate)")
blk = rep(blk, "color: rankColor(rank)", "color: supplyRankColor(rank)")
blk = rep(blk, LABEL_OLD, LABEL_NEW); blk = rep(blk, SUB_OLD, SUB_NEW)
s = s[:a] + blk + s[b:]
save(p, s, crlf); print('ok clan')

# ── PlayerHeaderV3 (폰 상세정보 줄) ──
p = 'packages/ui/src/v3/PlayerHeaderV3.tsx'; s, crlf = rw(p)
s = rep(s, "import { rankColorOf, statColor } from './rankColors'",
        "import { SUPPLY_INFO, rankColorOf, statColor, supplyRankColor, supplyRateColor } from './rankColors'")
a, b = seg(s, '<div className="v3-phead-info-phone"', "function PhoneInfoRow(")
blk = s[a:b]
blk = rep(blk, '<div className="v3-phead-info-phone"', '<div className="v3-phead-info-phone sac-info-card"')
blk = rep(blk, "color: statColor(data.win_rate)", "color: supplyRateColor(data.win_rate)")
blk = rep(blk, "color: data.kd_rate === null ? V3.textMuted : statColor(data.kd_rate)", "color: supplyRateColor(data.kd_rate)")
blk = rep(blk, "color: rankColorOf(data.rank, data.rank_count)", "color: supplyRankColor(data.rank)")
s = s[:a] + blk + s[b:]
a = s.index("function PhoneInfoRow(")
blk = s[a:]
blk = rep(blk, LABEL_OLD, LABEL_NEW); blk = rep(blk, SUB_OLD, SUB_NEW)
s = s[:a] + blk
save(p, s, crlf); print('ok header')

# ── ClanHeaderV3 ──
p = 'packages/ui/src/v3/ClanHeaderV3.tsx'; s, crlf = rw(p)
s = rep(s, "import { rankColor, statColor } from './rankColors'", "import { SUPPLY_INFO, supplyRankColor, supplyRateColor } from './rankColors'")
s = rep(s, '<div className="v3-phead-info-phone"', '<div className="v3-phead-info-phone sac-info-card"')
s = rep(s, "color: data.win_rate === null ? V3.textMuted : statColor(data.win_rate)", "color: supplyRateColor(data.win_rate)")
s = rep(s, "color: rankColor(rank)", "color: supplyRankColor(rank)")
s = rep(s, LABEL_OLD, LABEL_NEW); s = rep(s, SUB_OLD, SUB_NEW)
save(p, s, crlf); print('ok clanheader')

# ── CSS ──
p = 'packages/ui/src/v2/supply-skin.css'; s, crlf = rw(p)
if '.sac-info-card {' not in s:
    s += """
/* ★상세정보 카드 — 3rd.supply 스타일★ (2026-09-23 밤 사장님 명세). 판 #1E293B · 선 #35445A · Noto Sans KR · 라벨 600 · 값 700.
   색 규칙은 rankColors.ts 의 supplyRateColor / supplyRankColor (공통 statColor·rankColor 는 안 건드림) */
.sac-info-card { background: #1E293B !important; border-color: #35445A !important; font-family: "Noto Sans KR", "Noto Sans", sans-serif; }
.sac-info-card > div > div { border-bottom-color: #35445A !important; }
"""
    save(p, s, crlf); print('ok css')
