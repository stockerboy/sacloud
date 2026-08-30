import { BOARD_CATEGORIES } from '@sacloud/contract'
import type { TeamSide, Weapon } from '@sacloud/contract'
import { FIXTURE_SEED, Rng } from './rng'
import {
  ANON_ALIAS_STEM,
  BOARD_TITLE_HEAD,
  BOARD_TITLE_TAIL,
  CLAN_BODY,
  CLAN_PREFIX,
  CLAN_SLUG_STEM,
  COMMENT_BODY,
  NICK_BODY,
  NICK_PREFIX,
  POSITIONS,
} from './names'
import type {
  MockBoard,
  MockCategory,
  MockClan,
  MockComment,
  MockDataset,
  MockLeague,
  MockLeagueClan,
  MockLeagueClanSeason,
  MockLeaguePlayer,
  MockLeaguePlayerSeason,
  MockMap,
  MockMatch,
  MockMatchPlayer,
  MockPlayer,
  MockUser,
} from './types'

/* -------------------------------------------------------------------------- */
/* 픽스처 상수                                                                  */
/* -------------------------------------------------------------------------- */

/** 픽스처 기준 시각 (KST 고정). 실제 시계를 쓰지 않아야 결과가 결정적이다. */
export const FIXTURE_NOW = '2026-08-20T12:00:00+09:00'
const NOW_EPOCH = Date.parse(FIXTURE_NOW)

const DAY = 24 * 60 * 60 * 1000

/**
 * SACLOUD의 현재 시즌 번호.
 *
 * 3rd.supply는 시즌 7까지 운영했고(2026-08-20 사용자 확인),
 * SACLOUD는 그 다음인 **시즌 8부터 시작**한다 (docs/MIGRATION_GAPS.md 6장 D3).
 * 시즌 1~7은 3rd.supply의 과거 시즌이며 이전 대상이지만, 현재는 확보 경로가 없다.
 * 픽스처에서는 시즌 6~7을 "지난시즌"으로 만들어 과거 시즌 조회 화면을 확인할 수 있게 한다.
 */
export const CURRENT_SEASON = 8

/**
 * 배치고사 판정 경기 수.
 * 원본의 실제 기준은 [미확인] — 픽스처를 만들기 위한 임의값이며 원본과 동일함이 검증되지 않았다.
 * 실제 정책은 Phase 9에서 결정한다.
 */
export const PLACEMENT_MATCH_COUNT = 10

/** 픽스처 규모 (IMPLEMENTATION_PLAN Phase 0 기준) */
export const FIXTURE_SIZE = {
  CLANS: 60,
  PLAYERS_PER_CLAN: 15,
  MATCHES: 3000,
  BOARDS: 400,
  COMMENTS: 1200,
  USERS: 40,
} as const

/** 픽스처 이미지 호스트. 원본 자산을 쓰지 않는다 — 존재하지 않는 자리표시자 URL이다. */
const STATIC_HOST = 'https://static.sacloud.local'

/* -------------------------------------------------------------------------- */
/* 시간 유틸                                                                    */
/* -------------------------------------------------------------------------- */

const pad = (value: number, length = 2): string => String(value).padStart(length, '0')

/** epoch(ms) → `YYYY-MM-DDTHH:mm:ss+09:00` */
export function toKstIso(epochMs: number): string {
  const shifted = new Date(epochMs + 9 * 60 * 60 * 1000)
  return (
    `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}` +
    `T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}+09:00`
  )
}

/** epoch(ms) → `YYYY-MM-DD` (KST 기준) */
export function toKstDate(epochMs: number): string {
  return toKstIso(epochMs).slice(0, 10)
}

/**
 * 매치 ID 규칙 (관측): `YYMMDDHHmmss` + 6자리 코드.
 * 뒤 6자리의 의미는 [미확인] — 픽스처에서는 중복이 없도록 순번을 쓴다.
 */
