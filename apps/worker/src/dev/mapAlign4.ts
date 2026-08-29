/**
 * 미니맵 정렬 4차 — **벽이 아니라 "안쪽"에 맞춘다** (D-174).
 *
 * ── 앞선 세 번이 실패한 이유
 *   1차: 그림을 줄일수록 유리해지는 함정
 *   2차: 마스크가 틀렸다 (노란 글씨·격자까지 맵으로 잡음)
 *   3차: **맞추는 대상이 틀렸다.** 킬 좌표는 벽 위가 아니라 **방 안**에서 나온다.
 *        벽 선에 맞추려니 좌표 뭉치를 그림 밖으로 밀어내는 답이 나왔다
 *        (밖으로 나가면 무작위도 0 이라 비율이 폭발한다).
 *
 * ── 그래서 이렇게 고친다
 *   1. 벽 선을 부풀려 **틈을 막고**, 그림 테두리에서 물을 부어(flood fill)
 *      바깥을 지운다. 남은 것이 **맵 안쪽**이다
 *   2. 좌표가 그 안쪽에 얼마나 들어가는지로 점수를 매긴다
 *   3. **점의 85% 이상이 그림 안에 있어야** 후보로 친다 — 밖으로 밀어내는 답을 막는다
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

/** 테두리에서 물을 부어 바깥을 지운다. 남는 것이 벽 + 그 안쪽이다 */
function interiorOf(walls: Mask): Mask {
  const { width, height } = walls
  const outside = new Uint8Array(width * height)
  const queue: number[] = []
  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return
    const index = y * width + x
    if (outside[index] === 1 || walls.bits[index] === 1) return
    outside[index] = 1
    queue.push(index)
  }
  for (let x = 0; x < width; x += 1) {
    push(x, 0)
    push(x, height - 1)
  }
  for (let y = 0; y < height; y += 1) {
    push(0, y)
    push(width - 1, y)
  }
  while (queue.length > 0) {
    const index = queue.pop() as number
    const x = index % width
    const y = Math.floor(index / width)
    push(x + 1, y)
    push(x - 1, y)
    push(x, y + 1)
    push(x, y - 1)
  }
  const bits = new Uint8Array(width * height)
  for (let i = 0; i < bits.length; i += 1) bits[i] = outside[i] === 1 ? 0 : 1
  return { width, height, bits }
}

function onImage(points: readonly MapPoint[], mask: Mask, scale: number, dx: number, dy: number): number {
  let inside = 0
  for (const point of points) {
    const x = Math.round(point.x * scale + dx)
    const y = Math.round(point.y * scale + dy)
    if (x >= 0 && y >= 0 && x < mask.width && y < mask.height) inside += 1
  }
  return inside / points.length
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

async function main(): Promise<void> {
  const raw = readMask(stringArg('mask', ''))
  const walls = dilate(raw, 2)
  const interior = interiorOf(walls)
  const filled = interior.bits.reduce((sum, bit) => sum + bit, 0)
  console.log(`맵 안쪽 ${filled.toLocaleString()}칸 / ${(interior.width * interior.height).toLocaleString()} (${((filled / (interior.width * interior.height)) * 100).toFixed(1)}%)`)

  const rows = await prisma.barracksBattleLogRaw.findMany({ select: { payload: true } })
  const all: MapPoint[] = []
  for (const row of rows) {
    const payload = row.payload as { battleLog?: unknown } | null
    const events = Array.isArray(payload?.battleLog) ? payload.battleLog : []
    all.push(...positionPointsOf(events as never[]))
  }
  const sample = all.filter((_, index) => index % 8 === 0)
  console.log(`좌표 ${all.length.toLocaleString()}점 (표본 ${sample.length})`)

  let best = { scale: 1, dx: 0, dy: 0, hit: 0 }
  /* 가로 기준으로 배율이 대략 정해진다 — 맵 그림 가로 423 / 좌표 구름 가로 397 ≈ 1.07.
     그 언저리만 훑는다. 넓게 열어 두면 "줄이면 이긴다" 로 도망간다 */
  for (let scale = 0.95; scale <= 1.25; scale += 0.005) {
    for (let dx = -60; dx <= 60; dx += 2) {
      for (let dy = -80; dy <= 200; dy += 2) {
        /* 그림 밖으로 밀어내는 답을 먼저 걸러낸다 */
        if (onImage(sample, interior, scale, dx, dy) < 0.99) continue
        const hit = hitRate(sample, interior, scale, dx, dy)
        if (hit > best.hit) best = { scale, dx, dy, hit }
      }
    }
  }
  console.log(`거친 단계 — 배율 ${best.scale.toFixed(3)} · 이동 ${best.dx},${best.dy} · 안쪽 적중 ${(best.hit * 100).toFixed(1)}%`)

  const seed = { ...best }
  for (let scale = seed.scale - 0.02; scale <= seed.scale + 0.02; scale += 0.0025) {
    for (let dx = seed.dx - 4; dx <= seed.dx + 4; dx += 1) {
      for (let dy = seed.dy - 4; dy <= seed.dy + 4; dy += 1) {
        if (onImage(sample, interior, scale, dx, dy) < 0.99) continue
        const hit = hitRate(sample, interior, scale, dx, dy)
        if (hit > best.hit) best = { scale, dx, dy, hit }
      }
    }
  }
  const finalHit = hitRate(all, interior, best.scale, best.dx, best.dy)
  console.log(`고운 단계 — 배율 ${best.scale.toFixed(4)} · 이동 ${best.dx},${best.dy}`)
  console.log(`전체 좌표 ${ (finalHit * 100).toFixed(1)}% 가 맵 안쪽에 들어간다`)

  const out = path.join(REPO_ROOT, 'data', 'barracks', 'map-align.json')
  writeFileSync(
    out,
    JSON.stringify(
      {
        note: '배틀로그 좌표 → 미니맵 그림 픽셀. 픽셀 = 좌표 * scale + offset (마스크 크기 기준)',
        maskWidth: raw.width,
        maskHeight: raw.height,
        scale: Number(best.scale.toFixed(4)),
        offsetX: best.dx,
        offsetY: best.dy,
        insideRate: Number((finalHit * 100).toFixed(2)),
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
