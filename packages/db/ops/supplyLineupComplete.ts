/**
 * 3rd.supply 라인업으로 참가자 명단을 **완성**한다 (D-148).
 *
 * ── 왜 필요한가
 *   넥슨 Open API 의 `match-detail` 은 한 경기에 6~9명만 준다. 파라미터가 `match_id` 뿐이라
 *   나머지를 따로 요청할 방법이 없고, 같은 경기가 여러 match_id 로 쪼개져 있지도 않다.
 *   실측: 상세 수집이 끝난 866경기 중 865경기에서 **상세 참가자 > 우리가 관측한 수** 였다.
 *   즉 넥슨이 감추는 게 아니라 애초에 그만큼만 준다.
 *
 *   그런데 3rd.supply 스냅샷에는 **10명 전원**이 들어 있다 (750경기 중 739경기가 정확히 10명).
 *   명단을 이미 손에 들고 있으면서 안 쓰고 있었다.
 *
 * ── 무엇을 어디서 가져오는가
 *   3rd.supply : 10명 명단 · 닉네임 · **경기 당시 클랜** · **무기**(넥슨은 안 준다) · 승패
 *   넥슨       : 킬/데스/어시 · 딜량 · 헤드샷
 *   두 출처를 **합친다.** 넥슨이 준 사람은 KDA 가 채워지고, 나머지는 `null`(알수없음)이다.
 *   **없는 값을 0으로 지어내지 않는다** (CLAUDE.md 3-A 8번).
 *
 * ── 신원 규칙 — **채우기 전에 신원부터 확정한다** (2-pass)
 *
 *   1차 pass 는 아무것도 쓰지 않고 **근거만 모은다.**
 *     같은 경기 안에서 넥슨이 준 참가자의 닉네임과 3rd.supply 라인업의 닉네임이
 *     **정확히** 일치하면 그 둘은 같은 사람이다 — 같은 경기라는 맥락이 근거다.
 *     단 그 닉네임이 그 경기 안에서 **양쪽 모두 유일할 때만** 인정한다.
 *     전체 경기에서 모은 뒤 `supplyId ↔ playerId` 가 **1:1 일 때만** 확정한다.
 *
 *   2차 pass 에서 실제로 채운다.
 *     1순위 1차 pass 가 확정한 신원
 *     2순위 이미 저장된 `Player.sourcePlayerId` (1차 근거와 충돌하지 않을 때만)
 *     3순위 새 Player 생성 (`origin='3rd.supply'` · `sourcePlayerId` 보존)
 *
 *   순서가 중요하다. 저장된 `sourcePlayerId` 를 먼저 믿으면, 다른 경기에서 만들어진
 *   `SUP-` 그림자 선수가 같은 경기에 이미 있는 진짜 넥슨 선수를 가려 **한 사람이 두 줄**이 된다.
 *   1차 시도에서 실제로 그렇게 됐다 (경기당 11~16명).
 *
 *   fuzzy 매칭은 하지 않는다. 비슷한 닉네임을 같은 사람으로 합치지 않는다.
 */
import { prisma } from '../src/index'
import type { SupplyMatchSnapshot, SupplyLineupRow } from './supplyMatches'

export interface LineupCompleteResult {
  /** 스냅샷에서 살펴본 경기 수 */
  considered: number
  /** 우리 DB 에 Match 가 있어 대상이 된 경기 수 */
  targeted: number
  /** 이번에 10명이 된 경기 수 */
  completed: number
  /** 이미 10명이던 경기 수 */
  alreadyComplete: number
  createdPlayers: number
  /** 1차 pass 가 닉네임 근거로 확정한 신원 수 */
  identitiesResolved: number
  /** 근거가 서로 어긋나 확정하지 못한 신원 수 */
  identitiesAmbiguous: number
  /** 저장된 sourcePlayerId 가 근거와 달라 무시한 수 */
  storedLinkConflicts: number
  createdStats: number
  /** 라인업 인원을 넘겨 쓰지 않고 넘어간 경기 (신원 문제 의심) */
  overfilled: number
  skipped: Record<string, number>
}

