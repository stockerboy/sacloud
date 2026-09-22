(() => {
  const n = (v) => Math.round(v); const q = (s) => document.querySelector(s); const cs = (e) => getComputedStyle(e);
  const out = [`vw=${innerWidth} scrollW=${document.documentElement.scrollWidth} clientW=${document.documentElement.clientWidth}`];
  const over = document.documentElement.scrollWidth - document.documentElement.clientWidth;
  out.push(`★가로 넘침: ${over > 1 ? '있다 +' + over + 'px' : '없다'}★`);
  const bad = [];
  document.querySelectorAll('*').forEach((e) => {
    const r = e.getBoundingClientRect();
    if (r.width > 0 && r.right > innerWidth + 1) bad.push(`${e.tagName.toLowerCase()}.${(e.className || '').toString().replace(/\s+/g, '.').slice(0, 40)} w${n(r.width)} L${n(r.left)} R${n(r.right)}`);
  });
  out.push(`--- 밖으로 나간 요소 ${bad.length}개 (앞 8) ---`); out.push(...bad.slice(0, 8));
  const T = [
    ['상단바', 'header.v2-topbar'], ['상단바속', '.v2-topbar__inner'],
    ['메뉴줄', '.v2-gnb'], ['로고(상단)', '.v2-brand'], ['햄버거', '.v2-burger'], ['로그인', '.v2-login'],
    ['히어로', '.home-cloud'], ['히어로로고', '.home-mark img, .home-mark svg'],
    ['검색창', '.sb-cloud'], ['종류칸', '.sb-cloud button[aria-haspopup=listbox]'], ['입력', '.sb-cloud input'],
    ['Hot구역', '.home-cloud + div > section'], ['Hot카드', '.home-cloud + div > section > div'],
    ['Hot머리', '.home-cloud + div > section > div > div:first-child'],
    ['Hot줄a', '.home-cloud + div > section > div li > a'],
    ['Hot제목', '.home-cloud + div > section > div li > a > span'],
    ['푸터', 'footer'],
  ];
  out.push('--- 우리 폰 ---');
  T.forEach(([k, s]) => {
    const e = q(s); if (!e) { out.push(` ${k}: 없음`); return; }
    const r = e.getBoundingClientRect(); const c = cs(e);
    out.push(` ${k}: x${n(r.left)} w${n(r.width)} h${n(r.height)} bg:${c.backgroundColor} col:${c.color} ${c.fontSize}/${c.fontWeight} rad:${c.borderRadius} pad:${c.padding} disp:${c.display}`);
  });
  const b = cs(document.body); out.push(`--- 바탕 --- bg:${b.backgroundColor} col:${b.color} fs:${b.fontSize}`);
  return out.join('\n');
})()
