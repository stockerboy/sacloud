/**
 * 전투력 육각형을 **파일로** 그린다 (D-185 · D-194).
 *
 * 운영 코드가 아니다. 이 컴퓨터에서 개발 서버가 뜨지 않아(D-187 · listen EFAULT)
 * 화면을 눈으로 볼 수 없어서, 실제 데이터로 그림만이라도 확인하려고 만들었다.
 *
 * **화면 검수를 대신하지 못한다.** 좌표·문구·색은 실제 컴포넌트와 같은 함수를 쓰지만
 * (`@sacloud/ui` 의 `traitCopy` · `packages/ui/src/styles.css` 의 토큰 값),
 * 레이아웃·반응형·폰트는 브라우저에서 봐야 안다.
 *
 * ```
 * npx tsx apps/web/scripts/hexagonPreview.mts --out hexagon.svg
 * ```
 */
import { writeFileSync } from 'node:fs'
import { prisma } from '@sacloud/db'
import type { TraitHexagon } from '@sacloud/contract'
/* **실제 화면이 쓰는 바로 그 질의를 부른다.** 여기서 규칙을 흉내내면 그림과 화면이 갈린다 —
   실제로 처음엔 흉내냈다가 모집단이 무기별로 안 갈리는 버그를 만들었다 */
import { playerTraits } from '../lib/server/queries/playerTraits'
import {
  HEX_CENTER,
  HEX_RADIUS,
  axisLabelAnchor,
  hexPoint,
  hexPolygon,
  hexRing,
  pendingSummary,
  topPercentText,
} from '@sacloud/ui'

/** `packages/ui/src/styles.css` 의 토큰 실측값. 여기서 새 색을 만들지 않는다 */
const COLOR = {
  side: '#1e293b',
  sideLine: '#334155',
  sideMeta: '#94a3b8',
  line: '#d1d5db',
  win: '#0ea5e9',
} as const

const CARD_WIDTH = 300
const CARD_HEIGHT = 260

function radiusOf(percentile: number): number {
  return Math.max(3, (Math.min(100, Math.max(0, percentile)) / 100) * HEX_RADIUS)
}