function buildMatchId(startEpoch: number, index: number): string {
  const iso = toKstIso(startEpoch)
  const stamp = `${iso.slice(2, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}`
  return `${stamp}${pad(100000 + index, 6)}`
}

function must<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message)
  return value
}

/* -------------------------------------------------------------------------- */
/* 생성기                                                                       */
/* -------------------------------------------------------------------------- */

export function buildDataset(seed: number = FIXTURE_SEED): MockDataset {
  const rng = new Rng(seed)

  /* ------------------------------- 맵 ------------------------------- */
  // 원본의 실제 리그맵 목록은 조사되지 않았다 [미확인]. 자리표시자 이름을 쓴다.
  const maps: MockMap[] = Array.from({ length: 8 }, (_, index) => ({
    id: `map-${pad(index + 1)}`,
    name: `맵 ${pad(index + 1)}`,
  }))

  /* ------------------------------ 사용자 ----------------------------- */
  const users: MockUser[] = Array.from({ length: FIXTURE_SIZE.USERS }, (_, index) => ({
    id: String(1000 + index),
    email: `user${pad(index + 1, 3)}@naver.com`,
    nickname: `${rng.pick(NICK_PREFIX)}${rng.pick(NICK_BODY)}`,
    avatarUrl: null,
    role: index === 0 ? 2 : 0,
    emailVerifiedAt: toKstIso(NOW_EPOCH - rng.int(30, 900) * DAY),
    playerId: null,
    createdAt: toKstIso(NOW_EPOCH - rng.int(30, 900) * DAY),
  }))

  /* --------------------------- 클랜 / 플레이어 -------------------------- */
  const clans: MockClan[] = []
  const players: MockPlayer[] = []
  let playerSerial = 0

  for (let clanIndex = 0; clanIndex < FIXTURE_SIZE.CLANS; clanIndex += 1) {
    const clanId = String(2000 + clanIndex)
    const stem = CLAN_SLUG_STEM[clanIndex % CLAN_SLUG_STEM.length] ?? 'clan'
    const slug = `${stem}${pad(Math.floor(clanIndex / CLAN_SLUG_STEM.length) + 1)}`
    const name = `${rng.pick(CLAN_PREFIX)}${rng.pick(CLAN_BODY)}`

    const playerIds: string[] = []
    for (let i = 0; i < FIXTURE_SIZE.PLAYERS_PER_CLAN; i += 1) {
      playerSerial += 1
      const playerId = String(500000000 + playerSerial * 37)
      playerIds.push(playerId)
      players.push({
        id: playerId,
        name: `${rng.pick(NICK_PREFIX)}${rng.pick(NICK_BODY)}${rng.int(1, 99)}`,
        clanId,
        position: rng.chance(0.4) ? rng.pick(POSITIONS) : null,
        note: null,
        renewedAt: rng.chance(0.8) ? toKstIso(NOW_EPOCH - rng.int(0, 30) * DAY) : null,
      })
    }

    clans.push({
      id: clanId,
      slug,
      name,
      markBg: `${STATIC_HOST}/marks/bg/${pad((clanIndex % 12) + 1)}.png`,
      markFront: `${STATIC_HOST}/marks/front/${pad((clanIndex % 20) + 1)}.png`,
      masterPlayerId: must(playerIds[0], '클랜마스터가 없습니다'),
      notice: rng.chance(0.5) ? '클랜전 일정은 공지 채널에서 확인해 주세요.' : null,
      establishedAt: toKstDate(NOW_EPOCH - rng.int(200, 2600) * DAY),
      renewedAt: rng.chance(0.9) ? toKstIso(NOW_EPOCH - rng.int(0, 14) * DAY) : null,
      playerIds,
    })
  }

  // 클랜에 소속되지 않은 플레이어도 존재한다 (빈 상태 렌더 확인용)
  for (let i = 0; i < 20; i += 1) {
    playerSerial += 1
    players.push({
      id: String(500000000 + playerSerial * 37),
      name: `${rng.pick(NICK_PREFIX)}${rng.pick(NICK_BODY)}${rng.int(100, 999)}`,
      clanId: null,
      position: null,
      note: null,
      renewedAt: rng.chance(0.5) ? toKstIso(NOW_EPOCH - rng.int(0, 60) * DAY) : null,
    })
  }

  /* ------------------------------- 리그 ------------------------------- */
  // 단일리그 1 + N부리그 3, 그중 공식 배지 2 (Phase 0 요구 규모)
  const leagueSpecs = [
    { slug: 'officialmain', name: '공식전', official: true, divisionCount: 2, clanCount: 24 },
    { slug: 'secondline', name: '세컨드', official: true, divisionCount: 3, clanCount: 30 },
    { slug: 'friendly01', name: '친목전', official: false, divisionCount: 1, clanCount: 16 },
    { slug: 'tourney2026', name: '토너먼트', official: false, divisionCount: 2, clanCount: 20 },
  ] as const

  const leagues: MockLeague[] = leagueSpecs.map((spec, index) => ({
    id: String(3000 + index),
    slug: spec.slug,
    name: spec.name,
    official: spec.official,
    divisionCount: spec.divisionCount,
    description:
      '<h3>리그 규정</h3><p>등록된 클랜 간의 경기만 기록됩니다. 리그에서 선택한 맵과 대전 인원에 해당하지 않는 경기는 집계되지 않습니다.</p><ul><li>경기 결과는 원본 기록을 기준으로 반영됩니다.</li><li>부리그 이동은 리그 관리자가 처리합니다.</li></ul>',
    ownerUserId: must(users[index]?.id, '리그 관리자 사용자가 없습니다'),
    mapIds: rng.sample(maps, rng.int(3, 6)).map((map) => map.id),
    playerLimits: rng.chance(0.5) ? [5, 6] : [5],
    status: 1,
    // 아래에서 정렬된 값으로 다시 채운다
    createdAt: '',
    season: CURRENT_SEASON,
  }))

  /**
   * 리그 목록의 순서 기준은 `[미확인]`이라 **개설이 오래된 순**으로 뒀다.
   * 개설 시각이 id 순서와 어긋나면 Mock(배열 순서)과 실제 DB(`createdAt` 정렬)가
   * 서로 다른 순서를 내놓는다. 시각만 정렬해 다시 나눠준다.
   */
  const drawnLeagueTimes = leagues.map(() => NOW_EPOCH - rng.int(200, 900) * DAY)
  const orderedLeagueTimes = [...drawnLeagueTimes].sort((a, b) => a - b)
  leagues.forEach((league, index) => {
    league.createdAt = toKstIso(must(orderedLeagueTimes[index], '리그 개설시각 배치 실패'))
  })

  // 리그 관리자는 서든어택 계정이 연동되어 있어야 한다 (관측된 제약)
  leagues.forEach((league, index) => {
    const owner = users.find((user) => user.id === league.ownerUserId)
    if (owner) owner.playerId = must(players[index * 13]?.id, '연동할 플레이어가 없습니다')
  })

  /* ---------------------------- 리그 참여 클랜 --------------------------- */
  const leagueClans: MockLeagueClan[] = []
  const leaguePlayers: MockLeaguePlayer[] = []
  let leagueClanSerial = 0
  let leaguePlayerSerial = 0
  /** 참여 시각도 뽑아만 두고 뒤에서 리그별로 정렬해 다시 나눠준다 (게시글·댓글과 같은 이유) */
  const drawnJoinTimes: number[] = []

  leagues.forEach((league, leagueIndex) => {
    const spec = must(leagueSpecs[leagueIndex], '리그 스펙이 없습니다')
    const joined = rng.sample(clans, spec.clanCount)

    joined.forEach((clan, clanIndex) => {
      leagueClanSerial += 1
      const leagueClanId = String(4000 + leagueClanSerial)
      leagueClans.push({
        id: leagueClanId,
        leagueId: league.id,
        clanId: clan.id,
        // 시작 래더는 전부 동일하게 두고, 매치를 순서대로 반영하며 벌어지게 한다
        rating: 1000,
        division: (clanIndex % league.divisionCount) + 1,
        win: 0,
        lose: 0,
        placement: true,
        status: 1,
        // 아래에서 정렬된 값으로 다시 채운다
        joinedAt: '',
      })
      drawnJoinTimes.push(NOW_EPOCH - rng.int(60, 400) * DAY)

      clan.playerIds.forEach((playerId) => {
        leaguePlayerSerial += 1
        leaguePlayers.push({
          id: String(6000 + leaguePlayerSerial),
          leagueId: league.id,
          leagueClanId,
          playerId,
          rating: 1000,
          win: 0,
          lose: 0,
          kill: 0,
          death: 0,
          assist: 0,
          headshot: 0,
          mvpCount: 0,
          placement: true,
        })
      })
    })
  })

  /**
   * 리그별로 **id가 작을수록 먼저 참여**한 것이 되도록 참여 시각을 재배치한다.
   *
   * 리그 목록은 대표 클랜 3개를 보여주는데(관측), 선정 규칙은 `[미확인]`이라
   * "먼저 참여한 순"으로 뒀다. 참여 시각이 id 순서와 어긋나 있으면
   * Mock(배열 순서)과 실제 DB(`joinedAt` 정렬)가 서로 다른 클랜을 고르게 된다.
   */
  const leagueClanIndexesByLeague = new Map<string, number[]>()
  leagueClans.forEach((leagueClan, index) => {
    const list = leagueClanIndexesByLeague.get(leagueClan.leagueId) ?? []
    list.push(index)
    leagueClanIndexesByLeague.set(leagueClan.leagueId, list)
  })

  for (const indexes of leagueClanIndexesByLeague.values()) {
    const ordered = indexes
      .map((index) => must(drawnJoinTimes[index], '참여 시각 배치 실패'))
      .sort((a, b) => a - b)
    indexes.forEach((leagueClanIndex, order) => {
      must(leagueClans[leagueClanIndex], '참여 클랜 배치 실패').joinedAt = toKstIso(
        must(ordered[order], '참여 시각 배치 실패'),
      )
    })
  }

  const leaguePlayersByLeagueClan = new Map<string, MockLeaguePlayer[]>()
  for (const leaguePlayer of leaguePlayers) {
    const list = leaguePlayersByLeagueClan.get(leaguePlayer.leagueClanId) ?? []
    list.push(leaguePlayer)
    leaguePlayersByLeagueClan.set(leaguePlayer.leagueClanId, list)
  }

  /** 리그 → 부리그 → 참여 클랜 */
  const leagueDivisionIndex = new Map<string, Map<number, MockLeagueClan[]>>()
  for (const leagueClan of leagueClans) {
    const byDivision = leagueDivisionIndex.get(leagueClan.leagueId) ?? new Map<number, MockLeagueClan[]>()
    const list = byDivision.get(leagueClan.division) ?? []
    list.push(leagueClan)
    byDivision.set(leagueClan.division, list)
    leagueDivisionIndex.set(leagueClan.leagueId, byDivision)
  }

  /* ------------------------------- 매치 ------------------------------- */
  /**
   * 주의: 아래 래더 증감은 **픽스처용 난수**이며 레이팅 엔진이 아니다.
   * 관측된 범위(승 +7~+12 / 패 -10~-19)만 재현한다. 실제 공식은 [미확인]이고 Phase 9에서 다룬다.
   */
  const matchCountByLeagueClan = new Map<string, number>()
  const matchCountByLeaguePlayer = new Map<string, number>()

  const startTimes = Array.from({ length: FIXTURE_SIZE.MATCHES }, () =>
    NOW_EPOCH - rng.int(30 * 60 * 1000, 150 * DAY),
  ).sort((a, b) => a - b)

  const leagueWeights = leagues.flatMap((league, index) =>
    Array.from({ length: must(leagueSpecs[index], '리그 스펙 없음').clanCount }, () => league),
  )

  const matches: MockMatch[] = []

  startTimes.forEach((startEpoch, matchIndex) => {
    const league = rng.pick(leagueWeights)
    const byDivision = must(leagueDivisionIndex.get(league.id), '리그의 부리그 색인이 없습니다')
    const divisions = [...byDivision.keys()]
    const division = rng.pick(divisions)
    const candidates = must(byDivision.get(division), '부리그 참여 클랜이 없습니다')
    if (candidates.length < 2) return

    const [redClan, blueClan] = rng.sample(candidates, 2)
    if (!redClan || !blueClan) return

    const playerCount = rng.pick(league.playerLimits)
    const redPool = leaguePlayersByLeagueClan.get(redClan.id) ?? []
    const bluePool = leaguePlayersByLeagueClan.get(blueClan.id) ?? []
    if (redPool.length < playerCount || bluePool.length < playerCount) return

    const redRoster = rng.sample(redPool, playerCount)
    const blueRoster = rng.sample(bluePool, playerCount)

    const redMatches = matchCountByLeagueClan.get(redClan.id) ?? 0
    const blueMatches = matchCountByLeagueClan.get(blueClan.id) ?? 0
    const redPlacement = redMatches < PLACEMENT_MATCH_COUNT
    const bluePlacement = blueMatches < PLACEMENT_MATCH_COUNT

    const winnerSide: TeamSide = rng.chance(0.5) ? 'red' : 'blue'
    const redRatingUpdate = winnerSide === 'red' ? rng.int(7, 12) : -rng.int(10, 19)
    const blueRatingUpdate = winnerSide === 'blue' ? rng.int(7, 12) : -rng.int(10, 19)

    const playTime = rng.int(9 * 60, 26 * 60)
    const endEpoch = startEpoch + playTime * 1000

    const matchPlayers: MockMatchPlayer[] = []

    const buildSide = (roster: MockLeaguePlayer[], side: TeamSide, leagueClanId: string): void => {
      const won = winnerSide === side
      for (const leaguePlayer of roster) {
        const played = matchCountByLeaguePlayer.get(leaguePlayer.id) ?? 0
        const placement = played < PLACEMENT_MATCH_COUNT
        const kill = won ? rng.int(4, 28) : rng.int(0, 21)
        const death = won ? rng.int(2, 18) : rng.int(6, 24)
        const assist = rng.int(0, 12)
        const headshot = rng.int(0, kill)
        const personalUpdate = won ? rng.int(7, 12) : -rng.int(10, 19)

        const stat: MockMatchPlayer = {
          playerId: leaguePlayer.playerId,
          leagueClanId,
          side,
          kill,
          death,
          assist,
          headshot,
          damage: rng.int(900, 6800),
          weapon: (rng.chance(0.22) ? 1 : 0) as Weapon,
          dropout: !won && rng.chance(0.02),
          rating: placement ? null : leaguePlayer.rating,
          ratingUpdate: personalUpdate,
          placement,
          win: won,
          mvp: false,
        }
        matchPlayers.push(stat)

        // 누적 (기록실·랭킹이 매치 결과와 어긋나지 않도록 여기서 집계한다)
        leaguePlayer.rating += personalUpdate
        leaguePlayer.kill += kill
        leaguePlayer.death += death
        leaguePlayer.assist += assist
        leaguePlayer.headshot += headshot
        if (won) leaguePlayer.win += 1
        else leaguePlayer.lose += 1
        matchCountByLeaguePlayer.set(leaguePlayer.id, played + 1)
        leaguePlayer.placement = played + 1 < PLACEMENT_MATCH_COUNT
      }
    }

    buildSide(redRoster, 'red', redClan.id)
    buildSide(blueRoster, 'blue', blueClan.id)

    // MVP: 승리 팀에서 킬이 가장 많은 플레이어
    let mvpPlayerId: string | null = null
    let bestKill = -1
    for (const entry of matchPlayers) {
      if (entry.win && entry.kill > bestKill) {
        bestKill = entry.kill
        mvpPlayerId = entry.playerId
      }
    }
    for (const entry of matchPlayers) {
      if (entry.playerId === mvpPlayerId) {
        entry.mvp = true
        const owner = (entry.side === 'red' ? redRoster : blueRoster).find(
          (leaguePlayer) => leaguePlayer.playerId === entry.playerId,
        )
        if (owner) owner.mvpCount += 1
      }
    }

    matches.push({
      id: buildMatchId(startEpoch, matchIndex),
      leagueId: league.id,
      mapId: rng.pick(league.mapIds),
      playerCount,
      startAt: toKstIso(startEpoch),
      endAt: toKstIso(endEpoch),
      playTime,
      redLeagueClanId: redClan.id,
      blueLeagueClanId: blueClan.id,
      redRating: redPlacement ? null : redClan.rating,
      blueRating: bluePlacement ? null : blueClan.rating,
      redDivision: redClan.division,
      blueDivision: blueClan.division,
      redPlacement,
      bluePlacement,
      winnerSide,
      blueTeam: rng.chance(0.5),
      redRatingUpdate,
      blueRatingUpdate,
      mvpPlayerId,
      players: matchPlayers,
    })

    redClan.rating += redRatingUpdate
    blueClan.rating += blueRatingUpdate
    if (winnerSide === 'red') {
      redClan.win += 1
      blueClan.lose += 1
    } else {
      blueClan.win += 1
      redClan.lose += 1
    }
    matchCountByLeagueClan.set(redClan.id, redMatches + 1)
    matchCountByLeagueClan.set(blueClan.id, blueMatches + 1)
    redClan.placement = redMatches + 1 < PLACEMENT_MATCH_COUNT
    blueClan.placement = blueMatches + 1 < PLACEMENT_MATCH_COUNT
  })

  /* ------------------------------ 지난시즌 ----------------------------- */
  const leaguePlayerSeasons: MockLeaguePlayerSeason[] = []
  for (const leaguePlayer of leaguePlayers) {
    if (!rng.chance(0.45)) continue
    for (let season = CURRENT_SEASON - 2; season < CURRENT_SEASON; season += 1) {
      if (season < 1) continue
      const win = rng.int(3, 60)
      const lose = rng.int(3, 60)
      const rankCount = rng.int(80, 400)
      leaguePlayerSeasons.push({
        leaguePlayerId: leaguePlayer.id,
        season,
        rank: rng.chance(0.85) ? rng.int(1, rankCount) : null,
        rankCount,
        rating: rng.int(820, 1900),
        win,
        lose,
        kill: rng.int(50, 900),
        death: rng.int(50, 900),
      })
    }
  }

  const leagueClanSeasons: MockLeagueClanSeason[] = []
  for (const leagueClan of leagueClans) {
    if (!rng.chance(0.5)) continue
    for (let season = CURRENT_SEASON - 2; season < CURRENT_SEASON; season += 1) {
      if (season < 1) continue
      const rankCount = rng.int(10, 90)
      leagueClanSeasons.push({
        leagueClanId: leagueClan.id,
        season,
        rank: rng.chance(0.85) ? rng.int(1, rankCount) : null,
        rankCount,
        rating: rng.int(850, 1850),
        division: leagueClan.division,
        win: rng.int(4, 70),
        lose: rng.int(4, 70),
      })
    }
  }

  /* ------------------------------- 게시판 ------------------------------ */
  /* 목록의 단일 원천은 계약이다 (`packages/contract/src/entities/board.ts`).
     Mock 과 실제 DB 가 같은 표를 봐야 `pnpm compare` 가 의미를 갖는다 */
  const categories: MockCategory[] = BOARD_CATEGORIES.map((category) => ({ ...category }))

  /** 글이 실제로 저장되는 카테고리 (`hot`은 집계로 만들어지는 가상 카테고리) */
  const writableCategories = categories
    .filter((category) => category.slug !== 'hot' && category.slug !== 'notice')
    .map((category) => category.slug)

  const boards: MockBoard[] = []
  const anonAlias = (): string => `${rng.pick(ANON_ALIAS_STEM)}-${rng.int(100, 999)}`

  /**
   * 작성시간과 편집시간은 뽑아만 두고 **뒤에서 정렬해 다시 나눠준다.**
   *
   * 이유: 게시판 목록은 최신순이고 우리 정렬 키는 id다. 그런데 작성시간을 무작위로 주면
   * id 순서와 시간 순서가 어긋나서 목록의 `작성시간` 열이 내림차순으로 보이지 않는다.
   * 실제 DB(Phase 7)는 `createdAt` 으로 정렬하므로 mock↔live 순서도 달라진다.
   * rng를 뽑는 순서는 그대로 두고 **값의 배치만** 바꾼다(다른 필드가 흔들리지 않게).
   */
  const drawnTimes: number[] = []
  const drawnEditOffsets: (number | null)[] = []

  for (let index = 0; index < FIXTURE_SIZE.BOARDS; index += 1) {
    const notice = index < 8
    const isAnonymous = !notice && rng.chance(0.45)
    const author = rng.pick(users)
    drawnTimes.push(NOW_EPOCH - rng.int(5 * 60 * 1000, 90 * DAY))

    boards.push({
      id: String(700000 + index),
      category: notice ? 'notice' : rng.pick(writableCategories),
      title: `${rng.pick(BOARD_TITLE_HEAD)} ${rng.pick(BOARD_TITLE_TAIL)}`,
      content:
        '<p>본문 예시입니다. 실제 데이터 연결 전까지 화면 확인을 위해 생성된 Mock 글입니다.</p>' +
        '<p>목록·상세·댓글 흐름을 확인하는 용도로만 사용합니다.</p>',
      userId: isAnonymous ? null : author.id,
      anonAlias: isAnonymous ? anonAlias() : null,
      discloseType: isAnonymous ? 1 : rng.chance(0.1) ? 1 : 0,
      writerApp: rng.chance(0.25) ? 1 : 0,
      viewCount: rng.int(12, 9800),
      likeCount: rng.int(0, 180),
      dislikeCount: rng.int(0, 40),
      hasImage: rng.chance(0.3),
      notice,
      // 아래에서 정렬된 값으로 다시 채운다
      createdAt: '',
      lastEdited: null,
    })
    drawnEditOffsets.push(rng.chance(0.12) ? rng.int(60, 3600) : null)
  }

  // index(= id)가 클수록 최신이 되도록 시간을 오름차순으로 나눠준다
  const orderedTimes = [...drawnTimes].sort((a, b) => a - b)
  boards.forEach((board, index) => {
    const created = must(orderedTimes[index], '게시글 작성시간 배치 실패')
    board.createdAt = toKstIso(created)
    const offset = drawnEditOffsets[index]
    board.lastEdited = offset == null ? null : toKstIso(created + offset * 1000)
  })

  const comments: MockComment[] = []
  /** 댓글 작성시각도 뽑아만 두고 뒤에서 글별로 정렬해 다시 나눠준다 (게시글과 같은 이유) */
  const drawnCommentOffsets: number[] = []

  for (let index = 0; index < FIXTURE_SIZE.COMMENTS; index += 1) {
    const board = rng.pick(boards)
    const siblings = comments.filter(
      (comment) => comment.boardId === board.id && comment.parentId === null,
    )
    // 대댓글은 1단계까지만 (원본 제약)
    const parent = siblings.length > 0 && rng.chance(0.3) ? rng.pick(siblings) : null
    const isAnonymous = rng.chance(0.4)
    const author = rng.pick(users)

    comments.push({
      id: String(900000 + index),
      boardId: board.id,
      parentId: parent?.id ?? null,
      content: rng.pick(COMMENT_BODY),
      userId: isAnonymous ? null : author.id,
      anonAlias: isAnonymous ? anonAlias() : null,
      discloseType: isAnonymous ? 1 : 0,
      writerApp: rng.chance(0.2) ? 1 : 0,
      likeCount: rng.int(0, 40),
      dislikeCount: rng.int(0, 8),
      deleted: rng.chance(0.05),
      // 아래에서 정렬된 값으로 다시 채운다
      createdAt: '',
    })
    drawnCommentOffsets.push(rng.int(60, 20 * 3600))
  }

  /**
   * 같은 글 안에서 **id가 클수록 나중**이 되도록 시각을 재배치한다.
   *
   * 댓글 목록은 id 오름차순(= 오래된 순)으로 보여주는데, 시각이 뒤죽박죽이면
   * 화면의 작성시각이 순서대로 보이지 않는다. 실제 DB(Phase 7)는 `createdAt`으로
   * 정렬하므로 mock↔live 순서도 달라진다.
   *
   * 대댓글은 부모보다 항상 id가 크므로(부모를 기존 형제 중에서만 고른다)
   * id 순서로 배치하면 부모보다 뒤에 오는 것이 보장된다.
   *
   * 글보다 뒤여야 하지만 **기준 시각을 넘어서는 안 된다.**
   * 넘어가면 목록에 미래 시각이 찍혀 상대시간 표기가 깨진다.
   */
  const commentIndexesByBoard = new Map<string, number[]>()
  comments.forEach((comment, index) => {
    const list = commentIndexesByBoard.get(comment.boardId) ?? []
    list.push(index)
    commentIndexesByBoard.set(comment.boardId, list)
  })

  const boardCreatedAtEpoch = new Map(
    boards.map((board) => [board.id, Date.parse(board.createdAt)]),
  )

  for (const [boardId, indexes] of commentIndexesByBoard) {
    const base = must(boardCreatedAtEpoch.get(boardId), '댓글의 글을 찾지 못했다')
    const offsets = indexes
      .map((index) => must(drawnCommentOffsets[index], '댓글 작성시각 배치 실패'))
      .sort((a, b) => a - b)
    indexes.forEach((commentIndex, order) => {
      const offset = must(offsets[order], '댓글 작성시각 배치 실패')
      const comment = must(comments[commentIndex], '댓글 배치 실패')
      comment.createdAt = toKstIso(Math.min(base + offset * 1000, NOW_EPOCH))
    })
  }

  /* ------------------------------- 설정값 ------------------------------ */
  const configs: Record<string, string | number | boolean> = {
    // 관측: 글쓰기 rate limit 5분
    BOARD_WRITE_INTERVAL: 300,
    // 관측: ENTRY_TIME_LIMIT=3600 (용도는 [미확인])
    ENTRY_TIME_LIMIT: 3600,
    // 관측: 랭킹은 1시간마다 갱신
    RANK_REFRESH_INTERVAL: 3600,
    CURRENT_SEASON,
  }

  return {
    now: FIXTURE_NOW,
    configs,
    categories,
    maps,
    users,
    players,
    clans,
    leagues,
    leagueClans,
    leaguePlayers,
    matches,
    leaguePlayerSeasons,
    leagueClanSeasons,
    boards,
    comments,
  }
}

/** 프로세스/탭 당 한 번만 생성한다 (3,000경기 생성 비용을 반복하지 않기 위해). */
export const dataset: MockDataset = buildDataset()
