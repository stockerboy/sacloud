/**
 * **병영수첩 클랜원 명단이 우리 선수와 얼마나 이어져 있나** (2026-09-01).
 *
 * ```
 * node scripts/prod-run.mjs barracks-state
 * pnpm --filter @sacloud/worker exec tsx src/dev/barracksState.ts   # 로컬
 * ```
 *
 * ── 왜 필요한가
 *   클랜원 목록에 **접속중/미접속**을 붙이려면 `BarracksClanMember.connFlag` 를 써야 한다.
 *   그런데 그 표는 병영수첩 계정(`userNexonSn`)으로 되어 있고, 화면은 우리 `Player` 로 그린다.
 *   사슬은 이렇다.
 *
 *   ```
 *   BarracksClanMember.userNexonSn
 *     → NexonIdentity.barracksNexonSn   (`nexon barracks-link` 가 채운다 · D-221)
 *     → NexonIdentity.playerId          (사람이 판단한다 · D-036)
 *     → Player
 *   ```
 *
 *   **어느 고리가 비어 있는지** 숫자로 봐야 화면에 무엇을 그릴 수 있는지 정해진다.
 *   비어 있으면 「알수없음」 으로 그린다 — 지어내지 않는다 (`CLAUDE.md` 3장 7번).
 *
 * ── **읽기만 한다.**
 */
import { prisma } from '@sacloud/db'

const total = await prisma.barracksClanMember.count()
console.info(`병영 클랜원 관측  ${total} 건`)

if (total > 0) {
  const latest = await prisma.barracksClanMember.findFirst({
    orderBy: { observedAt: 'desc' },
    select: { observedAt: true },
  })
  const oldest = await prisma.barracksClanMember.findFirst({
    orderBy: { observedAt: 'asc' },
    select: { observedAt: true },
  })
  const clans = await prisma.barracksClanMember.groupBy({ by: ['clanSlug'], _count: { _all: true } })
  const conn = await prisma.barracksClanMember.groupBy({ by: ['connFlag'], _count: { _all: true } })

  console.info(`  클랜 수        ${clans.length}`)
  console.info(`  가장 최근 관측  ${latest?.observedAt?.toISOString() ?? '—'}`)
  console.info(`  가장 오래된     ${oldest?.observedAt?.toISOString() ?? '—'}`)
  console.info(
    `  connFlag       ${conn.map((r) => `${r.connFlag}:${r._count._all}`).join(' · ')}  (1 = 접속중)`,
  )
}

console.info('\n사슬이 어디서 끊기나')
const identities = await prisma.nexonIdentity.count()
const withBarracks = await prisma.nexonIdentity.count({ where: { barracksNexonSn: { not: null } } })
const withPlayer = await prisma.nexonIdentity.count({ where: { playerId: { not: null } } })
const both = await prisma.nexonIdentity.count({
  where: { barracksNexonSn: { not: null }, playerId: { not: null } },
})
console.info(`  NexonIdentity 전체              ${identities}`)
console.info(`  ├ 병영 계정이 붙은 것            ${withBarracks}   (nexon barracks-link)`)
console.info(`  ├ 우리 선수가 붙은 것            ${withPlayer}   (사람이 판단 · D-036)`)
console.info(`  └ **둘 다** 붙은 것              ${both}   ← 이 수만큼만 접속 표시가 가능하다`)

if (both > 0) {
  const linked = await prisma.nexonIdentity.findMany({
    where: { barracksNexonSn: { not: null }, playerId: { not: null } },
    select: { barracksNexonSn: true },
    take: 5000,
  })
  const sns = linked.map((row) => row.barracksNexonSn as string)
  const covered = await prisma.barracksClanMember.groupBy({
    by: ['userNexonSn'],
    where: { userNexonSn: { in: sns } },
  })
  console.info(`\n  그 중 명단에도 실제로 있는 계정   ${covered.length} 명`)
}

console.info('\n병영 클랜 slug ↔ 우리 클랜 잇기')
console.info(`  BarracksClanNumber  ${await prisma.barracksClanNumber.count()} 건`)

await prisma.$disconnect()
