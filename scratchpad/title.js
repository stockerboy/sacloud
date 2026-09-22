(() => {
  const out = []
  const walk = document.querySelectorAll('div,h1,h2,h3,span,p')
  for (const el of walk) {
    const t = (el.innerText || '').replace(/\s+/g, ' ').trim()
    if (t.length === 0 || t.length > 60) continue
    if (!/클랜랭킹|개인랭킹|랭킹은|1시간마다/.test(t)) continue
    if (el.children.length > 3) continue
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el)
    out.push('[' + Math.round(r.left) + ',' + Math.round(r.top) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) + '] ' +
      cs.fontSize + '/' + cs.fontWeight + ' ' + cs.color + ' | ' + t.slice(0, 45))
  }
  return out.slice(0, 14).join('\n')
})()
