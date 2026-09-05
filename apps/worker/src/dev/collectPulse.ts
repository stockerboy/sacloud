/**
 * ★수집기가 도는 중인지 멈춘 건지 가른다★ (2026-09-05). ★읽기만 한다.★
 *
 * 로그가 조용한 것과 ★일이 멈춘 것★ 은 다르다.
 * 45초를 두고 두 번 재서 ★숫자가 움직이는지★ 로 가른다.
 */
import { prisma } from '@sacloud/db'

type Snap = { lineup: number; raw: number; renew: number; left: number }

const snap = async (): Promise<Snap> => {
  const [a] = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
    `SELECT COUNT(*)::int AS n FROM "MatchPlayerStat"`,
  )
  const [b] = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
    `SELECT COUNT(*)::int AS n FROM "BarracksClanMatchRaw"`,
  )
  const [l] = await prisma.$queryRawUnsafe<Array<{ renew: number; left: number }>>(
    `SELECT "renewCount"::int AS renew,
            EXTRACT(EPOCH FROM ("expiresAt" - NOW()))::int AS left
     FROM "CollectorLease" WHERE "name" = 'barracks-collect'`,
  )
  return { lineup: a?.n ?? 0, raw: b?.n ?? 0, renew: l?.renew ?? 0, left: l?.left ?? 0 }
}

const wait = Number(process.argv[2] ?? 45)
const one = await snap()
console.info(`  ① 라인업 ${one.lineup} · 원문 ${one.raw} · 갱신 ${one.renew}회 · 만료까지 ${one.left}초`)
await new Promise((r) => setTimeout(r, wait * 1000))
const two = await snap()
console.info(`  ② 라인업 ${two.lineup} · 원문 ${two.raw} · 갱신 ${two.renew}회 · 만료까지 ${two.left}초`)

const moved = [
  two.lineup - one.lineup ? `라인업 +${two.lineup - one.lineup}` : '',
  two.raw - one.raw ? `원문 +${two.raw - one.raw}` : '',
  two.renew - one.renew ? `갱신 +${two.renew - one.renew}` : '',
].filter(Boolean)
console.info(
  moved.length
    ? `\n  ✔ ★돌고 있다★ — ${wait}초 동안 ${moved.join(' · ')}`
    : `\n  ✘ ★${wait}초 동안 아무것도 안 움직였다★ — 멈췄을 수 있다`,
)
await prisma.$disconnect()
