/** 표 한 줄의 속을 잰다 — 첫 데이터 행의 모든 자손 */
(() => {
  const px = (v) => Math.round(v * 10) / 10
  const short = (s) => (s || '').replace(/\s+/g, ' ').trim().slice(0, 18)
  // 「승」 또는 「점」 이 들어간 가장 작은 줄 = 데이터 행
  let row = null
  for (const el of document.querySelectorAll('div,tr,li')) {
    const t = (el.innerText || '').replace(/\s+/g, ' ')
    if (!/\d+\s*승/.test(t) || !/점/.test(t)) continue
    const r = el.getBoundingClientRect()
    if (r.height < 30 || r.height > 90) continue
    if (!row || r.height < row.getBoundingClientRect().height) row = el
    if (row && r.top < row.getBoundingClientRect().top) row = el
  }
  if (!row) return '데이터 행을 못 찾음'
  const rr = row.getBoundingClientRect()
  const out = ['행 [' + px(rr.left) + ',' + px(rr.top) + ' ' + px(rr.width) + 'x' + px(rr.height) + ']']
  const rcs = getComputedStyle(row)
  out.push('  padding ' + rcs.padding + ' | bg ' + rcs.backgroundColor + ' | border-bottom ' + rcs.borderBottomWidth + ' ' + rcs.borderBottomColor)
  for (const el of row.querySelectorAll('*')) {
    const r = el.getBoundingClientRect()
    if (r.width < 4 || r.height < 4) continue
    const cs = getComputedStyle(el)
    out.push(
      '  ' + el.tagName.toLowerCase() +
      ' [' + px(r.left - rr.left) + ' +' + px(r.width) + 'x' + px(r.height) + ']' +
      ' fs=' + cs.fontSize + '/' + cs.fontWeight + ' c=' + cs.color +
      ' m=' + cs.margin + ' p=' + cs.padding +
      ' | ' + short(el.innerText || el.tagName),
    )
  }
  return out.slice(0, 40).join('\n')
})()
