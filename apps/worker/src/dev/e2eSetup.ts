/**
 * 실데이터 E2E 준비 (Phase 10 · 정책 20).
 *
 *   pnpm --filter @sacloud/worker exec tsx src/dev/e2eSetup.ts
 *
 * 하는 일
 *   이미 수집해 둔 **실제 넥슨 응답**만 가지고 운영 경로를 한 번 통과시키기 위한 최소 구성을 만든다.
 *   - 실운영 리그(`supply`) + **Season 7 활성** 생성 (mock 리그와 분리한다)
 *   - 실제 상세에 나온 `guild_name`을 그대로 클랜으로 등록
 *   - 그 경기 참가자를 Player로 만들고 **명시적으로** NexonIdentity를 연결 (운영자 승인 대행)
 *   - 로스터 등록
 *
 * 하지 않는 일
 *   - **넥슨 API를 부르지 않는다.** 이미 받아 둔 원본만 쓴다
 *   - mock 시드를 건드리지 않는다
 *   - 없는 참가자를 만들지 않는다. 상세에 실제로 있는 사람만 등록한다
 *   - Season 8을 시작하지 않는다
 */
import { prisma } from '@sacloud/db'
import { addRosterMember, setLeagueDivision } from '@sacloud/db/ops'

const LEAGUE_SLUG = 'supply'
const SEASON_NUMBER = 7

function clanSlug(name: string): string {
  const normalized = name
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-|-$/g, '')
  return `real-${normalized || Buffer.from(name).toString('hex').slice(0, 8)}`
}

async function main(): Promise<void> {
  /* --- 1) 대상 경기: 실제로 상세를 받은 클랜전 중 참가자가 가장 많은 것 --- */
  const candidates = await prisma.nexonMatch.findMany({
    where: { detailFetchedAt: { not: null }, matchType: { in: ['퀵매치 클랜전', '클랜전', '클랜 랭크전'] } },
    select: {
      id: true,
      sourceMatchId: true,
      matchMap: true,
      dateMatch: true,
      participants: {
        select: { userName: true, clanName: true, matchResult: true, kill: true, death: true, assist: true },
      },
    },
  })
  const target = [...candidates].sort(
    (left, right) => right.participants.length - left.participants.length,
  )[0]
  if (!target || !target.dateMatch || !target.matchMap) {
    console.error('실제 상세를 받은 클랜전이 없다. 먼저 수집이 필요하다')
    return
  }

  console.info(
    `대상 경기 ${target.sourceMatchId} · ${target.matchMap} · ` +
      `${target.dateMatch.toISOString()} · 참가자 ${target.participants.length}명`,
  )

  /* --- 2) 실운영 리그 + Season 7 --- */
  const map = await prisma.gameMap.upsert({
    where: { name: target.matchMap },
    create: { name: target.matchMap },
    update: {},
    select: { id: true },
  })

  let league = await prisma.league.findUnique({ where: { slug: LEAGUE_SLUG }, select: { id: true } })
  if (!league) {
    league = await prisma.league.create({
      data: {
        slug: LEAGUE_SLUG,
        name: 'SPL',
        official: true,
        divisionCount: 2,
        maps: { create: [{ mapId: map.id }] },
        playerLimits: { create: [{ playerCount: 5 }] },
      },
      select: { id: true },
    })
    console.info('실운영 리그 생성: supply (mock 리그와 분리된다)')
  } else {
    await prisma.leagueMap.upsert({
      where: { leagueId_mapId: { leagueId: league.id, mapId: map.id } },
      create: { leagueId: league.id, mapId: map.id },
      update: {},
    })
  }

  const season = await prisma.season.findFirst({
    where: { leagueId: league.id, number: SEASON_NUMBER },
    select: { id: true, status: true },
  })
  if (!season) {
    await prisma.season.create({
      data: {
        leagueId: league.id,
        number: SEASON_NUMBER,
        // 대상 경기보다 앞선 시각이어야 그 경기가 이 시즌에 귀속된다 (D-078)
        startedAt: new Date(target.dateMatch.getTime() - 30 * 24 * 60 * 60 * 1000),
        status: 'active',
      },
    })
    console.info(`Season ${SEASON_NUMBER} 생성 — 활성. **Season 8은 시작하지 않는다**`)
  }

  /* --- 3) 상세에 나온 클랜명을 그대로 등록 (이름으로 추측 병합하지 않는다) --- */
  const clanNames = [
    ...new Set(
      target.participants
        .map((participant) => participant.clanName)
        .filter((name): name is string => Boolean(name)),
    ),
  ]
  for (const name of clanNames) {
    const slug = clanSlug(name)
    const clan = await prisma.clan.upsert({
      where: { slug },
      create: { slug, name, category: 'official' },
      update: {},
      select: { id: true },
    })
    // 넥슨 표기를 별칭으로 남겨 둔다 — 팀 식별의 1차 근거가 된다
    await prisma.clanAlias.upsert({
      where: { alias: name },
      create: { clanId: clan.id, alias: name, source: 'nexon_guild' },
      update: {},
    })
    await setLeagueDivision({ leagueSlug: LEAGUE_SLUG, clanSlug: slug, division: 1 })
  }
  console.info(`클랜 ${clanNames.length}곳 등록: ${clanNames.join(', ')}`)

  /* --- 4) 참가자를 Player로 만들고 신원을 **명시적으로** 연결 --- */
  let linked = 0
  let rostered = 0
  for (const participant of target.participants) {
    if (!participant.userName) continue

    const playerId = `E2E-${participant.userName}`
    const player = await prisma.player.upsert({
      where: { id: playerId },
      create: { id: playerId, name: participant.userName },
      update: { name: participant.userName },
      select: { id: true },
    })

    // 닉네임으로 자동 병합하지 않는다 — 여기서 운영자가 확인했다고 명시적으로 남긴다 (D-036)
    const ouid = `E2E-OUID-${participant.userName}`
    await prisma.nexonIdentity.upsert({
      where: { ouid },
      create: {
        ouid,
        userName: participant.userName,
        playerId: player.id,
        status: 'active',
        linkReason: 'Phase 10 E2E — 운영자 승인 대행 (실데이터 검증용)',
      },
      update: { playerId: player.id, status: 'active' },
    })
    linked += 1

    if (!participant.clanName) continue
    const membership = await addRosterMember({
      leagueSlug: LEAGUE_SLUG,
      clanSlug: clanSlug(participant.clanName),
      playerId: player.id,
      joinedAt: new Date(target.dateMatch.getTime() - 24 * 60 * 60 * 1000),
      verified: true,
      note: 'Phase 10 E2E',
    })
    if (membership) rostered += 1
  }
  console.info(`신원 연결 ${linked}명 · 로스터 등록 ${rostered}명`)

  /* --- 5) 상세 참가자를 우리 Player로 해석 --- */
  for (const participant of target.participants) {
    if (!participant.userName) continue
    await prisma.nexonMatchParticipant.updateMany({
      where: { nexonMatchId: target.id, userName: participant.userName },
      data: { resolvedPlayerId: `E2E-${participant.userName}`, resolutionStatus: 'resolved' },
    })
  }

  console.info('\n준비 완료. 다음을 실행한다:')
  console.info(`  pnpm nexon:reconstruct --league ${LEAGUE_SLUG} --redo --match-id ${target.sourceMatchId}`)
  console.info(`  pnpm nexon:rate --league ${LEAGUE_SLUG}`)
}

main()
  .catch((error: unknown) => console.error(error))
  .finally(() => prisma.$disconnect())
