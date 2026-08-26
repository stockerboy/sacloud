/**
 * 3rd.supply 미수입 경기 감사 + 래더 투영 (D-150).
 *
 * ── 아무것도 쓰지 않는다
 *   DB 를 읽기만 하고, 래더는 `ctx.dryRun` 으로 실제 replay 코드를 돌려 본다.
 *   **공식을 복제한 시뮬레이터를 만들지 않았다** — 복제하면 언젠가 갈라지고,
 *   갈라진 예측은 예측이 아니다. `runRate` 에 경기를 끼워 넣기만 한다.
 *
 * ── 먼저 하네스를 검증한다
 *   투영 없이(=현재 136경기만) dry-run 을 돌려 **지금 DB 값과 같은지** 본다.
 *   그게 맞아야 "624를 넣으면 이렇게 된다"는 말에 근거가 생긴다.
 */
import { readFileSync } from 'node:fs'
import { prisma } from '@sacloud/db'
import {
  auditFieldCoverage,
  auditSnapshotSet,
  crossReferenceNexon,
  projectMissingMatches,
  toRateMatchRows,
  type FieldCoverage,
  type NexonCrossRef,
  type SnapshotProjection,
  type SnapshotSetAudit,
  type SupplyMatchSnapshot,
} from '@sacloud/db/ops'
import { averageMembers, compositionScore } from '@sacloud/rating'
import type { JobContext } from './context.js'
import { log } from '../lib/log.js'
import { runRate, type RateRunResult } from './rate.js'

export interface RatingProjection {
  matchesConsidered: number
  matchesRated: number
  players: RateRunResult['report']['players']
  clans: RateRunResult['report']['clans']
  nonFinite: number
  underMinWinRateAt4000: number
  /** 래더에서 빠진 사유별 건수 */
  skipped: Record<string, number>
}

export interface SnapshotAuditResult {
  set: SnapshotSetAudit
  coverage: FieldCoverage
  /** 현재 DB 에 있는 경기의 원본 품질 — 구조 비교용 */
  coverageExisting: FieldCoverage
  nexon: NexonCrossRef
  projection: SnapshotProjection
  /** 투영 없이 돌린 dry-run — 하네스가 현재 DB 를 재현하는지 확인용 */
  baseline: RatingProjection
  /** 투영을 끼워 넣고 돌린 dry-run */
  projected: RatingProjection
  /** 같은 입력으로 두 번 돌렸을 때 결과가 같은가 */
  deterministic: boolean
  /** 하네스가 현재 DB rating 을 재현하는가 */
  baselineMatchesDb: { compared: number; mismatched: number; sample: string[] }
}

function toProjection(result: RateRunResult): RatingProjection {
  return {
    matchesConsidered: result.matchesConsidered,
    matchesRated: result.matchesRated,
    players: result.report.players,
    clans: result.report.clans,
    nonFinite: result.report.nonFinite,
    underMinWinRateAt4000: result.report.underMinWinRateAt4000,
    skipped: result.skipped,
  }
}

/** 결정성 확인용 지문 — 순서까지 포함해 비교한다 */
function fingerprint(projection: RatingProjection): string {
  return JSON.stringify([
    projection.matchesRated,
    projection.players.map((row) => [row.playerId, row.display, row.internal, row.games]),
    projection.clans.map((row) => [row.leagueClanId, row.display, row.internal]),
  ])
}

