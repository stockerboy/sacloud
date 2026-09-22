(() => {
  const px = (v) => Math.round(v * 10) / 10
  let row = document.querySelector('.sac-rank-row')
  if (!row) { for (const d of document.querySelectorAll('div')) { const cs = getComputedStyle(d); const r = d.getBoundingClientRect(); if (cs.backgroundColor === 'rgb(236, 236, 236)' && r.height > 28 && r.height < 60 && r.width > 300) { row = d; break } } }
  if (!row) { for (const d of document.querySelectorAll('div,a,li,tr')) { const r = d.getBoundingClientRect(); const t = (d.innerText||'').trim(); if (r.width > 300 && r.height >= 30 && r.height <= 42 && /^\d{1,3}\s/.test(t) && /점/.test(t)) { row = d; break } } }
  if (!row) return '행 없음'
  const rr = row.getBoundingClientRect(); const rcs = getComputedStyle(row)
  const out = ['행 [' + px(rr.left) + ',' + px(rr.top) + ' ' + px(rr.width) + 'x' + px(rr.height) + '] pad=' + rcs.padding + ' fs=' + rcs.fontSize]
  for (const el of row.querySelectorAll('*')) {
    const r = el.getBoundingClientRect(); if (r.width < 4 || r.height < 4) continue
    const cs = getComputedStyle(el)
    out.push('  ' + el.tagName.toLowerCase() + ' [' + px(r.left - rr.left) + ' +' + px(r.width) + 'x' + px(r.height) + '] fs=' + cs.fontSize + '/' + cs.fontWeight + ' | ' + (el.innerText || el.tagName).replace(/\s+/g, ' ').slice(0, 14))
  }
  return out.slice(0, 14).join('\n')
})()
