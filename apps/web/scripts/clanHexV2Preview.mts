/**
 * 클랜 육각형 **V2** 를 파일로 그린다 (D-217 · D-235).
 *
 * 운영 코드가 아니다. 이 컴퓨터에서 개발 서버가 뜨지 않아(D-187 · listen EFAULT)
 * 화면을 눈으로 볼 수 없어서, 그림만이라도 확인하려고 만들었다.
 * `hexagonPreview.mts`(선수 육각형)를 본떴다.
 *
 * **선수 육각형 미리보기와 다른 점 하나** — 저쪽은 실제 질의를 부르지만 여기는 **가짜 값**이다.
 * `MatchClanHexV2` 가 아직 없어서 부를 질의가 없다. 재료가 생기면 저쪽처럼 질의를 부르게 고친다.
 *
 * **화면 검수를 대신하지 못한다.** 좌표·문구·색은 실제 컴포넌트와 같은 값을 쓰지만
 * (`@sacloud/ui` 의 `traitCopy` · `packages/ui/src/styles.css` 의 토큰 실측값),
 * 레이아웃·반응형·폰트는 브라우저에서 봐야 안다.
 *
 * ```
 * npx tsx apps/web/scripts/clanHexV2Preview.mts --out clanHexV2.svg
 * ```
 */
import { writeFileSync } from 'node:fs'
import type { ClanHexV2, ClanHexV2Axis, ClanHexV2AxisKey } from '@sacloud/ui'
import {
  HEX_CENTER,
  HEX_DOT_RADIUS,
  HEX_RADIUS,
  HEX_RING_SCALES,
  axisLabelAnchor,
  hexPoint,
  hexPolygon,
  hexRing,
} from '@sacloud/ui'

/** `packages/ui/src/styles.css` 의 `적진` 토큰 실측값. **여기서 새 색을 만들지 않는다** (D-204) */
const COLOR = {
  page: '#060505',
  card: '#120c0c',
  line: '#2a1616',
  lineSoft: '#1a1010',
  text: '#d6c9c9',
  textStrong: '#f6eded',
  meta: '#9a8080',
  accent: '#d92b2b',
} as const

const CARD_WIDTH = 300
const CARD_HEIGHT = 392
/* SVG 좌표계(260 폭)를 컴포넌트의 `max-w-[224px]` 와 같은 배율로 줄인다 */
const HEX_SCALE = 224 / 260
const HEX_TOP = 34

/* 못 재는 이유 문구 — 컴포넌트의 `PENDING_TEXT` 와 **같은 말**이라야 한다 */
const PENDING_TEXT: Record<string, string> = {
  battlelog: '배틀로그 필요',
  side: '진영 판정 필요',
  foeSniper: '상대 스나 미확인',
  sample: '표본 부족',
  zone: '구역 좌표 없음',
  compare: '비교 대상 없음',
}

function radiusOf(value: number): number {
  return Math.max(3, Math.min(1, Math.max(0, value)) * HEX_RADIUS)
}

function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** 여섯 축이 다 차야만 폴리곤을 잇는다 (D-106) */
function isFilled(hexagon: ClanHexV2): boolean {
  return hexagon.axes.every((axis) => axis.value !== null)
}

function axisOf(hexagon: ClanHexV2 | undefined, key: ClanHexV2AxisKey): ClanHexV2Axis | undefined {
  return hexagon?.axes.find((axis) => axis.key === key)
}

/* ─────────────────────────────────────────────────────────── 가짜 값 만들기 */

function axis(
  key: ClanHexV2AxisKey,
  label: string,
  value: number | null,
  text: string,
  pending: ClanHexV2Axis['pending'] = null,
): ClanHexV2Axis {
  return { key, label, numerator: null, denominator: null, raw: null, value, text, pending }
}

/** 축 순서는 고정이다 — 스나싸움 · 소수싸움 · 세이브 · 게임템포 · B어택성공 · A어택성공 */
const AXIS_NAMES: [ClanHexV2AxisKey, string][] = [
  ['sniperFight', '스나싸움'],
  ['outnumbered', '소수싸움'],
  ['save', '세이브'],
  ['tempo', '게임템포'],
  ['lastSniper', 'B어택성공'],
  ['attackZone', 'A어택성공'],
]

