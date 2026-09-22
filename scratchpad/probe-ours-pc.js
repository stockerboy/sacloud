(() => {
  const n=(v)=>Math.round(v); const q=(s)=>document.querySelector(s); const cs=(e)=>getComputedStyle(e);
  const R=(s)=>{const e=q(s);return e?e.getBoundingClientRect():null};
  const want=[['상단바 높이',63,()=>n(R('header.v2-topbar').height)],
   ['상단바 칸폭',1120,()=>n(R('.v2-topbar__inner').width)],
   ['메뉴 보임','flex',()=>cs(q('.v2-gnb')).display],
   ['상단 로고','none',()=>cs(q('.v2-brand')).display],
   ['히어로 시작',63,()=>n(R('.home-cloud').top+scrollY)],
   ['히어로 높이',343,()=>n(R('.home-cloud').height)],
   ['로고 높이',144,()=>n((R('.home-mark svg')||R('.home-mark img')).height)],
   ['검색창 폭',546,()=>n(R('.sb-cloud').width)],
   ['검색창 높이',60,()=>n(R('.sb-cloud').height)],
   ['종류칸 폭',154,()=>n(R('.sb-cloud button[aria-haspopup=listbox]').width)],
   ['바탕색','rgb(242, 242, 242)',()=>cs(document.body).backgroundColor],
   ['글자색','rgb(0, 0, 0)',()=>cs(document.body).color],
   ['글자크기','14px',()=>cs(document.body).fontSize]];
  const over=document.documentElement.scrollWidth-document.documentElement.clientWidth;
  const rows=want.map(([k,w,f])=>{let g;try{g=f()}catch(e){g='오류'}return [k,w,g]});
  const bad=rows.filter(([k,w,g])=>String(g)!==String(w));
  return `vw=${innerWidth} 가로넘침=${over>1?'있다 +'+over:'없다'}\n`+
    rows.map(([k,w,g])=>`${String(g)===String(w)?'✅':'❌'} ${k}: 서플 ${w} / 우리 ${g}`).join('\n')+
    `\n★안 맞는 항목 ${bad.length}개 / ${rows.length}개★`;
})()
