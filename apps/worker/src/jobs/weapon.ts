/**
 * 무기 근거 적재 · 판정 · 반영 (Phase 12 · D-114).
 *
 * ── 흐름
 * ```
 * 병영수첩 BattleLog (정상 브라우저로 수집한 JSON)
 *   → BarracksRawImport      원문 보존 (멱등)
 *   → MatchWeaponEvidence    선수별 킬 신호 + 판정 + 사유
 *   → MatchPlayerStat.weapon 경기별 무기 확정
 *   → LeaguePlayerWeaponStat 라플/스나 누적
 * ```
 *
 * ── 왜 파일로 받는가
 *   Node에서 병영수첩을 직접 부르면 **403**이다. UA를 위조해 뚫지 않는다(금지).
 *   그래서 수집은 정상 브라우저가 하고, 여기서는 그 결과를 읽기만 한다.
 *
 * ── 재계산
 *   판정기를 고쳐도 **외부에 다시 요청하지 않는다.** 저장된 근거에서 다시 계산한다.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { prisma } from '@sacloud/db'
import { classifyWeapon, WEAPON_CLASSIFIER_VERSION, WEAPON_CODE } from '@sacloud/nexon'
import { log, warn } from '../lib/log.js'

const SOURCE = 'nexon_barracks'

export interface WeaponImportFile {
  source?: string
  endpoint?: string
  collectedAt?: string
  matches: {
    matchKey: string
    clanNo: string
    status: number
    totalEvents?: number
    killEvents?: number
    payloadHash?: string | null
    error?: string | null
    players: { sn: string; nick?: string | null; rifleKills: number; sniperKills: number; arHits?: number | null; srHits?: number | null }[]
  }[]
}

export interface WeaponImportResult {
  matches: number
  succeeded: number
  failed: number
  rawStored: number
  rawDuplicate: number
  evidence: { created: number; updated: number }
  classification: { rifle: number; sniper: number; unknown: number }
  /** 우리 Player와 이어지지 않은 근거 (그래도 버리지 않는다) */
  unresolved: number
}

function hashOf(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 32)
}

/**
 * 수집 JSON → 원문 + 근거.
 *
 * 같은 파일을 여러 번 넣어도 행이 늘지 않는다(멱등). 같은 내용이면 `fetchCount`만 올린다.
 */
export async function importWeaponEvidence(input: {
  file: string
  confirm?: boolean
}): Promise<WeaponImportResult> {
  const parsed = JSON.parse(readFileSync(input.file, 'utf8')) as WeaponImportFile
  const result: WeaponImportResult = {
    matches: parsed.matches.length,
    succeeded: 0,
    failed: 0,
    rawStored: 0,
    rawDuplicate: 0,
    evidence: { created: 0, updated: 0 },
    classification: { rifle: 0, sniper: 0, unknown: 0 },
    unresolved: 0,
  }

  for (const match of parsed.matches) {
    if (match.status !== 200) {
      result.failed += 1
      continue
    }
    result.succeeded += 1

    const payloadHash = match.payloadHash ?? hashOf(match.players)

    if (input.confirm) {
      const existing = await prisma.barracksRawImport.findUnique({
        where: {
          matchKey_clanNo_payloadHash: { matchKey: match.matchKey, clanNo: match.clanNo, payloadHash },
        },
        select: { id: true },
      })
      if (existing) {
        await prisma.barracksRawImport.update({
          where: { id: existing.id },
          data: { fetchCount: { increment: 1 } },
        })
        result.rawDuplicate += 1
      } else {
        await prisma.barracksRawImport.create({
          data: {
            source: SOURCE,
            endpoint: parsed.endpoint ?? '/api/BattleLog/GetBattleLogClan',
            matchKey: match.matchKey,
            clanNo: match.clanNo,
            payload: match as unknown as object,
            payloadHash,
            status: 'ok',
          },
        })
        result.rawStored += 1
      }
    }

    for (const player of match.players) {
      const verdict = classifyWeapon({
        rifleKills: player.rifleKills,
        sniperKills: player.sniperKills,
        arHits: player.arHits ?? null,
        srHits: player.srHits ?? null,
      })
      result.classification[verdict.role] += 1

      /* 사람은 **계정 번호**로 잇는다. 닉네임으로 합치지 않는다 (D-036).
         못 찾으면 근거는 그대로 남기고 연결만 비운다. */
      const playerId = await resolvePlayerId(player.sn, player.nick ?? null)
      if (!playerId) result.unresolved += 1

      if (!input.confirm) continue

      const data = {
        nickname: player.nick ?? null,
        playerId,
        rifleKills: player.rifleKills,
        sniperKills: player.sniperKills,
        arHits: player.arHits ?? null,
        srHits: player.srHits ?? null,
        classification: verdict.role,
        classificationReason: verdict.reason,
        classifierVersion: WEAPON_CLASSIFIER_VERSION,
        source: SOURCE,
      }
      const existing = await prisma.matchWeaponEvidence.findUnique({
        where: { matchKey_userNexonSn: { matchKey: match.matchKey, userNexonSn: player.sn } },
        select: { id: true },
      })
      if (existing) {
        await prisma.matchWeaponEvidence.update({ where: { id: existing.id }, data })
        result.evidence.updated += 1
      } else {
        await prisma.matchWeaponEvidence.create({
          data: { matchKey: match.matchKey, userNexonSn: player.sn, ...data },
        })
        result.evidence.created += 1
      }
    }
  }

  return result
}

