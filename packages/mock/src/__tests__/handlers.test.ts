import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  buildPath,
  DEFAULT_API_BASE_URL,
  endpointList,
  endpointSignature,
  type EndpointDef,
} from '@sacloud/contract'
import { createMockServer } from '../node'
import { createHandlers } from '../handlers'
import { dataset } from '../dataset'

/**
 * MSW 핸들러가 계약의 모든 엔드포인트를 커버하고,
 * 실제 응답이 계약 스키마대로 내려오는지 확인한다 (Phase 0 완료 조건).
 */

const server = createMockServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

/** 픽스처에서 실제로 존재하는 값으로 경로 파라미터를 채운다 */
function buildParams() {
  const league = dataset.leagues[0]
  if (!league) throw new Error('리그 픽스처가 없습니다')

  const match = dataset.matches.find((entry) => entry.leagueId === league.id)
  if (!match) throw new Error('매치 픽스처가 없습니다')

  const leagueClan = dataset.leagueClans.find((entry) => entry.id === match.redLeagueClanId)
  if (!leagueClan) throw new Error('리그 클랜 픽스처가 없습니다')

  const clan = dataset.clans.find((entry) => entry.id === leagueClan.clanId)
  if (!clan) throw new Error('클랜 픽스처가 없습니다')

  const leaguePlayer = dataset.leaguePlayers.find((entry) => entry.leagueClanId === leagueClan.id)
  if (!leaguePlayer) throw new Error('리그 플레이어 픽스처가 없습니다')

  const player = dataset.players.find((entry) => entry.id === leaguePlayer.playerId)
  if (!player) throw new Error('플레이어 픽스처가 없습니다')

  const board = dataset.boards.find((entry) => !entry.notice)
  if (!board) throw new Error('게시글 픽스처가 없습니다')

  const comment = dataset.comments[0]
  if (!comment) throw new Error('댓글 픽스처가 없습니다')

  return {
    params: {
      leagueSlug: league.slug,
      leagueId: league.id,
      clanSlug: clan.slug,
      playerId: player.id,
      leagueClanId: leagueClan.id,
      leaguePlayerId: leaguePlayer.id,
      matchId: match.id,
      boardId: board.id,
      commentId: comment.id,
      name: player.name,
      q: player.name.slice(0, 2),
      slug: 'brandnewleague',
    },
    board,
    clanName: clan.name,
    leagueName: league.name,
  }
}

/** 이름 조회 엔드포인트는 대상별로 다른 이름을 넣어야 한다 */
function paramsFor(
  key: string,
  base: ReturnType<typeof buildParams>,
): Record<string, string> {
  if (key === 'clansByName') return { ...base.params, name: base.clanName }
  if (key === 'leaguesByName') return { ...base.params, name: base.leagueName }
  return base.params
}

function buildQuery(endpoint: EndpointDef, boardId: string): string {
  const search = new URLSearchParams()
  for (const key of endpoint.query ?? []) {
    if (key === 'division') search.set('division', '1')
    if (key === 'category') search.set('category', 'free')
    if (key === 'board_id') search.set('board_id', boardId)
  }
  const serialized = search.toString()
  return serialized ? `?${serialized}` : ''
}

describe('핸들러 커버리지', () => {
  it('계약의 모든 엔드포인트에 핸들러가 있다', () => {
    const handlers = createHandlers()
    expect(handlers).toHaveLength(endpointList.length)

    const covered = new Set(
      handlers.map((handler) => {
        const info = handler.info as { method: string; path: string }
        return `${info.method} ${new URL(info.path).pathname}`
      }),
    )

    const missing = endpointList
      .map((endpoint) => endpointSignature(endpoint))
      .filter((signature) => !covered.has(signature))

    expect(missing).toEqual([])
  })

  it('관측된 엔드포인트와 자체 설계 엔드포인트가 모두 표시되어 있다', () => {
    const observed = endpointList.filter((endpoint) => endpoint.origin === 'observed')
    const designed = endpointList.filter((endpoint) => endpoint.origin === 'designed')
    expect(observed.length).toBeGreaterThan(0)
    expect(designed.length).toBeGreaterThan(0)
    expect(observed.length + designed.length).toBe(endpointList.length)
  })
})

describe('모든 엔드포인트 응답이 계약 스키마를 만족한다', () => {
  const fixtures = buildParams()

  for (const endpoint of endpointList) {
    it(`${endpointSignature(endpoint)}`, async () => {
      const path = buildPath(endpoint.path, paramsFor(endpoint.key, fixtures))
      const url = `${DEFAULT_API_BASE_URL}${path}${buildQuery(endpoint, fixtures.board.id)}`
      const response = await fetch(url, {
        method: endpoint.method,
        ...(endpoint.method === 'GET' || endpoint.method === 'DELETE'
          ? {}
          : { headers: { 'content-type': 'application/json' }, body: '{}' }),
      })

      expect(response.status, `${url} 가 200이 아님`).toBe(200)
      const payload: unknown = await response.json()
      const parsed = endpoint.response.safeParse(payload)
      if (!parsed.success) {
        throw new Error(`${endpointSignature(endpoint)} 응답이 계약과 다릅니다\n${parsed.error}`)
      }
    })
  }
})

describe('커서 규격이 응답에 실린다', () => {
  it('목록 응답의 metadata.cursor가 계약 형태다', async () => {
    const { params } = buildParams()
    const url = `${DEFAULT_API_BASE_URL}${buildPath('/leagues/:leagueId/ranks/players', params)}`
    const response = await fetch(url)
    const payload = (await response.json()) as {
      metadata: { cursor: { next: string | null; prev: string | null } }
    }
    expect(payload.metadata.cursor).toHaveProperty('next')
    expect(payload.metadata.cursor).toHaveProperty('prev')
  })
})