function makeHexagon(
  values: (number | null)[],
  texts: string[],
  pendings: (ClanHexV2Axis['pending'] | null)[],
  counts: { matches: number; rounds: number; redRounds: number },
): ClanHexV2 {
  const axes = AXIS_NAMES.map(([key, label], index) =>
    axis(key, label, values[index] ?? null, texts[index] ?? '측정중', pendings[index] ?? null),
  )
  return {
    axes,
    measured: axes.filter((a) => a.value !== null).length,
    matches: counts.matches,
    rounds: counts.rounds,
    redRounds: counts.redRounds,
    /* D-235 Q6 — `녹뒤`·`머리` 좌표가 아직 없어서 둘뿐이다 */
    zoneLabelsUsed: 2,
    zoneLabelsTotal: 4,
    formulaVersion: 'preview-fake',
  }
}

/* ────────────────────────────────────────────────────────────── 그리기 */

function hexGroup(hexagon: ClanHexV2, foe: ClanHexV2 | undefined): string {
  const parts: string[] = []
  const g = (inner: string) => parts.push(inner)
  const compare = foe !== undefined
  const empty = hexagon.measured === 0 && (foe === undefined || foe.measured === 0)

  for (const scale of HEX_RING_SCALES) {
    g(
      `<polygon points="${hexRing(HEX_RADIUS * scale)}" fill="none" stroke="${COLOR.line}" ` +
        `stroke-width="0.6" stroke-opacity="0.75"/>`,
    )
  }

  /* 축 여섯 줄 — 어느 한쪽이라도 못 쟀으면 점선 */
  hexagon.axes.forEach((a, index) => {
    const end = hexPoint(index, HEX_RADIUS)
    const foeAxis = axisOf(foe, a.key)
    const unmeasured = a.value === null || (compare && (foeAxis?.value ?? null) === null)
    const dash = unmeasured ? ' stroke-dasharray="3 3"' : ''
    g(
      `<line x1="${HEX_CENTER.x}" y1="${HEX_CENTER.y}" x2="${end.x.toFixed(1)}" y2="${end.y.toFixed(1)}" ` +
        `stroke="${COLOR.line}" stroke-width="0.6" stroke-opacity="0.75"${dash}/>`,
    )
  })

  /* 상대를 먼저 — 선만, 채움 없음 (D-235 Q10) */
  if (foe !== undefined && isFilled(foe)) {
    g(
      `<polygon points="${hexPolygon(foe.axes.map((a) => radiusOf(a.value as number)))}" ` +
        `fill="none" stroke="${COLOR.text}" stroke-width="1.2"/>`,
    )
  }
  /* 우리 — 진홍. 채움은 12% 로 아주 옅게 */
  if (isFilled(hexagon)) {
    g(
      `<polygon points="${hexPolygon(hexagon.axes.map((a) => radiusOf(a.value as number)))}" ` +
        `fill="${COLOR.accent}" fill-opacity="0.12" stroke="${COLOR.accent}" stroke-width="1.4"/>`,
    )
  }
  if (empty) {
    g(
      `<polygon points="${hexRing(HEX_RADIUS * 0.34)}" fill="${COLOR.line}" fill-opacity="0.55" ` +
        `stroke="${COLOR.line}" stroke-width="2"/>`,
    )
  }

  foe?.axes.forEach((a, index) => {
    if (a.value === null) return
    const point = hexPoint(index, radiusOf(a.value))
    g(
      `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="${HEX_DOT_RADIUS}" ` +
        `fill="none" stroke="${COLOR.text}" stroke-width="1"/>`,
    )
  })
  hexagon.axes.forEach((a, index) => {
    if (a.value === null) return
    const point = hexPoint(index, radiusOf(a.value))
    g(
      `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="${HEX_DOT_RADIUS}" fill="${COLOR.accent}"/>`,
    )
  })

  /* 축 이름만. 값은 아래 목록이 맡는다 */
  hexagon.axes.forEach((a, index) => {
    const at = axisLabelAnchor(index)
    g(
      `<text x="${at.x}" y="${at.y}" text-anchor="${at.anchor}" font-size="9" fill="${COLOR.textStrong}">` +
        `${escape(a.label)}</text>`,
    )
  })

  const dx = (CARD_WIDTH - 260 * HEX_SCALE) / 2
  return `<g transform="translate(${dx.toFixed(1)},${HEX_TOP}) scale(${HEX_SCALE.toFixed(4)})">${parts.join('')}</g>`
}

