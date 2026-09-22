/**
 * ★화면 지문(fingerprint)★ — measure.mjs 에 물려 쓴다.
 *   node scratchpad/measure.mjs <url> <w> <h> scratchpad/spec.js
 *
 * 「카드처럼 생긴 것」만 골라 깊이 들여쓰기로 적는다 — 자리 · 바탕 · 테두리 · 둥글기 · 첫 글자.
 * 두 사이트에 같은 식을 돌려 나란히 놓으면 ★무엇이 다른지가 줄 단위로 보인다.★
 */
(() => {
  const out = []
  const seen = new Set()
  const px = (v) => Math.round(v)
  const short = (s) => (s || '').replace(/\s+/g, ' ').trim().slice(0, 42)
  const isCardish = (el, cs, r) => {
    if (r.width < 60 || r.height < 24) return false
    if (r.width * r.height < 2600) return false
    const hasBorder = ['Top', 'Right', 'Bottom', 'Left'].some((s) => {
      const w = parseFloat(cs['border' + s + 'Width'])
      return w > 0 && cs['border' + s + 'Style'] !== 'none'
    })
    const radius = parseFloat(cs.borderRadius) || 0
    const bg = cs.backgroundColor
    const parentBg = el.parentElement ? getComputedStyle(el.parentElement).backgroundColor : ''
    const paints = bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== parentBg
    return hasBorder || radius >= 2 || paints
  }
  const depthOf = (el) => {
    let d = 0
    for (let p = el.parentElement; p; p = p.parentElement) d += 1
    return d
  }
  const all = Array.from(document.querySelectorAll('body *'))
  for (const el of all) {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    if (r.top > 9000) continue
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden') continue
    if (!isCardish(el, cs, r)) continue
    const key = px(r.left) + ':' + px(r.top) + ':' + px(r.width) + ':' + px(r.height)
    if (seen.has(key)) continue
    seen.add(key)
    const d = Math.min(depthOf(el), 14)
    out.push(
      '  '.repeat(d) +
        el.tagName.toLowerCase() +
        ' [' + px(r.left) + ',' + px(r.top) + ' ' + px(r.width) + 'x' + px(r.height) + ']' +
        ' bg=' + cs.backgroundColor +
        ' bd=' + cs.borderTopWidth + ' ' + cs.borderTopStyle + ' ' + cs.borderTopColor +
        ' r=' + cs.borderRadius +
        ' | ' + short(el.innerText),
    )
  }
  const b = getComputedStyle(document.body)
  const head = [
    'URL ' + location.href,
    'viewport ' + window.innerWidth + 'x' + window.innerHeight + ' dpr=' + devicePixelRatio,
    'scrollWidth ' + document.documentElement.scrollWidth + ' (가로넘침 ' + (document.documentElement.scrollWidth > window.innerWidth ? 'YES' : 'no') + ')',
    'body bg=' + b.backgroundColor + ' color=' + b.color + ' font=' + b.fontFamily.slice(0, 60) + ' size=' + b.fontSize,
    'cards ' + out.length,
    '',
  ]
  return head.concat(out.slice(0, 220)).join('\n')
})()
