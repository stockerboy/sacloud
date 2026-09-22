(() => {
  const secs = [...document.querySelectorAll('section')];
  const empty = secs.find((s) => s.textContent.includes('오늘 아직 집계된'));
  const score = secs.find((s) => s.textContent.includes('SET SCORE'));
  const n = (v) => Math.round(v);
  const out = [`url=${location.pathname}  vw=${innerWidth}`];
  out.push(`가로 넘침: ${document.documentElement.scrollWidth > document.documentElement.clientWidth ? '★있다★' : '없다'}`);
  out.push(`빈 상태 문구: ${empty ? '"' + empty.textContent.trim() + '"' : '없음'}`);
  out.push(`상대전적 카드: ${score ? '있음' : '없음'}`);
  if (score) {
    const r = score.getBoundingClientRect();
    out.push(`  카드 x${n(r.left)} w${n(r.width)} h${n(r.height)}`);
    const svg = score.querySelector('svg');
    if (svg) { const rs = svg.getBoundingClientRect(); out.push(`  그래프 w${n(rs.width)} h${n(rs.height)}`); }
    const ticks = [...score.querySelectorAll('svg text')].map((t) => t.textContent.trim()).filter((t) => /시$/.test(t));
    out.push(`  X축 눈금: ${ticks.join(' · ')}`);
    const pct = [...score.querySelectorAll('svg text')].map((t) => t.textContent.trim()).filter((t) => /^\d+\.\d%$/.test(t));
    out.push(`  큰 퍼센트: ${pct.join(' / ')}`);
  }
  const bad = [];
  document.querySelectorAll('*').forEach((e) => {
    const r = e.getBoundingClientRect();
    if (r.width > 0 && r.right > innerWidth + 1) bad.push(`${e.tagName.toLowerCase()}.${(e.className || '').toString().replace(/\s+/g, '.').slice(0, 34)} R${n(r.right)}`);
  });
  out.push(`밖으로 나간 요소: ${bad.length}개 ${bad.slice(0, 4).join(' | ')}`);
  return out.join('\n');
})()