function cardSvg(
  title: string,
  hexagon: ClanHexV2,
  offsetX: number,
  compare?: { hexagon: ClanHexV2; name: string; ourName: string },
): string {
  const parts: string[] = []
  const g = (inner: string) => parts.push(inner)
  const foe = compare?.hexagon
  const empty = hexagon.measured === 0 && (foe === undefined || foe.measured === 0)

  g(
    `<rect x="0.5" y="0.5" width="${CARD_WIDTH - 1}" height="${CARD_HEIGHT - 1}" ` +
      `fill="${COLOR.card}" stroke="${COLOR.line}"/>`,
  )
  g(`<text x="14" y="22" font-size="12" fill="${COLOR.textStrong}">${escape(title)}</text>`)

  /* 머리말 오른쪽 — 다 쟀으면 `측정중` 을 적지 않는다 */
  const head: string[] = []
  if (hexagon.measured < 6) head.push(`측정중 ${hexagon.measured}/6`)
  if (axisOf(hexagon, 'attackZone'))
    head.push(`구역 ${hexagon.zoneLabelsUsed}/${hexagon.zoneLabelsTotal}`)
  if (head.length > 0) {
    g(
      `<text x="${CARD_WIDTH - 14}" y="22" text-anchor="end" font-size="10" fill="${COLOR.meta}">` +
        `${escape(head.join('  '))}</text>`,
    )
  }

  g(hexGroup(hexagon, foe))

  let y = HEX_TOP + 208 * HEX_SCALE + 16

  if (empty) {
    g(
      `<text x="${CARD_WIDTH / 2}" y="${y}" text-anchor="middle" font-size="10" fill="${COLOR.meta}">` +
        `배틀로그가 아직 없습니다</text>`,
    )
    y += 16
  }

  /* 범례 — 채운 네모 / 빈 네모 */
  if (compare !== undefined) {
    g(`<rect x="70" y="${y - 8}" width="8" height="8" fill="${COLOR.accent}" fill-opacity="0.12" stroke="${COLOR.accent}"/>`)
    g(`<text x="83" y="${y}" font-size="10" fill="${COLOR.textStrong}">${escape(compare.ourName)}</text>`)
    g(`<rect x="170" y="${y - 8}" width="8" height="8" fill="none" stroke="${COLOR.text}"/>`)
    g(`<text x="183" y="${y}" font-size="10" fill="${COLOR.meta}">${escape(compare.name)}</text>`)
    y += 16
  }

  /* 값 목록 여섯 줄 — 얼룩무늬 없이 1px 선으로만 나눈다 */
  hexagon.axes.forEach((a, index) => {
    const rowY = y + index * 17
    g(`<text x="14" y="${rowY}" font-size="10" fill="${COLOR.meta}">${escape(a.label)}</text>`)
    if (compare === undefined) {
      g(
        `<text x="${CARD_WIDTH - 14}" y="${rowY}" text-anchor="end" font-size="10" ` +
          `fill="${a.value === null ? COLOR.meta : COLOR.accent}">${escape(a.text)}</text>`,
      )
    } else {
      const foeAxis = axisOf(foe, a.key)
      g(
        `<text x="${CARD_WIDTH - 84}" y="${rowY}" text-anchor="end" font-size="10" ` +
          `fill="${a.value === null ? COLOR.meta : COLOR.accent}">${escape(a.text)}</text>`,
      )
      g(
        `<text x="${CARD_WIDTH - 14}" y="${rowY}" text-anchor="end" font-size="10" ` +
          `fill="${(foeAxis?.value ?? null) === null ? COLOR.meta : COLOR.text}">` +
          `${escape(foeAxis?.text ?? '측정중')}</text>`,
      )
    }
    if (index < 5) {
      g(
        `<line x1="14" y1="${rowY + 5}" x2="${CARD_WIDTH - 14}" y2="${rowY + 5}" stroke="${COLOR.lineSoft}"/>`,
      )
    }
  })
  y += 6 * 17 + 6

  g(
    `<text x="14" y="${y}" font-size="9" fill="${COLOR.meta}">` +
      `경기 ${hexagon.matches.toLocaleString('ko-KR')} · 레드 라운드 ` +
      `${hexagon.redRounds.toLocaleString('ko-KR')}/${hexagon.rounds.toLocaleString('ko-KR')}</text>`,
  )
  y += 13

  const reasons: string[] = []
  for (const a of [...hexagon.axes, ...(foe?.axes ?? [])]) {
    if (a.pending === null) continue
    const text = PENDING_TEXT[a.pending]
    if (text && !reasons.includes(text)) reasons.push(text)
  }
  if (reasons.length > 0) {
    g(`<text x="14" y="${y}" font-size="9" fill="${COLOR.meta}">${escape(reasons.join(' · '))}</text>`)
  }

  return `<g transform="translate(${offsetX},0)">${parts.join('')}</g>`
}

