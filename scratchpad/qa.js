/* 한 화면 QA — 가로넘침 · 글자 잘림(…) · 글자가 칸 밖으로 · 겹침 (2026-09-23 밤 사장님 「간격 안 맞는 거 · 글씨 가려지는 거」) */
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const click = window.__QA_CLICK
  if (click) { const el = [...document.querySelectorAll('span,button,a,div')].find((e) => e.children.length === 0 && e.textContent.trim() === click); if (el) { el.click(); await sleep(2500) } }
  const W = innerWidth
  const out = { scrollW: document.documentElement.scrollWidth, clipped: [], outside: [], overlap: [] }
  const box = (r) => `[${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}]`
  const seen = []
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0 || r.top > 5000) continue
    const txt = (el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) ? el.textContent.replace(/\s+/g, ' ').trim() : ''
    /* 말줄임으로 잘린 글자 */
    if (txt && cs.textOverflow === 'ellipsis' && cs.overflow !== 'visible' && el.scrollWidth > el.clientWidth + 1) {
      if (out.clipped.length < 25) out.clipped.push(`${box(r)} ${txt.slice(0, 26)} (${el.scrollWidth - el.clientWidth}px)`)
    }
    /* 넘치는데 잘리지도 않는 글자 (칸 밖으로 새어 나감) */
    if (txt && cs.whiteSpace === 'nowrap' && cs.overflow === 'visible' && el.scrollWidth > el.clientWidth + 2 && el.parentElement && getComputedStyle(el.parentElement).overflow === 'hidden') {
      if (out.clipped.length < 25) out.clipped.push(`${box(r)} 숨은글자 ${txt.slice(0, 26)}`)
    }
    if (r.right > W + 1 || r.left < -1) { if (out.outside.length < 15) out.outside.push(`${box(r)} ${(el.className || '').toString().slice(0, 24)} ${txt.slice(0, 20)}`) }
    /* 글자끼리 겹침 — 잎 노드 글자 상자끼리 */
    if (txt && el.children.length === 0 && r.width > 8 && r.height > 8 && txt.length > 1) seen.push({ r, txt: txt.slice(0, 18), el })
  }
  for (let i = 0; i < seen.length && out.overlap.length < 20; i += 1) for (let j = i + 1; j < seen.length; j += 1) {
    const a = seen[i], b = seen[j]
    if (a.el.contains(b.el) || b.el.contains(a.el)) continue
    const ix = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left)
    const iy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top)
    if (ix > 4 && iy > 4) { out.overlap.push(`${box(a.r)} "${a.txt}" × "${b.txt}"`); if (out.overlap.length >= 20) break }
  }
  return JSON.stringify(out, null, 1)
})()
