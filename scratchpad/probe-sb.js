(() => {
  const n=(v)=>Math.round(v);
  const sb=document.querySelector('.sb-cloud'); const out=[];
  if(!sb) return '검색창 없음';
  const r0=sb.getBoundingClientRect(); out.push(`검색창 x${n(r0.left)} w${n(r0.width)} h${n(r0.height)}`);
  [...sb.querySelectorAll('*')].slice(0,14).forEach(e=>{const r=e.getBoundingClientRect();const c=getComputedStyle(e);
    out.push(` ${e.tagName.toLowerCase()}.${(e.className||'').toString().replace(/\s+/g,'.').slice(0,26)} x${n(r.left)} w${n(r.width)} h${n(r.height)} pos:${c.position} flex:${c.flex} minW:${c.minWidth} disp:${c.display}${e.placeholder?' ph="'+e.placeholder+'"':''}`)});
  out.push('--- 상단바 오른쪽 ---');
  document.querySelectorAll('.v2-login').forEach(e=>{const r=e.getBoundingClientRect();const c=getComputedStyle(e);
    out.push(` .v2-login "${e.textContent.trim().slice(0,10)}" x${n(r.left)} w${n(r.width)} disp:${c.display} cls=${(e.className||'').toString().slice(0,40)}`)});
  return out.join('\n');
})()
