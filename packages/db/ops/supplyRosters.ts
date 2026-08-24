/**
 * 현재 로스터 자동 갱신 — 3rd.supply 라인업 clan → `LeagueRosterMembership` (D-130).
 *
 * ── 출처를 고른 이유
 *   1. **병영수첩 클랜 멤버 목록** — 로그인 게이트다(실측 2026-08-24 · 서버 403 ·
 *      비로그인 브라우저에도 멤버 목록이 없다). 우회하지 않는다
 *   2. **3rd.supply 클랜원 목록 페이지** — "그 클랜에서 1경기 이상 뛴 선수"다.
 *      1,235명 중 **181명이 두 곳 이상**에 동시에 들어 있었다. 이력이지 현재가 아니다
 *   3. **3rd.supply 라인업 clan** ← 이것을 쓴다.
 *      750경기 11개월에 걸쳐 선수 1,091명 중 **아무도** 다른 클랜으로 나오지 않았다.
 *      렌더 시점의 현재 소속을 붙인 값이다 (`currentMembership.ts` 참조)
 *
 * ── 현재 소속만 알 수 있다
 *   이 출처는 **"지금 누가 어느 클랜인가"** 만 준다. 언제 들어왔는지는 주지 않는다.
 *   그래서 `joinedAt`을 지어내지 않는다.
 *     · 처음 보는 소속     → 그 클랜이 리그에 참여한 시각(`LeagueClan.joinedAt`)
 *     · 이적을 관측한 경우 → 관측 시각(`observedAt`). 그 이전이라는 것만 알 뿐이다
 *   어느 쪽이든 `observedAt`을 남겨 "언제 본 것인지"를 잃지 않는다.
 *
 * ── 경기 당시 소속과 섞지 않는다
 *   여기서 만드는 것은 **현재 소속**이다. 과거 경기 화면에 이 값을 쓰면 안 된다.
 *   경기 당시 소속은 `MatchPlayerStat.matchTimeClan*` 이고 근거가 다르다 (D-131).
 */
import { prisma } from '../src/index'
import type { CurrentMembershipSnapshot } from './currentMembership'

export interface SupplyRosterClanResult {
  slug: string
  observed: number
  playersCreated: number
  membershipsOpened: number
  membershipsUnchanged: number
  membershipsClosed: number
  transfersIn: number
  currentClanUpdated: number
  status: 'ok' | 'clan_not_found' | 'not_in_league'
  note: string
}

export interface SupplyRosterResult {
  clans: number
  observedPlayers: number
  /** 근거가 갈려 건드리지 않은 선수 (같은 선수가 서로 다른 클랜으로 관측됨) */
  conflicts: number
  playersCreated: number
  membershipsOpened: number
  membershipsUnchanged: number
  membershipsClosed: number
  transfers: number
  currentClanUpdated: number
  perClan: SupplyRosterClanResult[]
}

/** 이 명령이 만든 소속만 닫는다. 운영자가 손으로 넣은 로스터를 건드리지 않기 위한 것이다 */
export const SUPPLY_ROSTER_SOURCE = '3rd.supply-lineup'

/** slug → Clan. 별칭(`ClanAlias`)도 본다. **이름이 비슷하다는 이유로 잇지 않는다** */
async function findClanBySlug(slug: string) {
  const direct = await prisma.clan.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true },
  })
  if (direct) return direct
  const alias = await prisma.clanAlias.findUnique({
    where: { alias: slug },
    select: { clan: { select: { id: true, name: true, slug: true } } },
  })
  return alias?.clan ?? null
}

