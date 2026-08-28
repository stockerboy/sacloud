/**
 * 중복 선수 행 병합 (D-166).
 *
 * ── 무엇이 문제였나
 *
 * 한 사람이 **Player 행 두 개**로 쪼개져 있다. 실측(운영 DB · 2026-08-28):
 *
 *   · `huwho`     = `OBS-a7d2ab22a864bd2c7e59db70` · `sourcePlayerId` 없음 · supply 3판
 *   · `후후시치`  = `OBS-d0d0f16db3068ebb2ec468f2` · `sourcePlayerId=1561236212` · 256판
 *
 * 둘은 **같은 사람**이다. 넥슨 재구성 경기 `260823001903000001` 과
 * 미러 경기 `260823001903125001@sanply` 는 같은 경기이고(같은 시각·같은 라인업),
 * 넥슨 쪽에 `huwho` 16킬6데스가 있는 자리에 미러 쪽에는 `후후시치` 16킬6데스가 있다.
 *
 * 왜 갈라졌나 — 넥슨 재구성은 **닉네임 해시**로 `OBS-…` 행을 만들었고(Phase 8.2),
 * 미러 적재(`supply-push`)는 **원본 player id** 로 행을 만든다(D-156, create-only).
 * 그 사이에 닉네임이 바뀌면 같은 사람이 두 행이 된다.
 *
 * ── 왜 화면에서 눈에 띄나
 *
 * 미러 선수의 래더는 **원본 점수**(1500 근처)인데, 넥슨 잔재 행은 우리 공식 D-145 의
 * 기본값 **3000 근처**다. 그래서 1~8판짜리 잔재 행이 개인랭킹 30~100위를 차지한다.
 * 실측: supply 개인랭킹 상위 100 중 **61명이 10판 미만**이다.
 * 눌러 들어가면 "전적 3판"이 나온다 — 사용자가 신고한 그 증상이다.
 *
 * ── 판단 근거 (이름으로 묶지 않는다)
 *
 * 닉네임이 같다고 합치지 않는다. **경기 라인업 대조**만 근거로 쓴다.
 *
 *   1. 잔재 행이 뛴 넥슨 경기 M 의 경기번호 앞 12자리(YYMMDDHHMMSS)로 미러 쌍둥이 M' 를 찾는다
 *   2. M 과 M' 의 참가자 이름이 `MIN_NAME_OVERLAP` 명 이상 겹쳐야 같은 경기로 본다
 *   3. M' 참가자 중 **M 에 없는 이름**이면서 잔재 행과 킬·데스가 같은 사람이 후보다
 *   4. 잔재 행의 모든 경기에서 후보가 **하나로 모여야** 확정한다
 *
 * ── 안전장치
 *
 * · `--confirm` 없이는 한 줄도 쓰지 않는다
 * · `Player` 행을 **지우지 않는다**. 참가행(`MatchPlayerStat`)의 주인만 옮긴다
 * · 지우는 것은 **파생 집계**인 `LeaguePlayer` 뿐이고, 지우기 전에 내용을 전부 백업 파일에 적는다
 *   (`supply-rollup` 은 경기 없는 선수 행을 지우지 않는다 — 그래서 여기서 치운다)
 * · 백업 파일 하나로 **되돌릴 수 있다** (`--revert <파일>`)
 * · 멱등하다 — 이미 옮긴 행은 다시 옮기지 않는다
 *
 * ```bash
 * pnpm --filter @sacloud/worker exec tsx src/jobs/playerMerge.ts                  # 미리보기
 * pnpm --filter @sacloud/worker exec tsx src/jobs/playerMerge.ts --confirm
 * pnpm --filter @sacloud/worker exec tsx src/jobs/playerMerge.ts --revert <파일>
 * ```
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { prisma } from '@sacloud/db'
import { REPO_ROOT } from '../lib/env.js'

/** 미러링해 온 경기의 `Match.origin` */
const MIRROR_ORIGIN = '3rd.supply'
/** 넥슨 재구성 경기의 `Match.origin` */
const NEXON_ORIGIN = 'nexon'
/** 경기번호 앞 12자리 = YYMMDDHHMMSS. 쌍둥이 경기를 찾는 열쇠다 */
const MATCH_KEY_LENGTH = 12
/**
 * 두 경기를 같은 경기로 보는 최소 이름 겹침.
 *
 * 5v5 에서 7명이 겹치면 우연일 수 없다. 낮추면 오병합이 나고,
 * 10 으로 올리면 닉네임이 바뀐 사람이 둘 이상인 경기를 놓친다.
 */
