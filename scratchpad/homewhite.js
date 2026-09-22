(() => {
  const out = []
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el); const r = el.getBoundingClientRect()
    if (r.width < 60 || r.height < 20) continue
    if (cs.backgroundColor !== 'rgb(255, 255, 255)') continue
    const p = el.parentElement ? getComputedStyle(el.parentElement).backgroundColor : ''
    if (p === cs.backgroundColor) continue
    out.push(el.tagName.toLowerCase() + '.' + (el.className||'').toString().trim().split(/\s+/).slice(0,5).join('.') + ' [' + Math.round(r.width) + 'x' + Math.round(r.height) + '] color=' + cs.color + ' border=' + cs.borderTopColor)
  }
  return out.join('\n') || '없음'
})()
