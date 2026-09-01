/**
 * 가챠샵 부품을 파일로 그린다 (`packages/ui/src/gacha/*`).
 *
 * 운영 코드가 아니다. 이 컴퓨터에서 개발 서버가 뜨지 않아(D-187 · listen EFAULT)
 * 화면을 눈으로 볼 수 없어서, 그림만이라도 확인하려고 만들었다.
 * `clanHexV2Preview.mts` 를 본떴다.
 *
 * **저쪽과 다른 점** — 저쪽은 SVG 를 그리지만 여기는 **HTML** 이다.
 * 캡슐은 gradient · `overflow: hidden` · `@keyframes` 로 만들어져 있어서 SVG 로는
 * 같은 그림이 나오지 않는다. 도는 벨트는 더더욱 그렇다.
 *
 * **화면 검수를 대신하지 못한다.** 아래 CSS 는 `packages/ui/src/styles.css` 의 가챠 절과
 * `Capsule.tsx` 의 Tailwind 유틸리티를 **손으로 옮긴 거울**이다. 값은 같지만
 * 실제 폰트·반응형·하이드레이션은 브라우저에서 봐야 안다.
 *
 * ```
 * npx tsx apps/web/scripts/gachaPreview.mts --out gacha.html
 * ```
 *
 * 값은 전부 **가짜**다. 클랜 이름도 마크도 지어낸 것이고 DB 를 부르지 않는다.
 */
import { writeFileSync } from 'node:fs'

/** `packages/ui/src/styles.css` 의 `적진` 토큰 실측값. **여기서 새 색을 만들지 않는다** (D-204) */
const COLOR = {
  page: '#060505',
  card: '#120c0c',
  card2: '#1a1010',
  line: '#2a1616',
  lineSoft: '#1a1010',
  text: '#d6c9c9',
  textStrong: '#f6eded',
  meta: '#9a8080',
  faint: '#6b5555',
  accent: '#d92b2b',
} as const

/** 캡슐 한 개가 만드는 노드 수 — `Capsule.tsx` 의 구조를 그대로 센 것 */
const NODE_BUDGET = {
  root: 1,
  markLayer: 1,
  /** `ClanMark`: 공식 = span>span>img+img(4) · fallback = svg>circle+path(3) */
  markOfficial: 4,
  markFallback: 3,
  glass: 1,
  band: 1,
  lid: 1,
} as const

/* ───────────────────────────────────────────────────── 가짜 값 만들기 */

const SYLLABLE = [
  '검',
  '흑',
  '적',
  '백',
  '뇌',
  '풍',
  '월',
  '성',
  '용',
  '호',
  '랑',
  '무',
  '천',
  '강',
  '산',
]
const TAIL = ['', '단', '군', '대', '회', '전', '팀', '조']

/** 결정적 가짜 이름. 같은 index 는 항상 같은 이름을 낸다 */
function fakeName(index: number): string {
  const a = SYLLABLE[index % SYLLABLE.length]
  const b = SYLLABLE[(index * 7 + 3) % SYLLABLE.length]
  const t = TAIL[index % TAIL.length]
  return `${a}${b}${t}`
}