const MIN_NAME_OVERLAP = 7

export interface MergePlan {
  /** 흡수되는 쪽 (넥슨 잔재 행) */
  fromPlayerId: string
  fromName: string
  /** 남는 쪽 (원본 id 를 가진 미러 행) */
  intoPlayerId: string
  intoName: string
  intoSourcePlayerId: string
  /** 근거가 된 경기 쌍 */
  evidence: { nexonMatchId: string; mirrorMatchId: string; kill: number | null; death: number | null }[]
  /** 옮길 참가행 */
  statIds: string[]
}

export interface MergeBackup {
  createdAt: string
  confirmed: boolean
  merges: MergePlan[]
  /** 지우기 전에 통째로 적어 둔 파생 집계 행 */
  removedLeaguePlayers: unknown[]
  removedWeaponStats: unknown[]
  removedSeasonStats: unknown[]
}

/** 참가자 한 명 */
interface Participant {
  playerId: string
  name: string
  sourcePlayerId: string | null
  kill: number | null
  death: number | null
}

async function participantsOf(matchId: string): Promise<Participant[]> {
  const rows = await prisma.matchPlayerStat.findMany({
    where: { matchId },
    select: {
      playerId: true,
      kill: true,
      death: true,
      player: { select: { name: true, sourcePlayerId: true } },
    },
  })
  return rows.map((r) => ({
    playerId: r.playerId,
    name: r.player.name,
    sourcePlayerId: r.player.sourcePlayerId,
    kill: r.kill,
    death: r.death,
  }))
}

/**
 * 넥슨 잔재 행 하나의 상대(같은 사람인 미러 행)를 찾는다.
 *
 * 하나로 모이지 않으면 **아무것도 하지 않는다.** 추측해서 합치는 것보다 남겨 두는 편이 낫다.
 */
async function resolveCounterpart(
  leftover: { id: string; name: string },
): Promise<{ intoPlayerId: string; evidence: MergePlan['evidence'] } | { reason: string }> {
  const stats = await prisma.matchPlayerStat.findMany({
    where: { playerId: leftover.id, match: { origin: NEXON_ORIGIN } },
    select: {
      kill: true,
      death: true,
      match: { select: { id: true, sourceMatchId: true } },
    },
  })
  if (stats.length === 0) return { reason: '넥슨 경기 참가행 없음' }

  const votes = new Map<string, MergePlan['evidence']>()
  for (const stat of stats) {
    const key = (stat.match.sourceMatchId ?? stat.match.id).slice(0, MATCH_KEY_LENGTH)
    if (key.length < MATCH_KEY_LENGTH) continue

    const twins = await prisma.match.findMany({
      where: { origin: MIRROR_ORIGIN, id: { startsWith: key } },
      select: { id: true },
    })
    const mine = await participantsOf(stat.match.id)
    const myNames = new Set(mine.map((p) => p.name))

    for (const twin of twins) {
      const theirs = await participantsOf(twin.id)
      const overlap = theirs.filter((p) => myNames.has(p.name)).length
      if (overlap < MIN_NAME_OVERLAP) continue

      /* 내 이름은 저쪽에 없고, 킬·데스가 같은 사람 = 닉네임만 바뀐 같은 사람 */
      const candidates = theirs.filter(
        (p) =>
          !myNames.has(p.name) &&
          p.sourcePlayerId !== null &&
          p.kill !== null &&
          p.kill === stat.kill &&
          p.death === stat.death,
      )
      if (candidates.length !== 1) continue
      const found = candidates[0]!
      const list = votes.get(found.playerId) ?? []
      list.push({
        nexonMatchId: stat.match.id,
        mirrorMatchId: twin.id,
        kill: stat.kill,
        death: stat.death,
      })
      votes.set(found.playerId, list)
    }
  }

  if (votes.size === 0) return { reason: '쌍둥이 경기에서 상대를 특정하지 못함' }
  if (votes.size > 1) return { reason: `후보가 ${votes.size}명 — 사람이 판단해야 한다` }
  const [intoPlayerId, evidence] = [...votes][0]!
  return { intoPlayerId, evidence }
}

