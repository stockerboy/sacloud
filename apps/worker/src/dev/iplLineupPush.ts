/**
 * IPL **참가 기록**을 운영에 밀어 넣는다 (D-255 후속).
 *
 * ```
 * node scripts/prod-run.mjs ipl-lineup-push                    # 미리보기 (기본)
 * node scripts/prod-run.mjs ipl-lineup-push --confirm          # 실제 저장
 * node scripts/prod-run.mjs ipl-lineup-push --revert <계획파일> # 되돌리기
 * ```
 *
 * ── 옮기는 것은 **안정된 키뿐이다**
 *   `sourceMatchId` · 계정(`str_usn` · `user_nexon_sn`) · 진영 · 킬 · 데스 · 무기.
 *   `id` 라는 id 는 하나도 안 옮긴다 — 로컬과 운영은 다른 DB 다.
 *   진영별 클랜·부리그·클랜마크는 **이 DB 의 `Match` 를 보고 다시 만든다**
 *   (`dev/iplProjectPush.ts` 가 division·map 을 다룬 것과 같은 원칙).
 *
 * ── ★ 가장 위험한 지점: 같은 사람을 두 줄로 만들지 않는다 ★
 *   운영에는 3rd.supply 에서 온 선수가 이미 2만 명 넘게 있고, 그쪽
 *   `Player.sourcePlayerId` 가 **병영수첩 `user_nexon_sn` 바로 그 값**이다 (D-255 4장 실측).
 *   그래서 찾는 순서가 곧 안전장치다:
 *   ```
 *   1순위  NexonIdentity.barracksUsn 이 이어 둔 playerId   ← 사람이 확인한 매핑 (D-221)
 *   2순위  Player.sourcePlayerId = <user_nexon_sn>          ← 3rd.supply 로 이미 있는 사람
 *   3순위  Player.sourcePlayerId = 'BRK-<str_usn>'          ← 지난번에 우리가 민 사람
 *   4순위  새로 만든다
 *   ```
 *   두 계정이 같은 운영 선수로 풀리면 **둘 다 넣지 않는다.** 어느 쪽이 맞는지 모른다.
 *
 * ── 안전
 *   · `--confirm` 없이는 한 줄도 쓰지 않는다. 기본은 미리보기다
 *   · 멱등하다 — 선수는 `sourcePlayerId`, 참가는 `(matchId, playerId)` 로 upsert 한다
 *   · **이 DB 의 `Match` 와 이어지지 않는 행은 넣지 않는다.** 세어서 보고한다
 *   · 쓰기 전에 **계획 파일**을 남기고, 그 파일로 되돌릴 수 있다
 *   · 집계(`LeaguePlayer`)는 건드리지 않는다 — 그건 `season0-apply --leagues nolink` 의 일이다
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { prisma } from '@sacloud/db'
import { REPO_ROOT } from '../lib/env.js'
import type { IplLineupExportPlayer, IplLineupExportStat } from './iplLineupExport.js'

const LEAGUE_SLUG = 'nolink'
const MATCH_ORIGIN = 'nexon_barracks'
const PLAYER_ORIGIN = 'nexon_barracks'
const PLAYER_PREFIX = 'BRK-'
const CLAN_SOURCE = 'barracks-battlelog'
const BACKUP_DIR = path.join(REPO_ROOT, 'apps', 'worker', 'backups', 'ipl-lineup')

function flag(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 && process.argv[index + 1] ? (process.argv[index + 1] as string) : null
}

const file = flag('file') ?? path.join(process.cwd(), 'ipl-lineup-export.json')
const confirm = process.argv.includes('--confirm')
const revertFile = flag('revert')

interface Plan {
  createdAt: string
  confirmed: boolean
  file: string
  /**
   * **파일이 잘려도 되돌릴 수 있게** 술어를 함께 적는다 (2026-09-02).
   *
   * 아래 목록은 마지막 한 묶음이 빠질 수 있다. 그때는 이 술어로 고른다 —
   * 이 잡 말고는 이런 행을 만드는 것이 없다.
   */
  revertBy: { players: string; stats: string }
  /** 이번에 **새로 만든** 선수. 되돌릴 때 지운다 */
  createdPlayers: Array<{ playerId: string; usn: string; sourcePlayerId: string }>
  /** 이번에 **새로 만든** 참가 기록. 되돌릴 때 지운다 */
  createdStats: Array<{ matchId: string; playerId: string }>
}

/* ------------------------------------------------------------ 되돌리기 --- */