/** `CapsulePile.capsuleJitterHash` 와 **같은 식**이다 (FNV-1a) */
function jitterHash(key: string): number {
  let hash = 2166136261
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/** `CapsulePile.capsuleJitter` 와 **같은 식**이다 */
function jitter(key: string, tight = false): { dx: number; dy: number; rotate: number } {
  const hash = jitterHash(key)
  const scale = tight ? 0.4 : 1
  return {
    dx: Math.round(((hash % 11) - 5) * scale),
    dy: Math.round((((hash >>> 8) % 9) - 4) * scale),
    rotate: Math.round((((hash >>> 16) % 15) - 7) * scale),
  }
}

function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * 가짜 클랜마크 (2겹).
 *
 * 실제 마크는 원격 이미지 2장이라 여기서는 못 쓴다. 모양만 흉내 낸 인라인 SVG 다.
 * **실제 화면의 마크가 이렇게 생겼다는 뜻이 아니다.**
 */
function fakeMark(seed: number): string {
  const hue = seed % 3
  const inner =
    hue === 0
      ? `<path d="M16 5 L27 27 L5 27 Z" fill="${COLOR.accent}" opacity="0.85"/>`
      : hue === 1
        ? `<rect x="8" y="8" width="16" height="16" fill="${COLOR.textStrong}" opacity="0.8"/>`
        : `<circle cx="16" cy="16" r="9" fill="none" stroke="${COLOR.accent}" stroke-width="4"/>`
  return (
    `<svg viewBox="0 0 32 32" aria-hidden="true">` +
    `<circle cx="16" cy="16" r="16" fill="${COLOR.card2}"/>${inner}</svg>`
  )
}

/**
 * 공통 fallback 마크 — `FallbackClanMark.tsx` 의 경로를 **그대로** 옮겼다.
 * 마크가 없는 클랜에서 캡슐이 비어 보이지 않는 것을 확인하기 위한 것이다.
 */
function fallbackMark(): string {
  return (
    `<svg viewBox="0 0 32 32" aria-hidden="true">` +
    `<circle cx="16" cy="16" r="16" fill="${COLOR.card}"/>` +
    `<path d="M9.4 21.6 a4.4 4.4 0 0 1 0.5 -8.7 a5.9 5.9 0 0 1 11.1 -1.4 ` +
    `a4.1 4.1 0 0 1 1.6 10.1 Z" fill="none" stroke="${COLOR.accent}" stroke-width="2" ` +
    `stroke-linejoin="round" stroke-linecap="round"/></svg>`
  )
}

/* ───────────────────────────────────────────────────────── 캡슐 그리기 */

interface CapsuleOptions {
  name: string
  state: 'sealed' | 'opening' | 'opened'
  size?: 'sm' | 'md' | 'lg'
  /** 마크가 없는 클랜 — fallback 이 나오는지 보려고 */
  noMark?: boolean
  seed?: number
  flat?: boolean
  frosted?: boolean
  picked?: boolean
  style?: string
}

/** `Capsule.tsx` 의 구조를 그대로 옮긴다. 순서·클래스가 어긋나면 미리보기가 거짓말이 된다 */
function capsule({
  name,
  state,
  size = 'md',
  noMark = false,
  seed = 0,
  flat = false,
  frosted = false,
  picked = false,
  style = '',
}: CapsuleOptions): string {
  const veil =
    state === 'sealed'
      ? `capsule-veiled${frosted ? ' capsule-veiled-frosted' : ''}`
      : state === 'opening'
        ? 'capsule-reveal'
        : ''
  const mark = noMark ? fallbackMark() : fakeMark(seed)
  const lid =
    state === 'sealed'
      ? ''
      : `<span class="capsule-lid ${state === 'opening' ? 'capsule-lid-opening' : 'capsule-lid-open'}"></span>`
  const glass = flat ? '' : '<span class="capsule-glass"></span>'
  return (
    `<div class="cap cap-${size} ${flat ? 'capsule-body-flat' : 'capsule-body'}` +
    `${picked ? ' capsule-picked picked' : ''}" title="${escape(name)}"${style ? ` style="${style}"` : ''}>` +
    `<span class="cap-mark ${veil}">${mark}</span>` +
    glass +
    `<span class="cap-band">${escape(name)}</span>` +
    lid +
    `</div>`
  )
}

/* ─────────────────────────────────────────────────────────── 그림 셋 */

/** ① 캡슐 세 모습 */
function figureStates(): string {
  const one = (state: 'sealed' | 'opening' | 'opened', label: string, extra: CapsuleOptions) =>
    `<figure class="fig">${capsule({ ...extra, state })}<figcaption>${label}</figcaption></figure>`
  return (
    `<div class="row">` +
    one('sealed', 'sealed — 불투명하게 비친다', { name: '검월단', state: 'sealed', size: 'lg', seed: 0 }) +
    one('opening', 'opening — 뚜껑이 젖혀진다', { name: '흑풍대', state: 'opening', size: 'lg', seed: 1 }) +
    one('opened', 'opened — 또렷하다', { name: '적성회', state: 'opened', size: 'lg', seed: 2 }) +
    one('sealed', 'mark 가 null — 공통 fallback', {
      name: '마크없는클랜',
      state: 'sealed',
      size: 'lg',
      noMark: true,
    }) +
    one('sealed', 'frosted — blur 는 여기만', {
      name: '뽑힌클랜',
      state: 'sealed',
      size: 'lg',
      seed: 4,
      frosted: true,
      picked: true,
    }) +
    `</div>` +
    `<div class="row">` +
    one('sealed', 'sm', { name: '검월단', state: 'sealed', size: 'sm', seed: 5 }) +
    one('sealed', 'md (더미 기본)', { name: '검월단', state: 'sealed', size: 'md', seed: 5 }) +
    one('sealed', 'lg', { name: '검월단', state: 'sealed', size: 'lg', seed: 5 }) +
    one('sealed', 'flat — 가벼운 판', { name: '검월단', state: 'sealed', size: 'md', seed: 5, flat: true }) +
    `</div>`
  )
}

/** ② 105개 더미 */
function figurePile(count: number, opts: { dense?: boolean; highlight?: number } = {}): string {
  const { dense = false, highlight = -1 } = opts
  const cells: string[] = []
  for (let index = 0; index < count; index += 1) {
    const key = `clan-${index}`
    const { dx, dy, rotate } = jitter(key, dense)
    const picked = index === highlight
    /* 일곱 개에 한 번은 마크가 없는 클랜으로 둔다 — 빈 캡슐이 나오지 않는지 보려고 */
    const noMark = index % 7 === 3
    /* 열두 개에 한 번은 이미 열린 캡슐 */
    const opened = index % 12 === 5
    const transform =
      `translate(${dx}px, ${dy}px) rotate(${rotate}deg)` + (picked ? ' scale(1.14)' : '')
    cells.push(
      capsule({
        name: fakeName(index),
        state: opened ? 'opened' : 'sealed',
        size: 'md',
        noMark,
        seed: index,
        flat: dense,
        picked,
        style: `transform:${transform}`,
      }).replace('class="cap ', `class="cap ${dense ? 'pile-cell-dense' : 'pile-cell'} `),
    )
  }
  return `<div class="pile"><div class="pile-wrap">${cells.join('')}</div></div>`
}

/** ③ 도는 진열대 */
function figureShelf(names: string[], spin: boolean): string {
  const set = (clone: boolean) =>
    `<ul class="${clone ? 'gacha-belt-clone' : ''}">` +
    names
      .map(
        (name, index) =>
          `<li>${capsule({ name, state: 'opened', size: 'md', seed: index + 3 })}</li>`,
      )
      .join('') +
    `</ul>`
  const duration = Math.max(1, names.length) * 2.6
  return (
    `<section class="shelf">` +
    `<div class="shelf-head"><span class="shelf-tick"></span>` +
    `<h2 class="display">SACLOUD</h2><span class="shelf-rule"></span></div>` +
    `<div class="gacha-belt-viewport">` +
    `<div class="${spin ? 'gacha-belt belt-max' : 'belt-center'}" style="--belt-dur:${duration}s">` +
    set(false) +
    (spin ? set(true) : '') +
    `</div></div>` +
    `<div class="shelf-note">문구 자리 (<code>note</code> / <code>children</code>) — ` +
    `내용은 화면 쪽에서 채운다. 이 미리보기는 자리만 보여 준다.</div>` +
    `</section>`
  )
}

/* ─────────────────────────────────────────────────────────────── CSS */

/**
 * `packages/ui/src/styles.css` 의 가챠 절 + `Capsule.tsx` 의 Tailwind 유틸리티를
 * 손으로 옮긴 거울이다. **여기서 값을 바꾸면 미리보기가 거짓말이 된다.**
 */
const CSS = `
:root{
  --color-page:${COLOR.page}; --color-card:${COLOR.card}; --color-card-2:${COLOR.card2};
  --color-line:${COLOR.line}; --color-line-soft:${COLOR.lineSoft};
  --color-text:${COLOR.text}; --color-text-strong:${COLOR.textStrong};
  --color-meta:${COLOR.meta}; --color-faint:${COLOR.faint}; --color-accent:${COLOR.accent};
}
*{box-sizing:border-box}
body{margin:0;padding:24px 0 64px;background:var(--color-page);color:var(--color-text);
  font-family:'Noto Sans KR','Malgun Gothic',sans-serif;font-size:15px}
h1{font-size:20px;color:var(--color-text-strong);margin:0 0 4px}
h3{font-size:14px;color:var(--color-text-strong);margin:40px 0 4px;font-weight:400}
p.lede{color:var(--color-meta);font-size:12px;margin:0 0 8px}
.wrap{max-width:1120px;margin:0 auto;padding:0 24px}
code{font-family:'JetBrains Mono',Consolas,monospace;font-size:12px;color:var(--color-meta)}

/* ── 캡슐 (Capsule.tsx 의 Tailwind 유틸리티를 옮긴 것) */
.cap{position:relative;display:inline-flex;align-items:center;justify-content:center;
  border-radius:9999px;border:1px solid var(--color-line);vertical-align:top;padding:0}
.cap-sm{width:56px;height:56px}
.cap-md{width:84px;height:84px}
.cap-lg{width:132px;height:132px}
.cap-mark{position:absolute;inset:8%;display:flex;align-items:center;justify-content:center;
  overflow:hidden;border-radius:9999px}
.cap-mark>*{width:100%;height:100%;flex-shrink:0}
.cap-band{position:absolute;left:12%;right:12%;bottom:20%;overflow:hidden;text-overflow:ellipsis;
  white-space:nowrap;border-top:1px solid var(--color-line);border-bottom:1px solid var(--color-line);
  background:var(--color-card-2);padding:0 3px;text-align:center;line-height:1.6;
  color:var(--color-text);font-size:10px;pointer-events:none}
.cap-sm .cap-band{font-size:8px}
.cap-lg .cap-band{font-size:13px}
.picked{z-index:10;border-color:var(--color-accent)}

/* ── styles.css 의 가챠 절 (그대로) */
.capsule-body{background:
  radial-gradient(54% 36% at 33% 20%, rgb(246 237 237 / 0.13), transparent 70%),
  linear-gradient(170deg, var(--color-card-2) 0%, var(--color-card) 55%, var(--color-page) 100%)}
.capsule-body-flat{background:linear-gradient(170deg, var(--color-card-2) 0%,
  var(--color-card) 62%, var(--color-page) 100%)}
.capsule-glass{position:absolute;inset:0;border-radius:9999px;pointer-events:none;background:
  radial-gradient(44% 30% at 32% 18%, rgb(246 237 237 / 0.16), transparent 68%),
  linear-gradient(180deg, rgb(246 237 237 / 0.07) 0%, rgb(246 237 237 / 0.015) 44%,
  rgb(6 5 5 / 0.34) 100%);border-top:1px solid rgb(246 237 237 / 0.1)}
.capsule-veiled{opacity:.42}
.capsule-veiled>*{transform:scale(1.32)}
.capsule-veiled-frosted{filter:blur(3px)}
@keyframes capsule-reveal{from{opacity:.42}to{opacity:1}}
@keyframes capsule-reveal-mark{from{transform:scale(1.32)}to{transform:scale(1)}}
.capsule-reveal{animation:capsule-reveal 620ms ease-out forwards}
.capsule-reveal>*{animation:capsule-reveal-mark 620ms ease-out forwards}
.capsule-lid{position:absolute;top:-1px;left:-1px;right:-1px;height:50%;
  border:1px solid rgb(246 237 237 / 0.16);border-bottom:none;border-radius:999px 999px 0 0;
  background:linear-gradient(180deg, rgb(246 237 237 / 0.12), rgb(26 16 16 / 0.92));
  transform-origin:50% 100%}
.capsule-lid-open{transform:translateY(-44%) rotate(-20deg);opacity:.8}
@keyframes capsule-open{0%{transform:none;opacity:1}30%{transform:translateY(3%);opacity:1}
  100%{transform:translateY(-44%) rotate(-20deg);opacity:.8}}
.capsule-lid-opening{animation:capsule-open 620ms cubic-bezier(.2,.8,.2,1) forwards}
@keyframes capsule-picked{0%,100%{filter:drop-shadow(0 0 3px rgb(217 43 43 / .35))}
  50%{filter:drop-shadow(0 0 9px rgb(217 43 43 / .7))}}
.capsule-picked{animation:capsule-picked 2.4s ease-in-out infinite}

/* ── 더미 (CapsulePile.tsx) */
.pile{padding:16px 12px}
.pile-wrap{display:flex;flex-wrap:wrap;align-items:center;justify-content:center}
.pile-cell{margin-right:-12px;margin-bottom:-10px}
.pile-cell-dense{margin-right:-2px;margin-bottom:-2px}

/* ── 도는 진열대 (GachaShelf.tsx) */
.shelf{border:1px solid var(--color-line);background:var(--color-card)}
.shelf-head{display:flex;align-items:center;gap:12px;padding:16px 20px 0}
.shelf-tick{height:1px;width:32px;background:var(--color-accent)}
.shelf-rule{height:1px;flex:1;background:var(--color-line-soft)}
.shelf h2{margin:0;font-size:20px;line-height:1;letter-spacing:.28em;
  color:var(--color-text-strong);font-family:'Black Han Sans',sans-serif;font-weight:400}
.gacha-belt-viewport{overflow:hidden;margin-top:16px;border-top:1px solid var(--color-line);
  border-bottom:1px solid var(--color-line);background:var(--color-card-2);padding:16px 0}
.belt-max{display:flex;width:max-content}
.belt-center{display:flex;width:100%;justify-content:center}
.gacha-belt-viewport ul{display:flex;flex-shrink:0;list-style:none;margin:0;padding:0}
.gacha-belt-viewport li{padding-right:20px}
@keyframes gacha-belt{from{transform:translateX(0)}to{transform:translateX(-50%)}}
.gacha-belt{animation:gacha-belt var(--belt-dur,30s) linear infinite;will-change:transform}
.gacha-belt-viewport:hover .gacha-belt,
.gacha-belt-viewport:focus-within .gacha-belt{animation-play-state:paused}
.shelf-note{padding:16px 20px 20px;font-size:13px;line-height:1.7;color:var(--color-text)}

/* Capsule.tsx 의 max-md: 반응형 — 좁은 화면에서 한 단 줄인다 */
@media (max-width: 767px){
  .cap-md{width:68px;height:68px}
  .cap-lg{width:112px;height:112px}
  .cap-md .cap-band{font-size:9px}
  .gacha-belt-viewport li{padding-right:16px}
}
@media (prefers-reduced-motion: reduce){
  .gacha-belt{animation:none;will-change:auto}
  .gacha-belt-clone{display:none}
  .gacha-belt-viewport{overflow-x:auto}
  .capsule-reveal,.capsule-reveal>*,.capsule-lid-opening,.capsule-picked{animation:none}
  .capsule-reveal{opacity:1}
  .capsule-reveal>*{transform:scale(1)}
  .capsule-lid-opening{transform:translateY(-44%) rotate(-20deg);opacity:.8}
  .capsule-picked{filter:drop-shadow(0 0 6px rgb(217 43 43 / .5))}
}
`

/* ────────────────────────────────────────────────────────────── 실행 */

function main(): void {
  const outIndex = process.argv.indexOf('--out')
  const out = outIndex >= 0 ? process.argv[outIndex + 1] : 'gacha.html'
  if (!out) throw new Error('--out <파일> 이 필요하다')

  const PILE_COUNT = 105
  const pile = figurePile(PILE_COUNT, { highlight: 47 })
  const pileDense = figurePile(PILE_COUNT, { dense: true })

  const shortNames = Array.from({ length: 4 }, (_, index) => fakeName(index * 3))
  const longNames = Array.from({ length: 18 }, (_, index) => fakeName(index * 5 + 1))

  const body =
    `<div class="wrap">` +
    `<h1>가챠샵 미리보기</h1>` +
    `<p class="lede">값은 전부 가짜다. 색·치수·CSS 는 <code>packages/ui/src/gacha/*</code> 와 ` +
    `<code>packages/ui/src/styles.css</code> 의 실제 값을 옮긴 것이다.</p>` +
    `<h3>① 캡슐 — sealed / opening / opened</h3>` +
    `<p class="lede">「흐릿함」은 <code>filter: blur()</code> 가 아니라 opacity 0.42 + scale 1.32 + 잘라내기다. ` +
    `blur 는 <code>frosted</code> 하나에만 쓴다.</p>` +
    figureStates() +
    `<h3>② 쌓인 더미 — ${PILE_COUNT}개 (기본 판)</h3>` +
    `<p class="lede">겹침 −12px / −10px · 어긋남 ±5px · 기울기 ±7deg. 전부 key 해시라 다시 그려도 안 흔들린다.</p>` +
    pile +
    `<h3>③ 쌓인 더미 — ${PILE_COUNT}개 (<code>dense</code> 가벼운 판)</h3>` +
    `<p class="lede">유리막 한 겹을 빼고 겹침·어긋남을 40% 로 줄였다. 옛 판을 지우지 않고 둘 다 남긴다.</p>` +
    pileDense +
    `<h3>④ 진열대 — 항목이 적어 <b>안 돈다</b> (${shortNames.length}개)</h3>` +
    figureShelf(shortNames, false) +
    `<h3>⑤ 진열대 — 한 줄이 꽉 차 <b>돈다</b> (${longNames.length}개 · 마우스를 올리면 멈춘다)</h3>` +
    figureShelf(longNames, true) +
    `</div>`

  const html =
    `<!doctype html><html lang="ko"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>가챠샵 미리보기</title><style>${CSS}</style></head><body>${body}</body></html>`

  writeFileSync(out, html, 'utf8')

  /* ── 숫자로 잰다. 「괜찮아 보인다」는 근거가 아니다 (CLAUDE.md 3-A 6번) */
  const shell = NODE_BUDGET.root + NODE_BUDGET.markLayer + NODE_BUDGET.glass + NODE_BUDGET.band
  const sealedOfficial = shell + NODE_BUDGET.markOfficial
  const openedOfficial = sealedOfficial + NODE_BUDGET.lid

  /* 미리보기 마크업에서 **실제로 센** 요소 수 (여는 태그 개수).
     ⚠ 미리보기의 가짜 마크는 인라인 SVG 2노드라 **실제보다 적게 나온다.**
     실제 `ClanMark` 는 공식 4노드 · fallback 3노드다. 그래서 아래에 환산값을 따로 낸다 */
  const countedInPreview = (pile.match(/<(?!\/)[a-zA-Z]/g) ?? []).length

  /* 실제 컴포넌트로 환산. 더미의 구성은 `figurePile` 과 같은 규칙이다 */
  let projected = 2 // .pile + .pile-wrap
  for (let index = 0; index < PILE_COUNT; index += 1) {
    projected += shell
    projected += index % 7 === 3 ? NODE_BUDGET.markFallback : NODE_BUDGET.markOfficial
    if (index % 12 === 5) projected += NODE_BUDGET.lid
  }

  console.info('그렸다:', out)
  console.info('⚠ 값은 전부 가짜다. 색·치수·CSS 만 실제 컴포넌트와 같다')
  console.info('')
  console.info('── 노드 수 (캡슐 하나 · 실제 컴포넌트)')
  console.info(`   sealed  ${sealedOfficial - 1}~${sealedOfficial} 개 (마크가 fallback 이면 하나 적다)`)
  console.info(`   opened  ${openedOfficial - 1}~${openedOfficial} 개`)
  console.info(`── 더미 ${PILE_COUNT}개`)
  console.info(`   미리보기 마크업 실측       ${countedInPreview} 개 (가짜 마크가 2노드라 실제보다 적다)`)
  console.info(`   실제 ClanMark 로 환산      ${projected} 개 (컨테이너 2 포함)`)
  console.info('── 합성 레이어를 만드는 속성')
  console.info('   filter          더미 0개 · frosted 캡슐 1개 · picked 캡슐 1개 (모두 화면당 하나)')
  console.info('   backdrop-filter 0개')
  console.info('   will-change     1개 — .gacha-belt (도는 줄) 뿐')
  console.info('   opacity 애니메이션 opening 중인 캡슐에만. 더미의 sealed 는 정적 opacity 다')
  console.info('── 도는 줄이 애니메이션하는 속성: transform 하나')
}

main()
