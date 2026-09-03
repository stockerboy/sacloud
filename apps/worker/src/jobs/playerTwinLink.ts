/**
 * **두 선수로 갈린 같은 사람을 이어 둔다** (2026-09-04 · D-275 · D-273 의 뿌리).
 *
 * ══ ★무엇이 문제인가★ ══
 *
 * ```
 * 51경기  ★태뭉이★ (3rd.supply)  ↔  ★태뭉이★ (nexon_barracks)   ← 이름까지 같은데 둘이다
 * 69경기  김서정 (3rd.supply)     ↔  꿀벌뽀글이 (nexon_barracks)  ← 그 사이 닉을 바꿨다
 * ```
 * ★한 선수가 100경기 뛰었는데 50경기짜리 둘로 보인다.★ 킬뎃·승률·순위가 둘 다 틀리고
 * ★검색에 같은 이름이 두 번 나온다.★
 *
 * ══ ★어떻게 「같은 사람」이라고 아나 — 닉으로 안 잇는다★ ══
 *
 * ⚠ ★닉으로 합치면 안 된다★ (D-221) — 위장닉이 있고 닉은 물려받는다.
 *
 * `lineup-dedupe` 가 ★지우기 전에 떠 둔 백업★ 을 쓴다. 거기엔 지운 행의
 * `(matchId, side, kill, death)` 가 있다. ★같은 경기·같은 편·같은 킬데스★ 면
 * ★그 자리에 있던 같은 사람★ 이다. ★그 자리가 여러 경기에서 되풀이되면 더 확실하다.★
 *
 * ★거르는 규칙★
 * ```
 * · ★한 자리에 같은 킬데스가 둘 이상이면 안 센다★ — 누가 누군지 못 가린다
 * · ★N경기 이상 되풀이된 짝만★ 잇는다 (기본 3)
 * · ★한 병영수첩 선수가 미러 선수 둘 이상과 짝이면 안 잇는다★ — 어느 쪽인지 모른다
 * · ★그 반대도 안 잇는다★ (미러 하나에 병영수첩 둘)
 * ```
 *
 * ══ ★★쓰려고 했는데 못 썼다 — 이을 자리가 스키마에 없다★★ ══
 *
 * 계획은 `NexonIdentity.barracksUsn → playerId` 한 줄을 넣는 것이었다.
 * `battlelogLineup` 이 ★1순위로 그 표를 보므로★ 앞으로 들어오는 라인업이 미러 선수에 붙는다.
 *
 * ⚠ ★그런데 `NexonIdentity` 는 `ouid` 가 필수(`@unique`)다.★ 병영수첩 선수는 ★ouid 를 모른다★
 *   (IPL 선수 2,734명 중 ouid 를 아는 것은 3명뿐 · 앞선 조사).
 *   ★거기에 아무 값이나 넣으면 그건 지어낸 데이터다★ (`CLAUDE.md` 3장 7번). ★안 한다.★
 *
 * `Player` 에도 「같은 사람」을 가리키는 칸이 없다 (`aliasOf` 같은 것). ★스키마를 바꿔야 한다.★
 * ★스키마 변경은 밤에 혼자 할 일이 아니다.★
 *
 * ══ ★그래서 이 잡이 하는 일 — 계획을 파일로 낸다★ ══
 *
 * 짝을 찾아 ★파일 하나로 떨어뜨린다.★ 자리가 생기면 ★그 파일을 그대로 먹이면 된다.★
 * ★찾은 것을 잃지 않게 하는 것★ 이 지금 할 수 있는 일이다.
 *
 * ⚠ `--confirm` 을 줘도 ★DB 에는 한 줄도 안 쓴다.★ ★파일만 쓴다.★
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { prisma } from '@sacloud/db'
import { log } from '../lib/log.js'

/** 이 표식이 붙은 선수가 「병영수첩이 만든 쪽」이다 */
const BARRACKS_ORIGIN = 'nexon_barracks'
/** `Player.sourcePlayerId` 앞에 붙는 표식 (`battlelogLineup.ts` 와 같은 값) */
const BARRACKS_PREFIX = 'BRK-'
/** 몇 경기 이상 되풀이돼야 잇나 */
export const DEFAULT_MIN_MATCHES = 3

interface StatRow {
  matchId: string
  playerId: string
  side: string
  kill: number | null
  death: number | null
}

export interface PlayerTwinLinkResult {
  /** 자리가 하나씩 맞은 짝 */
  pairs: number
  /** 되풀이 수가 기준을 넘은 짝 */
  strong: number
  /** 한쪽이 여러 짝을 가져 버린 것 */
  ambiguous: number
  /** 실제로 이은 줄 */
  linked: number
  /** 이미 이어져 있던 것 */
  already: number
  written: boolean
}

