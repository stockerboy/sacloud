import { prisma } from '@sacloud/db'
import { log } from '../lib/log.js'

/**
 * ★★C1 — 개고수 전용 리그를 따로 만든다★★ (2026-09-20 밤 사장님)
 *
 * > 「IPL을 두 구간으로 나눈다. C1구간 딱 ★저기 10개클랜★ 이 C1 구간이다.
 * >  ★IPL이랑 아예 분리해서 리그를 하나 만드는 것★ 이다 IPL은 고대로 두고
 * >  C1이라는 ★개고수 전용 기록판★ 을 만드는 것이다.
 * >  이 리그는 ★10개클랜끼리한 기록만★ 따로 모아 기록되며
 * >  ★다른 IPL PL 열산클랜과 한 경기는 일체 기록되지 않는다.★
 * >  ★9/3일부터★ 이 클랜끼리 한 기록만 전부 모아서 개인랭킹과 클랜랭킹을 만들어 줄세워라.
 * >  ★킬데스도 이 클랜들이랑 한 것만★ 기록된다. IPL과 다른 ★독립적인 하나의 리그★ 이다」
 *
 * ── 무엇을 만드나
 *
 *   ① `League` 한 줄 (`c1`)
 *   ② 그 리그의 `LeagueClan` 열 줄
 *   ③ ★두 클랜이 다 C1 인 경기★ 만 골라 `Match` 를 ★새로 한 벌★ 만든다
 *   ④ 그 경기의 `MatchPlayerStat` 도 새로 만든다 — 킬데스가 C1 안에서만 세지게
 *
 * ── ⚠ ★IPL 을 한 줄도 안 건드린다★
 *
 *   사장님: 「IPL은 고대로 두고」. 그래서 ★같은 물리 경기가 두 리그에 한 줄씩★ 생긴다.
 *   이것은 이미 우리 구조가 하는 일이다 (D-155 — 같은 경기가 리그마다 다른 `Match` 행).
 *
 * ── ⚠ 왜 「복사」 가 아니라 「골라 담기」 인가
 *
 *   IPL 경기를 통째로 복사하면 ★C1 밖 클랜과 한 경기까지 따라온다.★
 *   사장님이 「일체 기록되지 않는다」 고 못 박으셨다. 그래서 ★양쪽이 다 C1 일 때만★ 담는다.
 *
 * ⚠ ★`--confirm` 없이는 한 줄도 안 쓴다.★
 * ⚠ ★멱등이다★ — 다시 돌려도 이미 담은 경기는 건너뛴다.
 */

/** 리그 slug — 주소가 `/league/c1` 이 된다 */
export const C1_SLUG = 'c1'

/** 화면에 뜨는 이름 */
export const C1_NAME = 'C1'

/**
 * ★C1 클랜 열 곳★ — 2026-09-20 밤 사장님이 클랜랭킹 1~10등으로 고르셨다.
 *
 * ⚠ ★이름이 아니라 slug 로 적는다★ — 클랜 이름은 바뀐다.
 *   실측 — 2026-09-20 하루에 ★94곳★ 이 이름을 바꿨다.
 * ⚠ 여기를 고치면 ★다시 돌려야★ 반영된다 (경기를 다시 고른다).
 */
export const C1_CLAN_SLUGS: readonly string[] = [
  'luverduck12', // igloo
  'minjihun', //    sometimes
  'uava01', //      vuvuzela
  'ferwfwfwfwf', // deluxe
  '01025606089', // 〃veritas
  'hanbi0302', //   luvme
  'saffggaaz', //   grave
  'ckdals2457', //  hardcores
  'ssdko', //       methodcrew
  'fdd8', //        amaryllis
]

/** ★9월 3일부터★ — 시즌0 시작과 같다 (사장님: 「9/3일부터」) */
export const C1_FROM = new Date('2026-09-02T22:00:00.000Z')

export interface C1BuildResult {
  /** C1 에 넣은 클랜 수 */
  clans: number
  /** 못 찾은 클랜 slug */
  missing: string[]
  /** 양쪽이 다 C1 인 경기 수 */
  matches: number
  /** 새로 담은 경기 */
  created: number
  /** 이미 담겨 있던 경기 */
  skipped: number
  /** 새로 담은 참가 기록 줄 */
  stats: number
  /** 명부에 새로 올린 선수 */
  players: number
}

