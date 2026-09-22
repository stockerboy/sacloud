(() => {
  const out = []
  for (const s of document.querySelectorAll('span,a')) {
    if (!(s.children.length === 0 && s.scrollWidth > s.clientWidth + 1 && /[A-Za-z가-힣]/.test(s.innerText||''))) continue
    const r = s.getBoundingClientRect()
    let chain = [], p = s.parentElement
    for (let i = 0; i < 4 && p; i += 1) { const pr = p.getBoundingClientRect(); const cs = getComputedStyle(p); chain.push(p.tagName.toLowerCase() + '.' + (p.className||'').toString().trim().split(/\s+/).slice(0,2).join('.') + '[' + Math.round(pr.width) + ']' + (cs.display === 'grid' ? '{' + cs.gridTemplateColumns + '}' : '')); p = p.parentElement }
    out.push(JSON.stringify(s.innerText.trim().slice(0,12)) + ' client=' + s.clientWidth + ' scroll=' + s.scrollWidth + ' fs=' + getComputedStyle(s).fontSize + ' ← ' + chain.join(' ← '))
  }
  return out.slice(0, 6).join('\n') || '잘린 글자 없음'
})()
