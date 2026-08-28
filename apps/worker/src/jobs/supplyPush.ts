/**
 * 로컬 DB → 운영(Supabase) 대량 전송 (D-156).
 *
 * ── 왜 필요한가
 *   미러 적재를 운영에 **직접** 돌렸더니 초당 9.3경기였다. 공식리그 12.8만 경기면
 *   3시간 49분이다. 경기마다 개별 INSERT 를 네트워크 너머로 보내기 때문이다.
 *
 *   그래서 적재는 **로컬에서** 하고(왕복이 없어 빠르다), 결과만 여기서 옮긴다.
 *   `createMany` 로 1000행씩 묶어 보내면 왕복이 12.8만 번에서 1400번쯤으로 준다.
 *
 *   `pg_dump` 를 쓰지 않는 이유 — 이 저장소의 로컬 DB 는 `embedded-postgres` 인데
 *   서버 바이너리만 들어 있고 클라이언트 도구(`pg_dump`/`psql`)가 없다.
 *
 * ── 무엇을 옮기는가
 *   **미러가 만든 것만** 옮긴다 (`origin = '3rd.supply'`). 개발용 시드(`origin='mock'`)나
 *   넥슨 수집분은 건드리지 않는다 — 운영에 개발 데이터가 새어 나가면 안 된다 (D-116).
 *
 * ── 안전
 *   전부 `skipDuplicates` 다. 여러 번 돌려도 같은 결과이고, 운영에 이미 있는 행을
 *   덮어쓰지 않는다. **삭제하지 않는다.** FK 순서대로 넣는다.
 */
import { PrismaClient } from '@sacloud/db'
import { log, warn } from '../lib/log.js'
import type { JobContext } from './context.js'

/** 한 번에 보내는 행 수. 너무 크면 쿼리가 거부되고 너무 작으면 왕복이 는다 */
const CHUNK = 1000
/** 로컬에서 한 번에 읽는 행 수 — 130만 행을 통째로 메모리에 올리지 않는다 */
const READ = 5000

const MIRROR_ORIGIN = '3rd.supply'

export interface SupplyPushResult {
  table: string
  read: number
  written: number
}

/** 커서로 끊어 읽어 배치로 보낸다. 읽기와 쓰기를 겹치지 않고 순서대로 한다 */
async function copyTable<T extends { id: string }>(
  name: string,
  read: (cursor: string | null, take: number) => Promise<T[]>,
  write: (rows: T[]) => Promise<number>,
): Promise<SupplyPushResult> {
  let cursor: string | null = null
  let total = 0
  let written = 0
  for (;;) {
    const rows = await read(cursor, READ)
    if (rows.length === 0) break
    total += rows.length
    for (let i = 0; i < rows.length; i += CHUNK) {
      written += await write(rows.slice(i, i + CHUNK))
    }
    cursor = rows[rows.length - 1]?.id ?? null
    log(`   ${name} ${total} 읽음 · ${written} 씀`)
    if (rows.length < READ) break
  }
  return { table: name, read: total, written }
}

