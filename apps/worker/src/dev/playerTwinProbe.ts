/**
 * **같은 사람이 두 선수로 갈려 있다 — 몇 명인가** (2026-09-04 · ★읽기 전용★ · D-273 의 뿌리).
 *
 * D-273 에서 겹친 라인업을 걷어냈지만 ★원인은 그대로다★ —
 * ★미러가 만든 `Player` 와 병영수첩이 만든 `Player` 가 같은 사람인데 다른 행★ 이다.
 * ```
 * blue 고지슈  3rd.supply       16킬 8데스
 * blue 슈한    nexon_barracks   16킬 8데스   ← ★같은 사람★
 * ```
 * ★선수 검색을 하면 같은 사람이 둘로 나온다.★ 기록도 반씩 갈려 있다.
 *
 * ══ ★어떻게 「같은 사람」이라고 아나 — 닉으로 안 잇는다★ ══
 *
 * ⚠ ★닉으로 합치면 안 된다★ (D-221) — 위장닉이 있고 닉은 물려받는다.
 *   ★대신 지우기 전에 떠 둔 백업★ 을 쓴다. 거기엔 지운 행의
 *   `(matchId, side, kill, death)` 가 그대로 있다. ★같은 경기·같은 편·같은 킬데스★ 면
 *   ★그 자리에 있던 같은 사람★ 이다.
 *
 * ⚠ ★한 경기·한 편에 킬·데스가 같은 사람이 둘 있으면 누가 누군지 못 가린다.★
 *   ★그런 자리는 세지 않는다.★ ★애매한 것을 세면 숫자가 거짓이 된다.★
 *
 * ★이 잡은 세기만 한다.★ ★합치지 않는다★ — 합치는 것은 되돌릴 수 없다.
 */
import { readFileSync } from 'node:fs'
import { prisma } from '@sacloud/db'

interface BackupRow {
  matchId: string
  playerId: string
  side: string
  kill: number | null
  death: number | null
}

async function main(): Promise<void> {
  const path = process.argv[2]
  if (!path) {
    console.info('백업 파일 경로를 인자로 준다 — `node scripts/prod-run.mjs player-twin <경로>`')
    return
  }
  const backup = JSON.parse(readFileSync(path, 'utf8')) as BackupRow[]
  console.info(`백업 ★${backup.length.toLocaleString()}행★ 을 읽었다`)

  /* 지금 DB 에 남아 있는 행 — 같은 경기들만 */
  const matchIds = [...new Set(backup.map((r) => r.matchId))]
  const alive = await prisma.$queryRaw<BackupRow[]>`
    SELECT "matchId", "playerId", "side"::text AS side, "kill", "death"
      FROM "MatchPlayerStat"
     WHERE "matchId" = ANY(${matchIds}::text[])
  `
  console.info(`그 경기들에 남아 있는 행 ★${alive.length.toLocaleString()}행★`)

  const slot = (r: BackupRow): string => `${r.matchId}|${r.side}|${r.kill}|${r.death}`

  /* ★한 자리에 둘 이상이면 애매하다 — 안 센다★ */
  const aliveBySlot = new Map<string, string[]>()
  for (const r of alive) {
    if (r.kill === null || r.death === null) continue
    const k = slot(r)
    aliveBySlot.set(k, [...(aliveBySlot.get(k) ?? []), r.playerId])
  }
  const goneBySlot = new Map<string, string[]>()
  for (const r of backup) {
    if (r.kill === null || r.death === null) continue
    const k = slot(r)
    goneBySlot.set(k, [...(goneBySlot.get(k) ?? []), r.playerId])
  }

  const pairs = new Map<string, number>()
  let ambiguous = 0
  for (const [k, gone] of goneBySlot) {
    const live = aliveBySlot.get(k)
    if (!live || live.length !== 1 || gone.length !== 1) {
      ambiguous += gone.length
      continue
    }
    const key = `${live[0]!}|${gone[0]!}`
    pairs.set(key, (pairs.get(key) ?? 0) + 1)
  }

  const people = new Set<string>()
  for (const key of pairs.keys()) for (const id of key.split('|')) people.add(id)

  console.info('')
  console.info(`★자리가 정확히 하나씩 맞은 짝 ${pairs.size.toLocaleString()}쌍★`)
  console.info(`  ⚠ ★애매해서 못 센 자리 ${ambiguous.toLocaleString()}행★ — 같은 킬데스가 둘 이상이었다`)
  console.info(`  ★관련된 선수 행 ${people.size.toLocaleString()}개★`)
  console.info('')

  /* 짝이 여러 경기에서 반복되면 더 확실하다 */
  const strong = [...pairs.entries()].filter(([, n]) => n >= 2)
  console.info(`★두 경기 이상에서 같은 짝으로 만난 것 ${strong.length.toLocaleString()}쌍★ — ★이게 제일 확실하다★`)

  const names = new Map(
    (
      await prisma.player.findMany({
        where: { id: { in: [...people] } },
        select: { id: true, name: true, origin: true },
      })
    ).map((p) => [p.id, `${p.name} (${p.origin ?? '-'})`]),
  )
  console.info('')
  console.info('  ★짝 예시 (많이 만난 순 · 최대 12쌍)★')
  for (const [key, n] of [...pairs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    const [a, b] = key.split('|')
    console.info(`    ${n}경기  ${names.get(a!) ?? a}  ↔  ${names.get(b!) ?? b}`)
  }
  console.info('')
  console.info('  ★읽는 법★ — 이름이 다른 짝은 ★그 사이에 닉을 바꾼 사람★ 이다.')
  console.info('  ★이름이 같은 짝은 출처가 달라 못 이은 것★ 이다.')
  console.info('  ★합치는 것은 되돌릴 수 없다. 이 잡은 세기만 한다.★')
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