export async function runC1LeagueBuild(input: { confirm: boolean }): Promise<C1BuildResult> {
  const result: C1BuildResult = {
    clans: 0,
    missing: [],
    matches: 0,
    created: 0,
    skipped: 0,
    stats: 0,
    players: 0,
  }

  /* ── ① 리그 ─────────────────────────────────────────── */
  let league = await prisma.league.findFirst({ where: { slug: C1_SLUG }, select: { id: true } })
  if (league === null) {
    if (!input.confirm) {
      log(`★C1 리그를 새로 만든다★ (미리보기라 안 만듦)`)
    } else {
      /*
       * ⚠ ★`category: 'independent'`★ — IPL 과 같은 갈래다. 「공식」 으로 두면
       *   화면이 공식 표시를 붙인다.
       * ⚠ ★`divisionCount: 1`★ — 구간을 안 나눈다. C1 자체가 한 구간이다.
       */
      league = await prisma.league.create({
        data: {
          slug: C1_SLUG,
          name: C1_NAME,
          category: 'independent',
          divisionCount: 1,
          origin: 'sacloud',
        },
        select: { id: true },
      })
      log(`★C1 리그를 만들었다★`)
    }
  }
  if (league === null) return result

  /* ── ② 클랜 ─────────────────────────────────────────── */
  const clans = await prisma.clan.findMany({
    where: { slug: { in: [...C1_CLAN_SLUGS] } },
    select: { id: true, slug: true, name: true },
  })
  const clanIdOf = new Map(clans.map((c) => [c.slug, c.id]))
  for (const slug of C1_CLAN_SLUGS) {
    if (!clanIdOf.has(slug)) result.missing.push(slug)
  }
  log(`C1 클랜 — 찾음 ${clans.length} · 못 찾음 ${result.missing.length}`)
  for (const c of clans) log(`  ${c.name} (${c.slug})`)

  /** clanId → 그 클랜의 C1 `LeagueClan` id */
  const leagueClanOf = new Map<string, string>()
  for (const clan of clans) {
    const found = await prisma.leagueClan.findFirst({
      where: { leagueId: league.id, clanId: clan.id },
      select: { id: true },
    })
    if (found !== null) {
      leagueClanOf.set(clan.id, found.id)
      continue
    }
    if (!input.confirm) continue
    const made = await prisma.leagueClan.create({
      data: {
        leagueId: league.id,
        clanId: clan.id,
        division: 1,
        /* ★배치고사는 폐지됐다★ (2026-09-02) — 처음부터 순위를 받는다 */
        placement: false,
      },
      select: { id: true },
    })
    leagueClanOf.set(clan.id, made.id)
  }
  result.clans = leagueClanOf.size

  if (leagueClanOf.size < 2) {
    log(`⚠ C1 클랜이 ${leagueClanOf.size}곳뿐이라 경기를 고를 수 없다`)
    return result
  }

  /* ── ③ 양쪽이 다 C1 인 경기만 ───────────────────────── */
  const clanIds = new Set(clans.map((c) => c.id))
  /*
   * ⚠ ★IPL 경기를 본다★ — 원본이 거기 있다. C1 은 그것을 ★골라 담는 것★ 이지
   *   따로 수집하는 것이 아니다.
   * ⚠ ★`supersededAt` 이 있는 경기는 안 본다★ — 물린 경기다.
   */
  const source = await prisma.match.findMany({
    where: {
      startAt: { gte: C1_FROM },
      supersededAt: null,
      league: { slug: { in: ['nolink', 'supply', 'sanply'] } },
      redClan: { clanId: { in: [...clanIds] } },
      blueClan: { clanId: { in: [...clanIds] } },
    },
    select: {
      id: true,
      sourceMatchId: true,
      mapId: true,
      playerCount: true,
      playTime: true,
      startAt: true,
      endAt: true,
      winnerSide: true,
      mvpPlayerId: true,
      firstHalfAttackSide: true,
      firstSideEvidence: true,
      secondHalfFrom: true,
      redClan: { select: { clanId: true } },
      blueClan: { select: { clanId: true } },
      stats: {
        select: {
          playerId: true,
          side: true,
          kill: true,
          death: true,
          assist: true,
          headshot: true,
          damage: true,
          weapon: true,
          dropout: true,
          mvp: true,
          participantRole: true,
        },
      },
    },
  })

  /*
   * ★같은 물리 경기가 리그마다 한 줄씩★ 이라 중복이 온다 (D-155).
   * ★`sourceMatchId` 로 한 번만★ 담는다.
   */
  const bySource = new Map<string, (typeof source)[number]>()
  for (const m of source) {
    const key = m.sourceMatchId ?? m.id
    if (!bySource.has(key)) bySource.set(key, m)
  }
  result.matches = bySource.size
  log(`양쪽이 다 C1 인 경기 — ${result.matches}건 (원본 ${source.length}줄)`)

  if (!input.confirm) {
    log(`(미리보기라 여기까지)`)
    return result
  }

  for (const [key, m] of bySource) {
    /* ★멱등★ — 이미 담았으면 건너뛴다 */
    const already = await prisma.match.findFirst({
      where: { leagueId: league.id, sourceMatchId: `c1-${key}` },
      select: { id: true },
    })
    if (already !== null) {
      result.skipped += 1
      continue
    }

    const redLc = leagueClanOf.get(m.redClan?.clanId ?? '')
    const blueLc = leagueClanOf.get(m.blueClan?.clanId ?? '')
    if (redLc === undefined || blueLc === undefined) continue

    const made = await prisma.match.create({
      data: {
        /*
         * ★`Match.id` 는 우리가 직접 준다★ — 자동 생성이 없다.
         *   IPL 쪽 id 는 `260907215557000001` 꼴이라 ★겹치지 않게 접두를 붙인다.★
         *   ⚠ 접두를 바꾸면 이미 담은 경기를 ★다시 담는다★ — 바꾸지 않는다.
         */
        id: `c1-${key}`,
        leagueId: league.id,
        /*
         * ⚠ ★`sourceMatchId` 에도 접두를 붙인다★ (2026-09-20 실측에서 막혔다)
         *
         *   DB 에 ★`Match_new_sourceMatchId_key`★ 라는 유니크 인덱스가 있다 —
         *   ★9/3 이후 경기는 `sourceMatchId` 가 전체에서 유일★ 해야 한다.
         *   (스키마의 `@@unique([leagueId, origin, sourceMatchId])` 와 ★별개★ 다)
         *
         *   그래서 같은 원본 번호를 두 리그에 담을 수 없다. C1 은 ★파생★ 이므로
         *   접두를 붙여 유일하게 만든다. ★원본은 접두를 떼면 나온다.★
         *
         * ⚠ 그 인덱스를 건드리지 않는다 — ★중복 투영을 막던 장치★ 다.
         */
        sourceMatchId: `c1-${key}`,
        mapId: m.mapId,
        playerCount: m.playerCount,
        playTime: m.playTime,
        startAt: m.startAt,
        endAt: m.endAt,
        winnerSide: m.winnerSide,
        mvpPlayerId: m.mvpPlayerId,
        firstHalfAttackSide: m.firstHalfAttackSide,
        firstSideEvidence: m.firstSideEvidence,
        secondHalfFrom: m.secondHalfFrom,
        redLeagueClanId: redLc,
        blueLeagueClanId: blueLc,
        redDivisionAtMatch: 1,
        blueDivisionAtMatch: 1,
      },
      select: { id: true },
    })
    result.created += 1

    if (m.stats.length > 0) {
      await prisma.matchPlayerStat.createMany({
        data: m.stats.map((s) => ({
          matchId: made.id,
          playerId: s.playerId,
          side: s.side,
          kill: s.kill,
          death: s.death,
          assist: s.assist,
          headshot: s.headshot,
          damage: s.damage,
          weapon: s.weapon,
          dropout: s.dropout,
          mvp: s.mvp,
          participantRole: s.participantRole,
          /* ★C1 은 구간을 안 나눈다★ — 한 구간뿐이라 양쪽 다 1 이다 */
          playerDivisionAtMatch: 1,
          opponentDivisionAtMatch: 1,
        })),
        skipDuplicates: true,
      })
      result.stats += m.stats.length
    }
  }

  log(
    `C1 경기 — 새로 담음 ${result.created} · 이미있음 ${result.skipped} · 참가기록 ${result.stats}줄`,
  )

  /* ── ④ 명부 ─────────────────────────────────────────── */
  /*
   * ★★C1 경기에 나온 사람을 명부에 올린다★★ (2026-09-20 밤)
   *
   *   육각·점수·랭킹이 전부 `LeaguePlayer` 한 줄을 기준으로 돈다.
   *   ★명부가 없으면 킬을 6만 개 읽어도 선수 줄이 0★ 이다 — 실제로 그랬다.
   *
   *   보통은 `battlelog-lineup` 이 만드는데 ★C1 은 수집 대상이 아니다★
   *   (파생 리그라 원문을 따로 안 받는다). 그래서 여기서 만든다.
   *
   * ⚠ ★소속 클랜은 그 경기에서 선 쪽★ 으로 둔다 — C1 은 열 클랜뿐이라
   *   그중 하나다. 용병으로 뛴 사람도 ★그 판의 팀★ 에 붙는다.
   * ⚠ ★승·패는 여기서 안 센다★ — `clan-summary`·`score-ladder` 가 제 규칙으로 센다.
   *   두 곳에서 세면 갈라진다.
   */
  const played = await prisma.matchPlayerStat.findMany({
    where: { match: { leagueId: league.id } },
    select: {
      playerId: true,
      side: true,
      match: { select: { redLeagueClanId: true, blueLeagueClanId: true } },
    },
  })
  /** playerId → 가장 마지막으로 선 팀의 clanId */
  const clanOfPlayer = new Map<string, string>()
  const lcToClan = new Map([...leagueClanOf.entries()].map(([clanId, lcId]) => [lcId, clanId]))
  for (const row of played) {
    const lcId = row.side === 'red' ? row.match.redLeagueClanId : row.match.blueLeagueClanId
    const clanId = lcToClan.get(lcId)
    if (clanId === undefined) continue
    clanOfPlayer.set(row.playerId, clanId)
  }

  const already = await prisma.leaguePlayer.findMany({
    where: { leagueId: league.id },
    select: { playerId: true },
  })
  const have = new Set(already.map((r) => r.playerId))
  let made = 0
  for (const [playerId, clanId] of clanOfPlayer) {
    if (have.has(playerId)) continue
    await prisma.leaguePlayer.create({
      data: {
        leagueId: league.id,
        playerId,
        clanId,
        /* ★배치고사는 폐지됐다★ — 처음부터 순위를 받는다 */
        placement: false,
      },
    })
    made += 1
  }
  log(`C1 명부 — 새로 올림 ${made}명 · 이미있음 ${have.size}명`)
  result.players = made

  return result
}