function cardSvg(traits: TraitHexagon, name: string, offsetX: number): string {
  const parts: string[] = []
  const g = (inner: string) => parts.push(inner)

  g(`<rect x="0" y="0" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="${COLOR.side}"/>`)
  g(`<text x="12" y="24" font-size="13" fill="${COLOR.line}">${escape(name)}</text>`)
  /* **다 쟀으면 `측정중` 이라고 적지 않는다.** 실제 컴포넌트가 `traits.measuring` 으로
     가르는 것과 같은 규칙이다 — 여기서 조건을 빠뜨려 6/6 인데 "측정중 6/6" 이 찍혔었다 */
  if (traits.measuring) {
    g(
      `<text x="${CARD_WIDTH - 12}" y="24" text-anchor="end" font-size="10" fill="${COLOR.sideMeta}">` +
        `전투력 측정중 ${traits.measured}/6</text>`,
    )
  }

  /* 눈금 세 겹 */
  for (const scale of [1, 2 / 3, 1 / 3]) {
    g(`<polygon points="${hexRing(HEX_RADIUS * scale)}" fill="none" stroke="${COLOR.sideLine}"/>`)
  }
  /* 축 여섯 줄 — 못 잰 축은 점선 */
  traits.axes.forEach((axis, index) => {
    const end = hexPoint(index, HEX_RADIUS)
    const dash = axis.percentile === null ? ' stroke-dasharray="3 3"' : ''
    g(
      `<line x1="${HEX_CENTER.x}" y1="${HEX_CENTER.y}" x2="${end.x.toFixed(1)}" y2="${end.y.toFixed(1)}" ` +
        `stroke="${COLOR.sideLine}"${dash}/>`,
    )
  })

  if (traits.axes.every((axis) => axis.percentile !== null)) {
    const points = hexPolygon(traits.axes.map((axis) => radiusOf(axis.percentile as number)))
    g(`<polygon points="${points}" fill="${COLOR.win}" fill-opacity="0.35" stroke="${COLOR.win}" stroke-width="2"/>`)
  }
  if (traits.measured === 0) {
    g(
      `<polygon points="${hexRing(HEX_RADIUS * 0.34)}" fill="${COLOR.sideLine}" fill-opacity="0.55" ` +
        `stroke="${COLOR.sideLine}" stroke-width="2"/>`,
    )
  }
  traits.axes.forEach((axis, index) => {
    if (axis.percentile === null) return
    const point = hexPoint(index, radiusOf(axis.percentile))
    g(`<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="3.5" fill="${COLOR.win}"/>`)
  })
  traits.axes.forEach((axis, index) => {
    const at = axisLabelAnchor(index)
    const top = topPercentText(axis.percentile)
    g(
      `<text x="${at.x}" y="${at.y}" text-anchor="${at.anchor}" font-size="10" fill="${COLOR.line}">` +
        `${escape(axis.label)}</text>`,
    )
    g(
      `<text x="${at.x}" y="${at.y + 12}" text-anchor="${at.anchor}" font-size="10" ` +
        `fill="${top === null ? COLOR.sideMeta : COLOR.win}">${escape(top ?? '측정중')}</text>`,
    )
  })

  const cohortLine =
    traits.weapon === null || traits.cohort === null
      ? ''
      : `같은 ${traits.weapon === 1 ? '스나수' : '라플수'} ${traits.cohort.toLocaleString('ko-KR')}명 안에서 견줬습니다`
  if (cohortLine) g(`<text x="12" y="${CARD_HEIGHT - 26}" font-size="9" fill="${COLOR.sideMeta}">${escape(cohortLine)}</text>`)
  const summary = pendingSummary(traits.axes)
  if (summary) g(`<text x="12" y="${CARD_HEIGHT - 12}" font-size="9" fill="${COLOR.sideMeta}">${escape(summary)}</text>`)

  return `<g transform="translate(${offsetX},0)">${parts.join('')}</g>`
}

function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

async function main(): Promise<void> {
  const outIndex = process.argv.indexOf('--out')
  const out = outIndex >= 0 ? process.argv[outIndex + 1] : 'hexagon.svg'
  if (!out) throw new Error('--out <파일> 이 필요하다')

  const slugIndex = process.argv.indexOf('--league')
  const slug = slugIndex >= 0 ? (process.argv[slugIndex + 1] ?? 'sanply') : 'sanply'
  const league = await prisma.league.findFirst({ where: { slug }, select: { id: true } })
  if (!league) throw new Error(`리그를 찾지 못했다: ${slug}`)

  /* 라운드 자료가 많은 순으로 셋. 실제 선수다 */
  const picks = await prisma.$queryRawUnsafe<{ id: string; name: string }[]>(
    `select pl.id, pl.name from "PlayerRoundProfile" pr join "Player" pl on pl.id = pr."playerId"
     where pr.alone >= 15 order by pr.matches desc limit 12`,
  )

  const cards: string[] = []
  let index = 0
  for (const pick of picks) {
    const { traits } = await playerTraits(league.id, pick.id)
    /* 그 리그에서 주무기가 안 잡히는 선수는 여섯 축이 전부 `측정중` 이라 그림이 뜻이 없다 */
    if (traits.weapon === null) continue
    cards.push(cardSvg(traits, pick.name, index * CARD_WIDTH))
    index += 1
    if (index >= 3) break
  }

  const width = Math.max(1, index) * CARD_WIDTH
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${CARD_HEIGHT}" ` +
    `viewBox="0 0 ${width} ${CARD_HEIGHT}" font-family="sans-serif">` +
    cards.join('') +
    '</svg>'
  writeFileSync(out, svg, 'utf8')
  console.info('그렸다:', out, '· 선수', index, '명')
  console.info('⚠ 화면 검수를 대신하지 못한다. 좌표·문구·색만 실제와 같다')
}

main()
  .catch((error) => console.error(error))
  .finally(() => prisma.$disconnect())
