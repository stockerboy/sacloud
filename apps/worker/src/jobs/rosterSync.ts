/**
 * 병영수첩 클랜 멤버 → 실제 로스터 (D-110).
 *
 * ── 왜 필요한가
 *   공식 인정은 "본클랜원 3명 이상"이고(D-079), 본클랜원 판정은 **등록된 로스터**로 한다.
 *   로스터가 비어 있으면 실제 경기가 아무리 쌓여도 official은 0건이다.
 *   그렇다고 사람이 클랜마다 수십 명을 손으로 적을 수는 없다.
 *
 * ── 근거의 강도
 *   병영수첩 클랜 멤버 응답은 한 행에 **클랜 + 닉네임 + 계정 식별자**가 같이 있다.
 *   "이름이 비슷하다"가 아니라 **그 클랜의 공식 멤버 목록**이다. 그래서 로스터 근거로 쓴다.
 *
 * ── 그래도 하지 않는 것
 *   - 병영수첩이 말하지 않은 사람을 로스터에 넣지 않는다
 *   - 클랜명이 우리 등록과 **정확히** 같지 않으면 진행하지 않는다 (유사 매칭 금지)
 *   - 넥슨 Open API 신원(`ouid`)과의 연결은 여기서 하지 않는다.
 *     그건 `identity-link`가 **경기 근거**를 보고 따로 한다 (D-109)
 *
 * ── 과거 시점 문제 (정책 8장)
 *   병영수첩은 "지금" 멤버만 준다. 가입 시각을 주지 않는다.
 *   그래서 `joinedAt`을 **아무렇게나 과거로 잡지 않는다.** 기본은 그 클랜이 리그에 참여한
 *   시각(`LeagueClan.joinedAt`)이다. 그 값은 운영자가 등록한 시점이고, D-108의 기준과 같다.
 *   이미 있는 membership은 시각을 건드리지 않는다.
 */
import { prisma } from '@sacloud/db'
import { BarracksClient, type BarracksClanMember } from '../lib/barracks.js'
import { log, warn } from '../lib/log.js'

/** 병영수첩 계정 번호로 만드는 Player 키. 3rd.supply의 `player.id`와 같은 값이다 */
export function barracksPlayerKey(userNexonSn: number): string {
  return `SUPPLY-${userNexonSn}`
}

export interface RosterSyncClanResult {
  clanName: string
  clanSlug: string | null
  clanNo: string | null
  /** 병영수첩이 준 멤버 수 */
  members: number
  /** 새로 만든 Player */
  playersCreated: number
  /** 새로 넣은 membership */
  membershipsCreated: number
  /** 이미 있던 membership */
  membershipsExisting: number
  /** E2E 자리표시자에서 실제 Player로 옮긴 membership */
  membershipsRepaired: number
  status: 'ok' | 'no_seed' | 'clan_mismatch' | 'no_members' | 'error'
  note: string
}

export interface RosterSyncResult {
  clans: RosterSyncClanResult[]
  requests: number
}

/**
 * 리그의 각 클랜에 대해 병영수첩 멤버 목록을 받아 로스터를 채운다.
 *
 * 클랜 slug를 모르면 **이미 등록된 로스터 멤버의 닉네임**을 씨앗으로 쓴다.
 * 그 사람의 병영수첩 프로필이 말하는 클랜이 우리 등록 클랜명과 정확히 같을 때만 진행한다.
 */
