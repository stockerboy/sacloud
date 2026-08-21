/**
 * Mock ↔ 실제 API 응답 대조.
 *
 * Phase 7의 완료 조건은 "`NEXT_PUBLIC_API_MODE` 스위치만으로 전환된다"이다.
 * 그러려면 두 구현이 **같은 입력에 같은 응답**을 내야 한다.
 * 계약(Zod) 검증은 "형태가 맞는지"만 보고, 값이 달라도 통과한다.
 * 이 스크립트는 **값까지** 대조한다.
 *
 * 전제
 * - 실제 API가 Mock과 **같은 결정적 픽스처**로 시드되어 있어야 한다 (`pnpm db:seed`).
 * - 개발 서버가 live 모드로 떠 있어야 한다.
 * - 비로그인 상태로 비교한다 (Node에는 localStorage가 없어 Mock 역할이 `guest`다).
 *
 * 실행: pnpm --filter @sacloud/web exec tsx scripts/compareMockLive.ts
 */
import { mockStore as store } from '@sacloud/mock'
import { PAGE_SIZE } from '@sacloud/contract'

const BASE = process.env.API_TEST_BASE_URL ?? 'http://localhost:3000/api'
const MAX_DIFFS_PER_CASE = 8

let cases = 0
let failed = 0

/** 두 값의 차이를 경로와 함께 모은다 */
function diff(path: string, mock: unknown, live: unknown, out: string[]): void {
  if (out.length >= MAX_DIFFS_PER_CASE) return
  if (mock === live) return

  const bothObjects =
    mock !== null && live !== null && typeof mock === 'object' && typeof live === 'object'

  if (!bothObjects) {
    out.push(`${path}\n      mock = ${JSON.stringify(mock)}\n      live = ${JSON.stringify(live)}`)
    return
  }

  if (Array.isArray(mock) !== Array.isArray(live)) {
    out.push(`${path}: 한쪽만 배열이다`)
    return
  }

  if (Array.isArray(mock) && Array.isArray(live)) {
    if (mock.length !== live.length) {
      out.push(`${path}.length  mock=${mock.length} live=${live.length}`)
    }
    for (let index = 0; index < Math.min(mock.length, live.length); index += 1) {
      diff(`${path}[${index}]`, mock[index], live[index], out)
    }
    return
  }

  const keys = new Set([
    ...Object.keys(mock as Record<string, unknown>),
    ...Object.keys(live as Record<string, unknown>),
  ])
  for (const key of keys) {
    diff(
      `${path}.${key}`,
      (mock as Record<string, unknown>)[key],
      (live as Record<string, unknown>)[key],
      out,
    )
  }
}

async function fetchLive(path: string): Promise<unknown> {
  const response = await fetch(`${BASE}${path}`)
  if (!response.ok) throw new Error(`${path} → HTTP ${response.status}`)
  return response.json()
}

/**
 * `ignore`에 넣은 조각이 들어간 차이는 **의도적으로 다른 값**이라 걸러낸다.
 * 값이 다르다고 실패로 잡으면 진짜 차이가 묻히므로 명시적으로 빼되,
 * 왜 빼는지는 호출부에 적는다. 배열 인덱스가 끼어들 수 있어 부분 일치로 본다.
 */
function withoutIgnored(lines: string[], ignore: string[]): string[] {
  return lines.filter((line) => !ignore.some((token) => line.includes(token)))
}

/** 단건 응답 비교 */
async function compare(name: string, path: string, mockData: unknown, ignore: string[] = []) {
  cases += 1
  try {
    const live = (await fetchLive(path)) as { data: unknown }
    const found: string[] = []
    diff('data', mockData, live.data, found)
    const out = withoutIgnored(found, ignore)
    if (out.length === 0) {
      console.info(`  같음   ${name}`)
    } else {
      failed += 1
      console.info(`  다름   ${name}  (${path})`)
      for (const line of out) console.info(`      ${line}`)
    }
  } catch (error) {
    failed += 1
    console.info(`  실패   ${name}  (${path}) — ${error instanceof Error ? error.message : error}`)
  }
}

