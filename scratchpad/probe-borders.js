(() => {
  const n = (v) => Math.round(v);
  const seen = new Map();
  document.querySelectorAll('div,section,article').forEach((e) => {
    const r = e.getBoundingClientRect();
    if (r.width < 200 || r.height < 60) return;
    const c = getComputedStyle(e);
    const hasBorder = parseFloat(c.borderTopWidth) > 0 || parseFloat(c.borderLeftWidth) > 0;
    const hasRadius = parseFloat(c.borderTopLeftRadius) > 0;
    const hasBg = c.backgroundColor !== 'rgba(0, 0, 0, 0)';
    if (!(hasBorder || hasRadius || hasBg)) return;
    const key = `${c.backgroundColor}|${c.borderColor}|${c.borderTopWidth}|${c.boxShadow === 'none' ? 'no' : 'yes'}`;
    if (!seen.has(key)) seen.set(key, { key, n: 0, sample: (e.className || '').toString().slice(0, 44) });
    seen.get(key).n += 1;
  });
  const rows = [...seen.values()].sort((a, b) => b.n - a.n).slice(0, 14);
  return `url=${location.pathname}\n` + rows.map((r) => `${String(r.n).padStart(3)}개  ${r.key}   ← ${r.sample}`).join('\n');
})()
