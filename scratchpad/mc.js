(() => {
  const pc = document.querySelectorAll('.mc-pc').length, ph = document.querySelectorAll('.mc-phone').length
  const shown = Array.from(document.querySelectorAll('.mc-pc,.mc-phone')).filter(e => getComputedStyle(e).display !== 'none')
  const first = shown[0]; const r = first ? first.getBoundingClientRect() : null
  return 'mc-pc=' + pc + ' mc-phone=' + ph + ' shown=' + (first ? first.className : '-') +
    (r ? ' [' + Math.round(r.left) + ',' + Math.round(r.top) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) + ']' : '') +
    ' scrollW=' + document.documentElement.scrollWidth + '/' + innerWidth
})()
