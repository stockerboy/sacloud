import { describe, expect, it } from 'vitest'
import type { z } from 'zod'
import { buildPath, endpoints, type EndpointKey } from '@sacloud/contract'

/**
 * 계약 준수 테스트 — 실제 API가 계약(Zod) 그대로 응답하는지 확인한다.
 *
 * 왜 필요한가
 *   Mock(MSW)과 실제 서버는 **같은 계약**을 구현해야 한다. 그래야 화면 코드를 고치지 않고
 *   `NEXT_PUBLIC_API_MODE`만 바꿔서 전환할 수 있다 (IMPLEMENTATION_PLAN Phase 7-7).
 *   응답 형태가 어긋나면 화면이 아니라 여기서 먼저 터져야 한다.
 *
 * 실행 조건
 *   개발 서버(`pnpm dev:clean`)와 로컬 DB(`pnpm db:start`)가 떠 있고 시드(`pnpm db:seed`)가
 *   들어 있어야 한다. 서버가 없으면 **조용히 통과시키지 않고 skip으로 표시**한다.
 *   `pnpm verify`(순수 단위 테스트)와 분리해서 보려면 이 파일만 따로 돌린다.
 */

const BASE = process.env.API_TEST_BASE_URL ?? 'http://localhost:3000/api'

/**
 * 서버가 떠 있는지 확인한다.
 *
 * 타임아웃이 넉넉한 이유: `next dev`는 라우트를 **처음 요청받을 때 컴파일**한다.
 * 라우트가 많으면 첫 응답이 수십 초 걸릴 수 있다. 짧게 잡으면 서버가 떠 있는데도
 * "없다"고 판단해 계약 검증을 통째로 건너뛴다 (실제로 그렇게 새어 나갔다).
 */
async function serverUp(): Promise<boolean> {
  try {
    const response = await fetch(`${BASE}/infos`, { signal: AbortSignal.timeout(90_000) })
    return response.ok
  } catch {
    return false
  }
}

const up = await serverUp()

/**
 * 응답을 계약 스키마로 파싱한다. 어긋나면 어디가 어긋났는지 그대로 드러낸다.
 *
 * 제네릭으로 둔 이유: `key`를 `EndpointKey`로만 받으면 반환 타입이 **모든 엔드포인트
 * 응답의 합집합**이 되어, 호출부에서 `.data[0].id` 같은 접근이 전부 타입 오류가 난다.
 */
async function checkGet<K extends EndpointKey>(
  key: K,
  options: { params?: Record<string, string>; search?: Record<string, string> } = {},
): Promise<z.infer<(typeof endpoints)[K]['response']>> {
  const endpoint = endpoints[key]
  const path = buildPath(endpoint.path, options.params ?? {})
  const search = new URLSearchParams(options.search ?? {}).toString()
  const response = await fetch(`${BASE}${path}${search ? `?${search}` : ''}`)

  expect(response.status, `${key} ${path} 가 200이 아니다`).toBe(200)
  const payload: unknown = await response.json()

  const parsed = endpoint.response.safeParse(payload)
  if (!parsed.success) {
    throw new Error(
      `${key} 응답이 계약과 다르다:\n${JSON.stringify(parsed.error.issues.slice(0, 5), null, 2)}`,
    )
  }
  return parsed.data
}

// 개발 모드는 라우트마다 첫 요청에서 컴파일이 일어나 느리다.
const CASE_TIMEOUT = 120_000