export async function syncSupplyRosters(input: {
  membership: CurrentMembershipSnapshot
  leagueSlug: string
  observedAt: Date
  confirm?: boolean
  /** 완전성 판정에 쓸 수 있게 표시할지. 출처가 리그 자신의 렌더값이라 기본은 true */
  verified?: boolean
}): Promise<SupplyRosterResult> {
  const verified = input.verified ?? true
  const confirm = Boolean(input.confirm)
  const sourceRef = `${input.membership.source}@${input.membership.capturedAt}`

  const result: SupplyRosterResult = {
    clans: 0,
    observedPlayers: 0,
    conflicts: input.membership.conflicts.length,
    playersCreated: 0,
    membershipsOpened: 0,
    membershipsUnchanged: 0,
    membershipsClosed: 0,
    transfers: 0,
    currentClanUpdated: 0,
    perClan: [],
  }

  const league = await prisma.league.findUnique({
    where: { slug: input.leagueSlug },
    select: { id: true },
  })
  if (!league) throw new Error(`리그를 찾을 수 없다: ${input.leagueSlug}`)

  const season = await prisma.season.findFirst({
    where: { leagueId: league.id, status: 'active' },
    select: { id: true },
  })

  /* 클랜별로 묶는다 — 탈퇴 감지는 클랜 단위로 해야 한다 */
  const byClan = new Map<string, CurrentMembershipSnapshot['rows']>()
  for (const row of input.membership.rows) {
    const bucket = byClan.get(row.clanSlug) ?? []
    bucket.push(row)
    byClan.set(row.clanSlug, bucket)
  }

  for (const [slug, rows] of byClan) {
    result.clans += 1
    const per: SupplyRosterClanResult = {
      slug,
      observed: rows.length,
      playersCreated: 0,
      membershipsOpened: 0,
      membershipsUnchanged: 0,
      membershipsClosed: 0,
      transfersIn: 0,
      currentClanUpdated: 0,
      status: 'ok',
      note: '',
    }

    const clan = await findClanBySlug(slug)
    if (!clan) {
      per.status = 'clan_not_found'
      per.note = '등록된 클랜이 없다. 이름 유사 매칭은 하지 않는다'
      result.perClan.push(per)
      continue
    }

    const leagueClan = await prisma.leagueClan.findUnique({
      where: { leagueId_clanId: { leagueId: league.id, clanId: clan.id } },
      select: { id: true, joinedAt: true },
    })
    if (!leagueClan) {
      per.status = 'not_in_league'
      per.note = '이 리그에 참여하지 않은 클랜이다'
      result.perClan.push(per)
      continue
    }

    const observedPlayerIds = new Set<string>()

    for (const row of rows) {
      result.observedPlayers += 1

      let player = await prisma.player.findFirst({
        where: { sourcePlayerId: row.sourcePlayerId },
        select: { id: true, name: true, clanId: true },
      })

      if (!player) {
        per.playersCreated += 1
        result.playersCreated += 1
        if (confirm) {
          player = await prisma.player.create({
            data: {
              name: row.nickname,
              sourcePlayerId: row.sourcePlayerId,
              origin: '3rd.supply',
              clanId: clan.id,
            },
            select: { id: true, name: true, clanId: true },
          })
        }
      }
      if (!player) {
        /* 미리보기라 아직 만들지 않았다. 그래도 **무엇이 일어날지는 세어 준다** —
           "--confirm 없이 먼저 숫자를 본다"가 성립하려면 여기서 0으로 보이면 안 된다. */
        per.membershipsOpened += 1
        result.membershipsOpened += 1
        per.currentClanUpdated += 1
        result.currentClanUpdated += 1
        continue
      }
      observedPlayerIds.add(player.id)

      /* --- 이 리그에서 열려 있는 소속 --- */
      const open = await prisma.leagueRosterMembership.findFirst({
        where: { leagueId: league.id, playerId: player.id, leftAt: null },
        select: { id: true, leagueClanId: true },
      })

      if (open?.leagueClanId === leagueClan.id) {
        per.membershipsUnchanged += 1
        result.membershipsUnchanged += 1
        if (confirm) {
          await prisma.leagueRosterMembership.update({
            where: { id: open.id },
            data: { observedAt: input.observedAt, confidence: 'high', sourceRef, verified },
          })
        }
      } else {
        if (open) {
          // 이적이다. **이전 소속을 지우지 않는다** — 관측 시각으로 닫는다
          per.transfersIn += 1
          result.transfers += 1
          per.membershipsClosed += 1
          result.membershipsClosed += 1
          if (confirm) {
            await prisma.leagueRosterMembership.update({
              where: { id: open.id },
              data: { leftAt: input.observedAt, observedAt: input.observedAt, sourceRef },
            })
          }
        }

        /* 처음 보는 소속이면 그 클랜이 리그에 들어온 시각부터로 본다(D-110과 같은 규칙).
           이적을 관측한 경우에는 **관측 시각**부터다 — 그 이전이라는 것만 알 뿐이라
           더 이른 시각을 지어내지 않는다. */
        const joinedAt = open ? input.observedAt : leagueClan.joinedAt
        per.membershipsOpened += 1
        result.membershipsOpened += 1
        if (confirm) {
          await prisma.leagueRosterMembership.upsert({
            where: {
              leagueClanId_playerId_joinedAt: {
                leagueClanId: leagueClan.id,
                playerId: player.id,
                joinedAt,
              },
            },
            create: {
              leagueId: league.id,
              leagueClanId: leagueClan.id,
              playerId: player.id,
              seasonId: season?.id ?? null,
              joinedAt,
              source: SUPPLY_ROSTER_SOURCE,
              verified,
              observedAt: input.observedAt,
              confidence: 'high',
              sourceRef,
            },
            update: {
              leftAt: null,
              verified,
              observedAt: input.observedAt,
              confidence: 'high',
              sourceRef,
            },
          })
        }
      }

      /* --- 현재 소속 표시값 --- */
      if (player.clanId !== clan.id) {
        per.currentClanUpdated += 1
        result.currentClanUpdated += 1
        if (confirm) {
          await prisma.player.update({ where: { id: player.id }, data: { clanId: clan.id } })
        }
      }
      if (confirm) {
        const leaguePlayer = await prisma.leaguePlayer.findUnique({
          where: { leagueId_playerId: { leagueId: league.id, playerId: player.id } },
          select: { id: true, clanId: true },
        })
        if (leaguePlayer && leaguePlayer.clanId !== clan.id) {
          await prisma.leaguePlayer.update({
            where: { id: leaguePlayer.id },
            data: { clanId: clan.id },
          })
        }
      }
    }

    /* --- 목록에서 사라진 사람 = 탈퇴. **이 명령이 만든 소속만** 닫는다 --- */
    const stillOpen = await prisma.leagueRosterMembership.findMany({
      where: {
        leagueClanId: leagueClan.id,
        leftAt: null,
        source: SUPPLY_ROSTER_SOURCE,
        playerId: { notIn: [...observedPlayerIds] },
      },
      select: { id: true },
    })
    for (const membership of stillOpen) {
      per.membershipsClosed += 1
      result.membershipsClosed += 1
      if (confirm) {
        await prisma.leagueRosterMembership.update({
          where: { id: membership.id },
          data: { leftAt: input.observedAt, observedAt: input.observedAt, sourceRef },
        })
      }
    }

    result.perClan.push(per)
  }

  return result
}