/** 목록(커서) 응답 비교 — 항목 배열과 커서 메타를 함께 본다 */
async function comparePage(
  name: string,
  path: string,
  mockPage: { items: unknown[]; cursor: unknown } | null,
  ignore: string[] = [],
) {
  cases += 1
  if (!mockPage) {
    failed += 1
    console.info(`  실패   ${name} — Mock이 null을 반환했다`)
    return
  }
  try {
    const live = (await fetchLive(path)) as { data: unknown[]; metadata: { cursor: unknown } }
    const found: string[] = []
    diff('data', mockPage.items, live.data, found)
    diff('metadata.cursor', mockPage.cursor, live.metadata.cursor, found)
    const out = withoutIgnored(found, ignore)
    if (out.length === 0) {
      console.info(`  같음   ${name}  (${live.data.length}건)`)
    } else {
      failed += 1
      console.info(`  다름   ${name}  (${path})`)
      for (const line of out) console.info(`      ${line}`)
    }
  } catch (error) {
    failed += 1
    console.info(`  실패   ${name}  (${path}) — ${error instanceof Error ? error.message : error}`)
  }
}

async function main() {
  console.info(`대조 대상: ${BASE}\n`)

  /* ------------------------------ 리그 · 랭킹 ----------------------------- */
  console.info('[리그 · 랭킹]')
  await comparePage('리그 목록', '/leagues', store.listLeagues(null, PAGE_SIZE.DEFAULT))

  const league = store.getLeague('officialmain')
  if (!league) throw new Error('Mock에 officialmain 리그가 없다')
  await compare('리그 상세', '/leagues/officialmain', league)
  await comparePage(
    '리그 참여 클랜',
    '/leagues/officialmain/clans',
    store.getLeagueClans('officialmain', null, PAGE_SIZE.DEFAULT),
  )
  // 경로에 **슬러그**를 넣는다. 화면이 실제로 그렇게 호출한다
  // (계약은 `:leagueId`지만 클라이언트가 슬러그를 넘긴다). ID만 받으면 랭킹이 404가 난다.
  await comparePage(
    '클랜랭킹 1부',
    `/leagues/officialmain/ranks/clans?division=1`,
    store.getClanRanks(league.id, 1, null, PAGE_SIZE.RANK),
  )
  await comparePage(
    '클랜랭킹 2부',
    `/leagues/officialmain/ranks/clans?division=2`,
    store.getClanRanks(league.id, 2, null, PAGE_SIZE.RANK),
  )
  await comparePage(
    '개인랭킹',
    `/leagues/officialmain/ranks/players`,
    store.getPlayerRanks(league.id, null, PAGE_SIZE.RANK),
  )

  /* 두 번째 페이지도 본다 — 커서 구현이 다르면 여기서 드러난다 */
  const firstPage = store.getPlayerRanks(league.id, null, PAGE_SIZE.RANK)
  const nextCursor = firstPage?.cursor.next
  if (nextCursor) {
    await comparePage(
      '개인랭킹 2페이지',
      `/leagues/officialmain/ranks/players?cursor=${encodeURIComponent(nextCursor)}`,
      store.getPlayerRanks(league.id, nextCursor, PAGE_SIZE.RANK),
    )
  }

  /* ----------------------------- 플레이어 · 클랜 --------------------------- */
  console.info('\n[플레이어 · 클랜]')
  const topPlayerId = firstPage?.items[0]?.player.id
  if (topPlayerId) {
    const player = store.getPlayer(topPlayerId)
    if (player) await compare('플레이어 상세', `/players/${topPlayerId}`, player)
    await compare(
      '플레이어 참여 리그',
      `/players/${topPlayerId}/leagues`,
      store.getPlayerLeagues(topPlayerId),
    )
  }

  const clanSlug = league.id ? (store.getLeagueClans('officialmain', null, 1)?.items[0]?.clan.slug ?? '') : ''
  if (clanSlug) {
    const clan = store.getClan(clanSlug)
    if (clan) await compare('클랜 상세', `/clans/${clanSlug}`, clan)
    await comparePage(
      '클랜원',
      `/clans/${clanSlug}/players`,
      store.getClanPlayers(clanSlug, null, PAGE_SIZE.DEFAULT),
    )
    await compare('클랜 참여 리그', `/clans/${clanSlug}/leagues`, store.getClanLeagues(clanSlug))
  }

  /* -------------------------------- 기록실 -------------------------------- */
  console.info('\n[기록실 · 매치]')
  if (clanSlug) {
    const show = store.getLeagueClanShow('officialmain', clanSlug)
    if (show) {
      await compare(
        '리그 내 클랜 상세',
        `/leagues/officialmain/clans/${clanSlug}/show`,
        show,
      )
      await comparePage(
        '클랜 기록실 매치',
        `/leagueclans/${show.id}/matches`,
        store.getLeagueClanMatches(show.id, null, PAGE_SIZE.DEFAULT),
      )
      await comparePage(
        '리그 내 클랜원',
        `/leagues/officialmain/clans/${clanSlug}/players`,
        store.getLeagueClanPlayers('officialmain', clanSlug, null, PAGE_SIZE.DEFAULT),
      )
      await compare('클랜 지난시즌', `/leagueclans/${show.id}/seasons`, store.getLeagueClanSeasons(show.id))

      const matches = store.getLeagueClanMatches(show.id, null, 1)
      const matchId = matches?.items[0]?.id
      if (matchId) {
        await compare(
          '매치 상세',
          `/leagues/officialmain/matches/${matchId}?league_clan_id=${show.id}`,
          store.getMatch(league.id, matchId, show.id),
        )
      }
    }
  }

  if (topPlayerId) {
    const detail = store.getLeaguePlayerDetail('officialmain', topPlayerId)
    if (detail) {
      await compare('개인 기록실 상세', `/leagues/officialmain/players/${topPlayerId}`, detail)
      await comparePage(
        '개인 기록실 매치',
        `/leagues/officialmain/players/${topPlayerId}/matches`,
        store.getLeaguePlayerMatches(league.id, topPlayerId, null, PAGE_SIZE.DEFAULT),
      )
      await compare(
        '개인 지난시즌',
        `/leagueplayers/${detail.id}/seasons`,
        store.getLeaguePlayerSeasons(detail.id),
      )
    }
  }

  /* -------------------------------- 게시판 -------------------------------- */
  console.info('\n[게시판]')
  // `view_count`는 의도적으로 다르다 — 실제 서버는 글을 열 때마다 조회수를 올리지만
  // Mock은 픽스처 값을 그대로 돌려주는 스텁이다. `hot` 점수에도 조회수가 들어가므로
  // 순위가 흔들릴 수 있는데, 그건 진짜 차이라서 걸러내지 않는다.
  for (const category of ['free', 'notice', 'hot']) {
    await comparePage(
      `게시판 목록 (${category})`,
      `/boards?category=${category}`,
      store.listBoards({ category, cursor: null, size: PAGE_SIZE.BOARD }),
      ['.view_count'],
    )
  }

  const freeList = store.listBoards({ category: 'free', cursor: null, size: 1 })
  const boardId = freeList.items[0]?.id
  if (boardId) {
    const board = store.getBoard(boardId)
    if (board) {
      // `view_count`는 의도적으로 다르다. 실제 서버는 글을 읽을 때마다 조회수를 올리지만
      // Mock은 픽스처 값을 그대로 돌려주는 스텁이다.
      await compare('글 상세', `/boards/${boardId}`, board, ['.view_count'])
    }
    await compare('댓글 목록', `/comments?board_id=${boardId}`, store.listComments(boardId))
  }

  /* --------------------------------- 결과 -------------------------------- */
  console.info(`\n대조 ${cases}건 중 ${cases - failed}건 같음, ${failed}건 다름.`)
  if (failed > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
