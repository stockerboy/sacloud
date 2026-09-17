/** 앰블럼을 HTML 한 장에 늘어놓는다 — 눈으로 보려고 만든 것. */
import { renderToStaticMarkup } from 'react-dom/server'
import { writeFileSync } from 'node:fs'
import { TraitEmblem } from './src/league/TraitEmblem'
import { PLAYER_HEX_BADGE, TRAIT_AXIS_KEYS, TRAIT_TIER_LABEL, type TraitAxisKey } from '@sacloud/contract'

const axes = TRAIT_AXIS_KEYS as readonly TraitAxisKey[]
const em = (axis: TraitAxisKey, weapon: 0 | 1, tier: 'best' | 'high', size: number) =>
  renderToStaticMarkup(<TraitEmblem axis={axis} weapon={weapon} tier={tier} size={size} />)

function block(tier: 'best' | 'high') {
  const cells: string[] = []
  for (const weapon of [1, 0] as const) {
    for (const axis of axes) {
      const name = PLAYER_HEX_BADGE[axis]?.[weapon === 1 ? 'sniper' : 'rifle'] ?? '?'
      cells.push(
        `<div class="cell">` +
          `<div class="r">${em(axis, weapon, tier, 96)}</div>` +
          `<div class="r">${em(axis, weapon, tier, 44)}</div>` +
          `<div class="r">${em(axis, weapon, tier, 22)}</div>` +
          `<div class="cap">${axis} / ${weapon === 1 ? 'SNIPER' : 'RIFLE'}<br/>${name}</div>` +
        `</div>`,
      )
    }
  }
  return `<h2>${TRAIT_TIER_LABEL[tier]} (${tier}) — 96 / 44 / 22px</h2><div class="grid">${cells.join('')}</div>`
}

/* 금·은을 바로 옆에 세워 «한눈에 더 좋아 보이나» 를 본다 */
const side = axes
  .map(
    (a) =>
      `<div class="cell"><div class="r">${em(a, 1, 'best', 76)}${em(a, 1, 'high', 76)}</div>` +
      `<div class="cap">${a}<br/>금(best) · 은(high)</div></div>`,
  )
  .join('')


/* 22px 에서 금·은이 갈리나 — 표 줄과 같은 크기로 열두 개씩 */
const tiny = (tier: 'best' | 'high') =>
  axes.map((a) => em(a, 1, tier, 22)).join('') + axes.map((a) => em(a, 0, tier, 22)).join('')

/* 랭킹 표 한 줄 흉내 */
const row =
  em('save', 1, 'best', 22) + em('duel', 1, 'best', 22) + em('gap', 1, 'high', 22)

const html = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><style>
  body{margin:0;background:radial-gradient(1200px 700px at 50% -8%,#142238 0%,#0c1526 42%,#070d1c 100%);
       color:#e8eaf2;font:13px system-ui;padding:16px;min-height:100vh}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px}
  .cell{background:linear-gradient(160deg,rgba(46,65,107,.58),rgba(32,48,82,.58));
        border:1px solid #3a4870;border-radius:10px;padding:10px;text-align:center}
  .r{display:flex;justify-content:center;align-items:center;gap:8px;margin-bottom:6px}
  .cap{font-size:10px;color:#a4b0c8;line-height:1.4}
  h2{font-size:12px;color:#7fa9ff;margin:20px 0 8px}
  .row{display:flex;align-items:center;gap:6px;background:#111a2c;border:1px solid #24314c;
       border-radius:6px;padding:7px 10px}
  .row .nm{font-size:12px}
</style></head><body>
${block('best')}
${block('high')}
<h2>금·은 나란히 — 최상위권이 더 좋아 보이나</h2>
<div class="grid">${side}</div>
<h2>22px — 금(최상위권) 열둘</h2>
<div class="row">${tiny('best')}</div>
<h2>22px — 은(상위권) 열둘</h2>
<div class="row">${tiny('high')}</div>
<h2>22px — 금·은을 붙여서 (축마다 금 다음 은)</h2>
<div class="row">${axes.map((a) => em(a, 1, 'best', 22) + em(a, 1, 'high', 22)).join('')}</div>
<h2>랭킹 표 한 줄 흉내 (22px 셋 · 금 둘 + 은 하나)</h2>
<div class="row"><span class="nm">1</span><span class="nm">PLAYERNAME</span>${row}<span class="nm">1842</span></div>
</body></html>`

writeFileSync('C:/Users/LG/Desktop/서플라이/scratchpad/emblem-preview.html', html)
console.log('ok')