export async function planPlayerMerge(): Promise<{ merges: MergePlan[]; skipped: { id: string; name: string; reason: string }[] }> {
  /* 잔재 = 원본 id 가 없는데 리그 집계 행을 가진 선수. 미러 리그 랭킹에 그대로 뜬다 */
  const leftovers = await prisma.player.findMany({
    where: {
      sourcePlayerId: null,
      origin: NEXON_ORIGIN,
      leaguePlayers: { some: {} },
      matchStats: { some: {} },
    },
    select: { id: true, name: true },
  })

  const merges: MergePlan[] = []
  const skipped: { id: string; name: string; reason: string }[] = []

  for (const leftover of leftovers) {
    const resolved = await resolveCounterpart(leftover)
    if ('reason' in resolved) {
      skipped.push({ id: leftover.id, name: leftover.name, reason: resolved.reason })
      continue
    }
    const into = await prisma.player.findUnique({
      where: { id: resolved.intoPlayerId },
      select: { id: true, name: true, sourcePlayerId: true },
    })
    /* 상대가 원본 id 를 가지고 있어야 "남는 쪽" 자격이 있다 */
    if (!into?.sourcePlayerId) {
      skipped.push({ id: leftover.id, name: leftover.name, reason: '상대에 원본 id 가 없다' })
      continue
    }
    const statRows = await prisma.matchPlayerStat.findMany({
      where: { playerId: leftover.id },
      select: { id: true, matchId: true },
    })
    /* 같은 경기에 둘 다 있으면 옮길 수 없다 (unique(matchId, playerId)). 그 행만 뺀다 */
    const conflicting = new Set(
      (
        await prisma.matchPlayerStat.findMany({
          where: { playerId: into.id, matchId: { in: statRows.map((s) => s.matchId) } },
          select: { matchId: true },
        })
      ).map((s) => s.matchId),
    )
    merges.push({
      fromPlayerId: leftover.id,
      fromName: leftover.name,
      intoPlayerId: into.id,
      intoName: into.name,
      intoSourcePlayerId: into.sourcePlayerId,
      evidence: resolved.evidence,
      statIds: statRows.filter((s) => !conflicting.has(s.matchId)).map((s) => s.id),
    })
  }
  return { merges, skipped }
}

const BACKUP_DIR = path.join(REPO_ROOT, 'apps', 'worker', 'backups', 'playerMerge')

