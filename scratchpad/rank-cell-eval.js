(() => {
  const re = window.__RE__;
  const ls = [...document.querySelectorAll('span')].filter(s => re.test((s.textContent||'').trim()) && s.children.length === 0).slice(0, 3);
  if (!ls.length) return 'lead 없음 (본문 앞: ' + document.body.innerText.replace(/\s+/g, ' ').slice(0, 80) + ')';
  return ls.map(l => {
    const p = l.parentElement;
    const v = [...p.querySelectorAll('span')].find(x => x !== l && /%/.test(x.textContent));
    const lt = l.getBoundingClientRect(), vt = v ? v.getBoundingClientRect() : null;
    return l.textContent.trim() + ' | ' + (v ? v.textContent.trim().replace(/\s+/g, '') : '?') + ' | 같은줄=' + (vt ? Math.abs(vt.top - lt.top) < 8 : '?') + ' | 칸폭=' + Math.round(p.getBoundingClientRect().width) + ' | lead x=' + Math.round(lt.left) + ' 값 x=' + (vt ? Math.round(vt.left) : '?');
  }).join('\n');
})()
