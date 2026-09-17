
const stub=()=>({ set innerHTML(v){ this._h=v }, get innerHTML(){return this._h}, addEventListener(){}, get children(){return []} });
const _n=stub(); const $ = () => _n; const document={querySelector:()=>_n};

const AX = [
  { k:'few',  n:'소수싸움', d:'수가 밀린 라운드를 이긴 비율' },
  { k:'duel', n:'스나싸움', d:'롱 안 스나 대 스나에서 이긴 비율' },
  { k:'save', n:'세이브',   d:'질 뻔한 라운드를 살린 비율' },
  { k:'A',    n:'A방어',    d:'A쪽으로 온 공격을 막은 비율' },
  { k:'B',    n:'B방어',    d:'B쪽으로 온 공격을 막은 비율' },
  { k:'F2',   n:'2층방어',  d:'2층으로 온 공격을 막은 비율' },
];
const ZK = (c) => ZONE_KO[c] || c;
const pctOf = (ax, k) => {
  const v = ax[k];
  if (v == null) return null;
  return typeof v === 'object' ? v.pct : v;
};
const denOf = (ax, k) => {
  const v = ax[k];
  if (v == null) return k === 'A' || k === 'B' || k === 'F2' ? '수비 0라운드' : '표본 없음';
  /* 방어 셋은 분모가 ★수비 라운드★ 다. 막은 판 수는 비율에서 되돌려 센다 */
  if (typeof v !== 'object') return Math.round((v / 100) * ax.defenceRounds) + '/' + ax.defenceRounds;
  return v.ok + '/' + v.n;
};

let mi = 0, ri = 0;

/* ── 한 라운드의 판정을 ★화면에서 다시 센다★ — 계산기와 같은 규칙이라 값이 어긋나면 눈에 띈다 ── */
function verdictOf(m, r) {
  const out = { breach: [], blame: [], hero: null, hint: [] };
  const D = r.def;
  if (D == null) out.hint.push('이 라운드는 진영을 몰라 방어 판정을 하지 않았습니다.');
  /* 계산기가 적어 준 판정 근거를 그대로 씁니다 — 화면이 따로 세면 둘이 어긋납니다 */
  (r.why || []).forEach((w) => {
    const tag = w.startsWith('A') ? 'A' : w.startsWith('B') ? 'B' : '2층';
    out.breach.push({ tag, text: w.replace(/^(A|B|2층) 뚫림 — /, '') });
  });
  const loser = r.win == null ? null : m.teams.find((t) => t.team !== r.win)?.team;
  if (loser != null) {
    const first = r.kills.find((k) => k.vt === loser);
    if (first) out.blame.push({ who:first.v, why:`진 팀에서 제일 먼저 죽었습니다 (${ZK(first.z[0])})` });
    const cnt = {};
    r.kills.forEach((k) => { if (k.kt === r.win) cnt[k.k] = (cnt[k.k] || 0) + 1; });
    const top = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] >= 2) out.hero = { who: top[0], n: top[1] };
  }
  return out;
}

