(() => {
  const seen = new Set()
  const out = []
  for (const a of document.querySelectorAll('a[href]')) {
    const h = a.getAttribute('href') || ''
    if (!h || h.startsWith('#')) continue
    const key = h.replace(/[0-9]{4,}/g, 'N')
    if (seen.has(key)) continue
    seen.add(key)
    out.push(h + '   | ' + (a.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 24))
  }
  return out.slice(0, 60).join('\n')
})()