export async function runPlayerMerge(confirm: boolean): Promise<MergeBackup> {
  const { merges, skipped } = await planPlayerMerge()

  console.log(`병합 대상 ${merges.length}건 · 보류 ${skipped.length}건`)
  for (const m of merges) {
    console.log(
      `  ${m.fromName}(${m.fromPlayerId}) → ${m.intoName}(${m.intoPlayerId} · 원본 ${m.intoSourcePlayerId})` +
        ` · 근거 ${m.evidence.length}경기 · 참가행 ${m.statIds.length}`,
    )
  }
  for (const s of skipped) console.log(`  [보류] ${s.name}(${s.id}) — ${s.reason}`)

  const backup: MergeBackup = {
    createdAt: new Date().toISOString(),
    confirmed: confirm,
    merges,
    removedLeaguePlayers: [],
    removedWeaponStats: [],
    removedSeasonStats: [],
  }

  if (confirm && merges.length > 0) {
    const fromIds = merges.map((m) => m.fromPlayerId)
    /* 지우기 전에 통째로 적는다. 이 파일 하나로 되돌릴 수 있어야 한다 */
    backup.removedLeaguePlayers = await prisma.leaguePlayer.findMany({
      where: { playerId: { in: fromIds } },
    })
    const lpIds = (backup.removedLeaguePlayers as { id: string }[]).map((r) => r.id)
    backup.removedWeaponStats = await prisma.leaguePlayerWeaponStat.findMany({
      where: { leaguePlayerId: { in: lpIds } },
    })
    backup.removedSeasonStats = await prisma.leaguePlayerSeason.findMany({
      where: { leaguePlayerId: { in: lpIds } },
    })

    writeBackup(backup)

    for (const m of merges) {
      if (m.statIds.length > 0) {
        await prisma.matchPlayerStat.updateMany({
          where: { id: { in: m.statIds } },
          data: { playerId: m.intoPlayerId },
        })
      }
    }
    /* 파생 집계만 지운다. `Player` 행은 남긴다 (되돌릴 근거이자 원본 대조용) */
    await prisma.leaguePlayer.deleteMany({ where: { id: { in: lpIds } } })
    console.log(`적용 완료 — 참가행 ${merges.reduce((n, m) => n + m.statIds.length, 0)}건 이동 · 집계행 ${lpIds.length}건 제거`)
  } else {
    writeBackup(backup)
    if (!confirm) console.log('미리보기다. 아무것도 쓰지 않았다. 적용하려면 --confirm')
  }
  return backup
}

function writeBackup(backup: MergeBackup): string {
  mkdirSync(BACKUP_DIR, { recursive: true })
  const file = path.join(
    BACKUP_DIR,
    `${backup.confirmed ? 'applied' : 'plan'}-${backup.createdAt.replace(/[:.]/g, '-')}.json`,
  )
  writeFileSync(file, JSON.stringify(backup, null, 2), 'utf8')
  console.log('백업/계획 파일:', file)
  return file
}

/** 백업 파일 하나로 되돌린다. 참가행을 원래 주인에게 돌려주고 집계 행을 되살린다 */
export async function revertPlayerMerge(file: string): Promise<void> {
  const backup = JSON.parse(readFileSync(file, 'utf8')) as MergeBackup
  if (!backup.confirmed) {
    console.log('적용된 적 없는 계획 파일이다. 되돌릴 것이 없다.')
    return
  }
  for (const m of backup.merges) {
    if (m.statIds.length === 0) continue
    await prisma.matchPlayerStat.updateMany({
      where: { id: { in: m.statIds } },
      data: { playerId: m.fromPlayerId },
    })
  }
  for (const row of backup.removedLeaguePlayers as Record<string, unknown>[]) {
    await prisma.leaguePlayer.upsert({
      where: { id: String(row.id) },
      create: row as never,
      update: {},
    })
  }
  for (const row of backup.removedWeaponStats as Record<string, unknown>[]) {
    await prisma.leaguePlayerWeaponStat.upsert({
      where: {
        leaguePlayerId_weapon: {
          leaguePlayerId: String(row.leaguePlayerId),
          weapon: Number(row.weapon),
        },
      },
      create: row as never,
      update: {},
    })
  }
  for (const row of backup.removedSeasonStats as Record<string, unknown>[]) {
    await prisma.leaguePlayerSeason.upsert({
      where: { id: String(row.id) },
      create: row as never,
      update: {},
    })
  }
  console.log(`되돌리기 완료 — 병합 ${backup.merges.length}건`)
}

/* --------------------------------------------------------------- CLI 진입 --- */
const invokedDirectly = process.argv[1]?.replace(/\\/g, '/').endsWith('playerMerge.ts')
if (invokedDirectly) {
  const revertIndex = process.argv.indexOf('--revert')
  const run =
    revertIndex >= 0
      ? revertPlayerMerge(process.argv[revertIndex + 1] ?? '')
      : runPlayerMerge(process.argv.includes('--confirm')).then(() => undefined)
  run
    .then(async () => {
      await prisma.$disconnect()
    })
    .catch(async (error: unknown) => {
      console.error(error)
      await prisma.$disconnect()
      process.exit(1)
    })
}