/**
 * 병영수첩 계정 번호 → 우리 Player.
 *
 * 1. `Player.sourcePlayerId` 가 같은 계정 번호 (병영수첩 로스터로 만든 행)
 * 2. 그 경기 참가 기록에 있는 **같은 닉네임**의 선수
 *
 * 2번은 닉네임을 쓰지만 **그 경기 참가자로 범위가 좁혀진 상태**다.
 * 전역에서 닉네임으로 사람을 찾는 것과 다르다. 그래도 못 찾으면 비워 둔다.
 */
async function resolvePlayerId(userNexonSn: string, nickname: string | null): Promise<string | null> {
  const bySn = await prisma.player.findFirst({
    where: { sourcePlayerId: userNexonSn },
    select: { id: true },
  })
  if (bySn) return bySn.id

  if (!nickname) return null
  const identity = await prisma.nexonIdentity.findFirst({
    where: { userName: nickname, playerId: { not: null }, status: 'active' },
    select: { playerId: true },
  })
  return identity?.playerId ?? null
}

/* ------------------------------------------------- 판정 → 경기 기록 반영 --- */

export interface WeaponApplyResult {
  evidence: number
  statsUpdated: number
  skippedUnknown: number
  skippedNoStat: number
  conflicts: number
}

/**
 * 근거 → `MatchPlayerStat.weapon`.
 *
 * `unknown`은 **쓰지 않는다.** 억지로 라플/스나 중 하나로 배정하지 않는다.
 * 이미 다른 출처의 값이 들어 있으면 덮어쓰지 않고 충돌로 센다.
 */
export async function applyWeaponToStats(input: { confirm?: boolean } = {}): Promise<WeaponApplyResult> {
  const result: WeaponApplyResult = {
    evidence: 0,
    statsUpdated: 0,
    skippedUnknown: 0,
    skippedNoStat: 0,
    conflicts: 0,
  }

  const rows = await prisma.matchWeaponEvidence.findMany({
    where: { playerId: { not: null } },
    select: { matchKey: true, playerId: true, classification: true },
  })

  for (const row of rows) {
    result.evidence += 1
    if (row.classification !== 'rifle' && row.classification !== 'sniper') {
      result.skippedUnknown += 1
      continue
    }
    const weapon = row.classification === 'rifle' ? WEAPON_CODE.rifle : WEAPON_CODE.sniper

    const match = await prisma.match.findFirst({
      where: { sourceMatchId: row.matchKey },
      select: { id: true },
    })
    if (!match) {
      result.skippedNoStat += 1
      continue
    }
    const stat = await prisma.matchPlayerStat.findUnique({
      where: { matchId_playerId: { matchId: match.id, playerId: row.playerId! } },
      select: { id: true, weapon: true },
    })
    if (!stat) {
      result.skippedNoStat += 1
      continue
    }
    if (stat.weapon !== null && stat.weapon !== weapon) {
      // 다른 값이 이미 있다. 출처가 다르면 임의로 덮어쓰지 않는다
      result.conflicts += 1
      continue
    }
    if (stat.weapon === weapon) continue

    if (input.confirm) {
      await prisma.matchPlayerStat.update({ where: { id: stat.id }, data: { weapon } })
    }
    result.statsUpdated += 1
  }

  return result
}