async function revert(planPath: string): Promise<void> {
  const plan = JSON.parse(readFileSync(planPath, 'utf8')) as Plan
  console.info(`되돌린다 — 참가 ${plan.createdStats.length} · 선수 ${plan.createdPlayers.length}`)
  if (!confirm) {
    console.info('--confirm 없이는 한 줄도 지우지 않는다')
    return
  }
  let stats = 0
  for (let i = 0; i < plan.createdStats.length; i += 200) {
    for (const row of plan.createdStats.slice(i, i + 200)) {
      const deleted = await prisma.matchPlayerStat.deleteMany({
        where: { matchId: row.matchId, playerId: row.playerId },
      })
      stats += deleted.count
    }
  }
  /* 선수는 **참가 기록이 하나도 안 남았을 때만** 지운다. 남의 기록을 끊지 않는다 */
  let players = 0
  for (const row of plan.createdPlayers) {
    const left = await prisma.matchPlayerStat.count({ where: { playerId: row.playerId } })
    if (left > 0) continue
    await prisma.player.deleteMany({ where: { id: row.playerId, origin: PLAYER_ORIGIN } })
    players += 1
  }
  console.info(`되돌렸다 — 참가 ${stats} · 선수 ${players}`)
}

/* ---------------------------------------------------------------- 본체 --- */

