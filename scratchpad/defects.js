(() => {
  const out = []
  // ① 상대전적 카드 머리 — 큰 클랜명과 마크가 겹치나
  const big = Array.from(document.querySelectorAll('span,div')).filter(e => { const cs = getComputedStyle(e); return parseFloat(cs.fontSize) >= 20 && e.children.length === 0 && (e.innerText||'').trim().length > 2 })
  for (const e of big.slice(0, 4)) { const r = e.getBoundingClientRect(); out.push('큰글자 ' + JSON.stringify(e.innerText.trim().slice(0,14)) + ' [' + Math.round(r.left) + '~' + Math.round(r.right) + ' y' + Math.round(r.top) + '] fs=' + getComputedStyle(e).fontSize + ' scroll>client=' + (e.scrollWidth > e.clientWidth + 1)) }
  const imgs = Array.from(document.querySelectorAll('img')).filter(i => { const r = i.getBoundingClientRect(); return r.width >= 24 && r.top < 700 })
  for (const i of imgs.slice(0, 4)) { const r = i.getBoundingClientRect(); out.push('마크 [' + Math.round(r.left) + '~' + Math.round(r.right) + ' y' + Math.round(r.top) + ' ' + Math.round(r.width) + 'px]') }
  // ② 잘린 글자
  let ell = []
  for (const s of document.querySelectorAll('span,a')) { if (s.children.length === 0 && s.scrollWidth > s.clientWidth + 1 && /[A-Za-z가-힣]/.test(s.innerText||'')) ell.push(s.innerText.trim().slice(0,12)) }
  out.push('잘린글자 ' + ell.length + ' ' + JSON.stringify(ell.slice(0, 8)))
  return out.join('\n')
})()
