/** 크랙 그림만 — 세이브 방패 옆에 세워 놓고 크기별로 본다. */
import { renderToStaticMarkup } from 'react-dom/server'
import { writeFileSync } from 'node:fs'
import { TraitEmblem } from './src/league/TraitEmblem'

const tag = process.argv[2] ?? 'x'
const em = (axis: 'safe' | 'save', tier: 'best' | 'high', size: number) =>
  renderToStaticMarkup(<TraitEmblem axis={axis} weapon={0} tier={tier} size={size} />)

const line = (size: number) =>
  `<div class="row"><span class="lb">${size}px</span>` +
  `${em('save', 'best', size)}${em('safe', 'best', size)}` +
  `<span class="gap"></span>` +
  `${em('save', 'high', size)}${em('safe', 'high', size)}</div>`

const html = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><style>
 body{margin:0;background:#0c1526;color:#e8eaf2;font:13px system-ui;padding:14px}
 h2{font-size:13px;color:#7fa9ff;margin:0 0 10px}
 .row{display:flex;align-items:center;gap:8px;margin-bottom:12px}
 .lb{width:44px;color:#7c88a4;font-size:11px}
 .gap{width:24px}
 .note{color:#a4b0c8;font-size:11px;margin-top:4px}
</style></head><body>
<h2>${tag} — 왼쪽부터 [세이브 방패 · 크랙] 금 / [세이브 방패 · 크랙] 은</h2>
${line(96)}${line(44)}${line(28)}${line(22)}${line(18)}
<p class="note">세이브(온전한 방패) 바로 옆에 크랙을 세웠다. 22px 에서 둘이 달라 보여야 한다.</p>
</body></html>`

writeFileSync(`C:/Users/LG/Desktop/서플라이/scratchpad/crack-${tag}.html`, html)
console.log('ok', tag)
