# -*- coding: utf-8 -*-
# 2026-09-23 오후 사장님: 「재생 버튼 누르면 축이 쓱 훑고 지나가면서(천천히) 경기 흐름을 재생해줘」
import io
p = 'packages/ui/src/v3/RoundFlowChartV3.tsx'
s = io.open(p, encoding='utf-8', newline='').read()
crlf = '\r\n' in s
s = s.replace('\r\n', '\n')

def rep(old, new):
    global s
    assert s.count(old) == 1, ('count', old[:80], s.count(old))
    s = s.replace(old, new)

rep("""const HALF_SUMMARY = false
const CREW_ABOVE = false
""", """const HALF_SUMMARY = false
const CREW_ABOVE = false
/** ★재생★ — 축이 왼쪽에서 오른쪽으로 천천히 훑는다 (2026-09-23 오후 사장님). 라운드 하나에 이만큼 걸린다 */
const PLAY_MS_PER_ROUND = 1800
""")

rep("""  const [hover, setHover] = useState<number | null>(null)
  const pickAt = (clientX: number) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const x = ((clientX - rect.left) / rect.width) * width
    setHover(Math.max(X0, Math.min(X1, x)))
  }""", """  const [hover, setHover] = useState<number | null>(null)
  /*
   * ★재생★ (2026-09-23 오후 사장님: 「재생 버튼 누르면 축이 쓱 훑고 지나가면서(천천히) 경기 흐름을 재생해줘 —
   *   시안 아티팩트에서 만든 것처럼」). rAF 로 축(`hover`)을 X0→X1 로 옮긴다. 손으로 만지면 멈춘다.
   */
  const [playing, setPlaying] = useState(false)
  const playRef = useRef<{ raf: number; t0: number } | null>(null)
  const stopPlay = () => {
    if (playRef.current) cancelAnimationFrame(playRef.current.raf)
    playRef.current = null
    setPlaying(false)
  }
  const startPlay = () => {
    stopPlay()
    const total = Math.max(6000, flow.rounds.length * PLAY_MS_PER_ROUND)
    const t0 = performance.now()
    setPlaying(true)
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / total)
      setHover(X0 + (X1 - X0) * k)
      if (k >= 1) { playRef.current = null; setPlaying(false); return }
      playRef.current = { raf: requestAnimationFrame(tick), t0 }
    }
    playRef.current = { raf: requestAnimationFrame(tick), t0 }
  }
  useEffect(() => () => { if (playRef.current) cancelAnimationFrame(playRef.current.raf) }, [])
  const pickAt = (clientX: number) => {
    const svg = svgRef.current
    if (!svg) return
    if (playRef.current) stopPlay()
    const rect = svg.getBoundingClientRect()
    const x = ((clientX - rect.left) / rect.width) * width
    setHover(Math.max(X0, Math.min(X1, x)))
  }""")

# 마우스가 나가도 재생 중이면 축을 지우지 않는다
rep("""        onMouseLeave={() => setHover(null)}""", """        onMouseLeave={() => { if (!playRef.current) setHover(null) }}""")
rep("""        onTouchEnd={() => setHover(null)}""", """        onTouchEnd={() => { if (!playRef.current) setHover(null) }}""")

# 단추 — 그래프 바로 위 오른쪽
rep("""      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${H}`}""", """      {/* ★재생 단추★ — 그래프 바로 위 오른쪽. 누르면 축이 처음부터 끝까지 천천히 훑는다 · 다시 누르면 멈춘다 */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '2px 4px 4px' }}>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); if (playing) stopPlay(); else startPlay() }}
          style={{ fontFamily: 'inherit', fontSize: 11.5, fontWeight: 700, padding: '4px 11px', cursor: 'pointer', color: playing ? '#f59e0b' : tone.textDim, background: 'transparent', border: `1px solid ${playing ? 'rgba(245,158,11,.55)' : tone.cardBorder}`, borderRadius: 3, whiteSpace: 'nowrap' }}
        >
          {playing ? '❚❚ 멈춤' : '▶ 재생'}
        </button>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${H}`}""")

if crlf:
    s = s.replace('\n', '\r\n')
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('ok')