/* --------------------------------------------------- 라플/스나 누적 --- */

export interface WeaponBucketResult {
  players: number
  buckets: number
  rifleGames: number
  sniperGames: number
  unknownGames: number
}

/**
 * @deprecated D-149 에서 `jobs/weaponRebuild.ts` 의 `rebuildWeaponStats` 로 대체됐다.
 *
 * 이 함수는 `games`/`knownStatGames` 를 구분하지 않고 `ratingDelta` 를 항상 0으로 넣어,
 * 무기 랭킹이 전원 동점(전부 1위)이 되는 결함이 있었다.
 * KDA 가 `null` 인 참가자도 0킬로 세어 평균을 떨어뜨렸다.
 *
 * 남겨 둔 이유는 과거 결과를 재현해 대조할 수 있게 하기 위함이다. **호출하지 마라.**
 */
export async function rebuildWeaponBuckets(input: {
  leagueSlug: string
  confirm?: boolean
}): Promise<WeaponBucketResult> {
  const result: WeaponBucketResult = {
    players: 0,
    buckets: 0,
    rifleGames: 0,
    sniperGames: 0,
    unknownGames: 0,
  }

  const league = await prisma.league.findUnique({
    where: { slug: input.leagueSlug },
    select: { id: true },
  })
  if (!league) {
    warn(`리그를 찾을 수 없다: ${input.leagueSlug}`)
    return result
  }

  const stats = await prisma.matchPlayerStat.findMany({
    /* 무기별 누적도 **래더 경기** 기준이다. `official` 라벨은 D-145 에서 래더와
       무관해졌고, 그 라벨로 거르면 래더에 반영된 경기가 무기 집계에서 빠져
       화면에 `집계 없음` 이 남는다 (D-148). */
    where: { match: { leagueId: league.id, redRatingUpdate: { not: null } } },
    select: {
      playerId: true,
      weapon: true,
      kill: true,
      death: true,
      assist: true,
      headshot: true,
      side: true,
      match: { select: { winnerSide: true } },
    },
  })

  const acc = new Map<
    string,
    Map<number, { win: number; lose: number; kill: number; death: number; assist: number; headshot: number }>
  >()

  for (const stat of stats) {
    if (stat.weapon === null) {
      result.unknownGames += 1
      continue
    }
    if (stat.weapon === WEAPON_CODE.rifle) result.rifleGames += 1
    else result.sniperGames += 1

    const byWeapon = acc.get(stat.playerId) ?? new Map()
    const bucket = byWeapon.get(stat.weapon) ?? {
      win: 0,
      lose: 0,
      kill: 0,
      death: 0,
      assist: 0,
      headshot: 0,
    }
    const won = stat.match.winnerSide === stat.side
    bucket.win += won ? 1 : 0
    bucket.lose += won ? 0 : 1
    bucket.kill += stat.kill
    bucket.death += stat.death
    bucket.assist += stat.assist
    bucket.headshot += stat.headshot ?? 0
    byWeapon.set(stat.weapon, bucket)
    acc.set(stat.playerId, byWeapon)
  }

  if (!input.confirm) {
    result.players = acc.size
    for (const byWeapon of acc.values()) result.buckets += byWeapon.size
    return result
  }

  /* 처음부터 다시 만든다 — 누적이 두 배가 되는 사고를 막는다 */
  await prisma.leaguePlayerWeaponStat.deleteMany({
    where: { leaguePlayer: { leagueId: league.id } },
  })

  for (const [playerId, byWeapon] of acc) {
    const leaguePlayer = await prisma.leaguePlayer.findUnique({
      where: { leagueId_playerId: { leagueId: league.id, playerId } },
      select: { id: true },
    })
    if (!leaguePlayer) continue
    result.players += 1

    for (const [weapon, bucket] of byWeapon) {
      await prisma.leaguePlayerWeaponStat.create({
        data: {
          leaguePlayerId: leaguePlayer.id,
          weapon,
          // 무기별 래더 분리는 아직 하지 않는다. 통합 래더가 진실이다 (3-B 1·2번)
          ratingDelta: 0,
          ...bucket,
        },
      })
      result.buckets += 1
    }
  }

  log(`무기별 누적 재작성 — 선수 ${result.players} · 버킷 ${result.buckets}`)
  return result
}
