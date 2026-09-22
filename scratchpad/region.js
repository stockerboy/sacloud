(() => {
  const px = (v) => Math.round(v * 10) / 10
  const Y0 = 560, Y1 = 790, out = []
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect(); if (r.width < 6 || r.height < 6 || r.bottom < Y0 || r.top > Y1 || r.left < -1) continue
    if (r.height > 120) continue
    const cs = getComputedStyle(el); const t = (el.innerText || '').replace(/\s+/g,' ').trim()
    if (el.children.length > 4) continue
    out.push(el.tagName.toLowerCase() + ' [' + px(r.left) + ',' + px(r.top) + ' ' + px(r.width) + 'x' + px(r.height) + '] fs=' + cs.fontSize + '/' + cs.fontWeight + ' c=' + cs.color + ' bg=' + cs.backgroundColor + ' | ' + t.slice(0, 18))
  }
  return out.slice(0, 40).join('\n')
})()
