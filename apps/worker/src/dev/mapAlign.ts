/**
 * 미니맵 그림과 **배틀로그 좌표를 자동으로 맞춘다** (D-174).
 *
 * ── 왜 필요한가
 *   구역 이름을 붙이려면 "이 좌표가 그림의 어디인가" 를 알아야 한다.
 *   인터넷 자료·스크린샷은 크기와 잘린 위치가 제각각이라 눈대중으로 맞추면 어긋난다.
 *
 * ── 어떻게 맞추나
 *   킬·데스 좌표는 **사람이 다닐 수 있는 곳**에서 나온다. 벽 바깥에서는 안 나온다.
 *   그래서 `좌표 → 그림 픽셀` 변환(확대율·이동)을 바꿔 가며
 *   **좌표가 맵 구조 위에 가장 많이 얹히는 값**을 찾는다. 눈대중이 아니라 계산이다.
 *
 * ```bash
 * pnpm --filter @sacloud/worker exec tsx src/dev/mapAlign.ts --mask <마스크.txt> --image <그림>
 * ```
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
  /** `1` 인 칸이 맵 구조다 */
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

/** 구조를 조금 부풀린다 — 좌표가 벽 선 바로 옆에 찍히는 일이 많다 */
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

function score(points: readonly MapPoint[], mask: Mask, scale: number, dx: number, dy: number): number {
  let hit = 0
  for (const point of points) {
    const x = Math.round(point.x * scale + dx)
    const y = Math.round(point.y * scale + dy)
    if (x < 0 || y < 0 || x >= mask.width || y >= mask.height) continue
    if (mask.bits[y * mask.width + x] === 1) hit += 1
  }
  return hit / points.length
}

/**
 * **줄이면 이기는 함정을 막는다.**
 *
 * 그림을 작게 줄일수록 점들이 구조가 빽빽한 가운데로 몰려 적중률이 저절로 오른다.
 * 그래서 같은 변환으로 **아무 데나 찍은 점**이 얼마나 맞는지로 나눈다.
 * 실제 좌표가 무작위보다 얼마나 더 잘 맞는지를 재는 것이다.
 */
function normalizedScore(
  points: readonly MapPoint[],
  random: readonly MapPoint[],
  mask: Mask,
  scale: number,
  dx: number,
  dy: number,
): number {
  const base = score(random, mask, scale, dx, dy)
  if (base <= 0.001) return 0
  return score(points, mask, scale, dx, dy) / base
}

async function main(): Promise<void> {
  const maskFile = stringArg('mask', '')
  if (!maskFile) throw new Error('--mask <마스크.txt> 가 필요하다')
  const mask = readMask(maskFile)
  const fat = dilate(mask, 2)

  const rows = await prisma.barracksBattleLogRaw.findMany({ select: { payload: true } })
  const points: MapPoint[] = []
  for (const row of rows) {
    const payload = row.payload as { battleLog?: unknown } | null
    const events = Array.isArray(payload?.battleLog) ? payload.battleLog : []
    points.push(...positionPointsOf(events as never[]))
  }
  console.log(`좌표 ${points.length.toLocaleString()}점 · 마스크 ${mask.width}x${mask.height}`)

  /* 비교용 무작위 점 — 좌표 구름과 같은 사각형 안에 고르게 뿌린다.
     `Math.random()` 을 쓰지 않는다(결정적이어야 다시 돌려도 같은 답이 나온다) */
  const bounds = points.reduce(
    (acc, p) => ({
      minX: Math.min(acc.minX, p.x),
      minY: Math.min(acc.minY, p.y),
      maxX: Math.max(acc.maxX, p.x),
      maxY: Math.max(acc.maxY, p.y),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  )
  const random: MapPoint[] = []
  const steps = 120
  for (let i = 0; i < steps; i += 1) {
    for (let j = 0; j < steps; j += 1) {
      random.push({
        x: bounds.minX + ((bounds.maxX - bounds.minX) * i) / (steps - 1),
        y: bounds.minY + ((bounds.maxY - bounds.minY) * j) / (steps - 1),
      })
    }
  }
  console.log(
    `구름 범위 x ${bounds.minX}~${bounds.maxX} · y ${bounds.minY}~${bounds.maxY} · 비교점 ${random.length}`,
  )

  /* ---- 1) 성긴 탐색 ----
     배율은 0.85~1.35 로 제한한다. 좌표 구름(약 400)과 그림 속 맵(약 430)이
     비슷한 크기라 그 밖은 애초에 말이 안 된다 */
  let best = { scale: 1, dx: 0, dy: 0, ratio: 0 }
  for (let scale = 0.85; scale <= 1.35; scale += 0.01) {
    for (let dx = -120; dx <= 200; dx += 4) {
      for (let dy = -120; dy <= 200; dy += 4) {
        const ratio = normalizedScore(points, random, fat, scale, dx, dy)
        if (ratio > best.ratio) best = { scale, dx, dy, ratio }
      }
    }
  }
  console.log(`성긴 탐색 — 배율 ${best.scale.toFixed(3)} · 이동 ${best.dx},${best.dy} · 무작위 대비 ${best.ratio.toFixed(3)}배`)

  /* ---- 2) 조밀 탐색 ---- */
  const around = { ...best }
  for (let scale = around.scale - 0.02; scale <= around.scale + 0.02; scale += 0.005) {
    for (let dx = around.dx - 6; dx <= around.dx + 6; dx += 1) {
      for (let dy = around.dy - 6; dy <= around.dy + 6; dy += 1) {
        const ratio = normalizedScore(points, random, fat, scale, dx, dy)
        if (ratio > best.ratio) best = { scale, dx, dy, ratio }
      }
    }
  }
  const hit = score(points, fat, best.scale, best.dx, best.dy)
  console.log(`조밀 탐색 — 배율 ${best.scale.toFixed(4)} · 이동 ${best.dx},${best.dy} · 무작위 대비 ${best.ratio.toFixed(3)}배`)
  console.log(`적중 ${(hit * 100).toFixed(1)}% (무작위는 ${(score(random, fat, best.scale, best.dx, best.dy) * 100).toFixed(1)}%)`)

  const out = path.join(REPO_ROOT, 'data', 'barracks', 'map-align.json')
  writeFileSync(
    out,
    JSON.stringify(
      {
        note: '배틀로그 좌표 → 미니맵 그림 픽셀 변환. 픽셀 = 좌표 * scale + offset',
        maskWidth: mask.width,
        maskHeight: mask.height,
        scale: Number(best.scale.toFixed(4)),
        offsetX: best.dx,
        offsetY: best.dy,
        hitRate: Number((hit * 100).toFixed(2)),
        randomRatio: Number(best.ratio.toFixed(3)),
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
