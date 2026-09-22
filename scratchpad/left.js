(() => {
  const out = []
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect(); if (r.width < 40 || r.height < 14) continue
    if (r.left < -1 && r.right > 0) { const cs = getComputedStyle(el); out.push(el.tagName.toLowerCase() + '.' + (el.className||'').toString().trim().split(/\s+/).slice(0,4).join('.') + ' [' + Math.round(r.left) + '~' + Math.round(r.right) + ' h=' + Math.round(r.height) + '] pos=' + cs.position + ' transform=' + cs.transform.slice(0,30)) }
  }
  return out.slice(0, 6).join('\n') || '없음'
})()
