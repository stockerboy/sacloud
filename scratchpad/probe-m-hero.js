(() => {
  const n = (v) => Math.round(v);
  const out = [];
  const desc = (e, d) => {
    const r = e.getBoundingClientRect(); const c = getComputedStyle(e);
    if (r.height < 4) return;
    const leaf = e.children.length === 0 ? ` "${e.textContent.trim().slice(0, 20)}"` : '';
    out.push(`${'  '.repeat(d)}${e.tagName.toLowerCase()}.${(e.className || '').toString().trim().replace(/\s+/g, '.').slice(0, 34)} y${n(r.top + scrollY)} x${n(r.left)} w${n(r.width)} h${n(r.height)} bg:${c.backgroundColor} col:${c.color} ${c.fontSize}/${c.fontWeight} rad:${c.borderRadius} pad:${c.padding}${leaf}`);
    if (d < 6) [...e.children].forEach((k) => desc(k, d + 1));
  };
  out.push('===== 상단바 =====');
  const bar = document.querySelector('nav') || document.querySelector('header');
  if (bar) desc(bar, 0); else out.push('(nav/header 없음)');
  out.push('===== 히어로 =====');
  const hero = document.querySelector('div.bg-black');
  if (hero) desc(hero, 0);
  out.push('===== 흰 카드(Hot?) =====');
  const white = [...document.querySelectorAll('div.bg-white')][0];
  if (white) desc(white, 0);
  return out.slice(0, 80).join('\n');
})()
