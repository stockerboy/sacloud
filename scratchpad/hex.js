(() => {
  const out = []
  const svgs = document.querySelectorAll('svg')
  let n = 0
  for (const s of svgs) {
    const r = s.getBoundingClientRect()
    if (r.width < 150) continue
    n += 1
    const texts = Array.from(s.querySelectorAll('text'))
    out.push('svg#' + n + ' [' + Math.round(r.left) + ',' + Math.round(r.top) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) + '] texts=' + texts.length)
    for (const t of texts.slice(0, 8)) {
      const cs = getComputedStyle(t)
      out.push('    ' + JSON.stringify((t.textContent||'').slice(0,14)) + ' fill=' + cs.fill + ' size=' + cs.fontSize)
    }
  }
  return out.join('\n') || 'svg 없음'
})()