/* ── 육각형 ── */
function hexSvg(m) {
  const cx = 158, cy = 150, R = 104;
  const pt = (i, f) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 3;
    return [cx + Math.cos(a) * R * f, cy + Math.sin(a) * R * f];
  };
  let g = '';
  for (const f of [0.25, 0.5, 0.75, 1]) {
    const p = AX.map((_, i) => pt(i, f).map((n) => n.toFixed(1)).join(',')).join(' ');
    g += `<polygon points="${p}" fill="none" stroke="var(--line)" stroke-width="1"/>`;
  }
  AX.forEach((_, i) => {
    const [x, y] = pt(i, 1);
    g += `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--line)" stroke-width="1"/>`;
  });
  m.teams.forEach((t) => {
    const col = t.side === 'red' ? 'var(--red)' : 'var(--blue)';
    const vs = AX.map((a, i) => { const v = pctOf(t.axes, a.k); return [i, v == null ? 0 : v / 100]; });
    const p = vs.map(([i, f]) => pt(i, Math.max(f, 0.012)).map((n) => n.toFixed(1)).join(',')).join(' ');
    g += `<polygon points="${p}" fill="${col}" fill-opacity=".15" stroke="${col}" stroke-width="2.2" stroke-linejoin="round"/>`;
    vs.forEach(([i, f]) => {
      if (pctOf(t.axes, AX[i].k) == null) return;
      const [x, y] = pt(i, Math.max(f, 0.012));
      g += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="${col}"/>`;
    });
  });
  AX.forEach((a, i) => {
    const [x, y] = pt(i, 1.26);
    const an = i === 0 || i === 3 ? 'middle' : x > cx ? 'start' : 'end';
    const dy = i === 0 ? -2 : i === 3 ? 12 : 4;
    g += `<text x="${x.toFixed(1)}" y="${(y + dy).toFixed(1)}" text-anchor="${an}" `
       + `font-size="12.5" font-weight="700" fill="var(--muted)" `
       + `font-family="Gothic A1,sans-serif">${a.n}</text>`;
  });
  return `<svg viewBox="-16 -8 348 316" role="img" aria-label="여섯 축 육각형">${g}</svg>`;
}

function ledger(m) {
  const [t1, t2] = m.teams;
  const cell = (t, k) => {
    const v = pctOf(t.axes, k);
    if (v == null) return `<td><span class="dash">측정중</span><span class="den">${denOf(t.axes, k)}</span></td>`;
    const o = pctOf((t === t1 ? t2 : t1).axes, k);
    const lead = o != null && v > o;
    const col = t.side === 'red' ? 'var(--red)' : 'var(--blue)';
    return `<td><span class="val mono ${lead ? 'lead' : ''}" style="color:${col}">${v}%</span>`
         + `<span class="den mono">${denOf(t.axes, k)}</span></td>`;
  };
  return `<table class="ledger"><thead><tr><th>축</th>`
    + m.teams.map((t) => `<th style="color:${t.side === 'red' ? 'var(--red)' : 'var(--blue)'}">${t.name}</th>`).join('')
    + `</tr></thead><tbody>`
    + AX.map((a) => `<tr><td class="axName">${a.n}<small>${a.d}</small></td>`
        + m.teams.map((t) => cell(t, a.k)).join('') + `</tr>`).join('')
    + `</tbody></table>`;
}

function render() {
  const m = MATCHES[mi];
  const teamOf = (t) => m.teams.find((x) => x.team === t) || null;
  const colOf = (t) => { const o = teamOf(t); return o == null ? 'var(--line)' : o.side === 'red' ? 'var(--red)' : 'var(--blue)'; };
  const nameOf = (t) => teamOf(t)?.name ?? '?';
  const wins = {};
  m.rounds.forEach((r) => { if (r.win != null) wins[r.win] = (wins[r.win] || 0) + 1; });
  const [t1, t2] = m.teams;
  const red = m.teams.find((t) => t.side === 'red'), blue = m.teams.find((t) => t.side === 'blue');
  const d = new Date(m.at);
  const date = `${d.getMonth() + 1}월 ${d.getDate()}일`;
  const r = m.rounds[Math.min(ri, m.rounds.length - 1)];
  const v = verdictOf(m, r);

  let strip = '', lastHalf = null, halfCut = 0;
  m.rounds.forEach((rr, i) => {
    const chips = ['A', 'B', '2층'].filter((_, j) => rr.br[['A', 'B', 'F2'][j]])
      .map((c) => `<span class="chip">${c}</span>`).join('');
    const role = rr.att == null ? '?' : rr.att === t1.team ? '' : '';
    strip += `<button class="rbtn" data-r="${i}" aria-pressed="${i === ri}" `
      + `title="${rr.no}라운드 · ${rr.half}">`
      + `<span class="rno mono">${rr.no}</span>`
      + `<span class="rbar" style="background:${rr.win == null ? 'var(--line)' : colOf(rr.win)}"></span>`
      + `<span class="rrole">${rr.def == null ? '—' : rr.def === t1.team ? '수' : '공'}</span>`
      + `<span class="rchips">${chips}</span></button>`;
    if (lastHalf != null && rr.half !== lastHalf) halfCut = i;
    lastHalf = rr.half;
  });

  const bombs = r.bombs.length ? r.bombs.map((b) => b.startsWith('install') ? 'C4 설치' : 'C4 해체').join(' · ') : null;

  const verdictHtml =
    `<div class="verdict ${v.breach.length ? 'bad' : ''}">`
    + (v.breach.length
        ? v.breach.map((b) => `<p class="vline"><span class="vk mono">${b.tag} 뚫림</span>${b.text}</p>`).join('')
        : `<p class="vline">${r.def == null ? v.hint[0] || '판정 없음'
            : `<b>${nameOf(r.def)}</b> 가 세 방향을 다 막았습니다.`}</p>`)
    + (v.blame.length ? `<p class="hero">가장 먼저 무너진 자리 — <b>${v.blame[0].who}</b> · ${v.blame[0].why}</p>` : '')
    + (v.hero ? `<p class="hero">그 라운드 주역 — <b>${v.hero.who}</b> · ${v.hero.n}킬</p>` : '')
    + `</div>`;

  const timeline = r.kills.map((k, i) => {
    const hitA = i < 3 && k.z.some((z) => A_ZONES.includes(z));
    const hitB = i < 3 && k.vt === r.def && k.z.some((z) => B_ZONES.includes(z));
    const hit2 = k.vt === r.def && k.z.includes('ICHUNG');
    return `<li><span class="tn mono">${i + 1}</span>`
      + `<span><span class="kn" style="color:${colOf(k.kt)}">${k.k}</span>`
      + (k.sn ? `<span class="snip">S</span>` : '')
      + `<span class="arrow">→</span>`
      + `<span class="vn" style="color:${colOf(k.vt)}">${k.v}</span></span>`
      + `<span class="tz ${hitA || hitB || hit2 ? 'hit' : ''}">${k.z.map(ZK).join(' · ')}</span></li>`;
  }).join('');

  $('#board').innerHTML =
    `<div class="score">
       <div class="r"><div class="sideTag mono">RED</div><div class="sideName">${red?.name ?? '?'}
         ${m.win === 'red' ? '<span class="crown">WIN</span>' : ''}</div></div>
       <div class="scoreNum mono">${wins[red?.team] || 0} : ${wins[blue?.team] || 0}</div>
       <div class="b"><div class="sideTag mono">BLUE</div><div class="sideName">${blue?.name ?? '?'}
         ${m.win === 'blue' ? '<span class="crown">WIN</span>' : ''}</div></div>
     </div>
     <div class="meta"><span>${date}</span><span>${m.map}</span>
       <span>배틀로그 <b>${m.rounds.length}라운드</b></span>
       <span>전반 끝 <b>${m.switchAt == null ? '알수없음' : m.switchAt + '라운드'}</b></span></div>

     <div class="hexrow">
       <div class="card"><p class="cardTitle">경기 여섯 축</p>${hexSvg(m)}</div>
       <div class="card"><p class="cardTitle">축마다 얼마였나</p>${ledger(m)}</div>
     </div>

     <p class="cardTitle" style="margin-bottom:8px">라운드 — 색은 이긴 팀 · 「수」는 ${t1.name} 가 수비</p>
     <div class="strip" id="strip">${strip}</div>
     <div class="halfmark"><span style="flex:${halfCut || m.rounds.length}">전반</span>
       ${halfCut ? `<span style="flex:${m.rounds.length - halfCut};margin-left:3px">후반</span>` : ''}</div>

     <div class="detail">
       <div class="dhead">
         <span class="dno mono">${r.no}<span style="font-size:.7rem;font-weight:700">라운드</span></span>
         <span class="pill">${r.half}</span>
         ${r.att == null ? '<span class="pill">진영 모름</span>'
           : `<span class="pill">공격 ${nameOf(r.att)}</span><span class="pill">수비 ${nameOf(r.def)}</span>`}
         ${r.win == null ? '<span class="pill">승자 모름</span>'
           : `<span class="pill win" style="color:${colOf(r.win)}">${nameOf(r.win)} 승${r.winSrc === 'deaths' ? ' (추정)' : ''}</span>`}
         ${bombs ? `<span class="pill">${bombs}</span>` : ''}
       </div>
       ${verdictHtml}
       <ul class="timeline">${timeline}</ul>
     </div>`;

  $('#strip').addEventListener('click', (e) => {
    const b = e.target.closest('.rbtn'); if (!b) return;
    ri = Number(b.dataset.r); render();
  });
}

$('#tabs').innerHTML = MATCHES.map((m, i) => {
  const d = new Date(m.at);
  return `<button class="tab" role="tab" data-m="${i}" aria-selected="${i === 0}">`
    + `${m.red} vs ${m.blue}<small class="mono">${d.getMonth() + 1}/${d.getDate()} · ${m.rounds.length}R</small></button>`;
}).join('');
$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('.tab'); if (!b) return;
  mi = Number(b.dataset.m); ri = 0;
  [...$('#tabs').children].forEach((c, i) => c.setAttribute('aria-selected', String(i === mi)));
  render();
});
$
for(let i=0;i<MATCHES.length;i++){mi=i;for(let j=0;j<MATCHES[i].rounds.length;j++){ri=j;render();}}
console.log("all rounds ok");
