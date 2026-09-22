/** 아직 밝은 면이 남은 곳을 찾는다 — 어두운 톤에서 튀는 칸 */
(() => {
  const out = []
  const lum = (c) => {
    const m = c.match(/\d+/g); if (!m || m.length < 3) return -1
    if (m.length > 3 && Number(m[3]) === 0) return -1
    return (0.2126 * +m[0] + 0.7152 * +m[1] + 0.0722 * +m[2]) / 255
  }
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect()
    if (r.width < 60 || r.height < 20 || r.top > 4000) continue
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden') continue
    const L = lum(cs.backgroundColor)
    if (L < 0.62) continue
    const p = el.parentElement ? getComputedStyle(el.parentElement).backgroundColor : ''
    if (p === cs.backgroundColor) continue
    out.push('[' + Math.round(r.left) + ',' + Math.round(r.top) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) + '] ' +
      cs.backgroundColor + ' | ' + (el.className || '').toString().slice(0, 34) + ' | ' + (el.innerText || '').replace(/\s+/g,' ').slice(0, 26))
  }
  return out.length === 0 ? '밝은 면 없음' : out.slice(0, 25).join('\n')
})()
