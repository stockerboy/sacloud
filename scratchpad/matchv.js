(() => {
  const t = document.body.innerText || ''
  const mvp = document.querySelector('[aria-label="MVP"]')
  const cs = mvp ? getComputedStyle(mvp) : null
  return 'mc-pc=' + document.querySelectorAll('.mc-pc').length +
    ' 경기분석=' + ((t.match(/경기분석/g) || []).length) +
    ' 대시어시=' + ((t.match(/\/ -/g) || []).length) +
    ' WIN=' + ((t.match(/WIN/g) || []).length) +
    ' mvp=' + (cs ? (cs.borderRadius + ' ' + cs.backgroundColor + ' ' + JSON.stringify(mvp.innerText)) : '없음')
})()
