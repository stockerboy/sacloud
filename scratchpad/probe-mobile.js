(() => {
  const n = (v) => Math.round(v);
  const q = (s) => document.querySelector(s);
  const cs = (e) => getComputedStyle(e);
  const out = [];
  out.push(`vw=${innerWidth} docScrollW=${document.documentElement.scrollWidth}`);
  const over = document.documentElement.scrollWidth - document.documentElement.clientWidth;
  out.push(`★가로 넘침: ${over > 1 ? '있다 +' + over + 'px' : '없다'}★`);
  const bad = [];
  document.querySelectorAll('*').forEach((e) => {
    const r = e.getBoundingClientRect();
    if (r.width > 0 && r.right > innerWidth + 1) {
      bad.push(`${e.tagName.toLowerCase()}.${(e.className || '').toString().replace(/\s+/g, '.').slice(0, 42)} w${n(r.width)} L${n(r.left)} R${n(r.right)}`);
    }
  });
  out.push(`--- 오른쪽 밖으로 나간 요소 ${bad.length}개 (앞 10) ---`);
  out.push(...bad.slice(0, 10));
  out.push('--- 주요 칸 ---');
  const targets = [
    ['상단바', 'nav, header.v2-topbar'],
    ['상단바속', '.pc-container, .v2-topbar__inner, nav > div'],
    ['메뉴줄', '.v2-gnb'],
    ['로고(상단)', '.v2-brand, nav img'],
    ['햄버거', '.v2-burger, nav button'],
    ['히어로', '.home-cloud, div.bg-black.pt-20, div.bg-black'],
    ['히어로로고', '.home-mark img, .home-mark svg, img.main-logo'],
    ['검색창', '.sb-cloud, div.inline-block.mt-10'],
    ['Hot카드', '.home-cloud + div > section > div, .w-board'],
  ];
  targets.forEach(([k, s]) => {
    const e = q(s);
    if (!e) { out.push(` ${k}: 없음`); return; }
    const r = e.getBoundingClientRect(); const c = cs(e);
    out.push(` ${k}: x${n(r.left)} w${n(r.width)} h${n(r.height)} bg:${c.backgroundColor} ${c.fontSize}/${c.fontWeight} rad:${c.borderRadius} disp:${c.display}`);
  });
  const b = cs(document.body);
  out.push(`--- 바탕 --- bg:${b.backgroundColor} col:${b.color} fs:${b.fontSize}`);
  return out.join('\n');
})()
