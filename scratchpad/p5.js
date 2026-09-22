(() => {
  const root = document.querySelector('.sac-v3-page'); const tabs = document.querySelector('.sac-pilltabs'); const tab = document.querySelector('.sac-pilltab')
  const card = document.querySelector('.mc-phone'); const sec = document.querySelector('.sac-v3-page section')
  const rr = (e) => e ? '[' + Math.round(e.getBoundingClientRect().left) + ' w=' + Math.round(e.getBoundingClientRect().width) + ' h=' + Math.round(e.getBoundingClientRect().height) + ']' : '-'
  return 'root=' + (root ? 'pad ' + getComputedStyle(root).paddingLeft : '없음') + ' tabs=' + rr(tabs) + ' tab=' + rr(tab) + ' section=' + rr(sec) + ' card=' + rr(card) + ' scrollW=' + document.documentElement.scrollWidth
})()