function main(): void {
  const outIndex = process.argv.indexOf('--out')
  const out = outIndex >= 0 ? process.argv[outIndex + 1] : 'clanHexV2.svg'
  if (!out) throw new Error('--out <파일> 이 필요하다')

  /* ① 여섯 축을 다 쟀다 */
  const full = makeHexagon(
    [0.72, 0.54, 0.38, 0.81, 0.46, 0.63],
    ['62%', '48%', '31%', '18.3초', '41%', '27%'],
    [null, null, null, null, null, null],
    { matches: 42, rounds: 618, redRounds: 311 },
  )

  /* ② 셋만 쟀다 — 나머지는 재료가 없다. **도형을 잇지 않는다** (D-106) */
  const partial = makeHexagon(
    [0.58, 0.44, null, null, null, 0.29],
    ['54%', '39%', '측정중', '측정중', '측정중', '12%'],
    [null, null, 'battlelog', 'side', 'foeSniper', null],
    { matches: 9, rounds: 121, redRounds: 58 },
  )

  /* ③ 두 클랜을 겹쳐 그린다 (경기 상세). 상대는 선만, 채움 없음 */
  const foe = makeHexagon(
    [0.45, 0.83, 0.62, 0.35, 0.71, 0.4],
    ['38%', '74%', '52%', '26.1초', '63%', '17%'],
    [null, null, null, null, null, null],
    { matches: 1, rounds: 17, redRounds: 9 },
  )
  const ours = makeHexagon(
    [0.9, 0.5, 0.41, 0.78, 0.36, 0.66],
    ['76%', '45%', '34%', '19.4초', '32%', '28%'],
    [null, null, null, null, null, null],
    { matches: 1, rounds: 17, redRounds: 8 },
  )

  const cards = [
    cardSvg('① 여섯 축을 다 쟀다', full, 0),
    /* 제목이 길면 오른쪽 머리말(`측정중 3/6 구역 2/4`)과 겹친다 — 짧게 적는다 */
    cardSvg('② 셋만 쟀다', partial, CARD_WIDTH),
    cardSvg('③ 두 클랜 겹쳐 그리기 (경기 상세)', ours, CARD_WIDTH * 2, {
      hexagon: foe,
      name: '상대클랜',
      ourName: '우리클랜',
    }),
  ]

  const width = CARD_WIDTH * cards.length
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${CARD_HEIGHT}" ` +
    `viewBox="0 0 ${width} ${CARD_HEIGHT}" font-family="sans-serif">` +
    `<rect width="${width}" height="${CARD_HEIGHT}" fill="${COLOR.page}"/>` +
    cards.join('') +
    '</svg>'
  writeFileSync(out, svg, 'utf8')
  console.info('그렸다:', out)
  console.info('⚠ 값은 전부 가짜다. 좌표·문구·색만 실제 컴포넌트와 같다')
}

main()
