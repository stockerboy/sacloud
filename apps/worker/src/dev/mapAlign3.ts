/**
 * 미니맵 정렬 3차 — **거칠게 훑고 곱게 다듬는다** (D-174).
 *
 * 1·2차가 실패한 이유를 먼저 적어 둔다.
 *   1차: 그림을 줄일수록 유리해지는 함정 → 무작위 점 대비로 고쳤다
 *   2차: **마스크가 틀렸다.** 노란 글씨·배경 격자까지 맵 구조로 잡아
 *        이미지 전체가 구조가 됐다. 청록 선만 남기도록 다시 만들었다
 *
 * 여기서는 계산량을 줄이려고 두 단계로 나눈다.
 *   거친 단계: 마스크를 1/4 로 줄이고 좌표도 표본만 써서 넓게 훑는다
 *   고운 단계: 이긴 값 근처만 원래 해상도로 다시 훑는다
 *
 * 점수는 **무작위 대비 몇 배**다. 그래야 "줄이면 이긴다" 를 막는다.
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

/** 선 주변을 부풀린다 — 좌표는 벽에 딱 붙지 않고 근처에 찍힌다 */
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

/** 1/factor 로 줄인다. 한 칸이라도 구조면 구조로 본다 */
function shrink(mask: Mask, factor: number): Mask {
  const width = Math.ceil(mask.width / factor)
  const height = Math.ceil(mask.height / factor)
  const bits = new Uint8Array(width * height)
  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      if (mask.bits[y * mask.width + x] !== 1) continue
      bits[Math.floor(y / factor) * width + Math.floor(x / factor)] = 1
    }
  }
  return { width, height, bits }
}

function hitRate(points: readonly MapPoint[], mask: Mask, scale: number, dx: number, dy: number): number {
  let hit = 0
  for (const point of points) {
    const x = Math.round(point.x * scale + dx)
    const y = Math.round(point.y * scale + dy)
    if (x < 0 || y < 0 || x >= mask.width || y >= mask.height) continue
    if (mask.bits[y * mask.width + x] === 1) hit += 1
  }
  return hit / points.length
}

function ratio(
  points: readonly MapPoint[],
  random: readonly MapPoint[],
  mask: Mask,
  scale: number,
  dx: number,
  dy: number,
): number {
  const base = hitRate(random, mask, scale, dx, dy)
  if (base <= 0.002) return 0
  return hitRate(points, mask, scale, dx, dy) / base
}

async function main(): Promise<void> {
  const mask = readMask(stringArg('mask', ''))
  const fat = dilate(mask, 2)
  const coarse = shrink(fat, 4)

  const rows = await prisma.barracksBattleLogRaw.findMany({ select: { payload: true } })
  const all: MapPoint[] = []
  for (const row of rows) {
    const payload = row.payload as { battleLog?: unknown } | null
    const events = Array.isArray(payload?.battleLog) ? payload.battleLog : []
    all.push(...positionPointsOf(events as never[]))
  }
  /* 표본 — 앞에서부터 균등하게 고른다(결정적) */
  const sample = all.filter((_, index) => index % 16 === 0)
  const bounds = all.reduce(
    (acc, p) => ({
      minX: Math.min(acc.minX, p.x),
      minY: Math.min(acc.minY, p.y),
      maxX: Math.max(acc.maxX, p.x),
      maxY: Math.max(acc.maxY, p.y),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  )
  const random: MapPoint[] = []
  for (let i = 0; i < 40; i += 1) {
    for (let j = 0; j < 40; j += 1) {
      random.push({
        x: bounds.minX + ((bounds.maxX - bounds.minX) * i) / 39,
        y: bounds.minY + ((bounds.maxY - bounds.minY) * j) / 39,
      })
    }
  }
  console.log(`좌표 ${all.length.toLocaleString()}점 (표본 ${sample.length}) · 마스크 ${mask.width}x${mask.height} → 거친 ${coarse.width}x${coarse.height}`)

  /* ---- 거친 단계 (1/4 해상도) ---- */
  let best = { scale: 1, dx: 0, dy: 0, ratio: 0 }
  for (let scale = 0.7; scale <= 1.8; scale += 0.02) {
    const cs = scale / 4
    for (let cdx = -70; cdx <= 90; cdx += 1) {
      for (let cdy = -70; cdy <= 90; cdy += 1) {
        const value = ratio(sample, random, coarse, cs, cdx, cdy)
        if (value > best.ratio) best = { scale, dx: cdx * 4, dy: cdy * 4, ratio: value }
      }
    }
  }
  console.log(`거친 단계 — 배율 ${best.scale.toFixed(3)} · 이동 ${best.dx},${best.dy} · 무작위 대비 ${best.ratio.toFixed(2)}배`)

  /* ---- 고운 단계 (원래 해상도) ---- */
  const seed = { ...best }
  best.ratio = 0
  for (let scale = seed.scale - 0.06; scale <= seed.scale + 0.06; scale += 0.005) {
    for (let dx = seed.dx - 10; dx <= seed.dx + 10; dx += 1) {
      for (let dy = seed.dy - 10; dy <= seed.dy + 10; dy += 1) {
        const value = ratio(sample, random, fat, scale, dx, dy)
        if (value > best.ratio) best = { scale, dx, dy, ratio: value }
      }
    }
  }
  const finalHit = hitRate(all, fat, best.scale, best.dx, best.dy)
  const randomHit = hitRate(random, fat, best.scale, best.dx, best.dy)
  console.log(`고운 단계 — 배율 ${best.scale.toFixed(4)} · 이동 ${best.dx},${best.dy} · 무작위 대비 ${best.ratio.toFixed(2)}배`)
  console.log(`전체 좌표 적중 ${(finalHit * 100).toFixed(1)}% (무작위 ${(randomHit * 100).toFixed(1)}%)`)
  console.log(
    `좌표 ${bounds.minX},${bounds.minY} → 픽셀 ${Math.round(bounds.minX * best.scale + best.dx)},${Math.round(bounds.minY * best.scale + best.dy)} · ` +
      `${bounds.maxX},${bounds.maxY} → ${Math.round(bounds.maxX * best.scale + best.dx)},${Math.round(bounds.maxY * best.scale + best.dy)}`,
  )

  const out = path.join(REPO_ROOT, 'data', 'barracks', 'map-align.json')
  writeFileSync(
    out,
    JSON.stringify(
      {
        note: '배틀로그 좌표 → 미니맵 그림 픽셀. 픽셀 = 좌표 * scale + offset (마스크 크기 기준)',
        maskWidth: mask.width,
        maskHeight: mask.height,
        scale: Number(best.scale.toFixed(4)),
        offsetX: best.dx,
        offsetY: best.dy,
        hitRate: Number((finalHit * 100).toFixed(2)),
        randomHitRate: Number((randomHit * 100).toFixed(2)),
        points: all.length,
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
