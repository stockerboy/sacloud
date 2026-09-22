(() => {
  const out = []
  const names = Array.from(document.querySelectorAll('span,div')).filter(e => parseFloat(getComputedStyle(e).fontSize) >= 20 && e.children.length === 0 && (e.innerText||'').trim().length > 2).slice(0, 2)
  const marks = Array.from(document.querySelectorAll('span,div')).filter(e => { const cs = getComputedStyle(e); const r = e.getBoundingClientRect(); return cs.backgroundImage !== 'none' && r.width >= 28 && r.width <= 80 && r.top < 260 })
  for (const n of names) { const r = n.getBoundingClientRect(); out.push('이름 ' + JSON.stringify(n.innerText.trim()) + ' [' + Math.round(r.left) + '~' + Math.round(r.right) + ' y' + Math.round(r.top) + '~' + Math.round(r.bottom) + ']') }
  for (const m of marks.slice(0, 4)) { const r = m.getBoundingClientRect(); out.push('마크 [' + Math.round(r.left) + '~' + Math.round(r.right) + ' y' + Math.round(r.top) + '~' + Math.round(r.bottom) + ' ' + Math.round(r.width) + 'px]') }
  return out.join('\n') || '없음'
})()
