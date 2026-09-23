/* .v3-board 의 조상 사슬 — 폭 · 여백 · overflow */
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const hit = [...document.querySelectorAll('span,button,a,div')].find((e) => e.children.length === 0 && e.textContent.trim() === '경기분석')
  if (hit) { hit.click(); await sleep(1500) }
  const chain = []
  let node = document.querySelector('.v3-board')
  while (node && node !== document.documentElement) {
    const c = getComputedStyle(node)
    const r = node.getBoundingClientRect()
    chain.push({
      tag: node.tagName,
      cls: node.className.toString().slice(0, 50),
      x: Math.round(r.x), w: Math.round(r.width),
      maxW: c.maxWidth, pos: c.position, ov: c.overflow,
      pad: c.paddingLeft + '/' + c.paddingRight,
    })
    node = node.parentElement
  }
  return JSON.stringify({ vw: innerWidth, chain }, null, 1)
})()