export async function syncRosterFromBarracks(input: {
  leagueSlug: string
  clanSlugFilter?: string | null
  confirm?: boolean
  client?: BarracksClient
}): Promise<RosterSyncResult> {
  const client = input.client ?? new BarracksClient()
  const result: RosterSyncResult = { clans: [], requests: 0 }

  const league = await prisma.league.findUnique({
    where: { slug: input.leagueSlug },
    select: { id: true },
  })
  if (!league) {
    warn(`리그를 찾을 수 없다: ${input.leagueSlug}`)
    return result
  }

  const leagueClans = await prisma.leagueClan.findMany({
    where: {
      leagueId: league.id,
      ...(input.clanSlugFilter ? { clan: { slug: input.clanSlugFilter } } : {}),
    },
    select: {
      id: true,
      joinedAt: true,
      clan: { select: { id: true, slug: true, name: true, sourceClanId: true } },
    },
  })

  for (const leagueClan of leagueClans) {
    const entry: RosterSyncClanResult = {
      clanName: leagueClan.clan.name,
      clanSlug: null,
      clanNo: null,
      members: 0,
      playersCreated: 0,
      membershipsCreated: 0,
      membershipsExisting: 0,
      membershipsRepaired: 0,
      status: 'ok',
      note: '',
    }

    /* 씨앗 — 이미 등록된 로스터 멤버의 닉네임 하나면 클랜 slug까지 갈 수 있다 */
    const seed = await prisma.leagueRosterMembership.findFirst({
      where: { leagueClanId: leagueClan.id },
      select: { player: { select: { name: true } } },
      orderBy: { joinedAt: 'asc' },
    })
    if (!seed) {
      entry.status = 'no_seed'
      entry.note = '이 클랜에 등록된 로스터가 하나도 없어 클랜을 특정할 수 없다'
      result.clans.push(entry)
      continue
    }

    let roster: Awaited<ReturnType<BarracksClient['rosterByMemberNickname']>> = null
    try {
      roster = await client.rosterByMemberNickname({
        nickname: seed.player.name,
        expectClanName: leagueClan.clan.name,
      })
    } catch (error) {
      entry.status = 'error'
      entry.note = error instanceof Error ? error.message : String(error)
      result.clans.push(entry)
      continue
    }

    if (!roster) {
      entry.status = 'clan_mismatch'
      entry.note = `씨앗 닉네임(${seed.player.name})의 병영수첩 클랜이 "${leagueClan.clan.name}"과 다르거나 확인되지 않는다`
      result.clans.push(entry)
      continue
    }

    entry.clanSlug = roster.clan.clanSlug
    entry.clanNo = roster.clanNo
    entry.members = roster.members.length
    if (roster.members.length === 0) {
      entry.status = 'no_members'
      entry.note = '멤버 목록이 비어 있다'
      result.clans.push(entry)
      continue
    }

    if (!input.confirm) {
      result.clans.push(entry)
      continue
    }

    /* 클랜 slug를 보존해 둔다 — 다음부터는 씨앗 없이 바로 찾을 수 있다 */
    if (leagueClan.clan.sourceClanId !== roster.clan.clanSlug) {
      await prisma.clan.update({
        where: { id: leagueClan.clan.id },
        data: { sourceClanId: roster.clan.clanSlug },
      })
    }

    for (const member of roster.members) {
      const applied = await applyMember({
        member,
        leagueId: league.id,
        leagueClanId: leagueClan.id,
        joinedAt: leagueClan.joinedAt,
      })
      entry.playersCreated += applied.playerCreated ? 1 : 0
      entry.membershipsCreated += applied.membershipCreated ? 1 : 0
      entry.membershipsExisting += applied.membershipExisting ? 1 : 0
      entry.membershipsRepaired += applied.repaired ? 1 : 0
    }

    log(
      `${leagueClan.clan.name} (${roster.clan.clanSlug}) — 멤버 ${entry.members} · ` +
        `신규 ${entry.membershipsCreated} · 기존 ${entry.membershipsExisting} · 교체 ${entry.membershipsRepaired}`,
    )
    result.clans.push(entry)
  }

  result.requests = client.requestCount
  return result
}

/**
 * 멤버 한 명을 로스터에 반영한다.
 *
 * E2E 자리표시자(`E2E-…`)가 같은 닉네임으로 이미 등록돼 있으면 **실제 Player로 옮긴다**.
 * 테스트 행의 이름을 바꾸지 않는다 — membership이 가리키는 대상을 바꾼다 (정책 6장).
 */