describe.skipIf(!up)('실제 API 계약 준수 (개발 서버 필요)', { timeout: CASE_TIMEOUT }, () => {
  /* 시드 데이터에서 실제 ID를 얻어 온다. 하드코딩하면 시드가 바뀔 때 같이 깨진다. */
  let leagueId = ''
  let leagueSlug = ''
  let clanSlug = ''
  let playerId = ''
  let leagueClanId = ''
  let leaguePlayerId = ''
  let boardId = ''

  it('부트스트랩 / 리그 목록에서 검증용 ID를 얻는다', async () => {
    const infos = await checkGet('infos')
    expect(infos.data.categories.length).toBeGreaterThan(0)

    const leagues = await checkGet('leagueList')
    const first = leagues.data[0]
    expect(first, '시드에 리그가 없다').toBeTruthy()
    leagueId = first!.id
    leagueSlug = first!.slug
    clanSlug = first!.clans[0]?.slug ?? ''

    const clanRanks = await checkGet('leagueRankClans', {
      params: { leagueId },
      search: { division: '1' },
    })
    leagueClanId = clanRanks.data[0]?.league_clan_id ?? ''

    const playerRanks = await checkGet('leagueRankPlayers', { params: { leagueId } })
    playerId = playerRanks.data[0]?.player.id ?? ''
    leaguePlayerId = playerRanks.data[0]?.league_player_id ?? ''

    const boards = await checkGet('boardList', { search: { category: 'free' } })
    boardId = boards.data[0]?.id ?? ''

    expect(leagueClanId, '클랜랭킹이 비어 있다').not.toBe('')
    expect(playerId, '개인랭킹이 비어 있다').not.toBe('')
    expect(boardId, '게시글이 없다').not.toBe('')
  })

  it('리그 · 랭킹', async () => {
    await checkGet('leagueShow', { params: { leagueSlug } })
    await checkGet('leagueClans', { params: { leagueSlug } })
    await checkGet('leagueRankClans', { params: { leagueId }, search: { division: '1' } })
    await checkGet('leagueRankPlayers', { params: { leagueId } })
  })

  it('플레이어 · 클랜', async () => {
    await checkGet('playerShow', { params: { playerId } })
    await checkGet('playerLeagues', { params: { playerId } })
    await checkGet('clanShow', { params: { clanSlug } })
    await checkGet('clanPlayers', { params: { clanSlug } })
    await checkGet('clanLeagues', { params: { clanSlug } })
  })

  it('기록실 · 매치 · 지난시즌', async () => {
    await checkGet('leagueClanShow', { params: { leagueSlug, clanSlug } })
    await checkGet('leagueClanPlayers', { params: { leagueSlug, clanSlug } })
    await checkGet('leaguePlayerShow', { params: { leagueSlug, playerId } })

    const matches = await checkGet('leagueClanMatches', { params: { leagueClanId } })
    const matchId = matches.data[0]?.id
    expect(matchId, '클랜 기록실에 매치가 없다').toBeTruthy()

    await checkGet('leaguePlayerMatches', { params: { leagueId, playerId } })
    await checkGet('matchShow', {
      params: { leagueId, matchId: matchId! },
      search: { league_clan_id: leagueClanId },
    })
    await checkGet('leaguePlayerSeasons', { params: { leaguePlayerId } })
    await checkGet('leagueClanSeasons', { params: { leagueClanId } })
  })

  it('게시판 · 댓글', async () => {
    await checkGet('boardList', { search: { category: 'free' } })
    await checkGet('boardList', { search: { category: 'hot' } })
    await checkGet('boardList', { search: { category: 'notice' } })
    await checkGet('boardShow', { params: { boardId } })
    await checkGet('commentList', { search: { board_id: boardId } })
  })

  it('검색 · 기타', async () => {
    await checkGet('mapList')
    await checkGet('remoteConfigs')
    await checkGet('leagueSlugAvailability', { params: { slug: 'nonexistentleague' } })
  })

  /**
   * 한 페이지를 넘는 리그가 있어야 검증할 수 있다.
   *
   * 공개 범위가 시드를 제외하므로(D-116) 실운영 리그만 남는다. 그 리그의 선수가
   * 한 페이지보다 적으면 **다음 커서가 없는 것이 정상**이다 — 그때는 검증할 대상이
   * 없다고 밝히고 넘어간다. 시드까지 대조하려면 서버를 `SACLOUD_PUBLIC_SCOPE=all`로 띄운다.
   *
   * 조건을 느슨하게 만든 것이 아니다. **데이터가 있으면 예전과 똑같이 엄격하게 본다.**
   */
  it('커서 페이지네이션이 같은 항목을 두 번 주지 않는다', async () => {
    const first = await checkGet('leagueRankPlayers', { params: { leagueId } })
    const next = first.metadata.cursor.next
    if (!next) {
      console.info(
        `건너뜀: ${leagueSlug} 리그의 랭킹이 한 페이지(${first.data.length}행)로 끝나 ` +
          '페이지네이션을 검증할 수 없다',
      )
      return
    }

    const second = await checkGet('leagueRankPlayers', {
      params: { leagueId },
      search: { cursor: next },
    })

    const firstIds = new Set(first.data.map((row) => row.league_player_id))
    const overlap = second.data.filter((row) => firstIds.has(row.league_player_id))
    expect(overlap, '두 페이지에 같은 행이 겹쳐서 나온다').toHaveLength(0)

    // 순위가 이어져야 한다 (1~20 다음은 21~)
    const lastRank = first.data[first.data.length - 1]?.rank ?? 0
    expect(second.data[0]?.rank).toBe(lastRank + 1)
  })

  /**
   * 계약은 랭킹·매치 경로를 `:leagueId`로 적지만 **화면은 슬러그를 넘긴다**
   * (`app/league/[leagueSlug]/rank/...` 등이 URL 슬러그를 그대로 쓴다).
   * ID만 받도록 두면 랭킹·기록실이 전부 404가 난다 — 실제로 그렇게 났다.
   */
  it('리그 ID 자리에 슬러그를 넣어도 동작한다', async () => {
    for (const path of [
      `/leagues/${leagueSlug}/ranks/clans?division=1`,
      `/leagues/${leagueSlug}/ranks/players`,
      `/leagues/${leagueSlug}/players/${playerId}/matches`,
    ]) {
      const response = await fetch(`${BASE}${path}`)
      expect(response.status, `${path} 가 200이 아니다`).toBe(200)
    }
  })

  /**
   * 참여중인 리그 카드가 실제로 열리는가 (Phase 9 회귀).
   *
   * 카드가 기록실 경로에 `league_player_id`를 넣어서 클릭하면 빈 페이지가 됐다.
   * 두 값이 **다르다는 것**과, 경로에는 `playerId`가 들어가야 한다는 것을 여기서 고정한다.
   */
  it('참여중인 리그 카드가 가리키는 기록실 경로가 실제로 열린다', async () => {
    const leagues = await checkGet('playerLeagues', { params: { playerId } })
    expect(leagues.data.length, '이 플레이어는 리그에 참여하고 있어야 한다').toBeGreaterThan(0)

    for (const entry of leagues.data) {
      const slug = entry.league.slug
      const ok = await fetch(`${BASE}/leagues/${slug}/players/${playerId}`)
      expect(ok.status, `/leagues/${slug}/players/${playerId} 가 200이 아니다`).toBe(200)

      // 리그 참가 레코드 ID는 플레이어 ID가 아니다 — 넣으면 404가 난다
      if (entry.league_player_id !== playerId) {
        const wrong = await fetch(`${BASE}/leagues/${slug}/players/${entry.league_player_id}`)
        expect(
          wrong.status,
          `league_player_id(${entry.league_player_id})로도 열리면 두 ID를 구분하지 못한다는 뜻이다`,
        ).toBe(404)
      }
    }
  })

  it('없는 대상은 404로 답한다 (HTML 오류 페이지가 아니라 계약 형태로)', async () => {
    const response = await fetch(`${BASE}/leagues/definitely-not-a-league`)
    expect(response.status).toBe(404)
    const payload = (await response.json()) as { message: string; data: null }
    expect(typeof payload.message).toBe('string')
    expect(payload.data).toBeNull()
  })
})

describe.skipIf(up)('개발 서버가 없어 계약 준수 테스트를 건너뛴다', () => {
  it('서버를 띄우고 다시 실행하면 검증된다', () => {
    // 조용히 통과시키지 않으려고 남기는 안내다.
    // `pnpm db:start` → `pnpm db:seed` → `pnpm dev:clean` 후 다시 실행하면 위 테스트가 돈다.
    expect(up).toBe(false)
  })
})
