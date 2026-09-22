(() => {
  const cards = Array.from(document.querySelectorAll('.mc-pc')).filter(e => getComputedStyle(e).display !== 'none')
  if (cards.length === 0) return 'mc-pc 0'
  let win = 0, wl = 0, ell = 0, dup = 0
  for (const c of cards) {
    const t = c.innerText || ''
    if (/WIN/.test(t)) win += 1
    if (/승리|패배/.test(t)) wl += 1
    dup += Math.max(0, (t.match(/수집중/g) || []).length - 1)
    for (const s of c.querySelectorAll('span')) { if (s.scrollWidth > s.clientWidth + 1 && /[A-Za-z가-힣]/.test(s.innerText||'') && s.children.length === 0) ell += 1 }
  }
  return 'cards=' + cards.length + ' WIN표=' + win + ' 승리/패배글자=' + wl + ' 잘린글자=' + ell + ' 수집중중복=' + dup + ' w=' + Math.round(cards[0].getBoundingClientRect().width)
})()
