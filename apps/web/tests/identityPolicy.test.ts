/**
 * 신원 정책 회귀 — 로스터는 신원의 조건이 아니다 (D-134가 D-109를 완화).
 *
 * 실제 DB에 임시 리그를 만들고 **실제 연결 함수**를 돌린다.
 *
 * 여기서 고정하는 약속
 *   1. 로스터가 **없어도** 신원이 생긴다 (무소속·용병도 선수가 된다)
 *   2. 강한 넥슨 식별자가 **필수**다 — 그 계정이 실제로 뛴 경기가 있어야 한다
 *   3. 이을 근거(같은 경기·같은 닉네임)가 있으면 **기존 선수**에 붙인다
 *   4. 닉네임만 같은 것으로는 잇지 않는다 (fuzzy 금지 · D-036 유지)
 *   5. 이미 다른 계정이 붙은 선수를 **빼앗지 않는다**
 *   6. 로스터는 오직 **본클랜원/용병 판정**에만 쓴다
 *   7. 같은 사람이 나중에 클랜에 가입해도 **같은 Player 행이 이어진다**
 *
 * 만든 데이터는 전부 `T134-` 접두사이고 끝나면 지운다.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { prisma } from '@sacloud/db'
import { linkIdentitiesByEvidence } from '../../../apps/worker/src/jobs/identityLink'

const P = 'T134-'
const SLUG = 't134league'
const MATCH_A = '990821000000000134'
const MATCH_B = '990822000000000134'

/** 라인업 스냅샷 — 같은 경기·같은 닉네임 근거의 출처 */
const LINEUP_PATH = join(tmpdir(), 't134-lineup.json')

/** 이 테스트가 만든 신원만 본다 — 다른 파일과 DB를 공유하므로 범위를 좁힌다 */
const OUIDS = [`${P}로스터계정`, `${P}무소속계정`, `${P}유령계정`]

