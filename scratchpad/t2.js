(() => {
  const out = []
  for (const el of document.querySelectorAll('.sac-rank-title,.sac-rank-note,h1,h2')) {
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el)
    if (r.width < 10) continue
    out.push((el.className||'').slice(0,40) + ' [' + Math.round(r.left) + ',' + Math.round(r.top) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) + '] ' +
      cs.fontSize + '/' + cs.fontWeight + ' ' + cs.fontFamily.slice(0,24) + ' ' + cs.color + ' | ' + (el.innerText||'').slice(0,20))
  }
  return out.join('\n')
})()
