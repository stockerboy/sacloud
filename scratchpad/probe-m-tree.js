(() => {
  const n = (v) => Math.round(v);
  const out = [`vw=${innerWidth} scrollW=${document.documentElement.scrollWidth}`];
  const walk = (e, d) => {
    const r = e.getBoundingClientRect(); const c = getComputedStyle(e);
    if (r.height < 6 || r.width < 30 || r.top + scrollY > 1400) return;
    const solid = c.backgroundColor !== 'rgba(0, 0, 0, 0)';
    const leaf = e.children.length === 0 ? ` "${e.textContent.trim().slice(0, 18)}"` : '';
    if (solid || d < 6 || leaf) {
      out.push(`${'  '.repeat(d)}${e.tagName.toLowerCase()}${e.className ? '.' + (e.className || '').toString().trim().replace(/\s+/g, '.').slice(0, 36) : ''} y${n(r.top + scrollY)} x${n(r.left)} w${n(r.width)} h${n(r.height)} bg:${c.backgroundColor} col:${c.color} ${c.fontSize}/${c.fontWeight} rad:${c.borderRadius} pad:${c.padding}${leaf}`);
    }
    if (d < 9) [...e.children].forEach((k) => walk(k, d + 1));
  };
  walk(document.body, 0);
  return out.slice(0, 70).join('\n');
})()
