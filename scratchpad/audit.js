/** 한 화면 점검 — 가로 넘침 · 밝은 면 · 칸 밖으로 나간 것 · 글자 묻힘 */
(() => {
  const out = []
  const W = innerWidth
  out.push('scrollW ' + document.documentElement.scrollWidth + (document.documentElement.scrollWidth > W ? '  ★가로넘침★' : '  가로넘침 없음'))
  const lum = (c) => { const m = c.match(/\d+/g); if (!m || m.length < 3) return -1
    if (m.length > 3 && Number(m[3]) === 0) return -1
    return (0.2126*+m[0] + 0.7152*+m[1] + 0.0722*+m[2]) / 255 }
  let bright = 0, over = 0
  const outs = []
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect()
    if (r.width < 40 || r.height < 14 || r.top > 6000) continue
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden') continue
    const L = lum(cs.backgroundColor)
    const p = el.parentElement ? getComputedStyle(el.parentElement).backgroundColor : ''
    if (L >= 0.62 && p !== cs.backgroundColor) { bright += 1
      if (outs.length < 6) outs.push('  밝은면 [' + Math.round(r.left) + ',' + Math.round(r.top) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) + '] ' + cs.backgroundColor + ' | ' + (el.innerText||'').replace(/\s+/g,' ').slice(0,22)) }
    if (r.right > W + 1 || r.left < -1) { over += 1
      if (outs.length < 12) outs.push('  칸밖 [' + Math.round(r.left) + '~' + Math.round(r.right) + '] ' + (el.className||'').toString().slice(0,26) + ' | ' + (el.innerText||'').replace(/\s+/g,' ').slice(0,22)) }
  }
  out.push('밝은 면 ' + bright + '개 · 칸 밖 ' + over + '개')
  return out.concat(outs).join('\n')
})()
