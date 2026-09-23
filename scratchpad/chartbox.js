(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const hit = [...document.querySelectorAll('span,button,a,div')].find((e) => e.children.length === 0 && e.textContent.trim() === '경기분석')
  if (hit) { hit.click(); await sleep(2500) }
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] }
  const flow = document.querySelector('.v3-board-flow')
  const kids = flow ? [...flow.children].map((k) => ({ tag: k.tagName, cls: String(k.className).slice(0, 30), box: box(k), disp: getComputedStyle(k).display, w: getComputedStyle(k).width, align: getComputedStyle(k).alignSelf })) : null
  const svg = flow ? flow.querySelector('svg') : null
  return JSON.stringify({ flow: box(flow), flowCs: flow ? { display: getComputedStyle(flow).display, alignItems: getComputedStyle(flow).alignItems, justify: getComputedStyle(flow).justifyContent } : null, kids, svg: box(svg), svgVB: svg ? svg.getAttribute('viewBox') : null, svgStyle: svg ? svg.getAttribute('style') : null, svgParent: svg ? box(svg.parentElement) : null }, null, 1)
})()