async function dbUp(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`
    return true
  } catch {
    return false
  }
}
const up = await dbUp()

let ids: { leagueId: string; rosteredPlayerId: string; takenPlayerId: string } | null = null

async function cleanup() {
  await prisma.nexonMatchObservation.deleteMany({ where: { ouid: { startsWith: P } } })
  await prisma.nexonMatch.deleteMany({ where: { sourceMatchId: { in: [MATCH_A, MATCH_B] } } })
  await prisma.nexonIdentity.deleteMany({ where: { ouid: { startsWith: P } } })
  await prisma.leagueRosterMembership.deleteMany({ where: { player: { id: { startsWith: P } } } })
  await prisma.leagueClan.deleteMany({ where: { league: { slug: SLUG } } })
  await prisma.league.deleteMany({ where: { slug: SLUG } })
  await prisma.player.deleteMany({ where: { id: { startsWith: P } } })
  await prisma.player.deleteMany({ where: { nexonOuid: { startsWith: P } } })
  await prisma.player.deleteMany({ where: { sourcePlayerId: { in: ['9001', '9002', '9003'] } } })
  await prisma.clan.deleteMany({ where: { slug: { startsWith: P.toLowerCase() } } })
}

beforeAll(async () => {
  if (!up) return
  await cleanup()

  writeFileSync(
    LINEUP_PATH,
    JSON.stringify({
      capturedAt: '2026-08-24T00:00:00.000Z',
      clans: {},
      matches: [
        {
          id: MATCH_A,
          red: [[9001, `${P}로스터선수`, 1, 0]],
          blue: [[9002, `${P}무소속선수`, null, 0]],
          perspectives: [],
        },
        {
          id: MATCH_B,
          // 같은 닉네임이 둘이면 그 경기는 근거로 쓰지 않는다
          red: [[9003, `${P}중복닉`, 1, 0]],
          blue: [[9004, `${P}중복닉`, 2, 0]],
          perspectives: [],
        },
      ],
    }),
    'utf8',
  )

  const clan = await prisma.clan.create({
    data: { slug: `${P.toLowerCase()}c`, name: `${P}클랜`, category: 'official' },
  })
  const league = await prisma.league.create({
    data: { slug: SLUG, name: `${P}리그`, category: 'official', official: true },
  })
  const leagueClan = await prisma.leagueClan.create({
    data: { leagueId: league.id, clanId: clan.id, division: 1, placement: false },
  })

  /* 로스터에 있는 선수 (3rd.supply 선수 9001) */
  const rostered = await prisma.player.create({
    data: { id: `${P}로스터선수`, name: `${P}로스터선수`, sourcePlayerId: '9001', origin: '3rd.supply' },
  })
  await prisma.leagueRosterMembership.create({
    data: {
      leagueId: league.id,
      leagueClanId: leagueClan.id,
      playerId: rostered.id,
      joinedAt: new Date('2026-08-01T00:00:00Z'),
      source: 'manual',
      verified: true,
    },
  })

  /* 이미 다른 계정이 붙어 있는 선수 (3rd.supply 선수 9003) */
  const taken = await prisma.player.create({
    data: {
      id: `${P}선점된선수`,
      name: `${P}중복닉`,
      sourcePlayerId: '9003',
      origin: '3rd.supply',
      nexonOuid: `${P}다른계정`,
    },
  })

  /* 스테이징 경기 + 관측값 — "이 계정이 실제로 뛰었다"는 근거 */
  const stagedA = await prisma.nexonMatch.create({
    data: { source: 'nexon', sourceMatchId: MATCH_A, matchMap: '제3보급창고' },
  })
  await prisma.nexonMatchObservation.createMany({
    data: [
      { nexonMatchId: stagedA.id, ouid: `${P}로스터계정`, userName: `${P}로스터선수`, outcome: 'win', kill: 5, death: 3, assist: 1 },
      { nexonMatchId: stagedA.id, ouid: `${P}무소속계정`, userName: `${P}무소속선수`, outcome: 'lose', kill: 4, death: 6, assist: 0 },
    ],
  })

  await prisma.nexonIdentity.createMany({
    data: [
      { ouid: `${P}로스터계정`, userName: `${P}로스터선수`, status: 'unresolved' },
      { ouid: `${P}무소속계정`, userName: `${P}무소속선수`, status: 'unresolved' },
      // 경기 기록이 하나도 없는 계정 — 닉네임만으로는 정하지 않는다
      { ouid: `${P}유령계정`, userName: `${P}유령`, status: 'unresolved' },
    ],
  })

  ids = { leagueId: league.id, rosteredPlayerId: rostered.id, takenPlayerId: taken.id }
})

afterAll(async () => {
  if (!up) return
  await cleanup()
  try {
    rmSync(LINEUP_PATH)
  } catch {
    /* 이미 지워졌으면 그만이다 */
  }
})

describe.runIf(up)('D-134 — 로스터는 신원의 조건이 아니다', () => {
  it('미리보기는 DB를 건드리지 않는다', async () => {
    const before = await prisma.nexonIdentity.count({ where: { ouid: { startsWith: P }, status: 'active' } })
    await linkIdentitiesByEvidence({ leagueSlug: SLUG, lineupPath: LINEUP_PATH, ouids: OUIDS })
    const after = await prisma.nexonIdentity.count({ where: { ouid: { startsWith: P }, status: 'active' } })
    expect(after).toBe(before)
  })

  it('로스터가 있는 선수는 같은 경기·같은 닉네임 근거로 **기존 선수**에 붙는다', async () => {
    await linkIdentitiesByEvidence({ leagueSlug: SLUG, lineupPath: LINEUP_PATH, ouids: OUIDS, confirm: true })
    const identity = await prisma.nexonIdentity.findUniqueOrThrow({
      where: { ouid: `${P}로스터계정` },
      select: { playerId: true, status: true, linkReason: true },
    })
    expect(identity.playerId).toBe(ids!.rosteredPlayerId)
    expect(identity.status).toBe('active')
    expect(identity.linkReason).toContain('같은 경기')
  })

  it('**로스터가 없어도** 신원이 생긴다 — 무소속·용병도 선수가 된다', async () => {
    const identity = await prisma.nexonIdentity.findUniqueOrThrow({
      where: { ouid: `${P}무소속계정` },
      select: { playerId: true, status: true },
    })
    expect(identity.playerId).not.toBeNull()
    expect(identity.status).toBe('active')

    const player = await prisma.player.findUniqueOrThrow({
      where: { id: identity.playerId! },
      select: { name: true, nexonOuid: true, sourcePlayerId: true, clanId: true },
    })
    expect(player.nexonOuid).toBe(`${P}무소속계정`)
    // 로스터가 없으니 클랜도 없다. 그래도 선수는 존재한다
    expect(player.clanId).toBeNull()
    // 라인업 근거로 3rd.supply 선수 id 도 함께 붙는다
    expect(player.sourcePlayerId).toBe('9002')
  })

  it('경기 기록이 없는 계정은 **연결하지 않는다** (강한 식별자 필수 · D-051)', async () => {
    const identity = await prisma.nexonIdentity.findUniqueOrThrow({
      where: { ouid: `${P}유령계정` },
      select: { playerId: true, status: true },
    })
    expect(identity.playerId).toBeNull()
    expect(identity.status).toBe('unresolved')
  })

  it('이미 다른 계정이 붙은 선수를 빼앗지 않는다', async () => {
    const taken = await prisma.player.findUniqueOrThrow({
      where: { id: ids!.takenPlayerId },
      select: { nexonOuid: true },
    })
    expect(taken.nexonOuid).toBe(`${P}다른계정`)
  })

  it('두 번 돌려도 새로 만들지 않는다 (idempotent)', async () => {
    const before = await prisma.player.count({ where: { nexonOuid: { startsWith: P } } })
    const result = await linkIdentitiesByEvidence({
      leagueSlug: SLUG,
      lineupPath: LINEUP_PATH,
      ouids: OUIDS,
      confirm: true,
    })
    const after = await prisma.player.count({ where: { nexonOuid: { startsWith: P } } })
    expect(after).toBe(before)
    expect(result.linked).toBe(0)
    expect(result.created).toBe(0)
  })

  it('라인업이 없으면 잇지 않고 **새로 만든다** — 닉네임만으로 붙이지 않는다', async () => {
    await prisma.nexonIdentity.updateMany({
      where: { ouid: `${P}로스터계정` },
      data: { playerId: null, status: 'unresolved' },
    })
    await prisma.player.update({ where: { id: ids!.rosteredPlayerId }, data: { nexonOuid: null } })

    const result = await linkIdentitiesByEvidence({ leagueSlug: SLUG, lineupPath: null, ouids: OUIDS })
    const candidate = result.candidates.find((row) => row.ouid === `${P}로스터계정`)
    // 이름이 같은 로스터 선수가 있어도 근거가 없으면 붙이지 않는다
    expect(candidate?.verdict).toBe('created')
  })
})

describe.runIf(up)('로스터의 역할은 본클랜원/용병 판정뿐이다', () => {
  it('신원이 생겨도 로스터가 없으면 클랜이 붙지 않는다', async () => {
    const identity = await prisma.nexonIdentity.findUniqueOrThrow({
      where: { ouid: `${P}무소속계정` },
      select: { playerId: true },
    })
    const memberships = await prisma.leagueRosterMembership.count({
      where: { playerId: identity.playerId! },
    })
    expect(memberships).toBe(0)
  })

  it('나중에 클랜에 가입해도 **같은 Player 행이 이어진다**', async () => {
    const identity = await prisma.nexonIdentity.findUniqueOrThrow({
      where: { ouid: `${P}무소속계정` },
      select: { playerId: true },
    })
    const playerId = identity.playerId!

    const leagueClan = await prisma.leagueClan.findFirstOrThrow({
      where: { leagueId: ids!.leagueId },
      select: { id: true },
    })
    await prisma.leagueRosterMembership.create({
      data: {
        leagueId: ids!.leagueId,
        leagueClanId: leagueClan.id,
        playerId,
        joinedAt: new Date('2026-08-23T00:00:00Z'),
        source: '3rd.supply-lineup',
        verified: true,
      },
    })

    // 계정 → 선수 연결은 그대로다. 사람이 바뀌지 않는다
    const after = await prisma.nexonIdentity.findUniqueOrThrow({
      where: { ouid: `${P}무소속계정` },
      select: { playerId: true },
    })
    expect(after.playerId).toBe(playerId)
    expect(
      await prisma.leagueRosterMembership.count({ where: { playerId, leftAt: null } }),
    ).toBe(1)
  })
})