/** 라인업 한 줄 → 읽기 쉬운 형태 */
interface LineupEntry {
  supplyPlayerId: string | null
  nickname: string | null
  supplyClanId: string | null
  /** 0 = 라이플, 1 = 스나이퍼 */
  weapon: number | null
  side: 'red' | 'blue'
}

function toEntries(rows: SupplyLineupRow[] | undefined, side: 'red' | 'blue'): LineupEntry[] {
  return (rows ?? []).map((row) => ({
    supplyPlayerId: row[0] === null || row[0] === undefined ? null : String(row[0]),
    nickname: row[1] ?? null,
    supplyClanId: row[2] === null || row[2] === undefined ? null : String(row[2]),
    weapon: row[3] === null || row[3] === undefined ? null : Number(row[3]),
    side,
  }))
}

export async function completeLineupsFromSupply(input: {
  snapshot: SupplyMatchSnapshot
  leagueSlug: string
  dryRun: boolean
  /** 우리 DB 에 이미 있는 경기만 손댈지. 기본 true — 새 경기 import 는 별도 작업이다 */
  onlyExisting?: boolean
  limit?: number
}): Promise<LineupCompleteResult> {
  const result: LineupCompleteResult = {
    considered: 0,
    targeted: 0,
    completed: 0,
    alreadyComplete: 0,
    createdPlayers: 0,
    identitiesResolved: 0,
    identitiesAmbiguous: 0,
    storedLinkConflicts: 0,
    createdStats: 0,
    overfilled: 0,
    skipped: {},
  }
  const skip = (code: string): void => {
    result.skipped[code] = (result.skipped[code] ?? 0) + 1
  }

  const league = await prisma.league.findUnique({
    where: { slug: input.leagueSlug },
    select: { id: true },
  })
  if (!league) {
    skip('league_not_found')
    return result
  }

  /* 3rd.supply 클랜 id → 우리 LeagueClan. 연결되지 않은 외부 클랜은 null 로 둔다 */
  const leagueClans = await prisma.leagueClan.findMany({
    where: { leagueId: league.id },
    select: { id: true, clan: { select: { id: true, sourceClanId: true, name: true, slug: true, markBgUrl: true, markFrontUrl: true } } },
  })
  const clanBySource = new Map<string, (typeof leagueClans)[number]>()
  for (const lc of leagueClans) {
    if (lc.clan.sourceClanId) clanBySource.set(lc.clan.sourceClanId, lc)
  }


  const records = input.limit ? input.snapshot.matches.slice(0, input.limit) : input.snapshot.matches

  /* 우리 DB 에 있는 경기만 대상이다. 없는 경기 import 는 별도 작업이다 */
  type LoadedMatch = {
    id: string
    sourceMatchId: string | null
    redLeagueClanId: string
    blueLeagueClanId: string
    stats: {
      playerId: string
      side: string
      player: { id: string; name: string; sourcePlayerId: string | null }
    }[]
  }
  const targets: { match: LoadedMatch; entries: LineupEntry[] }[] = []

  for (const record of records) {
    result.considered += 1
    const match = (await prisma.match.findFirst({
      where: { leagueId: league.id, OR: [{ id: record.id }, { sourceMatchId: record.id }] },
      select: {
        id: true,
        sourceMatchId: true,
        redLeagueClanId: true,
        blueLeagueClanId: true,
        stats: {
          select: {
            playerId: true,
            side: true,
            player: { select: { id: true, name: true, sourcePlayerId: true } },
          },
        },
      },
    })) as LoadedMatch | null
    if (!match) {
      if (input.onlyExisting !== false) skip('match_not_in_db')
      continue
    }
    const entries = [...toEntries(record.red, 'red'), ...toEntries(record.blue, 'blue')]
    if (entries.length === 0) {
      skip('no_lineup')
      continue
    }
    result.targeted += 1
    targets.push({ match, entries })
  }

  /* ------------------------------------------------------------------ */
  /* 1차 pass — 신원 근거만 모은다. 아무것도 쓰지 않는다                     */
  /* ------------------------------------------------------------------ */
  /** supplyId → 후보 playerId 들 */
  const evidence = new Map<string, Set<string>>()
  /** playerId → 후보 supplyId 들 (역방향 충돌 검사용) */
  const reverse = new Map<string, Set<string>>()

  /** 그 경기 안에서 **유일한** 닉네임만 근거로 쓴다. 두 번 나오면 버린다 */
  function uniqueByName<T>(rows: T[], nameOf: (row: T) => string | null): Map<string, T> {
    const seen = new Map<string, T | null>()
    for (const row of rows) {
      const name = nameOf(row)
      if (!name) continue
      seen.set(name, seen.has(name) ? null : row)
    }
    const out = new Map<string, T>()
    for (const [name, row] of seen) if (row) out.set(name, row)
    return out
  }

  /* `Player.name` 은 **지금** 닉네임이다. 3rd.supply 는 **경기 당시** 닉네임을 적었다.
     닉네임을 바꾼 사람은 이 둘이 다르다. 스테이징의 `NexonMatchParticipant.userName` 은
     그 경기 당시 이름이므로, 그것도 함께 근거로 쓴다 (D-148). */
  const matchTimeNames = new Map<string, Map<string, string>>()
  {
    const rows = await prisma.nexonMatchParticipant.findMany({
      where: { resolvedPlayerId: { not: null }, userName: { not: null } },
      select: { nexonMatchId: true, userName: true, resolvedPlayerId: true },
    })
    const nexonMatchIds = [...new Set(rows.map((row) => row.nexonMatchId))]
    /* NexonMatch 는 우리 Match 를 FK 로 들고 있지 않다. `sourceMatchId` 로 잇는다 */
    const nexonMatches = await prisma.nexonMatch.findMany({
      where: { id: { in: nexonMatchIds } },
      select: { id: true, sourceMatchId: true },
    })
    const ourMatchOf = new Map(nexonMatches.map((row) => [row.id, row.sourceMatchId]))
    for (const row of rows) {
      const ourId = ourMatchOf.get(row.nexonMatchId)
      if (!ourId) continue
      const bucket = matchTimeNames.get(ourId) ?? new Map<string, string>()
      /* 같은 경기에서 한 이름이 두 사람을 가리키면 근거로 못 쓴다 */
      bucket.set(row.userName as string, bucket.has(row.userName as string) ? '' : (row.resolvedPlayerId as string))
      matchTimeNames.set(ourId, bucket)
    }
  }

  const matchTimeNamesOf = (match: LoadedMatch): Map<string, string> =>
    matchTimeNames.get(match.id) ??
    (match.sourceMatchId ? matchTimeNames.get(match.sourceMatchId) : undefined) ??
    new Map<string, string>()

  for (const target of targets) {
    const nexonByName = uniqueByName(target.match.stats, (stat) => stat.player.name)
    /* 경기 당시 이름도 같은 색인에 얹는다. 현재 이름이 이미 잡은 자리는 덮지 않는다 */
    for (const [name, playerId] of matchTimeNamesOf(target.match)) {
      if (!playerId || nexonByName.has(name)) continue
      const stat = target.match.stats.find((row) => row.playerId === playerId)
      if (stat) nexonByName.set(name, stat)
    }
    const supplyByName = uniqueByName(target.entries, (entry) => entry.nickname)
    for (const [name, entry] of supplyByName) {
      const stat = nexonByName.get(name)
      if (!stat || !entry.supplyPlayerId) continue
      const supplyId = entry.supplyPlayerId
      const forward = evidence.get(supplyId) ?? new Set<string>()
      forward.add(stat.playerId)
      evidence.set(supplyId, forward)
      const backward = reverse.get(stat.playerId) ?? new Set<string>()
      backward.add(supplyId)
      reverse.set(stat.playerId, backward)
    }
  }

  /** 1:1 인 것만 확정한다. 하나라도 갈리면 버린다 — 틀린 연결보다 빈 채로 두는 게 낫다 */
  const identity = new Map<string, string>()
  for (const [supplyId, players] of evidence) {
    if (players.size !== 1) {
      result.identitiesAmbiguous += 1
      continue
    }
    const playerId = [...players][0]
    if (!playerId || (reverse.get(playerId)?.size ?? 0) !== 1) {
      result.identitiesAmbiguous += 1
      continue
    }
    identity.set(supplyId, playerId)
  }
  result.identitiesResolved = identity.size

  /* 이미 저장된 sourcePlayerId 중 근거와 어긋나는 것은 믿지 않는다.
     실제로 있었다 — `주일이` 에 다른 사람(`뜨거운감자냥`)의 supply id 가 박혀 있었다 */
  const storedBySupplyId = new Map<string, string>()
  const stored = await prisma.player.findMany({
    where: { sourcePlayerId: { not: null } },
    select: { id: true, sourcePlayerId: true },
  })
  for (const row of stored) {
    const supplyId = row.sourcePlayerId as string
    const resolved = identity.get(supplyId)
    if (resolved && resolved !== row.id) {
      result.storedLinkConflicts += 1
      continue
    }
    const backward = reverse.get(row.id)
    if (backward && !backward.has(supplyId)) {
      result.storedLinkConflicts += 1
      continue
    }
    storedBySupplyId.set(supplyId, row.id)
  }

  /* ------------------------------------------------------------------ */
  /* 2차 pass — 실제로 채운다                                             */
  /* ------------------------------------------------------------------ */
  const observedAt = new Date(input.snapshot.capturedAt)

  for (const { match, entries } of targets) {
    const present = new Set(match.stats.map((stat) => stat.playerId))
    if (present.size >= entries.length) {
      result.alreadyComplete += 1
      continue
    }

    /* 이 경기 안의 근거가 가장 강하다 — 같은 경기에 이미 그 이름/그 supply id 로
       앉아 있는 사람이면 그 사람이다. 전역 근거가 갈렸더라도 이건 흔들리지 않는다.
       (전역 근거만 믿으면 여기 있는 진짜 선수를 못 알아보고 `SUP-` 를 하나 더 만든다) */
    const inMatchByName = uniqueByName(match.stats, (stat) => stat.player.name)
    for (const [name, playerId] of matchTimeNamesOf(match)) {
      if (!playerId || inMatchByName.has(name)) continue
      const stat = match.stats.find((row) => row.playerId === playerId)
      if (stat) inMatchByName.set(name, stat)
    }
    const inMatchBySupplyId = new Map<string, string>()
    for (const stat of match.stats) {
      if (stat.player.sourcePlayerId) inMatchBySupplyId.set(stat.player.sourcePlayerId, stat.playerId)
    }

    /* 이 경기에서 쓸 사람을 **먼저 다 정한 뒤** 인원을 검사하고 쓴다 */
    const planned: { entry: LineupEntry; playerId: string; create: boolean }[] = []
    for (const entry of entries) {
      if (!entry.supplyPlayerId) {
        skip('lineup_row_without_player_id')
        continue
      }
      const resolved =
        inMatchBySupplyId.get(entry.supplyPlayerId) ??
        (entry.nickname ? inMatchByName.get(entry.nickname)?.playerId : undefined) ??
        identity.get(entry.supplyPlayerId) ??
        storedBySupplyId.get(entry.supplyPlayerId)
      planned.push({
        entry,
        playerId: resolved ?? `SUP-${entry.supplyPlayerId}`,
        create: !resolved,
      })
    }

    const finalIds = new Set([...present, ...planned.map((row) => row.playerId)])
    if (finalIds.size > entries.length) {
      /* 라인업이 10명인데 11명 이상이 된다 = 누군가의 신원이 틀렸다.
         지어내지 말고 손대지 않는다. 숫자로 남겨 따로 조사한다 */
      result.overfilled += 1
      skip('overfill_identity_suspect')
      continue
    }

    for (const row of planned) {
      if (present.has(row.playerId)) continue
      const { entry } = row

      if (row.create) {
        if (!input.dryRun) {
          await prisma.player.upsert({
            where: { id: row.playerId },
            create: {
              id: row.playerId,
              name: entry.nickname ?? `선수-${entry.supplyPlayerId}`,
              origin: '3rd.supply',
              sourcePlayerId: entry.supplyPlayerId,
            },
            update: {},
            select: { id: true },
          })
        }
        result.createdPlayers += 1
      } else if (!input.dryRun && entry.supplyPlayerId) {
        /* 확정된 신원에 근거를 남긴다. 이미 값이 있으면 덮어쓰지 않는다 */
        await prisma.player.updateMany({
          where: { id: row.playerId, sourcePlayerId: null },
          data: { sourcePlayerId: entry.supplyPlayerId },
        })
      }

      /* 경기 당시 클랜 — 3rd.supply 가 준 그 경기의 클랜이다. 현재 소속이 아니다 */
      const clan = entry.supplyClanId ? clanBySource.get(entry.supplyClanId) : undefined
      const leagueClanId = entry.side === 'red' ? match.redLeagueClanId : match.blueLeagueClanId
      const isMember = clan ? clan.id === leagueClanId : false

      if (!input.dryRun) {
        await prisma.matchPlayerStat.upsert({
          where: { matchId_playerId: { matchId: match.id, playerId: row.playerId } },
          create: {
            matchId: match.id,
            playerId: row.playerId,
            side: entry.side,
            /* 넥슨 상세에 없던 사람이다. KDA 를 **모른다.**
               0으로 채우면 "0킬을 했다"는 거짓이 되므로 null 로 둔다 — 화면은 `알수없음` (D-148) */
            kill: null,
            death: null,
            assist: null,
            headshot: null,
            damage: null,
            weapon: entry.weapon,
            dropout: null,
            mvp: null,
            participantRole: isMember ? 'member' : 'mercenary',
            rosterLeagueClanId: clan?.id ?? null,
            matchTimeClanName: clan?.clan.name ?? null,
            matchTimeLeagueClanId: clan?.id ?? null,
            matchTimeClanSlug: clan?.clan.slug ?? null,
            matchTimeClanMarkBgUrl: clan?.clan.markBgUrl ?? null,
            matchTimeClanMarkFrontUrl: clan?.clan.markFrontUrl ?? null,
            matchTimeClanSource: 'supply-lineup',
            matchTimeClanObservedAt: observedAt,
            matchTimeClanConfidence: 'high',
            playerDivisionAtMatch: 1,
            opponentDivisionAtMatch: 1,
          },
          /* 이미 있으면 무기만 보탠다. 넥슨이 준 KDA 를 덮어쓰지 않는다 */
          update: { weapon: entry.weapon },
        })
      }
      result.createdStats += 1
      present.add(row.playerId)
    }

    if (!input.dryRun) {
      const red = await prisma.matchPlayerStat.count({ where: { matchId: match.id, side: 'red' } })
      const blue = await prisma.matchPlayerStat.count({ where: { matchId: match.id, side: 'blue' } })
      await prisma.match.update({
        where: { id: match.id },
        data: {
          playerCount: red + blue,
          participantCompleteness: `${Math.max(red, blue)}v${Math.min(red, blue)}`,
        },
      })
      if (red + blue === 10) result.completed += 1
    } else if (present.size === 10) {
      result.completed += 1
    }
  }

  return result
}
