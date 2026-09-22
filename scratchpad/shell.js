/** 껍데기(상단바·리그띠·본문틀) 실측 — 위에서부터 y<260 인 것 전부 */
(() => {
  const out = []
  const px = (v) => Math.round(v)
  const short = (s) => (s || '').replace(/\s+/g, ' ').trim().slice(0, 38)
  const els = Array.from(document.querySelectorAll('body *'))
  for (const el of els) {
    const r = el.getBoundingClientRect()
    if (r.width < 40 || r.height < 10) continue
    if (r.top > 260) continue
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden') continue
    let d = 0
    for (let p = el.parentElement; p; p = p.parentElement) d += 1
    const cls = (typeof el.className === 'string' ? el.className : '').split(/\s+/).slice(0, 4).join('.')
    out.push(
      '  '.repeat(Math.min(d, 12)) + el.tagName.toLowerCase() + (cls ? '.' + cls : '') +
      ' [' + px(r.left) + ',' + px(r.top) + ' ' + px(r.width) + 'x' + px(r.height) + ']' +
      ' bg=' + cs.backgroundColor + ' c=' + cs.color + ' fs=' + cs.fontSize + '/' + cs.fontWeight +
      ' pos=' + cs.position +
      ' | ' + short(el.innerText),
    )
  }
  return 'viewport ' + innerWidth + 'x' + innerHeight + '\n' + out.slice(0, 90).join('\n')
})()