export async function runSupplyPush(
  ctx: JobContext,
  input: { targetUrl: string; leagueSlug?: string },
): Promise<SupplyPushResult[]> {
  const local = new PrismaClient({ log: ['error'], errorFormat: 'minimal' })
  const remote = new PrismaClient({
    datasources: { db: { url: input.targetUrl } },
    log: ['error'],
    errorFormat: 'minimal',
  })

  const out: SupplyPushResult[] = []
  try {
    /* 옮길 리그를 정한다. 지정이 없으면 미러가 만든 경기가 있는 리그 전부 */
    const leagues = await local.league.findMany({
      where: input.leagueSlug ? { slug: input.leagueSlug } : { matches: { some: { origin: MIRROR_ORIGIN } } },
      select: { id: true, slug: true, name: true },
    })
    if (leagues.length === 0) {
      warn('옮길 리그가 없다')
      return out
    }
    const leagueIds = leagues.map((l) => l.id)
    log(`대상 리그 ${leagues.map((l) => `${l.slug}(${l.name})`).join(' · ')}`)

    if (ctx.dryRun) {
      const m = await local.match.count({ where: { leagueId: { in: leagueIds }, origin: MIRROR_ORIGIN } })
      const s = await local.matchPlayerStat.count({
        where: { match: { leagueId: { in: leagueIds }, origin: MIRROR_ORIGIN } },
      })
      log(`[dry-run] 경기 ${m} · 참가기록 ${s} 를 옮긴다. 아무것도 쓰지 않았다`)
      return out
    }

    /* 1) 리그 — 이름/설정이 다를 수 있으니 만들기만 하고 덮어쓰지 않는다 */
    const leagueRows = await local.league.findMany({ where: { id: { in: leagueIds } } })
    out.push({
      table: 'League',
      read: leagueRows.length,
      written: (await remote.league.createMany({ data: leagueRows, skipDuplicates: true })).count,
    })

    /**
     * **리그 id 도 재매핑한다.**
     *
     * `League.slug` 가 unique 라, 같은 리그가 운영에 **다른 id 로** 이미 있으면
     * `skipDuplicates` 가 조용히 건너뛴다. 그런데 `LeagueMap`·`LeagueClan`·`Match` 는
     * **로컬 leagueId** 를 들고 있어서 FK 가 깨진다.
     * 실제로 그렇게 실패했다 — `LeagueMap_leagueId_fkey` 위반.
     * 로컬과 운영의 `daerule`·`sanply` id 가 서로 달랐다 (`supply` 만 같았다).
     *
     * 클랜·선수에 이미 있던 재매핑과 같은 처리다. 운영 행을 고치지 않고 우리 참조만 맞춘다.
     */
    const remoteLeagues = await remote.league.findMany({
      where: { slug: { in: leagueRows.map((l) => l.slug) } },
      select: { id: true, slug: true },
    })
    const remoteLeagueBySlug = new Map(remoteLeagues.map((l) => [l.slug, l.id]))
    const leagueIdMap = new Map<string, string>()
    for (const l of leagueRows) {
      const target = remoteLeagueBySlug.get(l.slug)
      if (target !== undefined && target !== l.id) leagueIdMap.set(l.id, target)
    }
    if (leagueIdMap.size > 0) log(`   리그 id 재매핑 ${leagueIdMap.size}건 (운영에 다른 id 로 이미 있다)`)
    const toRemoteLeague = (id: string): string => leagueIdMap.get(id) ?? id

    /* 2) 맵 — 경기가 참조한다 */
    const mapIds = [
      ...new Set(
        (
          await local.match.findMany({
            where: { leagueId: { in: leagueIds }, origin: MIRROR_ORIGIN },
            select: { mapId: true },
            distinct: ['mapId'],
          })
        ).map((r) => r.mapId),
      ),
    ]
    const maps = await local.gameMap.findMany({ where: { id: { in: mapIds } } })
    out.push({
      table: 'GameMap',
      read: maps.length,
      written: (await remote.gameMap.createMany({ data: maps, skipDuplicates: true })).count,
    })
    const leagueMaps = await local.leagueMap.findMany({ where: { leagueId: { in: leagueIds } } })
    out.push({
      table: 'LeagueMap',
      read: leagueMaps.length,
      written: (
        await remote.leagueMap.createMany({
          data: leagueMaps.map((r) => ({ ...r, leagueId: toRemoteLeague(r.leagueId) })),
          skipDuplicates: true,
        })
      ).count,
    })

    /* 3) 클랜 → 리그참가클랜 → 선수. FK 순서를 지킨다.
       **출처가 아니라 실제 참조 기준으로 고른다.** 처음에는 `origin='3rd.supply'` 인
       클랜만 옮겼는데, 리그참가클랜이 참조하는 클랜 중 넥슨 경로로 먼저 만들어진 것이
       섞여 있어 FK 위반이 났다. 필요한 것을 빠짐없이 옮기되 개발 시드는 뺀다 (D-116). */
    const neededClanIds = [
      ...new Set(
        (
          await local.leagueClan.findMany({
            where: { leagueId: { in: leagueIds } },
            select: { clanId: true },
          })
        ).map((r) => r.clanId),
      ),
    ]
    const mockClans = await local.clan.count({ where: { id: { in: neededClanIds }, origin: 'mock' } })
    if (mockClans > 0) warn(`개발 시드 클랜 ${mockClans}개는 옮기지 않는다 (D-116)`)

    const localClans = await local.clan.findMany({
      where: { id: { in: neededClanIds }, origin: { not: 'mock' } },
    })
    const clanWritten = (await remote.clan.createMany({ data: localClans, skipDuplicates: true })).count
    out.push({ table: 'Clan', read: localClans.length, written: clanWritten })

    /**
     * **id 를 다시 이어 붙인다.**
     *
     * `Clan` 은 `slug` 와 `sourceClanId` 가 각각 unique 다. 같은 클랜이 운영에 **다른 id 로**
     * 이미 있으면 `skipDuplicates` 가 조용히 건너뛴다 — 그런데 `LeagueClan` 은 **로컬 id** 를
     * 가리키고 있어서 FK 가 깨진다. 실제로 그렇게 실패했다 (`Clan 62 읽음 · 0 씀`).
     *
     * 그래서 로컬 id → 운영 id 대응표를 만들고, 참조하는 쪽을 옮길 때 바꿔 넣는다.
     * 운영에 이미 있는 행을 **고치지 않는다.** 우리 쪽 참조만 맞춘다.
     */
    const remoteClans = await remote.clan.findMany({
      where: {
        OR: [
          { slug: { in: localClans.map((c) => c.slug) } },
          { sourceClanId: { in: localClans.map((c) => c.sourceClanId).filter((v): v is string => v !== null) } },
        ],
      },
      select: { id: true, slug: true, sourceClanId: true },
    })
    const bySlug = new Map(remoteClans.map((c) => [c.slug, c.id]))
    const bySource = new Map(
      remoteClans.filter((c) => c.sourceClanId !== null).map((c) => [c.sourceClanId as string, c.id]),
    )
    const clanIdMap = new Map<string, string>()
    for (const c of localClans) {
      const target = bySlug.get(c.slug) ?? (c.sourceClanId !== null ? bySource.get(c.sourceClanId) : undefined)
      if (target !== undefined && target !== c.id) clanIdMap.set(c.id, target)
    }
    if (clanIdMap.size > 0) log(`   클랜 id 재매핑 ${clanIdMap.size}건 (운영에 다른 id 로 이미 있다)`)
    out.push(
      await copyTable(
        'LeagueClan',
        (cursor, take) =>
          local.leagueClan.findMany({
            where: { leagueId: { in: leagueIds } },
            orderBy: { id: 'asc' },
            take,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          }),
        async (rows) => {
          /* 리그·클랜이 운영에 다른 id 로 있으면 그쪽을 가리키게 바꾼다.
             `sourceLeagueClanId` 는 전역 unique 라 다른 리그 것과 부딪힐 수 있어 비운다 */
          const mapped = rows.map((r) => ({
            ...r,
            leagueId: toRemoteLeague(r.leagueId),
            clanId: clanIdMap.get(r.clanId) ?? r.clanId,
            sourceLeagueClanId: null,
          }))
          return (await remote.leagueClan.createMany({ data: mapped, skipDuplicates: true })).count
        },
      ),
    )

    /**
     * **리그참가클랜 id 도 재매핑한다.**
     *
     * `Match.redLeagueClanId` / `blueLeagueClanId` 가 이걸 가리킨다.
     * `LeagueClan` 은 `@@unique([leagueId, clanId])` 라, 같은 조합이 운영에 다른 id 로
     * 있으면 위에서 건너뛴다. 그 상태로 경기를 넣으면 FK 가 깨진다.
     * 대응표는 **(운영 리그id, 운영 클랜id)** 로 맞춘다 — 로컬 id 로는 찾을 수 없다.
     */
    const localLeagueClans = await local.leagueClan.findMany({
      where: { leagueId: { in: leagueIds } },
      select: { id: true, leagueId: true, clanId: true },
    })
    const remoteLeagueClans = await remote.leagueClan.findMany({
      where: { leagueId: { in: leagueIds.map(toRemoteLeague) } },
      select: { id: true, leagueId: true, clanId: true },
    })
    const remoteLcByPair = new Map(remoteLeagueClans.map((r) => [`${r.leagueId}|${r.clanId}`, r.id]))
    const leagueClanIdMap = new Map<string, string>()
    for (const r of localLeagueClans) {
      const key = `${toRemoteLeague(r.leagueId)}|${clanIdMap.get(r.clanId) ?? r.clanId}`
      const target = remoteLcByPair.get(key)
      if (target !== undefined && target !== r.id) leagueClanIdMap.set(r.id, target)
    }
    if (leagueClanIdMap.size > 0) log(`   리그참가클랜 id 재매핑 ${leagueClanIdMap.size}건`)
    /* 선수도 참조 기준이다. 참가기록이 가리키는 선수가 다 있어야 FK 가 선다.
       130만 행에서 distinct 를 뽑는 것이라 SQL 로 센다 — 앱으로 꺼내지 않는다 */
    const playerIdRows = await local.$queryRaw<{ playerId: string }[]>`
      select distinct s."playerId"
      from "MatchPlayerStat" s
      join "Match" m on m.id = s."matchId"
      where m."leagueId" = any(${leagueIds}) and m.origin = ${MIRROR_ORIGIN}`
    const neededPlayerIds = playerIdRows.map((r) => r.playerId)
    log(`   참가기록이 참조하는 선수 ${neededPlayerIds.length}명`)

    /* 선수도 `sourcePlayerId` / `nexonOuid` 가 unique 다. 클랜과 같은 재매핑이 필요하다 */
    const playerIdMap = new Map<string, string>()
    const pushPlayers = await copyTable(
      'Player',
      (cursor, take) =>
        local.player.findMany({
          where: { id: { in: neededPlayerIds }, origin: { not: 'mock' } },
          orderBy: { id: 'asc' },
          take,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        }),
      async (rows) => {
        const mapped = rows.map((r) => ({
          ...r,
          clanId: r.clanId === null ? null : (clanIdMap.get(r.clanId) ?? r.clanId),
        }))
        const n = (await remote.player.createMany({ data: mapped, skipDuplicates: true })).count
        /* 건너뛴 선수가 운영에 어떤 id 로 있는지 찾아 대응표에 넣는다 */
        const sources = rows.map((r) => r.sourcePlayerId).filter((v): v is string => v !== null)
        if (sources.length > 0) {
          const existing = await remote.player.findMany({
            where: { sourcePlayerId: { in: sources } },
            select: { id: true, sourcePlayerId: true },
          })
          const bySrc = new Map(existing.map((e) => [e.sourcePlayerId as string, e.id]))
          for (const r of rows) {
            const t = r.sourcePlayerId === null ? undefined : bySrc.get(r.sourcePlayerId)
            if (t !== undefined && t !== r.id) playerIdMap.set(r.id, t)
          }
        }
        return n
      },
    )
    out.push(pushPlayers)
    if (playerIdMap.size > 0) log(`   선수 id 재매핑 ${playerIdMap.size}건`)

    /* 4) 경기 → 참가기록. 여기가 대부분이다 */
    out.push(
      await copyTable(
        'Match',
        (cursor, take) =>
          local.match.findMany({
            where: { leagueId: { in: leagueIds }, origin: MIRROR_ORIGIN },
            orderBy: { id: 'asc' },
            take,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          }),
        async (rows) => {
          const mapped = rows.map((r) => ({
            ...r,
            leagueId: toRemoteLeague(r.leagueId),
            redLeagueClanId: leagueClanIdMap.get(r.redLeagueClanId) ?? r.redLeagueClanId,
            blueLeagueClanId: leagueClanIdMap.get(r.blueLeagueClanId) ?? r.blueLeagueClanId,
            mvpPlayerId: r.mvpPlayerId === null ? null : (playerIdMap.get(r.mvpPlayerId) ?? r.mvpPlayerId),
          }))
          return (await remote.match.createMany({ data: mapped, skipDuplicates: true })).count
        },
      ),
    )
    out.push(
      await copyTable(
        'MatchPlayerStat',
        (cursor, take) =>
          local.matchPlayerStat.findMany({
            where: { match: { leagueId: { in: leagueIds }, origin: MIRROR_ORIGIN } },
            orderBy: { id: 'asc' },
            take,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          }),
        async (rows) => {
          const mapped = rows.map((r) => ({
            ...r,
            playerId: playerIdMap.get(r.playerId) ?? r.playerId,
          }))
          return (await remote.matchPlayerStat.createMany({ data: mapped, skipDuplicates: true })).count
        },
      ),
    )
  } finally {
    await local.$disconnect()
    await remote.$disconnect()
  }
  return out
}
