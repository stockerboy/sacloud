import { http, HttpResponse, type HttpResponseResolver } from 'msw'
import {
  DEFAULT_API_BASE_URL,
  endpointList,
  PAGE_SIZE,
  parseRankWeapon,
  SUCCESS_MESSAGE,
  type EndpointKey,
} from '@sacloud/contract'
import { dataset, FIXTURE_NOW } from './dataset'
import { getMockRole, setMockRole } from './session'
import * as store from './store'
import type { Page } from './store'

/* -------------------------------------------------------------------------- */
/* 응답 헬퍼                                                                     */
/* -------------------------------------------------------------------------- */

function ok<T>(data: T): Response {
  return HttpResponse.json({ message: SUCCESS_MESSAGE, data })
}

function okPage<T>(page: Page<T>): Response {
  return HttpResponse.json({
    message: SUCCESS_MESSAGE,
    data: page.items,
    metadata: { cursor: page.cursor },
  })
}

function notFound(): Response {
  return HttpResponse.json({ message: 'not found', data: null }, { status: 404 })
}

/** 로그인이 필요한 엔드포인트에 비로그인으로 접근한 경우 */
function unauthorized(): Response {
  return HttpResponse.json({ message: 'unauthorized', data: null }, { status: 401 })
}

function param(value: string | readonly string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ''
  return typeof value === 'string' ? value : ''
}

function query(request: Request, name: string): string | null {
  return new URL(request.url).searchParams.get(name)
}

/** 원본 API는 리그를 slug로도 id로도 참조한다. Mock은 둘 다 받아준다. */
function resolveLeagueId(value: string): string | null {
  const bySlug = store.getLeagueIdBySlug(value)
  if (bySlug) return bySlug
  return dataset.leagues.some((league) => league.id === value) ? value : null
}

function leagueSlugOf(leagueIdOrSlug: string): string | null {
  const id = resolveLeagueId(leagueIdOrSlug)
  if (!id) return null
  return dataset.leagues.find((league) => league.id === id)?.slug ?? null
}

type Resolver = HttpResponseResolver

/* -------------------------------------------------------------------------- */
/* 엔드포인트별 리졸버                                                            */
/*                                                                            */
/* Record<EndpointKey, Resolver> 이므로 계약에 엔드포인트를 추가하면              */
/* 여기에 핸들러를 만들 때까지 타입 오류가 난다 (핸들러 누락 방지).                  */
/* -------------------------------------------------------------------------- */

