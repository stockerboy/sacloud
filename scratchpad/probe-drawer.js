(async () => {
  const n=(v)=>Math.round(v);
  const burger=document.querySelector('.v2-burger');
  if(!burger) return '햄버거 없음';
  burger.click();
  await new Promise(r=>setTimeout(r,700));
  const d=document.querySelector('.v2-drawer-supply');
  if(!d) return '서랍이 안 열렸다';
  const out=[];
  const r=d.getBoundingClientRect(); const c=getComputedStyle(d);
  out.push(`서랍 x${n(r.left)} y${n(r.top)} w${n(r.width)} h${n(r.height)} bg:${c.backgroundColor} pos:${c.position}`);
  out.push('--- 내용 ---');
  d.querySelectorAll('nav > div').forEach(sec=>{
    const t=sec.querySelector(':scope > div:first-child');
    const rr=sec.getBoundingClientRect(); const cc=getComputedStyle(sec);
    out.push(` [칸] "${t?t.textContent.trim():''}" y${n(rr.top)} h${n(rr.height)} pad:${cc.padding}`);
    sec.querySelectorAll('a, button').forEach(a=>{
      const ra=a.getBoundingClientRect(); const ca=getComputedStyle(a);
      out.push(`    · "${a.textContent.trim()}" → ${a.getAttribute('href')||'(단추)'} h${n(ra.height)} ${ca.fontSize} pad:${ca.padding} rad:${ca.borderRadius} bg:${ca.backgroundColor} col:${ca.color}`);
    });
  });
  out.push('가로 넘침: '+(document.documentElement.scrollWidth>document.documentElement.clientWidth?'있다':'없다'));
  return out.join('\n');
})()