async function applyMember(input: {
  member: BarracksClanMember
  leagueId: string
  leagueClanId: string
  joinedAt: Date
}): Promise<{
  playerCreated: boolean
  membershipCreated: boolean
  membershipExisting: boolean
  repaired: boolean
}> {
  const playerId = barracksPlayerKey(input.member.userNexonSn)
  const out = { playerCreated: false, membershipCreated: false, membershipExisting: false, repaired: false }

  const existingPlayer = await prisma.player.findUnique({ where: { id: playerId }, select: { id: true } })
  if (!existingPlayer) {
    await prisma.player.create({
      data: {
        id: playerId,
        name: input.member.nickname,
        sourcePlayerId: String(input.member.userNexonSn),
      },
    })
    out.playerCreated = true
  } else {
    // 닉네임이 바뀌었으면 현재 이름을 따라간다. 사람은 계정 번호로 고정돼 있다
    await prisma.player.update({ where: { id: playerId }, data: { name: input.member.nickname } })
  }

  /* 같은 닉네임의 E2E 자리표시자가 이 클랜에 등록돼 있으면 실제 Player로 옮긴다 */
  const placeholder = await prisma.leagueRosterMembership.findFirst({
    where: {
      leagueClanId: input.leagueClanId,
      player: { id: { startsWith: 'E2E-' }, name: input.member.nickname },
    },
    select: { id: true, joinedAt: true },
  })
  if (placeholder) {
    const already = await prisma.leagueRosterMembership.findUnique({
      where: {
        leagueClanId_playerId_joinedAt: {
          leagueClanId: input.leagueClanId,
          playerId,
          joinedAt: placeholder.joinedAt,
        },
      },
      select: { id: true },
    })
    if (already) {
      await prisma.leagueRosterMembership.delete({ where: { id: placeholder.id } })
    } else {
      await prisma.leagueRosterMembership.update({
        where: { id: placeholder.id },
        data: { playerId, source: 'barracks', verified: true, note: '병영수첩 멤버 목록으로 확인' },
      })
    }
    out.repaired = true
    return out
  }

  const existing = await prisma.leagueRosterMembership.findFirst({
    where: { leagueClanId: input.leagueClanId, playerId, leftAt: null },
    select: { id: true },
  })
  if (existing) {
    out.membershipExisting = true
    return out
  }

  await prisma.leagueRosterMembership.create({
    data: {
      leagueId: input.leagueId,
      leagueClanId: input.leagueClanId,
      playerId,
      // 병영수첩은 가입 시각을 주지 않는다. 클랜이 리그에 참여한 시각을 쓴다 (D-108)
      joinedAt: input.joinedAt,
      leftAt: null,
      source: 'barracks',
      verified: true,
      note: `병영수첩 클랜 멤버 (${input.member.clanLevel})`,
    },
  })
  out.membershipCreated = true
  return out
}

/* ------------------------------------------------- 경기 근거 기반 로스터 --- */

/**
 * 넥슨 경기 기록의 `guild_name`으로 로스터를 만든다 (D-111).
 *
 * ── 왜 이 경로가 필요한가
 *   병영수첩의 클랜 멤버 목록은 **넥슨 공식클랜에만** 공개된다(2026-08-23 실측).
 *   우리 Beta 6개 클랜은 공식클랜이 아니라 그 목록을 볼 수 없다. 로그인·우회는 하지 않는다.
 *
 * ── 무엇을 근거로 삼는가
 *   넥슨 매치 상세는 참가자마다 **그 경기에서 달고 나온 클랜 이름**을 준다.
 *   이건 우리가 추측한 값이 아니라 **게임이 기록한 소속**이다.
 *   D-072가 이미 "guild_name이 리그 클랜과 **정확히** 일치할 때 팀 식별 근거로 쓴다"고 정했다.
 *   같은 기준을 로스터에도 적용한다. **유사 매칭은 하지 않는다 — 문자열이 정확히 같아야 한다.**
 *
 * ── 만들어지는 것
 *   `verified=false`, `source='match_evidence'` membership.
 *   기본 재구성은 확인된 로스터만 쓰므로(D-056) 이대로는 official 판정에 들어가지 않는다.
 *   운영자가 검토 후 확정하면 그때 공식 기록이 된다.
 *
 * ── joinedAt
 *   그 클랜 이름으로 **처음 관측된 경기 시각**이다. 그보다 이전으로 소급하지 않는다 (D-108).
 */
export interface MatchEvidenceRosterResult {
  clanName: string
  candidates: number
  created: number
  existing: number
  /** 근거가 1경기뿐이라 넣지 않은 사람 */
  tooWeak: number
}