const resolvers: Record<EndpointKey, Resolver> = {
  /* -------------------------------- 공통 -------------------------------- */
  infos: () => ok(store.getInfos()),
  remoteConfigs: () => ok(dataset.configs),
  /* 메인 TOP3 — 레지스트리에 있어야 MSW 핸들러가 생긴다 (교차검증 [심각 1]) */
  homeTop: () => ok(store.getHomeTop()),

  /* --------------------------------- 알 --------------------------------- */
  /**
   * 깨진 알 목록 (`docs/EGG_SYSTEM_SPEC.md`).
   *
   * Mock 에는 알을 깨는 길이 없다 — 깨짐은 DB(`EggBreak`)에만 있다. 그래서 **고정으로**
   * 맨 앞 클랜 하나 · 선수 하나를 깨 둔다. **두 상태를 한 화면에서 같이 보기 위해서다.**
   * 전부 잠가 두면 「빛나는 마크」와 「열린 지표」를 Mock 모드에서 영영 못 본다.
   */
  eggsBroken: () =>
    ok({
      players: dataset.players[0] ? [dataset.players[0].id] : [],
      clans: dataset.clans[0] ? [dataset.clans[0].slug] : [],
    }),

  /* -------------------------------- 인증 -------------------------------- */
  // Phase 0에서는 계약 형태만 반환한다. 실제 검증·세션 전환은 Phase 6에서 구현한다.
  // 개발용 세션 스위치를 로그인 상태로 바꾼다 (실제 인증은 Phase 7 이후)
  authLogin: () => {
    if (getMockRole() === 'guest') setMockRole('user')
    return ok(mockSession())
  },
  authSignup: () => {
    if (getMockRole() === 'guest') setMockRole('user')
    return ok(mockSession())
  },
  authToken: () => ok(mockSession()),
  authPasswordForget: () => ok({ ok: true }),
  authPasswordReset: () => ok({ ok: true }),
  authEmailVerify: () => ok({ ok: true }),
  // Mock 세션은 localStorage에 있어서 서버가 지울 것이 없다.
  // 실제 서버는 httpOnly 쿠키를 지운다.
  authLogout: () => ok({ ok: true }),

  meShow: () => {
    const user = store.currentUser()
    return user ? ok(user) : unauthorized()
  },
  meSettingUpdate: () => {
    const user = store.currentUser()
    return user ? ok(user) : unauthorized()
  },
  mePasswordUpdate: () => ok({ ok: true }),
  meLinkShow: () => ok(mockLinkState()),
  meLinkUpdate: () => ok(mockLinkState()),
  uploadsCreate: () =>
    ok({
      id: 'upload-0001',
      url: 'https://static.sacloud.local/uploads/0001.png',
      created_at: FIXTURE_NOW,
    }),

  /* -------------------------------- 검색 -------------------------------- */
  playersByName: ({ params }) => {
    const found = store.findPlayerByName(decodeURIComponent(param(params['name'])))
    return found ? ok(found) : notFound()
  },
  playersSearch: ({ params }) => ok(store.searchPlayers(decodeURIComponent(param(params['q'])))),
  clansByName: ({ params }) => {
    const found = store.findClanByName(decodeURIComponent(param(params['name'])))
    return found ? ok(found) : notFound()
  },
  clansSearch: ({ params }) => ok(store.searchClans(decodeURIComponent(param(params['q'])))),
  leaguesByName: ({ params }) => {
    const found = store.findLeagueByName(decodeURIComponent(param(params['name'])))
    return found ? ok(found) : notFound()
  },
  leaguesSearch: ({ params }) => ok(store.searchLeagues(decodeURIComponent(param(params['q'])))),

  /* ---------------------------- 플레이어 / 클랜 --------------------------- */
  playerShow: ({ params }) => {
    const player = store.getPlayer(param(params['playerId']))
    return player ? ok(player) : notFound()
  },
  playerLeagues: ({ params }) => ok(store.getPlayerLeagues(param(params['playerId']))),
  playerRenew: () => ok({ accepted: true, renewed_at: FIXTURE_NOW, retry_after: null }),
  playerSettingUpdate: ({ params }) => {
    const player = store.getPlayer(param(params['playerId']))
    return player ? ok(player) : notFound()
  },
  clanShow: ({ params }) => {
    const clan = store.getClan(param(params['clanSlug']))
    return clan ? ok(clan) : notFound()
  },
  clanPlayers: ({ params, request }) => {
    const page = store.getClanPlayers(
      param(params['clanSlug']),
      query(request, 'cursor'),
      PAGE_SIZE.DEFAULT,
    )
    return page ? okPage(page) : notFound()
  },
  clanLeagues: ({ params }) => {
    const entries = store.getClanLeagues(param(params['clanSlug']))
    return entries ? ok(entries) : notFound()
  },
  clanRenew: () => ok({ accepted: true, renewed_at: FIXTURE_NOW, retry_after: null }),
  clanSettingUpdate: ({ params }) => {
    const clan = store.getClan(param(params['clanSlug']))
    return clan ? ok(clan) : notFound()
  },

  /* -------------------------------- 리그 -------------------------------- */
  leagueList: ({ request }) => okPage(store.listLeagues(query(request, 'cursor'), PAGE_SIZE.DEFAULT)),
  leagueShow: ({ params }) => {
    const slug = leagueSlugOf(param(params['leagueSlug']))
    const league = slug ? store.getLeague(slug) : null
    return league ? ok(league) : notFound()
  },
  leagueClans: ({ params, request }) => {
    const slug = leagueSlugOf(param(params['leagueSlug']))
    const page = slug
      ? store.getLeagueClans(slug, query(request, 'cursor'), PAGE_SIZE.DEFAULT)
      : null
    return page ? okPage(page) : notFound()
  },
  leagueClanShow: ({ params }) => {
    const slug = leagueSlugOf(param(params['leagueSlug']))
    const detail = slug ? store.getLeagueClanShow(slug, param(params['clanSlug'])) : null
    return detail ? ok(detail) : notFound()
  },
  leagueClanPlayers: ({ params, request }) => {
    const slug = leagueSlugOf(param(params['leagueSlug']))
    const page = slug
      ? store.getLeagueClanPlayers(
          slug,
          param(params['clanSlug']),
          query(request, 'cursor'),
          PAGE_SIZE.DEFAULT,
        )
      : null
    return page ? okPage(page) : notFound()
  },
  leaguePlayerShow: ({ params }) => {
    const slug = leagueSlugOf(param(params['leagueSlug']))
    const detail = slug ? store.getLeaguePlayerDetail(slug, param(params['playerId'])) : null
    return detail ? ok(detail) : notFound()
  },
  leagueRankClans: ({ params, request }) => {
    const leagueId = resolveLeagueId(param(params['leagueId']))
    const division = Number(query(request, 'division') ?? '1')
    const page = leagueId
      ? store.getClanRanks(
          leagueId,
          Number.isFinite(division) && division > 0 ? division : 1,
          query(request, 'cursor'),
          PAGE_SIZE.RANK,
        )
      : null
    return page ? okPage(page) : notFound()
  },
  /**
   * 개인랭킹. `weapon=all|sniper|rifle` 로 무기 축을 고른다 (D-169, 원본에 없는 신규 기능).
   * 파라미터가 없으면 `all` — 기존 동작 그대로다.
   */
  leagueRankPlayers: ({ params, request }) => {
    const leagueId = resolveLeagueId(param(params['leagueId']))
    if (!leagueId) return notFound()
    const cursor = query(request, 'cursor')
    const weapon = parseRankWeapon(query(request, 'weapon'))
    const page =
      weapon === 'all'
        ? store.getPlayerRanks(leagueId, cursor, PAGE_SIZE.RANK)
        : store.getPlayerRanksByWeapon(leagueId, weapon, cursor, PAGE_SIZE.RANK)
    return page ? okPage(page) : notFound()
  },
  leagueRankForm: ({ params, request }) => {
    const leagueId = resolveLeagueId(param(params['leagueId']))
    const form = leagueId
      ? store.getFormTop(leagueId, parseRankWeapon(query(request, 'weapon')))
      : null
    return form ? ok(form) : notFound()
  },
  leaguePlayerMatches: ({ params, request }) => {
    const leagueId = resolveLeagueId(param(params['leagueId']))
    const page = leagueId
      ? store.getLeaguePlayerMatches(
          leagueId,
          param(params['playerId']),
          query(request, 'cursor'),
          PAGE_SIZE.DEFAULT,
        )
      : null
    return page ? okPage(page) : notFound()
  },
  leagueClanMatches: ({ params, request }) => {
    const page = store.getLeagueClanMatches(
      param(params['leagueClanId']),
      query(request, 'cursor'),
      PAGE_SIZE.DEFAULT,
    )
    return page ? okPage(page) : notFound()
  },
  matchShow: ({ params, request }) => {
    const leagueId = resolveLeagueId(param(params['leagueId']))
    // `league_clan_id`는 어느 기록실에서 펼쳤는지를 나타낸다 (결측 처리 재현용, [자체 설계])
    const match = leagueId
      ? store.getMatch(leagueId, param(params['matchId']), query(request, 'league_clan_id'))
      : null
    return match ? ok(match) : notFound()
  },
  leaguePlayerSeasons: ({ params }) => {
    const seasons = store.getLeaguePlayerSeasons(param(params['leaguePlayerId']))
    return seasons ? ok(seasons) : notFound()
  },
  leagueClanSeasons: ({ params }) => {
    const seasons = store.getLeagueClanSeasons(param(params['leagueClanId']))
    return seasons ? ok(seasons) : notFound()
  },
  mapList: () => ok(store.getMaps()),

  /* ------------------------------ 리그 관리 ------------------------------ */
  // Phase 0에서는 계약 형태 확인까지만. 검증·권한·캡차는 Phase 6에서 구현한다.
  leagueCreate: () => {
    const league = store.getLeague('officialmain')
    return league ? ok(league) : notFound()
  },
  leagueSlugAvailability: ({ params }) => {
    const slug = param(params['slug'])
    return ok({ slug, available: !store.isSlugTaken(slug) })
  },
  leagueClanLookup: () => ok(store.sampleClanSummary()),
  leagueInvite: () =>
    ok({
      id: 'invitation-0001',
      clan: store.sampleClanSummary(),
      division: 1,
      invite_url: 'https://sacloud.local/invite/0001',
      created_at: FIXTURE_NOW,
      expires_at: null,
    }),
  /* 관리자가 클랜을 티어/부리그에 직접 등록한다 (D-165).
     Mock 은 저장하지 않는다 — 계약 형태만 돌려준다 (Phase 5~6 규칙). */
  leagueClanRegister: ({ params }) => {
    const slug = leagueSlugOf(param(params['leagueSlug']))
    const page = slug ? store.getLeagueClans(slug, null, PAGE_SIZE.DEFAULT) : null
    const first = page?.items[0]
    return first ? ok(first) : notFound()
  },
  leagueClanDivisionUpdate: ({ params }) => {
    const slug = leagueSlugOf(param(params['leagueSlug']))
    const page = slug ? store.getLeagueClans(slug, null, PAGE_SIZE.DEFAULT) : null
    const first = page?.items[0]
    return first ? ok(first) : notFound()
  },
  leagueClanSuccession: () => ok({ ok: true }),
  leagueClanDelete: ({ params }) =>
    ok({
      league_clan_id: param(params['leagueClanId']),
      delete_requested_at: FIXTURE_NOW,
      // 삭제대기 후 1주일 뒤 자동 삭제 (관측)
      deletes_at: new Date(Date.parse(FIXTURE_NOW) + 7 * 24 * 60 * 60 * 1000).toISOString(),
    }),
  leagueClanExpel: () => ok({ ok: true }),
  leagueContentUpdate: ({ params }) => {
    const slug = leagueSlugOf(param(params['leagueSlug']))
    const league = slug ? store.getLeague(slug) : null
    return league ? ok(league) : notFound()
  },

  /* ------------------------------- 게시판 -------------------------------- */
  boardList: ({ request }) =>
    okPage(
      store.listBoards({
        category: query(request, 'category') ?? 'free',
        cursor: query(request, 'cursor'),
        size: PAGE_SIZE.BOARD,
        type: query(request, 'type'),
        q: query(request, 'q'),
      }),
    ),
  boardShow: ({ params }) => {
    const board = store.getBoard(param(params['boardId']))
    return board ? ok(board) : notFound()
  },
  boardCreate: () => {
    const board = firstBoard()
    return board ? ok(board) : notFound()
  },
  boardUpdate: ({ params }) => {
    const board = store.getBoard(param(params['boardId']))
    return board ? ok(board) : notFound()
  },
  boardDelete: () => ok({ ok: true }),
  boardVote: ({ params }) => {
    const board = store.getBoard(param(params['boardId']))
    return board ? ok(board) : notFound()
  },
  commentList: ({ request }) => ok(store.listComments(query(request, 'board_id') ?? '')),
  commentCreate: () => {
    const comment = firstComment()
    return comment ? ok(comment) : notFound()
  },
  commentUpdate: ({ params }) => {
    const comment = findComment(param(params['commentId']))
    return comment ? ok(comment) : notFound()
  },
  commentDelete: () => ok({ ok: true }),
  commentVote: ({ params }) => {
    const comment = findComment(param(params['commentId']))
    return comment ? ok(comment) : notFound()
  },
}

