/**
 * 신전 히어로를 **파일 한 장으로** 그린다 (`packages/ui/src/hero/TempleHero.tsx`).
 *
 * 운영 코드가 아니다. 3000번 포트를 다른 작업이 쓰고 있어 dev 서버를 띄울 수 없을 때
 * 「구름이 어떻게 흐르는지 · 번개가 얼마나 자주 치는지 · 손가락 틈에 마크가 맞는지」를
 * 눈으로 보려고 만들었다. `gachaPreview.mts` 를 본떴다 —
 * **그 파일은 2026-09-01 가챠샵과 함께 지웠다.** 이 파일만 남았다.
 *
 * ```
 * npx tsx apps/web/scripts/heroPreview.mts --out hero.html
 * ```
 *
 * ── **화면 검수를 대신하지 못한다**
 *   Tailwind 유틸리티(`text-[clamp(...)]` 등)는 여기서 **손으로 옮긴 거울**이다.
 *   값은 같게 맞췄지만 실제 폰트 로딩 · 하이드레이션 · next/image 변환은 브라우저에서만 안다.
 *
 * ── 다만 **CSS 애니메이션 절은 손으로 옮기지 않는다**
 *   `packages/ui/src/styles.css` 에서 「신전 히어로」 절과 토큰을 **읽어서 그대로 붙인다.**
 *   구름·번개·글로우가 이 미리보기와 실제 화면에서 어긋나면 안 되기 때문이다.
 *   토큰도 `@theme` 블록에서 뽑아 `:root` 로 옮긴다 (Tailwind 없이도 var() 가 살게).
 *
 * 클랜 값은 **가짜**다. DB 를 부르지 않는다.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const STYLES = resolve(HERE, '../../../packages/ui/src/styles.css')
/** 조각상 원본. 결과 HTML 을 어디에 쓰든 그림이 뜨도록 **절대 경로**로 박는다 */
const IMAGE = `file:///${resolve(HERE, '../public/hero/creation-source.png').replace(/\\/g, '/')}`

/** `@theme { ... }` 안의 커스텀 프로퍼티만 뽑아 `:root` 로 옮긴다 */
function themeTokens(css: string): string {
  const open = css.indexOf('@theme {')
  if (open < 0) throw new Error('styles.css 에서 @theme 블록을 못 찾았다')

  // 중괄호 깊이를 세서 블록 끝을 찾는다 (안에 주석과 중첩이 있다)
  let depth = 0
  let end = -1
  for (let i = css.indexOf('{', open); i < css.length; i += 1) {
    if (css[i] === '{') depth += 1
    else if (css[i] === '}') {
      depth -= 1
      if (depth === 0) {
        end = i
        break
      }
    }
  }
  if (end < 0) throw new Error('@theme 블록이 닫히지 않았다')

  const body = css.slice(css.indexOf('{', open) + 1, end)
  const lines = body.match(/--[\w-]+:[^;]+;/g) ?? []
  return `:root {\n${lines.map((line) => `  ${line.replace(/\s+/g, ' ')}`).join('\n')}\n}`
}

/** 「신전 히어로」 절을 통째로 가져온다 — 손으로 베끼지 않는다 */
function templeSection(css: string): string {
  const marker = css.indexOf('/* ============================================================ 신전 히어로 ===')
  if (marker < 0) throw new Error('styles.css 에서 「신전 히어로」 절을 못 찾았다')
  return css.slice(marker)
}

/* ─────────────────────────────────────────────── TempleHero.tsx 의 거울 */

/** `TempleHero.tsx` 의 좌표 상수와 **같은 값**이어야 한다 */
const GEO = {
  ratio: '1254 / 700',
  focus: '50% 45.2%',
  gapX: '45%',
  gapY: '46.4%',
  mark: 'clamp(38px, 5.6vw, 76px)',
  halo: 'clamp(130px, 19vw, 300px)',
  offset: 'clamp(2.2rem, 5.2vw, 4.4rem)',
} as const

/** 가짜 1등. 마크는 없는 셈 치고 fallback(구름 윤곽) 을 그린다 */
const FAKE = { name: 'nightbloom', rating: '3,266점' }

/**
 * 약자 한 낱말.
 *
 * 낱말 사이는 `&nbsp;`(글자) + `margin`(간격) 이다 — `TempleHero.tsx` 와 같다.
 * 폭만 가진 빈 `<span>` 으로 벌리면 `innerText` 가 한 덩어리가 된다.
 */
function acronym(head: string, rest: string, last = false): string {
  return `<span style="white-space:nowrap${last ? '' : ';margin-right:.5em'}">
    <span style="font-size:1.32em;font-weight:700;letter-spacing:.06em;color:var(--color-marble)">${head}</span><span style="letter-spacing:.1em;color:var(--color-stone)">${rest}${last ? '' : '&nbsp;'}</span>
  </span>`
}

function bolt(left: string, second: boolean): string {
  const points = '28,0 12,86 24,94 9,200'
  return `<div class="temple-bolt${second ? ' temple-bolt-2' : ''}"
       style="left:${left};top:-6%;width:min(38%,420px);height:62%">
    <div style="position:absolute;inset:0;background:radial-gradient(46% 58% at 50% 22%, rgb(214 210 206 / .5), transparent 72%)"></div>
    <svg viewBox="0 0 40 200" preserveAspectRatio="xMidYMin meet"
         style="position:absolute;left:50%;top:0;height:100%;transform:translateX(-50%);width:clamp(16px,2.4vw,40px)">
      <polyline points="${points}" fill="none" stroke="rgb(214 210 206 / .28)" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
      <polyline points="${points}" fill="none" stroke="rgb(246 243 240 / .92)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  </div>`
}

