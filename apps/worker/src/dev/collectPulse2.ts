/** ★두 원문 표가 다 도는지 본다★ (2026-09-06). ★읽기만 한다.★ */
import { prisma } from '@sacloud/db'
const snap = async () => {
  const [a] = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
    `SELECT COUNT(*)::int AS n FROM "BarracksClanMatchRaw"`)
  const [b] = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
    `SELECT COUNT(*)::int AS n FROM "BarracksBattleLogRaw"`)
  const [c] = await prisma.$queryRawUnsafe<Array<{ last: Date | null }>>(
    `SELECT MAX("fetchedAt") AS last FROM "BarracksBattleLogRaw"`)
  const [d] = await prisma.$queryRawUnsafe<Array<{ last: Date | null }>>(
    `SELECT MAX("fetchedAt") AS last FROM "BarracksClanMatchRaw"`)
  return { list: a?.n ?? 0, blog: b?.n ?? 0, blogLast: c?.last, listLast: d?.last }
}
const w = Number(process.argv[2] ?? 60)
const one = await snap()
console.info(`  ① 매치목록 ${one.list} (마지막 ${one.listLast?.toISOString() ?? '-'}) · 배틀로그 ${one.blog} (마지막 ${one.blogLast?.toISOString() ?? '-'})`)
await new Promise((r) => setTimeout(r, w * 1000))
const two = await snap()
console.info(`  ② 매치목록 ${two.list} · 배틀로그 ${two.blog}`)
const moved = [
  two.list - one.list ? `매치목록 +${two.list - one.list}` : '',
  two.blog - one.blog ? `배틀로그 +${two.blog - one.blog}` : '',
].filter(Boolean)
console.info(moved.length ? `\n  ✔ ★받고 있다★ — ${w}초 동안 ${moved.join(' · ')}` : `\n  ✘ ${w}초 동안 원문이 안 늘었다`)
await prisma.$disconnect()
