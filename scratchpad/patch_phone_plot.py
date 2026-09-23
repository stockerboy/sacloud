# -*- coding: utf-8 -*-
# 2026-09-23 오후 사장님 폰 캡쳐: 「오른쪽 공간이 안 남게 그래프를 끝까지 뻗어줘 · 라운드 숫자 삐뚤빼뚤」
import io
p = 'packages/ui/src/v3/RoundFlowChartV3.tsx'
s = io.open(p, encoding='utf-8', newline='').read()
crlf = '\r\n' in s
s = s.replace('\r\n', '\n')

def rep(old, new):
    global s
    assert s.count(old) == 1, ('count', old[:80], s.count(old))
    s = s.replace(old, new)

# ① 폰은 판을 오른쪽 끝까지 — 마커(반지름 R)만 겨우 들어갈 자리만 남긴다
rep("""  const { H, X0, Y_TOP, Y_BOTTOM, phone } = box
  const X1 = box.X1 - (phone ? 16 : 18)""",
    """  const { H, X0, Y_TOP, Y_BOTTOM, phone } = box
  /* ⚠ 2026-09-23 오후 사장님 폰 캡쳐: 「오른쪽 공간이 안 남게 그래프를 끝까지 뻗어줘」 → 폰은 마커 반지름만큼만 남긴다.
     plotBox 가 폰에 34 를 비워 두는데 그 위에 16 을 더 비웠었다 (옛 값). % 글자는 마커 왼쪽으로 옮겼다 */
  const X1 = phone ? width - PLOT.markerR - 2 : box.X1 - 18""")

# ② % 글자 — 폰은 마커 왼쪽에 오른끝 맞춤 (판 밖으로 안 나간다)
rep("""            <text x={labelX} y={yL + lLabelDy} textAnchor="middle" fill={tone.textStrong} fontSize={PLOT.valueFont} fontWeight="700">{(100 - endW).toFixed(0)}%</text>""",
    """            <text x={phone ? nowX - R - 3 : labelX} y={phone ? yOf(100 - endW) + (tie ? R : 0) + 5 : yL + lLabelDy} textAnchor={phone ? 'end' : 'middle'} fill={tone.textStrong} fontSize={PLOT.valueFont} fontWeight="700">{(100 - endW).toFixed(0)}%</text>""")
rep("""            <text x={labelX} y={yW + wLabelDy} textAnchor="middle" fill={tone.textStrong} fontSize={PLOT.valueFont} fontWeight="700">{endW.toFixed(0)}%</text>""",
    """            <text x={phone ? nowX - R - 3 : labelX} y={phone ? yOf(endW) - (tie ? R : 0) + 5 : yW + wLabelDy} textAnchor={phone ? 'end' : 'middle'} fill={tone.textStrong} fontSize={PLOT.valueFont} fontWeight="700">{endW.toFixed(0)}%</text>""")

# ③ 라운드 번호 — 폰은 한 줄로 (엇갈림 없음). 18라운드가 넘으면 홀수만
rep("""          return model.ticks.map((t) => {
            const cx = (t.x + t.x1) / 2
            const tight = cx - lastX < (phone ? 16 : 22)
            stagger = tight ? 1 - stagger : 0
            lastX = cx""",
    """          const manyRounds = model.ticks.length > 18
          return model.ticks.map((t) => {
            const cx = (t.x + t.x1) / 2
            const tight = cx - lastX < (phone ? 16 : 22)
            /* ⚠ 2026-09-23 오후 사장님: 「라운드 1부터 14 숫자가 삐뚤빼뚤」 → 폰은 엇갈리지 않고 한 줄. 좁으면(18R 초과) 홀수만 적는다 */
            stagger = phone ? 0 : tight ? 1 - stagger : 0
            lastX = cx
            const skipNumber = phone && manyRounds && t.round % 2 === 0""")
rep("""                <text x={cx} y={Y_BOTTOM + (phone ? 20 : 24) + stagger * (phone ? 11 : 12)} textAnchor="middle" fill={tone.textDim} fontSize={phone ? 10.5 : PLOT.axisFont}>{t.round}</text>""",
    """                {skipNumber ? null : <text x={cx} y={Y_BOTTOM + (phone ? 20 : 24) + stagger * (phone ? 11 : 12)} textAnchor="middle" fill={tone.textDim} fontSize={phone ? 10 : PLOT.axisFont}>{t.round}</text>}""")

if crlf:
    s = s.replace('\n', '\r\n')
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('ok')
