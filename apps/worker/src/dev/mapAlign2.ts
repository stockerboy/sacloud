/**
 * 미니맵 정렬 2차 — **가로·세로를 따로 늘린다** (D-174).
 *
 * 1차(`mapAlign.ts`)는 확대율 하나만 썼는데 탐색 경계에 붙었다.
 * 그 말은 **좌표 공간과 그림이 단순 비례가 아닐 수 있다**는 뜻이다
 * (넥슨이 게임 좌표를 그릴 때 축마다 다르게 늘렸을 수 있다).
 *
 * 그래서 여기서는 `가로배율 · 세로배율 · 이동`(4개)을 찾는다.
 * 먼저 **네모 대 네모**로 대충 맞추고(좌표 구름 ↔ 맵 구조), 그 근처를 조밀하게 훑는다.
 *
 * 읽기만 한다.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { prisma } from '@sacloud/db'
import { positionPointsOf, type MapPoint } from '@sacloud/nexon'
import { REPO_ROOT } from '../lib/env.js'

function stringArg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback
}

interface Mask {
  width: number
  height: number
  bits: Uint8Array
}

function readMask(file: string): Mask {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/)
  const [width, height] = (lines[0] ?? '').split(' ').map(Number)
  if (!width || !height) throw new Error('마스크 머리글을 읽지 못했다')
  const bits = new Uint8Array(width * height)
  for (let y = 0; y < height; y += 1) {
    const row = lines[y + 1] ?? ''
    for (let x = 0; x < width; x += 1) bits[y * width + x] = row.charCodeAt(x) === 49 ? 1 : 0
  }
  return { width, height, bits }
}

function dilate(mask: Mask, radius: number): Mask {
  const out = new Uint8Array(mask.bits.length)
  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      if (mask.bits[y * mask.width + x] !== 1) continue
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= mask.width || ny >= mask.height) continue
          out[ny * mask.width + nx] = 1
        }
      }
    }
  }
  return { ...mask, bits: out }
}

interface Fit {
  sx: number
  sy: number
  dx: number
  dy: number
}

function hitRate(points: readonly MapPoint[], mask: Mask, fit: Fit): number {
  let hit = 0
  for (const point of points) {
    const x = Math.round(point.x * fit.sx + fit.dx)
    const y = Math.round(point.y * fit.sy + fit.dy)
    if (x < 0 || y < 0 || x >= mask.width || y >= mask.height) continue
    if (mask.bits[y * mask.width + x] === 1) hit += 1
  }
  return hit / points.length
}

/** 마스크에서 맵 구조가 차지하는 네모 */
function maskBounds(mask: Mask): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = mask.width
  let minY = mask.height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      if (mask.bits[y * mask.width + x] !== 1) continue
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  return { minX, minY, maxX, maxY }
}

async function main(): Promise<void> {
  const mask = readMask(stringArg('mask', ''))
  const fat = dilate(mask, 2)

  const rows = await prisma.barracksBattleLogRaw.findMany({ select: { payload: true } })
  const points: MapPoint[] = []
  for (const row of rows) {
    const payload = row.payload as { battleLog?: unknown } | null
    const events = Array.isArray(payload?.battleLog) ? payload.battleLog : []
    points.push(...positionPointsOf(events as never[]))
  }

  const cloud = points.reduce(
    (acc, p) => ({
      minX: Math.min(acc.minX, p.x),
      minY: Math.min(acc.minY, p.y),
      maxX: Math.max(acc.maxX, p.x),
      maxY: Math.max(acc.maxY, p.y),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  )
  const bounds = maskBounds(mask)
  console.log(`좌표 ${points.length.toLocaleString()}점`)
  console.log(`좌표 네모  x ${cloud.minX}~${cloud.maxX} (${cloud.maxX - cloud.minX}) · y ${cloud.minY}~${cloud.maxY} (${cloud.maxY - cloud.minY})`)
  console.log(`구조 네모  x ${bounds.minX}~${bounds.maxX} (${bounds.maxX - bounds.minX}) · y ${bounds.minY}~${bounds.maxY} (${bounds.maxY - bounds.minY})`)

  /* 네모 대 네모 — 출발점 */
  const seed: Fit = {
    sx: (bounds.maxX - bounds.minX) / (cloud.maxX - cloud.minX),
    sy: (bounds.maxY - bounds.minY) / (cloud.maxY - cloud.minY),
    dx: 0,
    dy: 0,
  }
  seed.dx = bounds.minX - cloud.minX * seed.sx
  seed.dy = bounds.minY - cloud.minY * seed.sy
  console.log(
    `네모 맞춤 — 가로배율 ${seed.sx.toFixed(3)} 세로배율 ${seed.sy.toFixed(3)} 이동 ${seed.dx.toFixed(1)},${seed.dy.toFixed(1)} · 적중 ${(hitRate(points, fat, seed) * 100).toFixed(1)}%`,
  )

  /* 그 근처를 훑는다 */
  let best = { fit: seed, hit: hitRate(points, fat, seed) }
  for (let sx = seed.sx * 0.8; sx <= seed.sx * 1.25; sx += seed.sx * 0.01) {
    for (let sy = seed.sy * 0.8; sy <= seed.sy * 1.25; sy += seed.sy * 0.01) {
      for (let dx = seed.dx - 60; dx <= seed.dx + 60; dx += 4) {
        for (let dy = seed.dy - 60; dy <= seed.dy + 60; dy += 4) {
          const fit = { sx, sy, dx, dy }
          const hit = hitRate(points, fat, fit)
          if (hit > best.hit) best = { fit, hit }
        }
      }
    }
  }
  console.log(
    `훑은 뒤 — 가로 ${best.fit.sx.toFixed(4)} 세로 ${best.fit.sy.toFixed(4)} 이동 ${best.fit.dx.toFixed(1)},${best.fit.dy.toFixed(1)} · 적중 ${(best.hit * 100).toFixed(1)}%`,
  )

  const out = path.join(REPO_ROOT, 'data', 'barracks', 'map-align.json')
  writeFileSync(
    out,
    JSON.stringify(
      {
        note: '배틀로그 좌표 → 미니맵 그림 픽셀. 픽셀x = 좌표x * scaleX + offsetX (세로도 같은 방식)',
        maskWidth: mask.width,
        maskHeight: mask.height,
        scaleX: Number(best.fit.sx.toFixed(4)),
        scaleY: Number(best.fit.sy.toFixed(4)),
        offsetX: Number(best.fit.dx.toFixed(1)),
        offsetY: Number(best.fit.dy.toFixed(1)),
        hitRate: Number((best.hit * 100).toFixed(2)),
        points: points.length,
      },
      null,
      2,
    ),
    'utf8',
  )
  console.log(`저장 — ${out}`)
  await prisma.$disconnect()
}

main().catch(async (error: unknown) => {
  console.error(error)
  await prisma.$disconnect()
  process.exit(1)
})
