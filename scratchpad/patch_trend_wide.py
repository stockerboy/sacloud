# -*- coding: utf-8 -*-
# 2026-09-23 저녁 사장님: 「킬뎃 추이 그래프 판 세로를 지금의 3분의 2로 · 누적을 먼저 · 카드 가로를 조금씩 더(경기상세·상세기록 답답)」
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

# ① 판 높이 배율 — 공용 plotBox 에 세 번째 인자. 기본 1 이라 다른 그래프(상대전적·라운드 흐름)는 안 바뀐다
patch('packages/ui/src/v3/seasonPlot.ts', [
    ("""export function plotBox(width: number, compact = false): {""",
     """/**
 * @param hScale 판 세로 배율 (2026-09-23 저녁 사장님: 「킬뎃 추이 그래프 판이 세로로 너무 커 — 3분의 2로」).
 *   승률·킬뎃 추이만 2/3 을 준다. 기본 1 이라 상대전적·라운드 흐름은 그대로다. 폰도 같은 배율.
 */
export function plotBox(width: number, compact = false, hScale = 1): {"""),
    ("""  const H = compact
    ? phone
      ? Math.round(width * 0.46)
      : 210
    : phone
      ? Math.round(width * 0.78)
      : 400""",
     """  const H = Math.round((compact
    ? phone
      ? Math.round(width * 0.46)
      : 210
    : phone
      ? Math.round(width * 0.78)
      : 400) * hScale)"""),
])

patch('packages/ui/src/v3/TrendChartV3.tsx', [
    ("""  const { H, X0, X1, Y_TOP, Y_BOTTOM } = plotBox(width)""",
     """  /* 판 세로 2/3 (2026-09-23 저녁 사장님 「세로로 너무 커」). 옛 값은 배율 1 (PC 400 · 폰 폭×0.78) */
  const { H, X0, X1, Y_TOP, Y_BOTTOM } = plotBox(width, false, TREND_H_SCALE)"""),
    ("""export function TrendChartV3({""",
     """const TREND_H_SCALE = 2 / 3

export function TrendChartV3({"""),
])

# ② 누적이 먼저
patch('packages/ui/src/v3/PlayerDetailV3.tsx', [
    ("""  const [mode, setMode] = useState<TrendMode>('day')""",
     """  /* 기본 탭 「누적」 (2026-09-23 저녁 사장님 「누적을 먼저 보여줘」 · 인계서 ②-6). 옛 기본값 'day' */
  const [mode, setMode] = useState<TrendMode>('cum')"""),
    # ③ 선수 페이지 2단 — 본문 넓게 · 오른쪽 330
    ("""        .sac-prr-grid { display: grid; grid-template-columns: minmax(0,1fr) 271px; gap: 7px; align-items: start; margin-top: 16px; }""",
     """        /* 2026-09-23 저녁 사장님: 「카드 가로를 조금씩 더 — 경기상세 카드랑 상세기록 카드 너무 작아 답답」
           → 선수 페이지 컨테이너를 1400 으로(supply-skin.css `.sac-player-page`) · 오른쪽 271→330. 옛 값 271 */
        .sac-prr-grid { display: grid; grid-template-columns: minmax(0,1fr) 330px; gap: 10px; align-items: start; margin-top: 16px; }"""),
])

patch('apps/web/app/league/[leagueSlug]/player/[playerId]/layout.tsx', [
    ("""  return (
    <div>
      {data ? (
        <div className="pc-container">""",
     """  return (
    /* `sac-player-page` — 선수 페이지만 컨테이너를 넓힌다 (2026-09-23 저녁 사장님 「카드 가로 조금 더」 · supply-skin.css) */
    <div className="sac-player-page">
      {data ? (
        <div className="pc-container">"""),
])

patch('packages/ui/src/v2/supply-skin.css', [
    ("""/* ★선수 페이지 폰 합치기★ (2026-09-23 오후 사장님)""",
     """/* ★선수 페이지 컨테이너 1400★ (2026-09-23 저녁 사장님: 「카드의 전체적인 가로크기를 조금씩 더 늘려도 될거같아 —
   특히 경기상세카드랑 상세기록카드 너무 가로크기가 작아서 답답해」). 다른 화면은 1120 그대로. 옛 값 1120 */
@media (min-width: 1200px) {
  .sac-player-page .pc-container { max-width: 1400px; }
}

/* ★선수 페이지 폰 합치기★ (2026-09-23 오후 사장님)"""),
])
