(() => {
  const card = document.querySelector('.mc-pc'); if (!card) return 'mc-pc 없음'
  const cols = getComputedStyle(card).gridTemplateColumns
  let ell = 0, names = []
  for (const s of card.querySelectorAll('span')) { if (s.children.length === 0 && s.scrollWidth > s.clientWidth + 1 && /[A-Za-z가-힣]/.test(s.innerText||'')) { ell += 1; names.push(s.innerText.slice(0,14)) } }
  return 'cols=' + cols + ' 잘림=' + ell + ' ' + JSON.stringify(names)
})()
