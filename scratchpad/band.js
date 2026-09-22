(() => {
  const out = []
  const el = document.querySelector('.v2-tabbar__league')
  if (el) {
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el)
    out.push('league label [' + Math.round(r.left) + ',' + Math.round(r.top) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) + ']')
    out.push('  text=' + JSON.stringify(el.innerText) + ' overflow=' + cs.overflow + ' padding=' + cs.padding + ' font=' + cs.fontSize)
    out.push('  scrollW=' + el.scrollWidth + ' clientW=' + el.clientWidth)
  } else out.push('.v2-tabbar__league 없음')
  const inner = document.querySelector('.v2-tabbar__inner')
  if (inner) { const r = inner.getBoundingClientRect(); const cs = getComputedStyle(inner)
    out.push('inner [' + Math.round(r.left) + ' ' + Math.round(r.width) + '] padding=' + cs.padding + ' overflow=' + cs.overflow) }
  // 클랜 이름 칸
  const row = document.querySelector('.sac-rank-row')
  if (row) {
    for (const c of row.children) {
      const r = c.getBoundingClientRect()
      out.push('  cell +' + Math.round(r.left - row.getBoundingClientRect().left) + ' w=' + Math.round(r.width) + ' | ' + (c.innerText || '').replace(/\s+/g,' ').slice(0, 30))
    }
  }
  return out.join('\n')
})()
