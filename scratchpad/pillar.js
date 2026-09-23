/* 왼쪽 기둥이 왜 안 보이나 — mc-card overflow(계산값 · 인라인) · 기둥 안 svg 크기 */
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const hit = [...document.querySelectorAll('span,button,a,div')].find((e) => e.children.length === 0 && e.textContent.trim() === '경기분석')
  if (hit) { hit.click(); await sleep(2000) }
  const card = document.querySelector('.mc-card')
  const pillar = document.querySelector('.v3-board-pillar')
  const svg = pillar ? pillar.querySelector('svg') : null
  const inner = pillar ? pillar.firstElementChild : null
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] }
  const chain = []
  let n = pillar
  while (n && n !== document.body) { const c = getComputedStyle(n); if (c.overflow !== 'visible' || c.clipPath !== 'none' || c.contain !== 'none') chain.push({ tag: n.tagName, cls: String(n.className).slice(0, 40), ov: c.overflow, clip: c.clipPath, contain: c.contain }); n = n.parentElement }
  return JSON.stringify({
    hasSupport: typeof CSS !== 'undefined' && CSS.supports('selector(:has(a))'),
    cardOverflow: card ? getComputedStyle(card).overflow : null,
    cardInline: card ? card.getAttribute('style') : null,
    cardMatchesHas: card ? card.matches(':has(.v3-board-pillar)') : null,
    pillar: box(pillar), inner: box(inner), innerPos: inner ? getComputedStyle(inner).position : null, svg: box(svg),
    svgChildren: svg ? svg.children.length : null,
    chain,
  }, null, 1)
})()
