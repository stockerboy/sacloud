(() => {
  const n = (v) => Math.round(v);
  const out = [];
  const main = document.querySelector('sp-mobile-main');
  const walk = (e, d) => {
    const r = e.getBoundingClientRect(); const c = getComputedStyle(e);
    if (r.height < 6) return;
    const leaf = e.children.length === 0 ? ` "${e.textContent.trim().slice(0, 22)}"` : '';
    out.push(`${'  '.repeat(d)}${e.tagName.toLowerCase()}.${(e.className || '').toString().trim().replace(/\s+/g, '.').slice(0, 32)} y${n(r.top + scrollY)} x${n(r.left)} w${n(r.width)} h${n(r.height)} bg:${c.backgroundColor} col:${c.color} ${c.fontSize}/${c.fontWeight} rad:${c.borderRadius} pad:${c.padding} bd:${c.borderBottomWidth} ${c.borderBottomColor}${leaf}`);
    if (d < 7) [...e.children].forEach((k) => walk(k, d + 1));
  };
  if (main) walk(main, 0); else out.push('sp-mobile-main 없음');
  return out.slice(0, 75).join('\n');
})()
