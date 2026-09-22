(() => { const r = document.querySelector('.v3-score-row--saves') || document.querySelector('.v3-score-row'); return r ? 'cols=' + getComputedStyle(r).gridTemplateColumns : 'row 없음' })()
