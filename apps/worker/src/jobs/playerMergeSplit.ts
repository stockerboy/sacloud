/**
 * ★★두 갈래 난 선수 합치기★★ (2026-09-24 · 사장님 「혜밤 · 차준성 기록이 갈라져서 나와 — 같은 계정인데 두 갈래」)
 *
 * ── 왜 갈라졌나 (운영 실측 · scratchpad/vps_probe26~27.mjs)
 *   ```
 *   혜밤    SUP-1644337843 (3rd.supply 출신 · des`per@do. · 2025-04 경기 1)   ← 미러 시절 줄
 *           cmue7zmhm…    (병영수첩 출신 · BRK-30E26B1A… · 09-23 경기 4)       ← 어제 새로 생긴 줄
 *   차준성  SUP-1527186467 (멘토르 · 2025-07 경기 1)  +  cmue7zmit… (BRK · 09-23 경기 4)
 *   ```
 *   `battlelog-lineup` 은 사람을 ★계정(`str_usn`)★ 으로만 알아본다 (닉으로 안 합친다 — 위장닉 · D-221).
 *   미러 시절 선수는 `sourcePlayerId` 가 ★서플라이 숫자 ID★ 라 병영 `usn` 과 이어질 다리가 없다.
 *   그래서 미러 시절에 있던 사람이 병영수첩에 처음 보이면 ★새 선수★ 가 된다. 같은 이름 · 같은 리그클랜 쌍이 114줄(2026-09-24).
 *
 * ── 잇는 규칙 (좁게 · 지어내지 않는다)
 *   ★같은 이름 + 같은 리그 + 같은(비어 있지 않은) 클랜★ 인 3rd.supply 선수 ↔ 병영 선수 한 쌍.
 *   · 그 이름의 3rd.supply 후보가 둘 이상이거나 병영 후보가 둘 이상이면 ★안 잇는다★ (어느 쪽인지 모른다 · D-106)
 *   · 클랜이 둘 다 비어 있는(무소속) 쌍은 ★안 잇는다★ — 이름 하나로는 같은 사람이라 못 한다. 수만 센다
 *   · 이미 합친 줄(`note` 가 `merged-into:` 로 시작)은 다시 안 본다
 *
 * ── 무엇을 하나 — ★지우지 않는다. 옮기고 숨긴다★ (CLAUDE.md 1-4 · 2-2)
 *   병영 줄(BRK)이 ★본줄★ 이다 (사장님 2026-09-19 「무조건 병영수첩 기준」).
 *   1. 참가 기록(`MatchPlayerStat`) · 경기 육각(`MatchPlayerHex`) · 무기 근거 · MVP · 명부 이력을 SUP → BRK 로 옮긴다.
 *      같은 경기에 BRK 줄이 이미 있으면 그 줄은 ★안 옮기고 센다★ (겹침)
 *   2. `LeaguePlayer`: BRK 가 그 리그에 이미 있으면 SUP 줄을 ★백업하고 지운다★(랭킹·검색에서 그림자를 없애려면 이 길뿐이다) ·
 *      없으면 SUP 줄을 BRK 로 옮긴다(등록·클랜이 그대로 산다)
 *   3. SUP `Player.note` 에 `merged-into:<BRK id> <날짜>` 를 적는다 — 검색이 이 표시를 보고 숨긴다. 줄은 남는다
 *   4. 되돌릴 파일을 먼저 쓴다 — `data/player-merge/<날짜>.jsonl`. `--revert <파일>` 이면 그대로 되돌린다
 *
 * ── ⚠ 점수 래더·육각 집계는 다시 세야 한다
 *   `score-ladder-build` · `player-hex-build` 가 `MatchPlayerHex` 를 다시 읽으면 BRK 줄 하나로 모인다. 여기서는 안 센다.
 *
 * ```
 * pnpm --filter @sacloud/worker nexon player-merge-split                     # 미리보기 (한 줄도 안 쓴다)
 * pnpm --filter @sacloud/worker nexon player-merge-split --names 혜밤,차준성   # 이름을 좁혀서
 * pnpm --filter @sacloud/worker nexon player-merge-split --confirm
 * pnpm --filter @sacloud/worker nexon player-merge-split --revert data/player-merge/2026-09-24.jsonl
 * ```
 */