async function main(): Promise<void> {
  if (revertFile) {
    await revert(revertFile)
    return
  }

  const doc = JSON.parse(readFileSync(file, 'utf8')) as {
    players: IplLineupExportPlayer[]
    stats: IplLineupExportStat[]
  }
  const players = doc.players ?? []
  const stats = doc.stats ?? []
  console.info(`파일 — 선수 ${players.length} · 참가 ${stats.length}`)

  const league = await prisma.league.findUnique({
    where: { slug: LEAGUE_SLUG },
    select: { id: true },
  })
  if (!league) throw new Error(`리그 ${LEAGUE_SLUG} 이 없다`)

  /* ── 1. 이 DB 의 경기 --------------------------------------------------- */
  const keys = [...new Set(stats.map((s) => s.sourceMatchId))]
  interface Side {
    leagueClanId: string
    clanName: string
    clanSlug: string
    markBgUrl: string | null
    markFrontUrl: string | null
    division: number
  }
  const matchOf = new Map<string, { id: string; startAt: Date; red: Side; blue: Side }>()
  for (let i = 0; i < keys.length; i += 300) {
    const rows = await prisma.match.findMany({
      where: {
        leagueId: league.id,
        origin: MATCH_ORIGIN,
        sourceMatchId: { in: keys.slice(i, i + 300) },
      },
      select: {
        id: true,
        sourceMatchId: true,
        startAt: true,
        redDivisionAtMatch: true,
        blueDivisionAtMatch: true,
        redClan: {
          select: {
            id: true,
            clan: { select: { name: true, slug: true, markBgUrl: true, markFrontUrl: true } },
          },
        },
        blueClan: {
          select: {
            id: true,
            clan: { select: { name: true, slug: true, markBgUrl: true, markFrontUrl: true } },
          },
        },
      },
    })
    for (const row of rows) {
      if (!row.sourceMatchId) continue
      const side = (c: (typeof row)['redClan'], division: number): Side => ({
        leagueClanId: c.id,
        clanName: c.clan.name,
        clanSlug: c.clan.slug,
        markBgUrl: c.clan.markBgUrl,
        markFrontUrl: c.clan.markFrontUrl,
        division,
      })
      matchOf.set(row.sourceMatchId, {
        id: row.id,
        startAt: row.startAt,
        red: side(row.redClan, row.redDivisionAtMatch),
        blue: side(row.blueClan, row.blueDivisionAtMatch),
      })
    }
  }
  const missingMatches = keys.filter((k) => !matchOf.has(k))
  console.info(`경기 — 파일 ${keys.length} · 이 DB 에 있다 ${matchOf.size} · 없다 ${missingMatches.length}`)

  /* ── 2. 사람 찾기 — 순서가 곧 안전장치다 ------------------------------- */
  const resolved = new Map<string, { playerId: string; how: string }>()
  const source = new Map<string, IplLineupExportPlayer>(players.map((p) => [p.usn, p]))

  /* 1순위 — 사람이 확인해 이어 둔 신원 */
  const usns = players.map((p) => p.usn)
  for (let i = 0; i < usns.length; i += 400) {
    for (const row of await prisma.nexonIdentity.findMany({
      where: { barracksUsn: { in: usns.slice(i, i + 400) }, playerId: { not: null } },
      select: { barracksUsn: true, playerId: true },
    })) {
      if (row.barracksUsn && row.playerId) {
        resolved.set(row.barracksUsn, { playerId: row.playerId, how: 'identity' })
      }
    }
  }

  /* 2순위 — 3rd.supply 로 이미 있는 사람. **여기가 중복을 막는 자리다** */
  const bySn = new Map<string, string>()
  for (const p of players) if (p.nexonSn && !resolved.has(p.usn)) bySn.set(p.nexonSn, p.usn)
  const sns = [...bySn.keys()]
  for (let i = 0; i < sns.length; i += 400) {
    for (const row of await prisma.player.findMany({
      where: { sourcePlayerId: { in: sns.slice(i, i + 400) } },
      select: { id: true, sourcePlayerId: true, origin: true },
    })) {
      const usn = row.sourcePlayerId ? bySn.get(row.sourcePlayerId) : undefined
      if (usn) resolved.set(usn, { playerId: row.id, how: `supply:${row.origin}` })
    }
  }

  /* 3순위 — 지난번에 우리가 민 사람 */
  const left = players.filter((p) => !resolved.has(p.usn)).map((p) => PLAYER_PREFIX + p.usn)
  for (let i = 0; i < left.length; i += 400) {
    for (const row of await prisma.player.findMany({
      where: { sourcePlayerId: { in: left.slice(i, i + 400) } },
      select: { id: true, sourcePlayerId: true },
    })) {
      if (row.sourcePlayerId?.startsWith(PLAYER_PREFIX)) {
        resolved.set(row.sourcePlayerId.slice(PLAYER_PREFIX.length), {
          playerId: row.id,
          how: 'brk',
        })
      }
    }
  }

  /* 두 계정이 같은 운영 선수로 풀리면 **둘 다 뺀다.** 어느 쪽이 맞는지 모른다 */
  const byPlayer = new Map<string, string[]>()
  for (const [usn, r] of resolved) {
    if (!byPlayer.has(r.playerId)) byPlayer.set(r.playerId, [])
    byPlayer.get(r.playerId)?.push(usn)
  }
  const collided: string[] = []
  for (const [, list] of byPlayer) {
    if (list.length > 1) {
      collided.push(...list)
      for (const usn of list) resolved.delete(usn)
    }
  }

  const how = new Map<string, number>()
  for (const [, r] of resolved) how.set(r.how, (how.get(r.how) ?? 0) + 1)
  const toCreate = players.filter((p) => !resolved.has(p.usn) && !collided.includes(p.usn))

  /*
    ★ 붙인 사람이 정말 그 사람인가 — **닉으로 교차검증한다** ★

    `user_nexon_sn` 이 곧 3rd.supply 의 `player.id` 라는 것이 이 연결의 근거인데,
    그 근거가 틀렸다면 **남의 기록에 우리 경기를 붙이게 된다.** 되돌리기 가장 어려운 사고다.
    그래서 쓰기 전에 한 번 더 잰다 — 우리가 배틀로그에서 본 닉과 운영 `Player.name` 이
    같은가. 닉은 바뀌므로 100% 를 기대하지 않는다. **몇 %인지 사람이 보고 판단한다.**
  */
  const resolvedIds = [...resolved.values()].map((r) => r.playerId)
  const nameOf = new Map<string, string>()
  for (let i = 0; i < resolvedIds.length; i += 400) {
    for (const row of await prisma.player.findMany({
      where: { id: { in: resolvedIds.slice(i, i + 400) } },
      select: { id: true, name: true },
    })) {
      nameOf.set(row.id, row.name)
    }
  }
  let nameSame = 0
  let nameDiff = 0
  let nameUnknown = 0
  const diffSample: string[] = []
  for (const [usn, r] of resolved) {
    const ours = source.get(usn)?.name ?? null
    const theirs = nameOf.get(r.playerId) ?? null
    if (ours === null || theirs === null) {
      nameUnknown += 1
      continue
    }
    if (ours === theirs) nameSame += 1
    else {
      nameDiff += 1
      if (diffSample.length < 8) diffSample.push(`${ours} ↔ ${theirs}`)
    }
  }
  const nameTotal = nameSame + nameDiff
  console.info('')
  console.info('=== 닉 대조 — ⚠ 이것은 **닉 변경률**이다. 연결 정확도가 아니다 ===')
  console.info(
    `  닉이 같다 ${nameSame} / ${nameTotal}` +
      (nameTotal ? ` (${((nameSame / nameTotal) * 100).toFixed(1)}%)` : '') +
      ` · 다르다 ${nameDiff} · 한쪽을 모른다 ${nameUnknown}`,
  )
  if (diffSample.length) console.info(`  다른 것 표본: ${diffSample.join(' / ')}`)
  /*
    ⚠ 이 숫자를 「연결이 틀렸다」로 읽지 마라 (2026-09-01).

    두 이름의 **시점이 다르다** — 우리 쪽은 그 계정의 가장 오래된 경기 닉이고
    (`battlelogLineup` 이 matchKey 오름차순으로 첫 관측 닉을 쓴다),
    운영 쪽은 미러 적재 시점 닉이다. 그래서 이 값은 사실상 **닉 변경률**이다.
    실제로 처음 재고 31.9% 가 나와 멀쩡한 연결을 막을 뻔했다.

    연결이 옳은지는 **시점을 맞춰** 이미 쟀다. 근거는 `docs/DECISIONS.md` D-255 4장.
  */
  console.info('  연결 정확도는 시점을 맞춰 따로 쟀다 — 같은 경기 안 닉 대조 43,682/43,682 = 100.00%')
  console.info('  (같은 대조에서 킬 100.000% · 데스 99.995% · 명단 4,366/4,367 경기 일치)')
  console.info('  근거: docs/DECISIONS.md D-255 4장. 우리 닉은 **가장 오래된 경기** 기준이라 시간이 흐르면 갈린다')

  console.info('')
  console.info('=== 선수 ===')
  console.info(`  기존 선수와 이어짐  ${resolved.size}`)
  for (const [key, count] of [...how].sort((a, b) => b[1] - a[1])) {
    console.info(`      ${key.padEnd(20)} ${count}`)
  }
  console.info(`  새로 만든다        ${toCreate.length}`)
  console.info(`  겹쳐서 뺀다        ${collided.length}${collided.length ? ` (${collided.slice(0, 5).join(', ')})` : ''}`)

  /* ── 3. 계획 세기 ------------------------------------------------------- */
  const usable = stats.filter(
    (s) => matchOf.has(s.sourceMatchId) && !collided.includes(s.usn) && source.has(s.usn),
  )
  const droppedNoMatch = stats.filter((s) => !matchOf.has(s.sourceMatchId)).length
  const droppedCollide = stats.filter((s) => collided.includes(s.usn)).length

  console.info('')
  console.info('=== 참가 기록 ===')
  console.info(`  넣을 것            ${usable.length}`)
  console.info(`  경기가 없어 뺀다   ${droppedNoMatch}`)
  console.info(`  선수가 겹쳐 뺀다   ${droppedCollide}`)

  /* 이미 있는 것 세기 — 신규/갱신을 가른다 (멱등 확인용) */
  const existing = new Set<string>()
  const matchIds = [...new Set(usable.map((s) => matchOf.get(s.sourceMatchId)!.id))]
  for (let i = 0; i < matchIds.length; i += 300) {
    for (const row of await prisma.matchPlayerStat.findMany({
      where: { matchId: { in: matchIds.slice(i, i + 300) } },
      select: { matchId: true, playerId: true },
    })) {
      existing.add(`${row.matchId} ${row.playerId}`)
    }
  }
  const alreadyThere = usable.filter((s) => {
    const r = resolved.get(s.usn)
    return r && existing.has(`${matchOf.get(s.sourceMatchId)!.id} ${r.playerId}`)
  }).length
  console.info(`  그중 이미 있는 것  ${alreadyThere}  (다시 돌려도 안 늘어난다)`)

  mkdirSync(BACKUP_DIR, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const plan: Plan = {
    createdAt: new Date().toISOString(),
    confirmed: confirm,
    file,
    revertBy: {
      players: `Player where sourcePlayerId LIKE '${PLAYER_PREFIX}%' AND origin = '${PLAYER_ORIGIN}'`,
      stats: `MatchPlayerStat where match.leagueId = (league '${LEAGUE_SLUG}') AND match.origin = '${MATCH_ORIGIN}'`,
    },
    createdPlayers: [],
    createdStats: [],
  }

  if (!confirm) {
    const planPath = path.join(BACKUP_DIR, `plan-${stamp}.json`)
    writeFileSync(planPath, JSON.stringify(plan, null, 1))
    console.info('')
    console.info('미리보기다. 한 줄도 쓰지 않았다.')
    console.info(`계획 파일: ${planPath}`)
    console.info('적용하려면 --confirm')
    await prisma.$disconnect()
    return
  }

  /* ── 4. 쓰기 ------------------------------------------------------------ */
  /*
    ★ **쓰기 전에 먼저 남긴다** (2026-09-02 · 실제로 당하고 고쳤다)

    예전에는 계획 파일을 **끝까지 돌아야** 썼다. 그런데 15,620행을 미는 도중
    Supavisor 가 끊겨 90.6% 에서 죽었고, **그래서 계획 파일이 한 줄도 안 남았다.**
    되돌릴 근거가 사라진 것이다.

    지금은 세 번 남긴다 — 시작할 때 · 선수를 다 만든 뒤 · 끝났을 때.
    중간에 죽어도 **그 시점까지 만든 것**이 파일에 남는다.
    (그래도 마지막 한 묶음은 못 적을 수 있다. 그래서 아래 술어를 파일에 함께 적는다)
  */
  const planPath = path.join(BACKUP_DIR, `applied-${stamp}.json`)
  const save = () => writeFileSync(planPath, JSON.stringify(plan, null, 1))
  save()
  console.info('')
  console.info(`쓰기 시작 — 계획 파일을 먼저 남겼다: ${planPath}`)

  for (const p of toCreate) {
    const created = await prisma.player.upsert({
      where: { sourcePlayerId: PLAYER_PREFIX + p.usn },
      update: {},
      create: {
        name: p.name ?? p.usn,
        origin: PLAYER_ORIGIN,
        sourcePlayerId: PLAYER_PREFIX + p.usn,
      },
      select: { id: true },
    })
    resolved.set(p.usn, { playerId: created.id, how: 'created' })
    plan.createdPlayers.push({
      playerId: created.id,
      usn: p.usn,
      sourcePlayerId: PLAYER_PREFIX + p.usn,
    })
  }
  /* 선수를 다 만든 지점에서 한 번 더 남긴다 — 참가 기록이 오래 걸리는 구간이다 */
  save()
  if (plan.createdPlayers.length) console.info(`선수 ${plan.createdPlayers.length}명 생성 — 계획 파일 갱신`)

  let created = 0
  let updated = 0
  for (const s of usable) {
    const target = resolved.get(s.usn)
    const match = matchOf.get(s.sourceMatchId)
    if (!target || !match) continue
    const own = s.side === 'red' ? match.red : match.blue
    const opponent = s.side === 'red' ? match.blue : match.red
    const data = {
      side: s.side,
      kill: s.kill,
      death: s.death,
      /* 배틀로그에 없는 칸은 전부 null 이다. 0 으로 지어내지 않는다 */
      assist: null,
      headshot: null,
      damage: null,
      weapon: s.weapon,
      dropout: null,
      mvp: null,
      matchTimeClanName: own.clanName,
      matchTimeLeagueClanId: own.leagueClanId,
      matchTimeClanSlug: own.clanSlug,
      matchTimeClanMarkBgUrl: own.markBgUrl,
      matchTimeClanMarkFrontUrl: own.markFrontUrl,
      matchTimeClanSource: CLAN_SOURCE,
      matchTimeClanObservedAt: match.startAt,
      matchTimeClanConfidence: 'medium',
      playerDivisionAtMatch: own.division,
      opponentDivisionAtMatch: opponent.division,
    }
    const key = `${match.id} ${target.playerId}`
    await prisma.matchPlayerStat.upsert({
      where: { matchId_playerId: { matchId: match.id, playerId: target.playerId } },
      create: { matchId: match.id, playerId: target.playerId, ...data },
      update: data,
    })
    if (existing.has(key)) updated += 1
    else {
      created += 1
      plan.createdStats.push({ matchId: match.id, playerId: target.playerId })
      /* 500행마다 남긴다. 중간에 끊겨도 그 앞까지는 되돌릴 수 있다 */
      if (plan.createdStats.length % 500 === 0) save()
    }
  }

  save()
  console.info('')
  console.info(`반영 완료 — 참가 신규 ${created} · 갱신 ${updated} · 선수 신규 ${plan.createdPlayers.length}`)
  console.info(`계획 파일: ${planPath}`)
  console.info(`되돌리려면: node scripts/prod-run.mjs ipl-lineup-push --revert "${planPath}" --confirm`)
  console.info('집계는 따로다 — node scripts/prod-run.mjs season0-apply --leagues nolink --confirm')
  await prisma.$disconnect()
}

void main()
