/**
 * 킬로그로 되짚은 무기가 **얼마나 맞는지** 잰다 (D-195).
 *
 * 운영 코드가 아니다. 규칙을 정하기 **전에** 숫자를 보려고 만든 도구다.
 * 우리 DB(`MatchPlayerStat.weapon`)에 무기가 확실히 있는 경기에서만 잴 수 있고,
 * 그 답을 정답으로 삼아 킬로그 판정의 정확도를 잰다.
 *
 * ```
 * pnpm --filter @sacloud/worker exec tsx src/dev/weaponAccuracyProbe.ts
 * ```
 *
 * ── 무엇을 가르나
 *   킬 수가 많을수록 정확해야 정상이다. 그 곡선을 봐야
 *   "몇 킬부터 믿을 것인가" 를 **재서** 정할 수 있다. 지어내지 않는다.
 */
import { prisma } from '@sacloud/db'
import { killsOf, weaponByPlayerOf, type DuelEvent, type Weapon } from '@sacloud/nexon'

interface Bucket {
  n: number
  same: number
}

const bump = (map: Map<string, Bucket>, key: string, ok: boolean): void => {
  const b = map.get(key) ?? { n: 0, same: 0 }
  b.n += 1
  if (ok) b.same += 1
  map.set(key, b)
}

const pct = (b: Bucket): string => (b.n === 0 ? '-' : ((b.same / b.n) * 100).toFixed(1) + '%')

async function main(): Promise<void> {
  const rows = await prisma.barracksBattleLogRaw.findMany({
    where: { subjectKind: 'clan', status: 'ok' },
    select: { matchKey: true, payload: true },
  })

  /** 한 경기의 이벤트를 모은다 (두 클랜 응답이 있으면 합친다) */
  const byMatch = new Map<string, DuelEvent[]>()
  for (const row of rows) {
    const holder = row.payload as { raw?: { battleLog?: DuelEvent[] }; battleLog?: DuelEvent[] }
    const raw = holder.raw ?? holder
    const events = raw.battleLog ?? []
    if (events.length === 0) continue
    const list = byMatch.get(row.matchKey)
    if (list) list.push(...events)
    else byMatch.set(row.matchKey, [...events])
  }

  /** 우리 DB 가 아는 무기 — `sourceMatchId` 로 잇고, 선수는 병영수첩 계정 번호로 잇는다 */
  const keys = [...byMatch.keys()]
  const truth = new Map<string, Map<string, Weapon>>()
  for (let i = 0; i < keys.length; i += 300) {
    const slice = keys.slice(i, i + 300)
    const matches = await prisma.match.findMany({
      where: { sourceMatchId: { in: slice } },
      select: {
        sourceMatchId: true,
        stats: {
          select: { weapon: true, player: { select: { sourcePlayerId: true } } },
        },
      },
    })
    for (const match of matches) {
      if (!match.sourceMatchId) continue
      const inner = new Map<string, Weapon>()
      for (const stat of match.stats) {
        const sn = stat.player?.sourcePlayerId
        if (!sn) continue
        if (stat.weapon !== 0 && stat.weapon !== 1) continue
        inner.set(sn, stat.weapon as Weapon)
      }
      if (inner.size > 0) truth.set(match.sourceMatchId, inner)
    }
  }

  /* 킬로그의 사람 키는 `str_usn`(해시)인데 우리 DB 는 계정 번호다. 이벤트가 둘을 같이 준다 */
  const byKillCount = new Map<string, Bucket>()
  const byMargin = new Map<string, Bucket>()
  const overall: Bucket = { n: 0, same: 0 }
  let matchesCompared = 0
  let noTruth = 0
  let unknownInferred = 0

  for (const [matchKey, events] of byMatch) {
    const known = truth.get(matchKey)
    if (!known) {
      noTruth += 1
      continue
    }
    matchesCompared += 1

    /* str_usn → 계정 번호 */
    const account = new Map<string, string>()
    for (const event of events as (DuelEvent & Record<string, unknown>)[]) {
      const put = (usn: unknown, sn: unknown) => {
        if (typeof usn === 'string' && usn !== '' && sn !== null && sn !== undefined && sn !== '') {
          account.set(usn, String(sn))
        }
      }
      put(event.str_usn, event.user_nexon_sn)
      put(event.target_str_usn, event.target_user_nexon_sn)
    }

    const kills = killsOf(events)
    /* 사람마다 라플/스나 킬을 다시 센다 — 킬 수와 우세폭이 정확도와 어떻게 붙는지 보려고 */
    const counts = new Map<string, [number, number]>()
    for (const kill of kills) {
      if (kill.weapon === null) continue
      const entry = counts.get(kill.killer) ?? [0, 0]
      entry[kill.weapon] += 1
      counts.set(kill.killer, entry)
    }
    const inferred = weaponByPlayerOf(kills)

    for (const [usn, [rifle, sniper]] of counts) {
      const sn = account.get(usn)
      if (!sn) continue
      const truthWeapon = known.get(sn)
      if (truthWeapon === undefined) continue

      const guess = inferred.get(usn)
      if (guess === undefined) {
        unknownInferred += 1
        continue
      }

      const total = rifle + sniper
      const margin = Math.abs(rifle - sniper)
      const ok = guess === truthWeapon
      overall.n += 1
      if (ok) overall.same += 1

      const bucket = total >= 10 ? '10킬+' : total >= 5 ? '5~9킬' : total >= 3 ? '3~4킬' : total + '킬'
      bump(byKillCount, bucket, ok)
      bump(byMargin, margin >= 5 ? '우세 5+' : '우세 ' + margin, ok)
    }
  }

  console.info('배틀로그 경기            ', byMatch.size)
  console.info('우리 DB 에 무기가 있는 경기', matchesCompared, '· 없는 경기', noTruth)
  console.info('대조한 선수-경기          ', overall.n, '· 반반이라 판정 못한 것', unknownInferred)
  console.info('전체 정확도               ', pct(overall), `(${overall.same}/${overall.n})`)
  console.info('')
  console.info('킬 수별')
  for (const key of ['1킬', '2킬', '3~4킬', '5~9킬', '10킬+']) {
    const b = byKillCount.get(key)
    if (b) console.info('  ', key.padEnd(7), pct(b), `(${b.same}/${b.n})`)
  }
  console.info('')
  console.info('우세폭별 (많이 쓴 무기 − 적게 쓴 무기)')
  for (const key of [...byMargin.keys()].sort()) {
    const b = byMargin.get(key) as Bucket
    console.info('  ', key.padEnd(7), pct(b), `(${b.same}/${b.n})`)
  }
}

main()
  .catch((error) => console.error(error))
  .finally(() => prisma.$disconnect())
