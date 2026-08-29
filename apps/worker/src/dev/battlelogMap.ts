/**
 * 배틀로그 좌표 지도 — **구역 이름을 사람이 붙이라고 그리는 그림** (D-174).
 *
 * 저장된 배틀로그 원문에서 킬·데스 좌표를 전부 꺼내 밀도로 그린다.
 * 격자에 `A1` `B3` 같은 이름표를 달아 두어, 보는 사람이
 * "A1~C4 는 2층" 처럼 **말로 구역을 지정할 수 있게** 한다.
 *
 * 읽기만 한다. 아무것도 쓰지 않는다.
 *
 * ```bash
 * pnpm --filter @sacloud/worker exec tsx src/dev/battlelogMap.ts
 * pnpm --filter @sacloud/worker exec tsx src/dev/battlelogMap.ts --cell 25 --out 지도.svg
 * ```
 */
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { prisma } from '@sacloud/db'
import { positionPointsOf, type ZoneMap } from '@sacloud/nexon'
import { readFileSync } from 'node:fs'
import { REPO_ROOT } from '../lib/env.js'

function numberArg(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`)
  if (index < 0) return fallback
  const value = Number(process.argv[index + 1])
  return Number.isFinite(value) ? value : fallback
}

function stringArg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback
}

/** 격자 한 칸 크기. 이름표를 붙일 단위다 */
const LABEL_CELL = numberArg('cell', 50)
/** 밀도를 그릴 칸 크기 — 이름표 칸보다 잘게 */
const HEAT_CELL = numberArg('heat', 10)

function columnName(index: number): string {
  /* A, B, ... Z, AA, AB ... */
  let name = ''
  let n = index
  while (n >= 0) {
    name = String.fromCharCode(65 + (n % 26)) + name
    n = Math.floor(n / 26) - 1
  }
  return name
}

async function main(): Promise<void> {
  const rows = await prisma.barracksBattleLogRaw.findMany({ select: { payload: true } })

  const heat = new Map<string, number>()
  let total = 0
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const row of rows) {
    const payload = row.payload as { battleLog?: unknown } | null
    const events = Array.isArray(payload?.battleLog) ? payload.battleLog : []
    for (const point of positionPointsOf(events as never[])) {
      total += 1
      minX = Math.min(minX, point.x)
      minY = Math.min(minY, point.y)
      maxX = Math.max(maxX, point.x)
      maxY = Math.max(maxY, point.y)
      const key = `${Math.floor(point.x / HEAT_CELL)},${Math.floor(point.y / HEAT_CELL)}`
      heat.set(key, (heat.get(key) ?? 0) + 1)
    }
  }

  if (total === 0) {
    console.log('좌표가 하나도 없다. 배틀로그를 먼저 적재해라')
    await prisma.$disconnect()
    return
  }

  /* 이름표 칸 경계에 맞춰 넉넉하게 자른다.
     배경 그림을 깔면 **그림 전체가 보이도록** 넓힌다 — 좌표가 없는 구석도 이름을 붙여야 하니까 */
  const imageW = numberArg('img-w', 0)
  const imageH = numberArg('img-h', 0)
  const x0 = Math.floor(Math.min(minX, imageW > 0 ? 0 : minX) / LABEL_CELL) * LABEL_CELL
  const y0 = Math.floor(Math.min(minY, imageH > 0 ? 0 : minY) / LABEL_CELL) * LABEL_CELL
  const x1 = Math.ceil(Math.max(maxX, imageW) / LABEL_CELL) * LABEL_CELL
  const y1 = Math.ceil(Math.max(maxY, imageH) / LABEL_CELL) * LABEL_CELL

  const peak = Math.max(...heat.values())
  const margin = 46
  const width = x1 - x0
  const height = y1 - y0

  /* 지금 쓰고 있는 구역 지도도 같이 그린다 — 무엇이 이미 정해져 있는지 보이게.
     파일이 없으면 그냥 안 그린다 (구역을 새로 정하는 중일 수 있다) */
  const zonemap = ((): ZoneMap | null => {
    try {
      return JSON.parse(
        readFileSync(path.join(REPO_ROOT, 'data', 'barracks', 'zonemap.json'), 'utf8'),
      ) as ZoneMap
    } catch {
      return null
    }
  })()
  const ZONE_COLOR: Record<string, string> = {
    '2F': '#a855f7',
    B: '#eab308',
    SHORT: '#38bdf8',
  }

  /**
   * 미니맵 그림을 배경으로 깔 수 있다.
   *
   * 좌표가 **그 그림의 픽셀 좌표 그대로**라고 보고 1:1 로 얹는다
   * (넥슨이 그 그림 위에 킬 지점을 찍으므로 그럴 가능성이 높다 — 확인 필요).
   * 어긋나면 `--img-scale` · `--img-dx` · `--img-dy` 로 밀고 늘린다.
   */
  const imagePath = stringArg('image', '')
  let backgroundTag = ''
  if (imagePath) {
    const bytes = readFileSync(imagePath)
    const ext = path.extname(imagePath).toLowerCase()
    const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'image/png'
    const scale = numberArg('img-scale', 1)
    const dx = numberArg('img-dx', 0)
    const dy = numberArg('img-dy', 0)
    const imgWidth = imageW
    const imgHeight = imageH
    const sizeAttr =
      imgWidth > 0 && imgHeight > 0
        ? ` width="${imgWidth * scale}" height="${imgHeight * scale}"`
        : ''
    backgroundTag =
      `<image x="${dx}" y="${dy}"${sizeAttr} opacity="0.85" ` +
      `xlink:href="data:${mime};base64,${bytes.toString('base64')}" ` +
      `href="data:${mime};base64,${bytes.toString('base64')}"/>`
  }

  const parts: string[] = []
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width + margin * 2}" height="${height + margin * 2}" viewBox="0 0 ${width + margin * 2} ${height + margin * 2}" font-family="sans-serif">`,
    `<rect width="100%" height="100%" fill="#0b1020"/>`,
    `<g transform="translate(${margin - x0} ${margin - y0})">`,
    backgroundTag,
  )

  /* 밀도. 배경 그림이 있으면 그림이 보이도록 옅게 깐다 */
  const heatMax = imagePath ? 0.55 : 0.85
  for (const [key, count] of heat) {
    const [cx = 0, cy = 0] = key.split(',').map(Number)
    const x = cx * HEAT_CELL
    const y = cy * HEAT_CELL
    const alpha = Math.min(1, 0.1 + Math.sqrt(count / peak) * heatMax)
    parts.push(
      `<rect x="${x}" y="${y}" width="${HEAT_CELL}" height="${HEAT_CELL}" fill="#f97316" opacity="${alpha.toFixed(3)}"/>`,
    )
  }

  /* 이미 정해 둔 구역 */
  if (zonemap) {
    for (const [key, zone] of Object.entries(zonemap.zone)) {
      const [cx = 0, cy = 0] = key.split(',').map(Number)
      const color = ZONE_COLOR[zone] ?? '#94a3b8'
      parts.push(
        `<rect x="${cx * zonemap.cell}" y="${cy * zonemap.cell}" width="${zonemap.cell}" height="${zonemap.cell}" fill="none" stroke="${color}" stroke-width="1" opacity="0.55"/>`,
      )
    }
  }

  /* 이름표 격자 */
  for (let x = x0; x <= x1; x += LABEL_CELL) {
    parts.push(`<line x1="${x}" y1="${y0}" x2="${x}" y2="${y1}" stroke="#64748b" stroke-width="0.6" opacity="0.8"/>`)
  }
  for (let y = y0; y <= y1; y += LABEL_CELL) {
    parts.push(`<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="#64748b" stroke-width="0.6" opacity="0.8"/>`)
  }

  /* 칸 이름 (A1 · B2 ...) */
  const columns = Math.round((x1 - x0) / LABEL_CELL)
  const rowsCount = Math.round((y1 - y0) / LABEL_CELL)
  for (let c = 0; c < columns; c += 1) {
    for (let r = 0; r < rowsCount; r += 1) {
      const cellX = x0 + c * LABEL_CELL
      const cellY = y0 + r * LABEL_CELL
      parts.push(
        `<text x="${cellX + 3}" y="${cellY + 12}" fill="#e2e8f0" font-size="11" opacity="0.75">${columnName(c)}${r + 1}</text>`,
      )
    }
  }
  parts.push('</g>')

  /* 축 눈금 — 실제 좌표값 */
  for (let c = 0; c <= columns; c += 1) {
    const x = margin + c * LABEL_CELL
    parts.push(
      `<text x="${x}" y="${margin - 14}" fill="#94a3b8" font-size="11" text-anchor="middle">${x0 + c * LABEL_CELL}</text>`,
    )
  }
  for (let r = 0; r <= rowsCount; r += 1) {
    const y = margin + r * LABEL_CELL
    parts.push(
      `<text x="${margin - 8}" y="${y + 4}" fill="#94a3b8" font-size="11" text-anchor="end">${y0 + r * LABEL_CELL}</text>`,
    )
  }

  parts.push(
    `<text x="${margin}" y="20" fill="#f8fafc" font-size="14">배틀로그 킬·데스 좌표 ${total.toLocaleString()}점 · 경기 ${rows.length}건</text>`,
    `<text x="${margin}" y="${height + margin + 26}" fill="#94a3b8" font-size="12">칸 ${LABEL_CELL} 단위 · 보라=2층 노랑=B 하늘=숏 (지금 쓰는 구역)</text>`,
    '</svg>',
  )

  const out = stringArg('out', path.join(REPO_ROOT, 'data', 'barracks', 'battlelog-map.svg'))
  writeFileSync(out, parts.join('\n'), 'utf8')
  console.log(`좌표 ${total.toLocaleString()}점 · 경기 ${rows.length}건`)
  console.log(`범위 x ${minX}~${maxX} · y ${minY}~${maxY}`)
  console.log(`격자 ${columns} x ${rowsCount} (칸 ${LABEL_CELL})`)
  console.log(`저장 — ${out}`)
  await prisma.$disconnect()
}

main().catch(async (error: unknown) => {
  console.error(error)
  await prisma.$disconnect()
  process.exit(1)
})