import { existsSync, mkdirSync, readFileSync, appendFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { prisma, type Prisma } from '@sacloud/db'
import { log, warn } from '../lib/log.js'

export const MERGED_NOTE_PREFIX = 'merged-into:'

export interface MergePair {
  name: string
  supId: string
  brkId: string
  leagueSlug: string
  clanName: string
  supStats: number
  brkStats: number
}

export interface MergePlan extends MergePair {
  /** 옮길 참가 기록 · 겹쳐서 못 옮기는 참가 기록 */
  statsMove: number
  statsClash: number
  hexMove: number
  hexClash: number
  weaponMove: number
  mvpMove: number
  rosterMove: number
  rosterClash: number
  /** SUP 의 LeaguePlayer — BRK 가 그 리그에 있어 지울 줄 · 없어서 옮길 줄 */
  leagueDelete: string[]
  leagueMove: string[]
}

export interface MergeResult {
  pairs: MergePlan[]
  /** 이름·클랜이 같은데 후보가 둘 이상이라 건너뛴 이름 */
  ambiguous: string[]
  /** 클랜이 둘 다 비어 있어 안 잇는 쌍 수 (참고) */
  clanlessPairs: number
  confirmed: boolean
  backupPath: string | null
}

interface PairRow {
  name: string
  sup_id: string
  brk_id: string
  league: string
  clan: string
  sup_stats: number
  brk_stats: number
  sup_note: string | null
}

const kstDate = (): string => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)

