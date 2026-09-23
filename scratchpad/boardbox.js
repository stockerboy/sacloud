/* 경기분석 칸 배치 재기 — 「경기분석」을 누른 뒤 .v3-board 와 그 아이들의 자리 */
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const hit = [...document.querySelectorAll('span,button,a,div')].find((e) => e.children.length === 0 && e.textContent.trim() === '경기분석')
  if (hit) { hit.click(); await sleep(2000) }
  const out = []
  document.querySelectorAll('.v3-board').forEach((b, i) => {
    const cs = getComputedStyle(b)
    const r = b.getBoundingClientRect()
    out.push({
      board: i,
      display: cs.display,
      cols: cs.gridTemplateColumns,
      box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      kids: [...b.children].map((k) => {
        const kr = k.getBoundingClientRect()
        const kc = getComputedStyle(k)
        return {
          cls: k.className.toString().slice(0, 44),
          box: [Math.round(kr.x), Math.round(kr.y), Math.round(kr.width), Math.round(kr.height)],
          ga: kc.gridArea,
          disp: kc.display,
        }
      }),
    })
  })
  const clip = []
  let node = document.querySelector('.v3-board')
  while (node && node !== document.body) {
    const c = getComputedStyle(node)
    if (c.overflow !== 'visible') clip.push({ tag: node.tagName, cls: node.className.toString().slice(0, 44), o: c.overflow })
    node = node.parentElement
  }
  const shell = document.querySelector('.v3-board')
  let box = null
  if (shell) { const s = shell.getBoundingClientRect(); box = [Math.round(s.x), Math.round(s.right)] }
  return JSON.stringify({ vw: innerWidth, boardX: box, clip, out }, null, 1)
})()
