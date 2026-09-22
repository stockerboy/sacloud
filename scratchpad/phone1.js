(() => {
  const band = document.querySelector('.v2-tabbar'); const b = band ? band.getBoundingClientRect() : null
  const tb = document.querySelector('.sac-rank-board'); const t = tb ? tb.getBoundingClientRect() : null
  const row = document.querySelector('.sac-rank-row'); const r = row ? row.getBoundingClientRect() : null
  return 'band y=' + (b ? Math.round(b.top) + ' h=' + Math.round(b.height) : '-') +
    ' | table x=' + (t ? Math.round(t.left) + ' w=' + Math.round(t.width) : '-') +
    ' | row h=' + (r ? Math.round(r.height) : '-') + ' fs=' + (row ? getComputedStyle(row).fontSize : '-') +
    ' | scrollW=' + document.documentElement.scrollWidth + '/' + innerWidth
})()