export async function buildRosterFromMatchEvidence(input: {
  leagueSlug: string
  from: Date
  to: Date
  /** 이 횟수 이상 같은 클랜으로 관측돼야 후보로 인정한다 */
  minAppearances?: number
  confirm?: boolean
}): Promise<MatchEvidenceRosterResult[]> {
  const minAppearances = input.minAppearances ?? 2
  const league = await prisma.league.findUnique({
    where: { slug: input.leagueSlug },
    select: { id: true, clans: { select: { id: true, joinedAt: true, clan: { select: { name: true } } } } },
  })
  if (!league) return []

  const results: MatchEvidenceRosterResult[] = []

  for (const leagueClan of league.clans) {
    const entry: MatchEvidenceRosterResult = {
      clanName: leagueClan.clan.name,
      candidates: 0,
      created: 0,
      existing: 0,
      tooWeak: 0,
    }

    /* 클랜 이름이 **정확히** 같은 참가자만 본다 */
    const rows = await prisma.nexonMatchParticipant.findMany({
      where: {
        clanName: leagueClan.clan.name,
        nexonMatch: {
          dateMatch: { gte: input.from, lt: input.to },
          matchType: { in: ['클랜전', '퀵매치 클랜전', '클랜 랭크전'] },
        },
      },
      select: { userName: true, nexonMatch: { select: { dateMatch: true } } },
    })

    const seen = new Map<string, { count: number; firstAt: Date }>()
    for (const row of rows) {
      if (!row.userName) continue
      const at = row.nexonMatch.dateMatch ?? input.from
      const prev = seen.get(row.userName)
      if (prev) {
        prev.count += 1
        if (at < prev.firstAt) prev.firstAt = at
      } else {
        seen.set(row.userName, { count: 1, firstAt: at })
      }
    }

    for (const [nickname, evidence] of seen) {
      entry.candidates += 1
      if (evidence.count < minAppearances) {
        entry.tooWeak += 1
        continue
      }

      /* 사람은 닉네임이 아니라 계정으로 고정돼야 한다.
         우리가 아는 계정(NexonIdentity → playerId)이 있을 때만 로스터에 넣는다.
         없으면 넣지 않는다 — 닉네임만으로 사람을 만들지 않는다 (D-036) */
      let identity = await prisma.nexonIdentity.findFirst({
        where: { userName: nickname, playerId: { not: null }, status: 'active' },
        select: { ouid: true, playerId: true },
      })

      /* 아직 사람이 없는 계정이면 **그 계정 전용 Player를 새로 만든다.**
         남과 합치는 것이 아니라 1:1로 만드는 것이라 D-036에 걸리지 않는다.
         같은 닉네임의 계정이 둘 이상이면 누구인지 정할 수 없으므로 건너뛴다. */
      if (!identity?.playerId) {
        const unresolved = await prisma.nexonIdentity.findMany({
          where: { userName: nickname, playerId: null, NOT: { ouid: { startsWith: 'E2E-' } } },
          select: { ouid: true },
        })
        if (unresolved.length !== 1) {
          entry.tooWeak += 1
          continue
        }
        const ouid = unresolved[0]!.ouid
        if (!input.confirm) {
          entry.created += 1
          continue
        }
        const playerId = `NX-${ouid}`
        await prisma.player.upsert({
          where: { id: playerId },
          create: { id: playerId, name: nickname, nexonOuid: ouid },
          update: { name: nickname },
          select: { id: true },
        })
        await prisma.nexonIdentity.update({
          where: { ouid },
          data: {
            playerId,
            status: 'active',
            linkReason:
              `계정 전용 Player 생성 — 경기 ${evidence.count}건에서 guild_name이 ` +
              `"${leagueClan.clan.name}"으로 정확히 일치 (병합 아님)`,
          },
        })
        identity = { ouid, playerId }
      }
      if (!identity?.playerId) {
        entry.tooWeak += 1
        continue
      }

      const existing = await prisma.leagueRosterMembership.findFirst({
        where: { leagueClanId: leagueClan.id, playerId: identity.playerId, leftAt: null },
        select: { id: true },
      })
      if (existing) {
        entry.existing += 1
        continue
      }
      if (!input.confirm) {
        entry.created += 1
        continue
      }

      /* 근거가 말하는 **첫 관측 경기 시각**을 그대로 쓴다.
         예전에는 `LeagueClan.joinedAt` 아래로 못 내려가게 막았는데, 그 값은
         "클랜이 리그에 참여한 시각"이 아니라 **DB 행이 만들어진 시각**일 수 있다.
         그러면 이관된 클랜의 과거 경기가 통째로 "등록 전"으로 걸러진다 (실제로 그랬다). */
      const joinedAt = evidence.firstAt
      await prisma.leagueRosterMembership.create({
        data: {
          leagueId: league.id,
          leagueClanId: leagueClan.id,
          playerId: identity.playerId,
          joinedAt,
          leftAt: null,
          source: 'match_evidence',
          // 운영자가 확인하기 전까지는 공식 판정에 쓰이지 않는다
          verified: false,
          note: `넥슨 경기 기록의 guild_name 정확 일치 ${evidence.count}건`,
        },
      })
      entry.created += 1
    }

    results.push(entry)
  }

  return results
}
