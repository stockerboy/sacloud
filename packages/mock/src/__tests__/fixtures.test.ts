import { describe, expect, it } from 'vitest'
import {
  Board,
  BoardListItem,
  Clan,
  ClanLeagueEntry,
  ClanPlayer,
  ClanRankRow,
  Comment,
  League,
  LeagueClan,
  LeagueClanShow,
  LeaguePlayerDetail,
  LeaguePlayerSeason,
  MatchDetail,
  MatchListItem,
  Player,
  PlayerLeagueEntry,
  PlayerRankRow,
} from '@sacloud/contract'
import { buildDataset, dataset, FIXTURE_SIZE, PLACEMENT_MATCH_COUNT } from '../dataset'
import * as store from '../store'
import { kdRate, winRate } from '../derive'

/**
 * "생성된 Mock 픽스처 전량이 Zod 파싱을 통과한다" (Phase 0 완료 조건).
 * 계약 스키마와 픽스처가 어긋나면 여기서 즉시 실패한다.
 */

describe('픽스처 규모', () => {
  it('계획서에 정한 규모대로 생성된다', () => {
    expect(dataset.leagues).toHaveLength(4)
    expect(dataset.clans).toHaveLength(FIXTURE_SIZE.CLANS)
    expect(dataset.players.length).toBeGreaterThanOrEqual(
      FIXTURE_SIZE.CLANS * FIXTURE_SIZE.PLAYERS_PER_CLAN,
    )
    expect(dataset.matches.length).toBeGreaterThan(FIXTURE_SIZE.MATCHES * 0.9)
    expect(dataset.boards).toHaveLength(FIXTURE_SIZE.BOARDS)
    expect(dataset.comments).toHaveLength(FIXTURE_SIZE.COMMENTS)
  })

  it('단일리그 1개 + N부리그 3개, 공식 배지 2개', () => {
    expect(dataset.leagues.filter((league) => league.divisionCount === 1)).toHaveLength(1)
    expect(dataset.leagues.filter((league) => league.divisionCount > 1)).toHaveLength(3)
    expect(dataset.leagues.filter((league) => league.official)).toHaveLength(2)
  })

  it('같은 seed면 항상 같은 데이터가 나온다 (결정적 생성)', () => {
    const a = buildDataset(1234)
    const b = buildDataset(1234)
    expect(a.matches[0]?.id).toBe(b.matches[0]?.id)
    expect(a.players[10]?.name).toBe(b.players[10]?.name)
    expect(a.leagueClans[5]?.rating).toBe(b.leagueClans[5]?.rating)
  })

  it('매치 ID는 관측된 규칙(YYMMDDHHmmss + 6자리)을 따르고 중복이 없다', () => {
    const ids = new Set<string>()
    for (const match of dataset.matches) {
      expect(match.id).toMatch(/^\d{18}$/)
      expect(match.id.slice(0, 12)).toBe(
        match.startAt.replace(/[-:T]/g, '').slice(2, 14),
      )
      ids.add(match.id)
    }
    expect(ids.size).toBe(dataset.matches.length)
  })

  it('배치고사 상태가 경기 수와 일치한다', () => {
    const counts = new Map<string, number>()
    for (const match of dataset.matches) {
      for (const id of [match.redLeagueClanId, match.blueLeagueClanId]) {
        counts.set(id, (counts.get(id) ?? 0) + 1)
      }
    }
    for (const leagueClan of dataset.leagueClans) {
      const played = counts.get(leagueClan.id) ?? 0
      expect(leagueClan.placement).toBe(played < PLACEMENT_MATCH_COUNT)
    }
  })

  it('래더 증감은 관측 범위(승 +7~+12 / 패 -10~-19) 안에 있다', () => {
    for (const match of dataset.matches) {
      const winnerUpdate =
        match.winnerSide === 'red' ? match.redRatingUpdate : match.blueRatingUpdate
      const loserUpdate = match.winnerSide === 'red' ? match.blueRatingUpdate : match.redRatingUpdate
      expect(winnerUpdate).toBeGreaterThanOrEqual(7)
      expect(winnerUpdate).toBeLessThanOrEqual(12)
      expect(loserUpdate).toBeLessThanOrEqual(-10)
      expect(loserUpdate).toBeGreaterThanOrEqual(-19)
    }
  })

  it('대댓글은 1단계까지만 존재한다', () => {
    const byId = new Map(dataset.comments.map((comment) => [comment.id, comment]))
    for (const comment of dataset.comments) {
      if (!comment.parentId) continue
      const parent = byId.get(comment.parentId)
      expect(parent).toBeDefined()
      expect(parent?.parentId).toBeNull()
    }
  })
})