function page(css: string): string {
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>신전 히어로 미리보기</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&family=Noto+Sans+KR:wght@300;400;500;700&family=JetBrains+Mono&display=swap" rel="stylesheet">
<style>
${css}

/* --- 아래는 미리보기 전용 뼈대. TempleHero.tsx 의 Tailwind 유틸리티를 손으로 옮긴 것 --- */
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: var(--color-page); color: var(--color-text); font-family: 'Noto Sans KR', sans-serif; }
/* next/font 없이 보므로 토큰의 폴백(원래 이름)이 살아야 한다 */
.temple-type { font-family: var(--font-temple); }
.hero { position: relative; isolation: isolate; overflow: hidden; }
.hero-inner { position: relative; margin: 0 auto; width: 100%; max-width: var(--layout-max); padding: 0 20px; }
.fade { position: absolute; inset-inline: 0; bottom: 0; height: 33.33%; pointer-events: none;
        background: linear-gradient(to bottom, transparent, var(--color-page)); }
.wordmark { padding-top: 104px; text-align: center; }
.wordmark h1 { line-height: 1; font-weight: 400; }
.sa, .cloud { font-size: clamp(2.2rem, 7vw, 4.6rem); letter-spacing: .14em; }
.sa { color: var(--color-stone); }
.cloud { color: var(--color-marble); font-weight: 700; }
.dot { display: inline-block; width: .16em; height: .16em; margin-left: .18em;
       vertical-align: .34em; background: var(--color-accent); }
.acronyms { margin-top: 16px; font-size: clamp(.62rem, 1.7vw, .92rem); }
.plate { position: relative; margin-top: 36px; aspect-ratio: ${GEO.ratio}; }
.plate img { position: absolute; inset: 0; width: 100%; height: 100%;
             object-fit: cover; object-position: ${GEO.focus}; }
.anchor { position: absolute; left: ${GEO.gapX}; top: ${GEO.gapY}; }
.halo { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%);
        width: ${GEO.halo}; aspect-ratio: 1; border-radius: 999px; pointer-events: none; }
/* 글자는 **전부 틈 위쪽**이다 — 아래에 두면 누운 조각상의 허벅지에 얹힌다 */
.above { position: absolute; left: 50%; transform: translateX(-50%); bottom: ${GEO.offset};
         display: flex; flex-direction: column; align-items: center; gap: 4px; white-space: nowrap; }
.label { font-size: clamp(.6rem,1.2vw,.8rem); font-weight: 700;
         letter-spacing: .42em; color: var(--color-gold); }
.mark { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%);
        display: block; width: ${GEO.mark}; }
.mark svg { display: block; width: 100%; aspect-ratio: 1; }
.clan { font-size: clamp(.95rem,2.4vw,1.7rem); font-weight: 700; letter-spacing: .06em; line-height: 1.2; color: var(--color-marble); }
.rating { font-family: var(--font-num); font-size: clamp(.68rem,1.4vw,.92rem); color: var(--color-accent); }
.after { margin: 0 auto; max-width: var(--layout-max); padding: 32px 20px 40px; text-align: center; color: var(--color-faint); }
@media (max-width: 767px) { .wordmark { padding-top: 64px; } .plate { margin-top: 24px; } .hero-inner { padding: 0 12px; } }
</style></head>
<body>
<div class="hero">
  <div class="temple-cloud temple-cloud-a"></div>
  <div class="temple-cloud temple-cloud-b"></div>
  <div class="temple-cloud temple-cloud-c"></div>
  ${bolt('17%', false)}
  ${bolt('71%', true)}
  <div class="fade"></div>

  <div class="hero-inner">
    <div class="wordmark">
      <h1 class="temple-type"><span class="sa">SA</span><span style="display:inline-block;width:.34em"></span><span class="cloud">CLOUD</span><span class="dot"></span></h1>
      <p class="temple-type acronyms">
        ${acronym('C', 'onnected')}${acronym('L', 'eague')}${acronym('O', 'perations')}${acronym('U', 'ser')}${acronym('D', 'ata', true)}
      </p>
    </div>

    <div class="plate">
      <img class="temple-statue" src="${IMAGE}" alt="">
      <div class="anchor">
        <div class="halo temple-halo"></div>
        <span class="above">
          <span class="temple-type label">현재 1등</span>
          <span class="temple-type clan">${FAKE.name}</span>
          <span class="rating">${FAKE.rating}</span>
        </span>
        <span class="mark">
          <!-- FallbackClanMark 와 같은 그림 (가짜 데이터라 실제 마크를 안 그린다) -->
          <svg viewBox="0 0 32 32" class="temple-mark-glow">
            <circle cx="16" cy="16" r="16" fill="var(--color-card)"/>
            <path d="M9.4 21.6 a4.4 4.4 0 0 1 .5 -8.7 a5.9 5.9 0 0 1 11.1 -1.4 a4.1 4.1 0 0 1 1.6 10.1 Z"
                  fill="none" stroke="var(--color-accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
          </svg>
        </span>
      </div>
    </div>
  </div>

  <div class="after">— 여기부터 통합검색이 들어온다 —</div>
</div>
</body></html>`
}

const outIndex = process.argv.indexOf('--out')
const out = outIndex > 0 ? process.argv[outIndex + 1]! : 'hero.html'

const css = readFileSync(STYLES, 'utf8')
writeFileSync(out, page(`${themeTokens(css)}\n\n${templeSection(css)}`), 'utf8')
console.log(`wrote ${out}`)
