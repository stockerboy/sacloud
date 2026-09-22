(() => {
  const px = (v) => Math.round(v * 10) / 10
  const cands = Array.from(document.querySelectorAll('body *')).filter(e => { const r = e.getBoundingClientRect(); return r.width >= 380 && r.height >= 33 && r.height <= 39 && r.top > 100 && /점/.test(e.innerText||'') })
  const out = ['후보 ' + cands.length]
  for (const e of cands.slice(0, 3)) { const r = e.getBoundingClientRect(); out.push(e.tagName.toLowerCase() + '.' + (e.className||'').toString().trim().split(/\s+/).slice(0,3).join('.') + ' [' + px(r.left) + ',' + px(r.top) + ' ' + px(r.width) + 'x' + px(r.height) + '] bg=' + getComputedStyle(e).backgroundColor + ' | ' + (e.innerText||'').replace(/\s+/g,' ').slice(0, 24)) }
  const row = cands.find(e => e.children.length > 0 && e.children.length < 8)
  if (row) { const rr = row.getBoundingClientRect(); out.push('--- 첫 행 자손 (pad=' + getComputedStyle(row).padding + ' fs=' + getComputedStyle(row).fontSize + ')')
    for (const el of row.querySelectorAll('*')) { const r = el.getBoundingClientRect(); if (r.width < 4 || r.height < 4) continue; const cs = getComputedStyle(el); out.push('  ' + el.tagName.toLowerCase() + ' [' + px(r.left - rr.left) + ' +' + px(r.width) + 'x' + px(r.height) + '] fs=' + cs.fontSize + '/' + cs.fontWeight + ' c=' + cs.color + ' | ' + (el.innerText || el.tagName).replace(/\s+/g,' ').slice(0, 14)) } }
  return out.slice(0, 18).join('\n')
})()