describe('픽스처가 계약 스키마를 만족한다', () => {
  it('플레이어 / 리그 참여 요약', () => {
    for (const player of dataset.players) {
      Player.parse(store.getPlayer(player.id))
    }
    for (const player of dataset.players.slice(0, 200)) {
      for (const entry of store.getPlayerLeagues(player.id)) {
        PlayerLeagueEntry.parse(entry)
      }
    }
  })

  it('클랜 / 클랜원 / 클랜 리그성적', () => {
    for (const clan of dataset.clans) {
      Clan.parse(store.getClan(clan.slug))
      const page = store.getClanPlayers(clan.slug, null, 50)
      for (const member of page?.items ?? []) ClanPlayer.parse(member)
      for (const entry of store.getClanLeagues(clan.slug) ?? []) ClanLeagueEntry.parse(entry)
    }
  })

  it('리그 / 참여 클랜 / 랭킹', () => {
    for (const league of dataset.leagues) {
      League.parse(store.getLeague(league.slug))

      const clans = store.getLeagueClans(league.slug, null, 200)
      for (const entry of clans?.items ?? []) LeagueClan.parse(entry)

      for (let division = 1; division <= league.divisionCount; division += 1) {
        const ranks = store.getClanRanks(league.id, division, null, 200)
        for (const row of ranks?.items ?? []) ClanRankRow.parse(row)
      }

      const playerRanks = store.getPlayerRanks(league.id, null, 500)
      for (const row of playerRanks?.items ?? []) PlayerRankRow.parse(row)
    }
  })

  it('기록실 상세 (개인 / 클랜)', () => {
    for (const league of dataset.leagues) {
      const leagueClans = dataset.leagueClans.filter((entry) => entry.leagueId === league.id)
      for (const leagueClan of leagueClans.slice(0, 6)) {
        const clan = dataset.clans.find((entry) => entry.id === leagueClan.clanId)
        if (!clan) continue
        LeagueClanShow.parse(store.getLeagueClanShow(league.slug, clan.slug))

        const members = store.getLeagueClanPlayers(league.slug, clan.slug, null, 50)
        for (const row of members?.items ?? []) PlayerRankRow.parse(row)

        for (const playerId of clan.playerIds.slice(0, 3)) {
          const detail = store.getLeaguePlayerDetail(league.slug, playerId)
          if (detail) LeaguePlayerDetail.parse(detail)
        }
      }
    }
  })

  /* 픽스처 3,000경기를 전부 Zod 로 통과시키는 무거운 검증이다. 단독으로 2.5초쯤 걸려
     기본 5초로는 여유가 없다 — DB 를 쓰는 다른 테스트와 같이 돌면 CPU 를 나눠 쓰다
     타임아웃으로 깨진다. 검증 내용이 아니라 시간 여유가 문제라 시간을 늘린다 */
  it('매치 목록 전량 + 매치 상세', () => {
    let parsed = 0
    for (const leagueClan of dataset.leagueClans) {
      const page = store.getLeagueClanMatches(leagueClan.id, null, 5000)
      for (const item of page?.items ?? []) {
        MatchListItem.parse(item)
        parsed += 1
      }
    }
    // 매치 1건당 두 클랜의 기록실에 각각 나타난다
    expect(parsed).toBe(dataset.matches.length * 2)

    for (const match of dataset.matches.slice(0, 50)) {
      MatchDetail.parse(store.getMatch(match.leagueId, match.id, match.redLeagueClanId))
    }
  }, 30_000)

  it('지난시즌', () => {
    for (const leaguePlayer of dataset.leaguePlayers.slice(0, 300)) {
      for (const season of store.getLeaguePlayerSeasons(leaguePlayer.id) ?? []) {
        LeaguePlayerSeason.parse(season)
      }
    }
  })

  it('게시판 / 글 / 댓글', () => {
    for (const category of dataset.categories) {
      const page = store.listBoards({ category: category.slug, cursor: null, size: 500 })
      for (const item of page.items) BoardListItem.parse(item)
    }
    for (const board of dataset.boards) {
      Board.parse(store.getBoard(board.id))
      for (const comment of store.listComments(board.id)) Comment.parse(comment)
    }
  })

  /**
   * 목록은 최신순이고 정렬 키는 id다. 작성시간이 id와 어긋나면
   * 화면의 `작성시간` 열이 내림차순으로 보이지 않고, 실제 DB(createdAt 정렬)와도
   * 순서가 달라진다. 실제로 어긋나 있던 것을 Phase 7에서 고쳤다.
   */
  it('게시글 작성시간이 id 순서와 일치한다 (목록이 최신순으로 보인다)', () => {
    const times = dataset.boards.map((board) => Date.parse(board.createdAt))
    for (let index = 1; index < times.length; index += 1) {
      expect(times[index]!, `id가 큰 글이 더 최신이어야 한다 (index ${index})`).toBeGreaterThanOrEqual(
        times[index - 1]!,
      )
    }

    const listed = store.listBoards({ category: 'free', cursor: null, size: 500 }).items
    for (let index = 1; index < listed.length; index += 1) {
      expect(Date.parse(listed[index]!.created_at)).toBeLessThanOrEqual(
        Date.parse(listed[index - 1]!.created_at),
      )
    }
  })

  it('댓글 작성시각이 글 이후이고 기준 시각을 넘지 않는다', () => {
    const now = Date.parse(dataset.now)
    const boardTime = new Map(dataset.boards.map((board) => [board.id, Date.parse(board.createdAt)]))
    for (const comment of dataset.comments) {
      const at = Date.parse(comment.createdAt)
      expect(at).toBeLessThanOrEqual(now)
      expect(at).toBeGreaterThanOrEqual(boardTime.get(comment.boardId)!)
    }
  })

  /** 댓글 목록은 오래된 순으로 보여준다. id 순서와 시각 순서가 맞아야 한다. */
  it('같은 글의 댓글은 id 순서와 시각 순서가 일치한다', () => {
    const byBoard = new Map<string, number[]>()
    for (const comment of dataset.comments) {
      const list = byBoard.get(comment.boardId) ?? []
      list.push(Date.parse(comment.createdAt))
      byBoard.set(comment.boardId, list)
    }
    for (const [boardId, times] of byBoard) {
      for (let index = 1; index < times.length; index += 1) {
        expect(times[index]!, `글 ${boardId}의 댓글 시각이 역전됐다`).toBeGreaterThanOrEqual(
          times[index - 1]!,
        )
      }
    }
  })

  /** 대댓글은 부모보다 나중이어야 한다 */
  it('대댓글은 부모 댓글보다 나중이다', () => {
    const byId = new Map(dataset.comments.map((comment) => [comment.id, comment]))
    for (const comment of dataset.comments) {
      if (!comment.parentId) continue
      const parent = byId.get(comment.parentId)!
      expect(Date.parse(comment.createdAt)).toBeGreaterThanOrEqual(Date.parse(parent.createdAt))
    }
  })
})

