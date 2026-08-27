/**
 * 스냅샷 감사의 **안전장치** (D-150).
 *
 * 이 감사는 승인 전에 도는 것이다. 여기서 DB 가 한 줄이라도 바뀌면
 * "미리 보기만 했다" 는 말이 거짓이 된다.
 *
 * 여기서 고정하는 것
 *   1. 감사는 dry-run 이 아니면 **아예 돌지 않는다**
 *   2. 주입한 경기는 dry-run 이 아니면 replay 에 들어갈 수 없다
 *   3. 감사를 돌려도 Match / MatchPlayerStat / LeaguePlayer 행 수와 값이 그대로다
 *   4. 같은 입력이면 같은 결과다
 */
import { describe, expect, it } from 'vitest'
import { prisma } from '@sacloud/db'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { runRate } from '../jobs/rate.js'
import { runSnapshotAudit } from '../jobs/snapshotAudit.js'

/* vitest 는 저장소 루트에서 돌고 CLI 는 `apps/worker` 에서 돈다.
   둘 다에서 찾도록 존재하는 쪽을 고른다 */
const SNAPSHOT = [
  join(process.cwd(), 'packages/db/data/supply-official-matches.json'),
  join(process.cwd(), '..', '..', 'packages/db/data/supply-official-matches.json'),
].find((path) => existsSync(path)) as string

async function dbUp(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`
    return true
  } catch {
    return false
  }
}

const up = await dbUp()

const ctx = (dryRun: boolean) =>
  ({ config: null, client: null, dryRun, limit: null, resume: false }) as never

/* 감사 한 번이 replay 를 세 번 돌린다. 전량(624건)으로 돌리면 CPU 를 오래 잡아
   **다른 테스트 파일이 타임아웃된다** — 실제로 그랬다.
   여기서는 한 번만, 그리고 일부만 투영해서 확인한다.

   여기서 보는 성질(쓰기 0건 · 결정적 · 10명 5대5 · K/D null 보존 · 기존 경기 불간섭)은
   **표본 크기와 무관하다.** 전량 수치는 CLI 로 뽑는다:
     pnpm --filter @sacloud/worker nexon snapshot-audit --league supply */
const SAMPLE = 40
let cached: Promise<Awaited<ReturnType<typeof runSnapshotAudit>>> | null = null
const audited = () => {
  cached ??= runSnapshotAudit(ctx(true), { leagueSlug: 'supply', file: SNAPSHOT, limit: SAMPLE })
  return cached
}

describe('감사는 쓰기 경로가 없다', () => {
  it('dry-run 이 아니면 감사 자체를 거부한다', async () => {
    await expect(
      runSnapshotAudit(ctx(false), { leagueSlug: 'supply', file: SNAPSHOT }),
    ).rejects.toThrow('dry-run')
  })

  it.skipIf(!up)('주입한 경기는 dry-run 이 아니면 replay 에 넣을 수 없다', async () => {
    await expect(
      runRate(ctx(false), {
        leagueSlug: 'supply',
        extraMatches: [
          {
            id: 'T150-fake',
            startAt: new Date('2026-08-20T00:00:00Z'),
            official: true,
            redLeagueClanId: 'r',
            blueLeagueClanId: 'b',
            winnerSide: 'red',
            stats: [],
          },
        ],
      }),
    ).rejects.toThrow('dry-run')
  })
})

describe.skipIf(!up)('감사를 돌려도 DB 가 바뀌지 않는다', () => {
  it('행 수와 래더 값이 그대로다', async () => {
    /* **supply 리그로 한정해서** 센다. 다른 테스트 파일이 같은 DB 에 자기 픽스처를
       만들었다 지우므로, 전체를 세면 감사와 무관한 변화에 깨진다 (실제로 그랬다).
       감사가 손댈 수 있는 범위는 이 리그뿐이라 이 범위만 보면 충분하다 */
    const scope = { league: { slug: 'supply' } } as const
    const snapshotState = async () => ({
      matches: await prisma.match.count({ where: scope }),
      stats: await prisma.matchPlayerStat.count({ where: { match: scope } }),
      /* 리그 안에서만 센다. `origin='3rd.supply'` 를 전역으로 세면
         다른 테스트가 만들었다 지우는 픽스처에 흔들린다 (실제로 22↔24 로 흔들렸다) */
      leaguePlayers: await prisma.leaguePlayer.count({ where: scope }),
      weaponStats: await prisma.leaguePlayerWeaponStat.count({
        where: { leaguePlayer: scope },
      }),
      ratings: (
        await prisma.leaguePlayer.findMany({
          where: scope,
          orderBy: { id: 'asc' },
          select: { id: true, rating: true, win: true, lose: true },
        })
      )
        .map((row) => `${row.id}:${row.rating}:${row.win}:${row.lose}`)
        .join('|'),
    })

    const before = await snapshotState()
    const audit = await audited()
    expect(audit.set.missing).toBeGreaterThan(0)
    const after = await snapshotState()

    expect(after).toEqual(before)
  }, 600_000)
})

describe.skipIf(!up)('감사 결과 자체의 성질', () => {
  it('하네스가 현재 DB 래더를 그대로 재현한다', async () => {
    /* 이게 깨지면 "624를 넣으면 이렇게 된다" 는 예측에 근거가 없다 */
    const audit = await audited()
    expect(audit.baselineMatchesDb.compared).toBeGreaterThan(0)
    expect(audit.baselineMatchesDb.mismatched).toBe(0)
  }, 600_000)

  it('같은 입력이면 같은 결과다', async () => {
    const audit = await audited()
    expect(audit.deterministic).toBe(true)
  }, 600_000)

  it('투영된 경기는 전부 10명 5대5 다', async () => {
    const audit = await audited()
    for (const match of audit.projection.projected) {
      expect(match.participants).toHaveLength(10)
      expect(match.complete5v5).toBe(true)
      const ids = match.participants.map((row) => row.playerId)
      expect(new Set(ids).size).toBe(ids.length)
    }
  }, 600_000)

  it('K/D 를 모르는 참가자는 null 로 남는다 — 0으로 채우지 않는다', async () => {
    const audit = await audited()
    const unknown = audit.projection.projected
      .flatMap((match) => match.participants)
      .filter((row) => row.kill === null)
    expect(unknown.length).toBeGreaterThan(0)
    for (const row of unknown) {
      expect(row.kill).toBeNull()
      expect(row.death).toBeNull()
      expect(row.assist).toBeNull()
    }
  }, 600_000)

  it('투영은 이미 DB 에 있는 경기를 건드리지 않는다', async () => {
    const audit = await audited()
    const stored = new Set(
      (await prisma.match.findMany({ select: { id: true } })).map((row) => row.id),
    )
    for (const match of audit.projection.projected) {
      expect(stored.has(match.id)).toBe(false)
    }
  }, 600_000)
})