export async function runSnapshotAudit(
  ctx: JobContext,
  input: { leagueSlug: string; file: string; limit?: number },
): Promise<SnapshotAuditResult> {
  if (!ctx.dryRun) {
    /* 이 잡은 감사 전용이다. 쓰기 경로가 아예 없다 */
    throw new Error('snapshot-audit 은 dry-run 전용이다')
  }

  const snapshot = JSON.parse(readFileSync(input.file, 'utf8')) as SupplyMatchSnapshot

  log('1) 집합 대조')
  const set = await auditSnapshotSet(snapshot, input.leagueSlug)

  const missingSet = new Set(set.missingIds)
  const missingRecords = snapshot.matches.filter((row) => missingSet.has(String(row.id)))
  const existingRecords = snapshot.matches.filter((row) => !missingSet.has(String(row.id)))

  log('2) 원본 품질')
  const coverage = auditFieldCoverage(missingRecords)
  const coverageExisting = auditFieldCoverage(existingRecords)

  log('3) 넥슨 저장 증거 대조 (새 호출 없음)')
  const nexon = await crossReferenceNexon(set.missingIds)

  log('4) 투영 (메모리에만)')
  const projection = await projectMissingMatches({
    snapshot,
    leagueSlug: input.leagueSlug,
    missingIds: set.missingIds,
    limit: input.limit,
  })

  log('5) 래더 dry-run — 하네스 검증 (투영 없이)')
  const baseline = toProjection(await runRate(ctx, { leagueSlug: input.leagueSlug }))

  log('6) 래더 dry-run — 투영 반영')
  const extraMatches = toRateMatchRows(projection)
  const projected = toProjection(
    await runRate(ctx, { leagueSlug: input.leagueSlug, extraMatches }),
  )

  log('7) 결정성 — 같은 입력으로 한 번 더')
  const repeat = toProjection(
    await runRate(ctx, { leagueSlug: input.leagueSlug, extraMatches }),
  )
  const deterministic = fingerprint(projected) === fingerprint(repeat)

  log('8) 하네스가 현재 DB 를 재현하는가')
  const stored = await prisma.leaguePlayer.findMany({
    where: { league: { slug: input.leagueSlug } },
    select: { rating: true, player: { select: { id: true } } },
  })
  const storedById = new Map(stored.map((row) => [row.player.id, row.rating]))
  let compared = 0
  let mismatched = 0
  const sample: string[] = []
  for (const row of baseline.players) {
    const actual = storedById.get(row.playerId)
    if (actual === undefined) continue
    compared += 1
    if (Math.round(row.display) !== Math.round(actual)) {
      mismatched += 1
      if (sample.length < 5) sample.push(`${row.playerId} dry-run ${row.display} ≠ DB ${actual}`)
    }
  }

  return {
    set,
    coverage,
    coverageExisting,
    nexon,
    projection,
    baseline,
    projected,
    deterministic,
    baselineMatchesDb: { compared, mismatched, sample },
  }
}

/** 클랜 구성 보정 투영 — 저장된 값과 비교한다 */
export async function projectComposition(
  leagueSlug: string,
  projected: RatingProjection,
): Promise<
  {
    name: string
    currentScore: number
    currentMembers: number
    nextScore: number
    nextMembers: number
  }[]
> {
  const clans = await prisma.leagueClan.findMany({
    where: { league: { slug: leagueSlug } },
    select: {
      id: true,
      compositionScore: true,
      compositionMembers: true,
      clan: { select: { name: true } },
    },
  })
  const byId = new Map(clans.map((row) => [row.id, row]))
  const out: {
    name: string
    currentScore: number
    currentMembers: number
    nextScore: number
    nextMembers: number
  }[] = []
  for (const row of projected.clans) {
    const clan = byId.get(row.leagueClanId)
    if (!clan) continue
    out.push({
      name: clan.clan.name,
      currentScore: clan.compositionScore,
      currentMembers: clan.compositionMembers,
      /* 보정값은 `runRate` 가 이미 계산해 리포트에 담아 준다. 여기서 다시 만들지 않는다 */
      nextScore: row.composition,
      nextMembers: row.avgMembers,
    })
  }
  return out
}

/** 곡선이 D-145 그대로인지 확인용 — 감사 보고서에 함께 찍는다 */
export function compositionCurveSample(): string {
  return [1, 2, 3, 4, 5]
    .map((n) => `${n}명 +${compositionScore(averageMembers([n])).toFixed(0)}`)
    .join(' · ')
}