describe('결측 처리 (알수없음)', () => {
  it('보는 쪽이 아닌 팀의 딜량·헤드샷은 null로 내려간다', () => {
    const match = dataset.matches[0]
    expect(match).toBeDefined()
    if (!match) return

    const detail = store.getMatch(match.leagueId, match.id, match.redLeagueClanId)
    expect(detail).not.toBeNull()

    for (const stat of detail?.red_stats ?? []) {
      expect(stat.damage).not.toBeNull()
      expect(stat.headshot).not.toBeNull()
    }
    for (const stat of detail?.blue_stats ?? []) {
      expect(stat.damage).toBeNull()
      expect(stat.headshot).toBeNull()
      expect(stat.damage_percent).toBeNull()
      expect(stat.headshot_percent).toBeNull()
    }
  })
})

describe('커서 페이지네이션', () => {
  it('페이지를 끝까지 넘기면 중복·누락 없이 전량을 순회한다', () => {
    const league = dataset.leagues[0]
    expect(league).toBeDefined()
    if (!league) return

    const seen: string[] = []
    let cursor: string | null = null
    for (let guard = 0; guard < 100; guard += 1) {
      const page = store.getPlayerRanks(league.id, cursor, 20)
      expect(page).not.toBeNull()
      if (!page) break
      seen.push(...page.items.map((row) => row.league_player_id))
      cursor = page.cursor.next
      if (!cursor) break
    }

    const total = store.getPlayerRanks(league.id, null, 100000)?.items.length ?? 0
    expect(seen).toHaveLength(total)
    expect(new Set(seen).size).toBe(total)
  })

  it('마지막 페이지에서는 next가 null이다', () => {
    const league = dataset.leagues[0]
    if (!league) return
    const all = store.getPlayerRanks(league.id, null, 100000)
    expect(all?.cursor.next).toBeNull()
    expect(all?.cursor.prev).toBeNull()
  })
})

describe('파생값 계산 규칙 (원본 실측 확정)', () => {
  it('킬뎃은 킬/(킬+데스) 백분율이다 — 원본 1위 플레이어로 검증', () => {
    // 원본 관측: 17,855킬 17,422데스 → 킬뎃 50.6%
    expect(kdRate(17855, 17422)).toBe(50.6)
    // 킬과 데스가 같으면 정확히 50%
    expect(kdRate(100, 100)).toBe(50)
    // 데스가 0이면 100%
    expect(kdRate(10, 0)).toBe(100)
    // 둘 다 0이면 0
    expect(kdRate(0, 0)).toBe(0)
  })

  it('승률은 승/(승+패) 백분율이다 — 원본 1위 플레이어로 검증', () => {
    // 원본 관측: 1,302승 851패 → 60.5%
    expect(winRate(1302, 851)).toBe(60.5)
    expect(winRate(0, 0)).toBe(0)
  })

  it('생성된 픽스처의 킬뎃이 0~100 범위 안에 있다', () => {
    const ranks = store.getPlayerRanks(dataset.leagues[0]!.id, null, 20)
    expect(ranks).not.toBeNull()
    expect(ranks!.items.length).toBeGreaterThan(0)
    for (const row of ranks!.items) {
      expect(row.kd_rate).toBeGreaterThanOrEqual(0)
      expect(row.kd_rate).toBeLessThanOrEqual(100)
      expect(row.win_rate).toBeGreaterThanOrEqual(0)
      expect(row.win_rate).toBeLessThanOrEqual(100)
    }
  })
})
