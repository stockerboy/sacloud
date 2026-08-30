/**
 * 포지션별로 **플레이 스타일이 실제로 다른가** 를 데이터로 본다 (임시 조사용).
 *
 * 지어내지 않는다. 표본이 얇으면 얇다고 적는다.
 */
import { prisma } from '@sacloud/db'

interface Bucket {
  people: number
  kill: number
  death: number
  assist: number
  damage: number
  headshot: number
  rounds: number
  games: number
  mvp: number
  /* 라운드 지표 */
  alone: number
  aloneWon: number
  outnumbered: number
  outnumberedWon: number
  oneAttackKills: number
  oneAttackSame: number
}

function empty(): Bucket {
  return {
    people: 0, kill: 0, death: 0, assist: 0, damage: 0, headshot: 0,
    rounds: 0, games: 0, mvp: 0,
    alone: 0, aloneWon: 0, outnumbered: 0, outnumberedWon: 0,
    oneAttackKills: 0, oneAttackSame: 0,
  }
}

async function main(): Promise<void> {
  /* 포지션이 판정된 사람만. 판정 신뢰도(margin)가 낮은 것도 일단 포함하되 따로 센다 */
  const profiles = await prisma.playerPositionProfile.findMany({
    where: { position: { not: null }, playerId: { not: null } },
    select: { playerId: true, position: true, score: true, margin: true, games: true },
  })
  const posOf = new Map<string, string>()
  for (const p of profiles) if (p.playerId && p.position) posOf.set(p.playerId, p.position)

  console.info(`포지션 판정된 선수(우리 Player 연결) ${posOf.size}명`)
  const byPos = new Map<string, Bucket>()
  for (const p of profiles) {
    if (!p.position) continue
    const b = byPos.get(p.position) ?? empty()
    b.people += 1
    byPos.set(p.position, b)
  }

  /* --- 경기 기록: 무기별로 나눠 본다 (0=라플 1=스나) --- */
  const ids = [...posOf.keys()]
  const perKey = new Map<string, Bucket>()
  for (let i = 0; i < ids.length; i += 400) {
    const slice = ids.slice(i, i + 400)
    const stats = await prisma.matchPlayerStat.findMany({
      where: { playerId: { in: slice } },
      select: {
        playerId: true, kill: true, death: true, assist: true,
        damage: true, headshot: true, weapon: true, mvp: true,
      },
    })
    for (const s of stats) {
      const pos = posOf.get(s.playerId)
      if (!pos) continue
      const weapon = s.weapon === 1 ? '스나' : s.weapon === 0 ? '라플' : '무기모름'
      const key = `${pos}|${weapon}`
      const b = perKey.get(key) ?? empty()
      b.games += 1
      b.kill += s.kill ?? 0
      b.death += s.death ?? 0
      b.assist += s.assist ?? 0
      b.damage += s.damage ?? 0
      b.headshot += s.headshot ?? 0
      if (s.mvp) b.mvp += 1
      perKey.set(key, b)
    }
  }

  /* --- 라운드 지표 --- */
  const rounds = await prisma.playerRoundProfile.findMany({
    where: { playerId: { in: ids } },
    select: {
      playerId: true, alone: true, aloneWon: true,
      outnumbered: true, outnumberedWon: true,
      oneAttackKills: true, oneAttackSameKills: true,
    },
  })
  for (const r of rounds) {
    const pos = r.playerId ? posOf.get(r.playerId) : undefined
    if (!pos) continue
    const b = byPos.get(pos) ?? empty()
    b.alone += r.alone
    b.aloneWon += r.aloneWon
    b.outnumbered += r.outnumbered
    b.outnumberedWon += r.outnumberedWon
    b.oneAttackKills += r.oneAttackKills
    b.oneAttackSame += r.oneAttackSameKills
    byPos.set(pos, b)
  }

  const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : '표본없음')
  const per = (a: number, b: number) => (b > 0 ? (a / b).toFixed(2) : '-')

  console.info('\n=== 경기 기록 (포지션 × 무기) ===')
  console.info('포지션 무기      판수    킬/판  뎃/판  어시/판  K/D   딜/판   헤드샷%  MVP%')
  const keys = [...perKey.keys()].sort()
  for (const key of keys) {
    const b = perKey.get(key)!
    if (b.games < 50) continue
    const [pos = '', weapon = ''] = key.split('|')
    console.info(
      `${pos.padEnd(6)} ${weapon.padEnd(7)} ${String(b.games).padStart(6)}  ` +
        `${per(b.kill, b.games).padStart(5)}  ${per(b.death, b.games).padStart(5)}  ` +
        `${per(b.assist, b.games).padStart(6)}  ${per(b.kill, b.death).padStart(4)}  ` +
        `${per(b.damage, b.games).padStart(6)}  ${pct(b.headshot, b.kill).padStart(7)}  ` +
        `${pct(b.mvp, b.games).padStart(5)}`,
    )
  }

  console.info('\n=== 라운드 지표 (포지션별) ===')
  console.info('포지션  인원   혼자남음  세이브%   둘남음  소수싸움%   원어택표본  같은포지션킬%')
  for (const [pos, b] of [...byPos.entries()].sort()) {
    console.info(
      `${pos.padEnd(6)} ${String(b.people).padStart(5)}  ${String(b.alone).padStart(8)}  ` +
        `${pct(b.aloneWon, b.alone).padStart(7)}  ${String(b.outnumbered).padStart(7)}  ` +
        `${pct(b.outnumberedWon, b.outnumbered).padStart(9)}  ` +
        `${String(b.oneAttackKills).padStart(10)}  ${pct(b.oneAttackSame, b.oneAttackKills).padStart(12)}`,
    )
  }
}

main()
  .catch((e) => {
    console.error(String(e).slice(0, 600))
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