export async function runPlayerTwinLink(options: {
  backupPath: string
  confirm?: boolean
  minMatches?: number
}): Promise<PlayerTwinLinkResult> {
  const minMatches = options.minMatches ?? DEFAULT_MIN_MATCHES
  const backup = JSON.parse(readFileSync(options.backupPath, 'utf8')) as StatRow[]
  log(`백업 ${backup.length.toLocaleString()}행을 읽었다 · 기준 ★${minMatches}경기 이상★`)

  const matchIds = [...new Set(backup.map((r) => r.matchId))]
  const alive = await prisma.$queryRaw<StatRow[]>`
    SELECT "matchId", "playerId", "side"::text AS side, "kill", "death"
      FROM "MatchPlayerStat"
     WHERE "matchId" = ANY(${matchIds}::text[])
  `

  const slot = (r: StatRow): string => `${r.matchId}|${r.side}|${r.kill}|${r.death}`
  const group = (rows: readonly StatRow[]): Map<string, string[]> => {
    const m = new Map<string, string[]>()
    for (const r of rows) {
      if (r.kill === null || r.death === null) continue
      const k = slot(r)
      m.set(k, [...(m.get(k) ?? []), r.playerId])
    }
    return m
  }
  const liveBySlot = group(alive)
  const goneBySlot = group(backup)

  /* 자리가 정확히 하나씩 맞은 것만 짝으로 본다 */
  const pairCount = new Map<string, number>()
  for (const [k, gone] of goneBySlot) {
    const live = liveBySlot.get(k)
    if (!live || live.length !== 1 || gone.length !== 1) continue
    const key = `${live[0]!}|${gone[0]!}`
    pairCount.set(key, (pairCount.get(key) ?? 0) + 1)
  }

  const strong = [...pairCount.entries()].filter(([, n]) => n >= minMatches)

  /*
   * ★한쪽이 여러 짝을 가지면 안 잇는다★ — 어느 쪽이 진짜인지 모른다.
   * ★모르면 안 한다.★ 잘못 이으면 ★남의 기록이 섞인다★ — 그건 되돌리기 어렵다.
   */
  const leftSeen = new Map<string, number>()
  const rightSeen = new Map<string, number>()
  for (const [key] of strong) {
    const [a, b] = key.split('|')
    leftSeen.set(a!, (leftSeen.get(a!) ?? 0) + 1)
    rightSeen.set(b!, (rightSeen.get(b!) ?? 0) + 1)
  }
  const clean = strong.filter(([key]) => {
    const [a, b] = key.split('|')
    return leftSeen.get(a!) === 1 && rightSeen.get(b!) === 1
  })

  const result: PlayerTwinLinkResult = {
    pairs: pairCount.size,
    strong: strong.length,
    ambiguous: strong.length - clean.length,
    linked: 0,
    already: 0,
    written: options.confirm === true,
  }

  log(`자리가 맞은 짝 ★${result.pairs.toLocaleString()}쌍★`)
  log(`  ${minMatches}경기 이상 되풀이 ★${result.strong.toLocaleString()}쌍★`)
  log(`  ⚠ 한쪽이 여러 짝을 가져 ★못 잇는 것 ${result.ambiguous.toLocaleString()}쌍★ — ★모르면 안 한다★`)

  /* 병영수첩 쪽 선수에서 계정(usn)을 꺼낸다 — 이을 때 쓰는 키다 */
  const rightIds = clean.map(([key]) => key.split('|')[1]!)
  const rights = await prisma.player.findMany({
    where: { id: { in: rightIds }, origin: BARRACKS_ORIGIN },
    select: { id: true, name: true, sourcePlayerId: true },
  })
  const usnOf = new Map<string, string>()
  for (const p of rights) {
    if (!p.sourcePlayerId?.startsWith(BARRACKS_PREFIX)) continue
    usnOf.set(p.id, p.sourcePlayerId.slice(BARRACKS_PREFIX.length))
  }

  const plan = clean
    .map(([key, n]) => {
      const [left, right] = key.split('|')
      return { playerId: left!, twinId: right!, usn: usnOf.get(right!) ?? null, matches: n }
    })
    .filter((p): p is { playerId: string; twinId: string; usn: string; matches: number } =>
      p.usn !== null,
    )
    .sort((a, b) => b.matches - a.matches)

  log(`이을 수 있는 짝 ★${plan.length.toLocaleString()}쌍★ (계정을 아는 것만)`)

  if (!options.confirm) {
    const names = new Map(
      (
        await prisma.player.findMany({
          where: { id: { in: plan.slice(0, 10).flatMap((p) => [p.playerId, p.twinId]) } },
          select: { id: true, name: true, origin: true },
        })
      ).map((p) => [p.id, `${p.name} (${p.origin ?? '-'})`]),
    )
    log('  이을 짝 (많이 만난 순 · 최대 10쌍)')
    for (const p of plan.slice(0, 10)) {
      log(`    ${p.matches}경기  ${names.get(p.playerId) ?? p.playerId}  ←  ${names.get(p.twinId) ?? p.twinId}`)
    }
    log('')
    log('★미리보기다. 한 줄도 안 썼다.★ 이으려면 `--confirm` 을 준다')
    return result
  }

  /*
   * ★DB 에 쓰지 않는다★ — 이을 자리가 없다 (머리말 참조). ★찾은 것을 파일로 남긴다.★
   * 자리가 생기면 이 파일을 그대로 먹이면 된다.
   */
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outPath = join(process.cwd(), `player-twin-plan-${stamp}.json`)
  writeFileSync(outPath, JSON.stringify(plan, null, 1), 'utf8')
  log(`★계획 ${plan.length.toLocaleString()}쌍을 파일로 냈다★ — ${outPath}`)
  log('⚠ ★DB 에는 한 줄도 안 썼다★ — `NexonIdentity` 는 `ouid` 가 필수인데 병영수첩 선수는 모른다')
  log('  ★지어낸 ouid 를 넣지 않는다.★ 스키마에 자리가 생기면 이 파일을 먹이면 된다')
  return result
}