async function findPairs(names?: readonly string[]): Promise<{ pairs: MergePair[]; ambiguous: string[]; clanless: number }> {
  const rows = await prisma.$queryRaw<PairRow[]>`
    WITH sup AS (
      SELECT pl."id", pl."name", pl."note", lp."leagueId", lp."clanId"
      FROM "Player" pl JOIN "LeaguePlayer" lp ON lp."playerId" = pl."id"
      WHERE pl."origin" = '3rd.supply'
    ), brk AS (
      SELECT pl."id", pl."name", lp."leagueId", lp."clanId"
      FROM "Player" pl JOIN "LeaguePlayer" lp ON lp."playerId" = pl."id"
      WHERE pl."origin" = 'nexon_barracks'
    )
    SELECT DISTINCT s."name", s."id" AS sup_id, b."id" AS brk_id, l."slug" AS league, c."name" AS clan, s."note" AS sup_note,
      (SELECT COUNT(*)::int FROM "MatchPlayerStat" x WHERE x."playerId" = s."id") AS sup_stats,
      (SELECT COUNT(*)::int FROM "MatchPlayerStat" x WHERE x."playerId" = b."id") AS brk_stats
    FROM sup s
    JOIN brk b ON b."name" = s."name" AND b."leagueId" = s."leagueId" AND b."clanId" = s."clanId"
    JOIN "League" l ON l."id" = s."leagueId"
    JOIN "Clan" c ON c."id" = s."clanId"
    ORDER BY s."name"`
  const clanless = await prisma.$queryRaw<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM (
      SELECT DISTINCT a."id", b."id" AS bid
      FROM "Player" a JOIN "LeaguePlayer" la ON la."playerId" = a."id"
      JOIN "Player" b ON b."name" = a."name" AND b."origin" = 'nexon_barracks'
      JOIN "LeaguePlayer" lb ON lb."playerId" = b."id" AND lb."leagueId" = la."leagueId"
      WHERE a."origin" = '3rd.supply' AND la."clanId" IS NULL AND lb."clanId" IS NULL
    ) t`
  const byName = new Map<string, PairRow[]>()
  for (const r of rows) {
    if (names && !names.includes(r.name)) continue
    if (r.sup_note !== null && r.sup_note.startsWith(MERGED_NOTE_PREFIX)) continue
    byName.set(r.name, [...(byName.get(r.name) ?? []), r])
  }
  const pairs: MergePair[] = []
  const ambiguous: string[] = []
  for (const [name, list] of byName) {
    const sups = new Set(list.map((r) => r.sup_id))
    const brks = new Set(list.map((r) => r.brk_id))
    if (sups.size !== 1 || brks.size !== 1) { ambiguous.push(name); continue }
    const r = list[0] as PairRow
    pairs.push({ name, supId: r.sup_id, brkId: r.brk_id, leagueSlug: list.map((x) => x.league).join('·'), clanName: r.clan, supStats: r.sup_stats, brkStats: r.brk_stats })
  }
  return { pairs, ambiguous, clanless: clanless[0]?.n ?? 0 }
}

/**
 * 한 쌍(SUP → BRK)을 옮길 계획. ★읽기만 한다.★
 *
 * 2026-09-25 — `accountSplitMerge`(계정번호 기준 병합)가 같은 계획·같은 적용을 쓰도록 export 했고,
 * 옮기는 표를 넓혔다: 회원 연동(`UserPlayerLink`) · 신고 · 깃발 · 연동 신청 · 계정표(`NexonIdentity`) ·
 * 클랜 마스터 · 자리/라운드/플레이스타일 프로필 · 자기소개 인증. 전에는 참가·육각·무기·MVP·명부·LeaguePlayer 만 옮겨서
 * 껍데기에 회원 연동이 남아 「내 선수」 가 기록 없는 줄을 가리키는 일이 있었다.
 */
export async function planOf(pair: MergePair): Promise<MergePlan & { ids: BackupLine['ids'] }> {
  /*
   * ⚠ 2026-09-25 — ★질의를 나란히 던지지 않는다★ (`Promise.all` 이었다). 배치용 풀은 연결이 2개뿐이라
   *   DB 가 밀리는 시각(season0-apply · hex 빌드)에 「Timed out fetching a new connection from the connection pool」 로
   *   168쌍 만에 죽었다. 한 줄씩 차례로 읽는다 — 느려도 죽지 않는 쪽이 낫다.
   */
  const supStats = await prisma.matchPlayerStat.findMany({ where: { playerId: pair.supId }, select: { id: true, matchId: true } })
  const brkStats = await prisma.matchPlayerStat.findMany({ where: { playerId: pair.brkId }, select: { matchId: true } })
  const brkMatches = new Set(brkStats.map((s) => s.matchId))
  const statsMove = supStats.filter((s) => !brkMatches.has(s.matchId)).map((s) => s.id)
  /* MatchPlayerHex 는 id 가 없다 — (playerId, matchId) 가 키라 matchId 로 옮긴다 */
  const supHex = await prisma.matchPlayerHex.findMany({ where: { playerId: pair.supId }, select: { matchId: true } })
  const brkHex = await prisma.matchPlayerHex.findMany({ where: { playerId: pair.brkId }, select: { matchId: true } })
  const brkHexMatches = new Set(brkHex.map((h) => h.matchId))
  const hexMove = supHex.filter((h) => !brkHexMatches.has(h.matchId)).map((h) => h.matchId)
  const weapon = await prisma.matchWeaponEvidence.findMany({ where: { playerId: pair.supId }, select: { id: true } })
  const mvp = await prisma.match.findMany({ where: { mvpPlayerId: pair.supId }, select: { id: true } })
  const supRoster = await prisma.leagueRosterMembership.findMany({ where: { playerId: pair.supId }, select: { id: true, leagueClanId: true, joinedAt: true } })
  const brkRoster = await prisma.leagueRosterMembership.findMany({ where: { playerId: pair.brkId }, select: { leagueClanId: true, joinedAt: true } })
  const brkRosterKeys = new Set(brkRoster.map((r) => `${r.leagueClanId}|${r.joinedAt.toISOString()}`))
  const rosterMove = supRoster.filter((r) => !brkRosterKeys.has(`${r.leagueClanId}|${r.joinedAt.toISOString()}`)).map((r) => r.id)
  const supLeague = await prisma.leaguePlayer.findMany({ where: { playerId: pair.supId } })
  const brkLeague = await prisma.leaguePlayer.findMany({ where: { playerId: pair.brkId }, select: { leagueId: true } })
  const brkLeagues = new Set(brkLeague.map((l) => l.leagueId))
  const leagueDelete = supLeague.filter((l) => brkLeagues.has(l.leagueId))
  const leagueMove = supLeague.filter((l) => !brkLeagues.has(l.leagueId)).map((l) => l.id)

  /* ── 2026-09-25 추가 — 사람에 딸린 나머지 표 ── */
  /* 회원 연동은 선수당 하나(`playerId` unique) — BRK 가 이미 연동돼 있으면 SUP 것은 두고(껍데기에 남음) 센다 */
  const supLink = await prisma.userPlayerLink.findUnique({ where: { playerId: pair.supId }, select: { userId: true } })
  const brkLink = await prisma.userPlayerLink.findUnique({ where: { playerId: pair.brkId }, select: { userId: true } })
  const userLinkMove = supLink && !brkLink ? [supLink.userId] : []
  /* 신고: (playerId, userId, day) 유일 — BRK 에 같은 (userId, day) 가 있으면 그 줄은 안 옮긴다 */
  const supReports = await prisma.playerReport.findMany({ where: { playerId: pair.supId }, select: { id: true, userId: true, day: true } })
  const brkReports = await prisma.playerReport.findMany({ where: { playerId: pair.brkId }, select: { userId: true, day: true } })
  const brkReportKeys = new Set(brkReports.map((r) => `${r.userId}|${r.day}`))
  const reportMove = supReports.filter((r) => !brkReportKeys.has(`${r.userId}|${r.day}`)).map((r) => r.id)
  /* 깃발: 유일키가 (league, day, rank) 라 playerId 만 바꾸면 된다 */
  const flagMove = (await prisma.leagueFlag.findMany({ where: { playerId: pair.supId }, select: { id: true } })).map((f) => f.id)
  /* 연동 신청: (userId, playerId) 유일 — BRK 에 같은 userId 신청이 있으면 안 옮긴다 */
  const supClaims = await prisma.playerLinkClaim.findMany({ where: { playerId: pair.supId }, select: { id: true, userId: true } })
  const brkClaims = await prisma.playerLinkClaim.findMany({ where: { playerId: pair.brkId }, select: { userId: true } })
  const brkClaimUsers = new Set(brkClaims.map((c) => c.userId))
  const claimMove = supClaims.filter((c) => !brkClaimUsers.has(c.userId)).map((c) => c.id)
  const identityMove = (await prisma.nexonIdentity.findMany({ where: { playerId: pair.supId }, select: { id: true } })).map((r) => r.id)
  const masterMove = (await prisma.clan.findMany({ where: { masterPlayerId: pair.supId }, select: { id: true } })).map((c) => c.id)
  const positionMove = (await prisma.playerPositionProfile.findMany({ where: { playerId: pair.supId }, select: { id: true } })).map((r) => r.id)
  const roundMove = (await prisma.playerRoundProfile.findMany({ where: { playerId: pair.supId }, select: { id: true } })).map((r) => r.id)
  const playstyleMove = (await prisma.playerPlaystyleProfile.findMany({ where: { playerId: pair.supId }, select: { id: true } })).map((r) => r.id)
  const introMove = (await prisma.introChallenge.findMany({ where: { playerId: pair.supId }, select: { id: true } })).map((r) => r.id)
  return {
    ...pair,
    statsMove: statsMove.length,
    statsClash: supStats.length - statsMove.length,
    hexMove: hexMove.length,
    hexClash: supHex.length - hexMove.length,
    weaponMove: weapon.length,
    mvpMove: mvp.length,
    rosterMove: rosterMove.length,
    rosterClash: supRoster.length - rosterMove.length,
    leagueDelete: leagueDelete.map((l) => l.id),
    leagueMove,
    ids: {
      stats: statsMove,
      hex: hexMove,
      weapon: weapon.map((w) => w.id),
      mvp: mvp.map((m) => m.id),
      roster: rosterMove,
      leagueMove,
      leagueDeleted: leagueDelete,
      userLink: userLinkMove,
      report: reportMove,
      flag: flagMove,
      claim: claimMove,
      identity: identityMove,
      master: masterMove,
      position: positionMove,
      round: roundMove,
      playstyle: playstyleMove,
      intro: introMove,
    },
  }
}

interface BackupLine {
  at: string
  pair: MergePair
  supNoteBefore: string | null
  ids: {
    stats: string[]
    /** 옮긴 육각의 matchId (MatchPlayerHex 는 id 가 없다) */
    hex: string[]
    weapon: string[]
    mvp: string[]
    roster: string[]
    leagueMove: string[]
    /** 지운 LeaguePlayer 줄 전체 — 되돌릴 때 그대로 다시 만든다 */
    leagueDeleted: Prisma.LeaguePlayerGetPayload<Record<string, never>>[]
    /* ── 2026-09-25 추가 — 옛 백업 줄에는 없다. 읽을 때 `?? []` 로 받는다 ── */
    /** 옮긴 회원 연동의 userId (`UserPlayerLink` 는 userId 가 키다) */
    userLink?: string[]
    report?: string[]
    flag?: string[]
    claim?: string[]
    identity?: string[]
    /** 마스터를 옮긴 클랜 id */
    master?: string[]
    position?: string[]
    round?: string[]
    playstyle?: string[]
    intro?: string[]
  }
}

/** ★한 쌍을 실제로 옮긴다★ — 백업 한 줄을 먼저 쓰고, 한 트랜잭션으로 옮긴다. `runPlayerMergeSplit` 과 `accountSplitMerge` 가 같이 쓴다 */
export async function applyMergePlan(pair: MergePair, ids: BackupLine['ids'], backupPath: string): Promise<void> {
  const sup = await prisma.player.findUnique({ where: { id: pair.supId }, select: { note: true } })
  const line: BackupLine = { at: new Date().toISOString(), pair, supNoteBefore: sup?.note ?? null, ids }
  /* ★되돌릴 파일을 먼저★ — 쓰다 죽어도 무엇을 건드리려 했는지 남는다 */
  mkdirSync(dirname(backupPath), { recursive: true })
  appendFileSync(backupPath, JSON.stringify(line) + '\n')
  await prisma.$transaction(async (tx) => {
    if (ids.stats.length) await tx.matchPlayerStat.updateMany({ where: { id: { in: ids.stats } }, data: { playerId: pair.brkId } })
    if (ids.hex.length) await tx.matchPlayerHex.updateMany({ where: { playerId: pair.supId, matchId: { in: ids.hex } }, data: { playerId: pair.brkId } })
    if (ids.weapon.length) await tx.matchWeaponEvidence.updateMany({ where: { id: { in: ids.weapon } }, data: { playerId: pair.brkId } })
    if (ids.mvp.length) await tx.match.updateMany({ where: { id: { in: ids.mvp } }, data: { mvpPlayerId: pair.brkId } })
    if (ids.roster.length) await tx.leagueRosterMembership.updateMany({ where: { id: { in: ids.roster } }, data: { playerId: pair.brkId } })
    if (ids.leagueMove.length) await tx.leaguePlayer.updateMany({ where: { id: { in: ids.leagueMove } }, data: { playerId: pair.brkId } })
    if (ids.leagueDeleted.length) await tx.leaguePlayer.deleteMany({ where: { id: { in: ids.leagueDeleted.map((l) => l.id) } } })
    if (ids.userLink?.length) await tx.userPlayerLink.updateMany({ where: { userId: { in: ids.userLink } }, data: { playerId: pair.brkId } })
    if (ids.report?.length) await tx.playerReport.updateMany({ where: { id: { in: ids.report } }, data: { playerId: pair.brkId } })
    if (ids.flag?.length) await tx.leagueFlag.updateMany({ where: { id: { in: ids.flag } }, data: { playerId: pair.brkId } })
    if (ids.claim?.length) await tx.playerLinkClaim.updateMany({ where: { id: { in: ids.claim } }, data: { playerId: pair.brkId } })
    if (ids.identity?.length) await tx.nexonIdentity.updateMany({ where: { id: { in: ids.identity } }, data: { playerId: pair.brkId } })
    if (ids.master?.length) await tx.clan.updateMany({ where: { id: { in: ids.master } }, data: { masterPlayerId: pair.brkId } })
    if (ids.position?.length) await tx.playerPositionProfile.updateMany({ where: { id: { in: ids.position } }, data: { playerId: pair.brkId } })
    if (ids.round?.length) await tx.playerRoundProfile.updateMany({ where: { id: { in: ids.round } }, data: { playerId: pair.brkId } })
    if (ids.playstyle?.length) await tx.playerPlaystyleProfile.updateMany({ where: { id: { in: ids.playstyle } }, data: { playerId: pair.brkId } })
    if (ids.intro?.length) await tx.introChallenge.updateMany({ where: { id: { in: ids.intro } }, data: { playerId: pair.brkId } })
    const mark = `${MERGED_NOTE_PREFIX}${pair.brkId} ${kstDate()}`
    /* 껍데기는 소속도 비운다 — 클랜 명단·검색에서 옛 이름이 남지 않게 (`barracksIdentityMerge` 와 같은 규칙) */
    await tx.player.update({ where: { id: pair.supId }, data: { note: line.supNoteBefore ? `${mark} | ${line.supNoteBefore}` : mark, clanId: null } })
  }, {
    /* DB 가 밀리는 시각에도 죽지 않게 — 기본(5초)보다 넉넉히. 한 쌍은 많아야 수백 줄이다 */
    maxWait: 30_000,
    timeout: 120_000,
  })
}

export async function runPlayerMergeSplit(options: { confirm?: boolean; names?: readonly string[]; backupPath?: string } = {}): Promise<MergeResult> {
  const confirm = options.confirm ?? false
  const { pairs, ambiguous, clanless } = await findPairs(options.names)
  const plans: MergePlan[] = []
  const backupPath = options.backupPath ?? `data/player-merge/${kstDate()}.jsonl`
  if (confirm && pairs.length > 0) mkdirSync(dirname(backupPath), { recursive: true })
  for (const pair of pairs) {
    const plan = await planOf(pair)
    const { ids, ...rest } = plan
    plans.push(rest)
    if (!confirm) continue
    await applyMergePlan(pair, ids, backupPath)
    log(`합침 ${pair.name} — ${pair.supId} → ${pair.brkId} · 참가 ${ids.stats.length}(겹침 ${plan.statsClash}) · 육각 ${ids.hex.length} · LeaguePlayer 옮김 ${ids.leagueMove.length} 지움 ${ids.leagueDeleted.length}`)
  }
  if (ambiguous.length) warn(`후보가 둘 이상이라 건너뜀: ${ambiguous.join(' · ')}`)
  return { pairs: plans, ambiguous, clanlessPairs: clanless, confirmed: confirm, backupPath: confirm && pairs.length > 0 ? backupPath : null }
}

/** `--revert <파일>` — 백업 줄을 거꾸로 되돌린다. 한 쌍이 한 트랜잭션이다 */
export async function revertPlayerMergeSplit(path: string): Promise<{ reverted: number }> {
  if (!existsSync(path)) throw new Error(`백업 파일이 없다: ${path}`)
  const lines = readFileSync(path, 'utf8').split('\n').filter((l) => l.trim() !== '')
  let reverted = 0
  for (const raw of lines.reverse()) {
    const line = JSON.parse(raw) as BackupLine
    const { pair, ids } = line
    await prisma.$transaction(async (tx) => {
      if (ids.stats.length) await tx.matchPlayerStat.updateMany({ where: { id: { in: ids.stats } }, data: { playerId: pair.supId } })
      if (ids.hex.length) await tx.matchPlayerHex.updateMany({ where: { playerId: pair.brkId, matchId: { in: ids.hex } }, data: { playerId: pair.supId } })
      if (ids.weapon.length) await tx.matchWeaponEvidence.updateMany({ where: { id: { in: ids.weapon } }, data: { playerId: pair.supId } })
      if (ids.mvp.length) await tx.match.updateMany({ where: { id: { in: ids.mvp } }, data: { mvpPlayerId: pair.supId } })
      if (ids.roster.length) await tx.leagueRosterMembership.updateMany({ where: { id: { in: ids.roster } }, data: { playerId: pair.supId } })
      if (ids.leagueMove.length) await tx.leaguePlayer.updateMany({ where: { id: { in: ids.leagueMove } }, data: { playerId: pair.supId } })
      for (const row of ids.leagueDeleted) {
        const exists = await tx.leaguePlayer.findUnique({ where: { id: row.id }, select: { id: true } })
        if (!exists) await tx.leaguePlayer.create({ data: row as unknown as Prisma.LeaguePlayerUncheckedCreateInput })
      }
      if (ids.userLink?.length) await tx.userPlayerLink.updateMany({ where: { userId: { in: ids.userLink } }, data: { playerId: pair.supId } })
      if (ids.report?.length) await tx.playerReport.updateMany({ where: { id: { in: ids.report } }, data: { playerId: pair.supId } })
      if (ids.flag?.length) await tx.leagueFlag.updateMany({ where: { id: { in: ids.flag } }, data: { playerId: pair.supId } })
      if (ids.claim?.length) await tx.playerLinkClaim.updateMany({ where: { id: { in: ids.claim } }, data: { playerId: pair.supId } })
      if (ids.identity?.length) await tx.nexonIdentity.updateMany({ where: { id: { in: ids.identity } }, data: { playerId: pair.supId } })
      if (ids.master?.length) await tx.clan.updateMany({ where: { id: { in: ids.master } }, data: { masterPlayerId: pair.supId } })
      if (ids.position?.length) await tx.playerPositionProfile.updateMany({ where: { id: { in: ids.position } }, data: { playerId: pair.supId } })
      if (ids.round?.length) await tx.playerRoundProfile.updateMany({ where: { id: { in: ids.round } }, data: { playerId: pair.supId } })
      if (ids.playstyle?.length) await tx.playerPlaystyleProfile.updateMany({ where: { id: { in: ids.playstyle } }, data: { playerId: pair.supId } })
      if (ids.intro?.length) await tx.introChallenge.updateMany({ where: { id: { in: ids.intro } }, data: { playerId: pair.supId } })
      /* clanId 는 되돌리지 않는다 — 옛 소속은 이미 `clanAffiliation` 이 다시 정한다 */
      await tx.player.update({ where: { id: pair.supId }, data: { note: line.supNoteBefore } })
    })
    reverted += 1
    log(`되돌림 ${pair.name} — ${pair.brkId} → ${pair.supId}`)
  }
  return { reverted }
}
