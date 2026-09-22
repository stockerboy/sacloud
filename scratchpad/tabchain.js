(() => {
  const t = document.querySelector('.sac-pilltabs'); if (!t) return 'sac-pilltabs 없음'
  const out = []; let p = t
  for (let i = 0; i < 5 && p; i += 1) { const r = p.getBoundingClientRect(); const cs = getComputedStyle(p); out.push(p.tagName.toLowerCase() + '.' + (p.className||'').toString().trim().split(/\s+/).slice(0,4).join('.') + ' [' + Math.round(r.left) + ' w=' + Math.round(r.width) + '] pad=' + cs.paddingLeft + '/' + cs.paddingRight + ' m=' + cs.marginLeft); p = p.parentElement }
  return out.join('\n')
})()