/* -------------------------------------------------------------------------- */
/* 보조                                                                         */
/* -------------------------------------------------------------------------- */

function mockSession() {
  return {
    access_token: 'mock-access-token',
    refresh_token: 'mock-refresh-token',
    expires_at: FIXTURE_NOW,
    // 세션 스위치가 정한 사용자. guest면 로그인 직후이므로 일반 회원으로 본다.
    user: store.currentUser() ?? store.toUser(store.sampleUser()),
  }
}

function mockLinkState() {
  const user = store.toUser(store.sampleUser())
  return {
    linked: user.player !== null,
    player: user.player,
    linked_at: user.player ? FIXTURE_NOW : null,
  }
}

function firstBoard() {
  const board = dataset.boards[0]
  return board ? store.getBoard(board.id) : null
}

function firstComment() {
  const comment = dataset.comments[0]
  if (!comment) return null
  return store.listComments(comment.boardId)[0] ?? null
}

function findComment(commentId: string) {
  const comment = dataset.comments.find((entry) => entry.id === commentId)
  if (!comment) return null
  const list = store.listComments(comment.boardId)
  return (
    list.find((entry) => entry.id === commentId) ??
    list.flatMap((entry) => entry.comments).find((entry) => entry.id === commentId) ??
    null
  )
}

/* -------------------------------------------------------------------------- */
/* MSW 핸들러                                                                   */
/* -------------------------------------------------------------------------- */

export function createHandlers(baseUrl: string = DEFAULT_API_BASE_URL) {
  return endpointList.map((endpoint) => {
    const resolver = resolvers[endpoint.key]
    const url = `${baseUrl}${endpoint.path}`
    switch (endpoint.method) {
      case 'GET':
        return http.get(url, resolver)
      case 'POST':
        return http.post(url, resolver)
      case 'PUT':
        return http.put(url, resolver)
      case 'DELETE':
        return http.delete(url, resolver)
    }
  })
}

export const handlers = createHandlers()
