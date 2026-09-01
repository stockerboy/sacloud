import { z } from 'zod'
import { apiResponse, paginatedResponse } from './response'
import { EggBrokenList } from './egg'
import {
  AccountLinkState,
  AuthSession,
  Board,
  BoardListItem,
  Clan,
  ClanLeagueEntry,
  ClanMasterClaimState,
  ClanPlayer,
  ClanRankRow,
  ClanSummary,
  Comment,
  FormTop,
  GameMap,
  HomeTop,
  Infos,
  League,
  LeagueClan,
  LeagueClanDeleteState,
  LeagueClanSeason,
  LeagueClanShow,
  LeagueInvitation,
  LeagueListItem,
  LeaguePlayerDetail,
  LeaguePlayerSeason,
  LeagueSummary,
  MatchDetail,
  MatchListItem,
  Ok,
  Player,
  PlayerLeagueEntry,
  PlayerRankRow,
  PlayerSearchItem,
  RemoteConfigs,
  RenewResult,
  SlugAvailability,
  TitleVerificationState,
  Upload,
  User,
} from './entities'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

/**
 * 엔드포인트 출처 구분.
 * - `observed`: `docs/3rd-supply-structure.md`에서 실제로 관측된 엔드포인트
 * - `designed`: 화면 동작은 관측됐으나 경로·본문이 확인되지 않아 우리가 설계한 것 [미확인]
 */
export type EndpointOrigin = 'observed' | 'designed'

export interface EndpointDef {
  method: HttpMethod
  /** `:param` 형식의 경로 패턴 (base URL 제외) */
  path: string
  origin: EndpointOrigin
  description: string
  /** 응답 스키마 (공통 래퍼 포함) */
  response: z.ZodTypeAny
  /** 쿼리 파라미터 이름 목록 */
  query?: readonly string[]
}

const CURSOR = ['cursor'] as const

export const endpoints = {
  /* -------------------------------- 공통 -------------------------------- */
  infos: {
    method: 'GET',
    path: '/infos',
    origin: 'observed',
    description: '부트스트랩: configs, 게시판 categories, 로그인 유저',
    response: apiResponse(Infos),
  },
  remoteConfigs: {
    method: 'GET',
    path: '/remote_configs',
    origin: 'observed',
    description: '원격 설정 (구조 [미확인])',
    response: apiResponse(RemoteConfigs),
  },
  /**
   * 메인페이지 리그별 개인랭킹 TOP3 (`docs/SITE_SPEC_V2.md` 3절).
   *
   * 원본에는 없다 — 사용자가 새로 요구한 화면이라 `designed` 다.
   * **레지스트리에 반드시 있어야 한다.** 여기 없으면 MSW 핸들러가 생기지 않고,
   * `providers.tsx` 의 `onUnhandledRequest: 'bypass'` 때문에 경고 한 줄 없이
   * 실제 라우트로 새어 나가 Mock 모드에서 DB 를 부른다 (교차검증 [심각 1]).
   */
  homeTop: {
    method: 'GET',
    path: '/home/top',
    origin: 'designed',
    description: '메인 SPL/IPL/YSL 개인랭킹 TOP3',
    response: apiResponse(HomeTop),
  },

  /* --------------------------------- 알 --------------------------------- */
  /**
   * 깨진 알 목록 (`docs/EGG_SYSTEM_SPEC.md`).
   *
   * 로그인하지 않아도 부른다 — 「누구 알이 깨졌나」는 화면에 이미 보이는 것이다.
   * 근거(누가·왜)는 여기 담지 않는다. 그건 관리자 전용이다.
   */
  eggsBroken: {
    method: 'GET',
    path: '/eggs/broken',
    origin: 'designed',
    description: '깨진 알 목록 (선수 id · 클랜 slug)',
    response: apiResponse(EggBrokenList),
  },

  /* -------------------------------- 인증 -------------------------------- */
  authLogin: {
    method: 'POST',
    path: '/auth/login',
    origin: 'observed',
    description: '로그인',
    response: apiResponse(AuthSession),
  },
  authSignup: {
    method: 'POST',
    path: '/auth/signup',
    origin: 'observed',
    description: '회원가입 (아이디 + 비밀번호 · D-252)',
    response: apiResponse(AuthSession),
  },
  authToken: {
    method: 'POST',
    path: '/auth/token',
    origin: 'observed',
    description: '토큰 갱신',
    response: apiResponse(AuthSession),
  },
  authPasswordForget: {
    method: 'POST',
    path: '/auth/password/forget',
    origin: 'observed',
    description: '비밀번호 재설정 메일 발송',
    response: apiResponse(Ok),
  },
  authPasswordReset: {
    method: 'POST',
    path: '/auth/password/reset',
    origin: 'designed',
    description: '비밀번호 재설정 (화면은 관측, 경로는 자체 설계)',
    response: apiResponse(Ok),
  },
  authEmailVerify: {
    method: 'POST',
    path: '/auth/email/verify',
    origin: 'designed',
    description: '이메일 인증 (화면은 관측, 경로는 자체 설계)',
    response: apiResponse(Ok),
  },
  authLogout: {
    method: 'POST',
    path: '/auth/logout',
    origin: 'designed',
    // 원본에 로그아웃 엔드포인트가 있는지는 [미확인]이다(GNB의 `로그아웃` 링크만 관측).
    // 우리는 세션을 httpOnly 쿠키로 두기 때문에 서버가 지워줘야 한다.
    description: '로그아웃 — 세션 쿠키 삭제 + 리프레시 토큰 폐기 [자체 설계]',
    response: apiResponse(Ok),
  },

  /* ------------------------------ 마이페이지 ----------------------------- */
  meShow: {
    method: 'GET',
    path: '/me',
    origin: 'observed',
    description: '내 정보',
    response: apiResponse(User),
  },
  meSettingUpdate: {
    method: 'PUT',
    path: '/me/setting',
    origin: 'observed',
    description: '내 정보 수정',
    response: apiResponse(User),
  },
  mePasswordUpdate: {
    method: 'PUT',
    path: '/me/password',
    origin: 'observed',
    description: '비밀번호 변경',
    response: apiResponse(Ok),
  },
  meLinkShow: {
    method: 'GET',
    path: '/me/link',
    origin: 'observed',
    description: '서든어택 계정 연동 상태',
    response: apiResponse(AccountLinkState),
  },
  meLinkUpdate: {
    method: 'PUT',
    path: '/me/link',
    origin: 'observed',
    description: '서든어택 계정 연동/해제',
    response: apiResponse(AccountLinkState),
  },
  /* --- 서든어택 계정 소유권 증명 (칭호 `[용병]`, 2026-09-01) ---------------
     전부 **로그인 필요**하고 개인 정보다. 공개 캐시(`okPublic`)를 붙이지 않는다. */
  meTitleVerificationShow: {
    method: 'GET',
    path: '/me/title-verification',
    origin: 'designed',
    description: '칭호 소유권 증명 상태',
    response: apiResponse(TitleVerificationState),
  },
  meTitleVerificationCheck: {
    method: 'POST',
    path: '/me/title-verification',
    origin: 'designed',
    description: '칭호 소유권 증명 — 닉네임을 넣고 지금 칭호를 확인한다',
    response: apiResponse(TitleVerificationState),
  },
  meTitleVerificationCancel: {
    method: 'DELETE',
    path: '/me/title-verification',
    origin: 'designed',
    description: '진행 중인 칭호 증명 접기',
    response: apiResponse(TitleVerificationState),
  },
  uploadsCreate: {
    method: 'POST',
    path: '/uploads',
    origin: 'observed',
    description: '이미지 업로드',
    response: apiResponse(Upload),
  },

  /* -------------------------------- 검색 -------------------------------- */
  playersByName: {
    method: 'GET',
    path: '/players/name/:name',
    origin: 'observed',
    description: '닉네임 정확일치 조회 (검색 제출 시 사용)',
    response: apiResponse(PlayerSearchItem),
  },
  playersSearch: {
    method: 'GET',
    path: '/players/search/:q',
    origin: 'observed',
    description: '플레이어 자동완성',
    response: apiResponse(z.array(PlayerSearchItem)),
  },
  clansByName: {
    method: 'GET',
    path: '/clans/name/:name',
    origin: 'observed',
    description: '클랜명 정확일치 조회',
    response: apiResponse(ClanSummary),
  },
  clansSearch: {
    method: 'GET',
    path: '/clans/search/:q',
    origin: 'observed',
    description: '클랜 자동완성',
    response: apiResponse(z.array(ClanSummary)),
  },
  leaguesByName: {
    method: 'GET',
    path: '/leagues/name/:name',
    origin: 'observed',
    description: '리그명 정확일치 조회',
    response: apiResponse(LeagueSummary),
  },
  leaguesSearch: {
    method: 'GET',
    path: '/leagues/search/:q',
    origin: 'observed',
    description: '리그 자동완성',
    response: apiResponse(z.array(LeagueSummary)),
  },

  /* ---------------------------- 플레이어 / 클랜 --------------------------- */
  playerShow: {
    method: 'GET',
    path: '/players/:playerId',
    origin: 'observed',
    description: '플레이어 기본정보',
    response: apiResponse(Player),
  },
  playerLeagues: {
    method: 'GET',
    path: '/players/:playerId/leagues',
    origin: 'observed',
    description: '참여중인 리그별 요약',
    response: apiResponse(z.array(PlayerLeagueEntry)),
  },
  playerRenew: {
    method: 'POST',
    path: '/players/:playerId/renew',
    origin: 'designed',
    description: '`정보갱신` 요청 (버튼은 관측, 경로는 자체 설계)',
    response: apiResponse(RenewResult),
  },
  playerSettingUpdate: {
    method: 'PUT',
    path: '/players/:playerId/setting',
    origin: 'designed',
    description: '플레이어 설정 (화면 상세 [미확인])',
    response: apiResponse(Player),
  },
  clanShow: {
    method: 'GET',
    path: '/clans/:clanSlug',
    origin: 'observed',
    description: '클랜 기본정보',
    response: apiResponse(Clan),
  },
  clanPlayers: {
    method: 'GET',
    path: '/clans/:clanSlug/players',
    origin: 'observed',
    description: '클랜원 목록 (커서)',
    response: paginatedResponse(ClanPlayer),
    query: CURSOR,
  },
  clanLeagues: {
    method: 'GET',
    path: '/clans/:clanSlug/leagues',
    origin: 'observed',
    description: '클랜의 리그별 성적',
    response: apiResponse(z.array(ClanLeagueEntry)),
  },
  clanRenew: {
    method: 'POST',
    path: '/clans/:clanSlug/renew',
    origin: 'designed',
    description: '`전적갱신` 요청 (버튼은 관측, 경로는 자체 설계)',
    response: apiResponse(RenewResult),
  },
  clanSettingUpdate: {
    method: 'PUT',
    path: '/clans/:clanSlug/setting',
    origin: 'designed',
    description: '클랜 설정 (화면 상세 [미확인])',
    response: apiResponse(Clan),
  },
  /* --- 클랜 마스터 인증 (스크린샷 1장 · 사람이 심사, 2026-09-01 · D-253) -----
     전부 **로그인 필요**하고 개인 정보다. 공개 캐시(`okPublic`)를 붙이지 않는다.

     ⚠ 사진 자체를 내려 주는 경로(`/clans/:clanSlug/master-claim/image`)는 여기에 없다.
     응답이 JSON 이 아니라 **바이트**라 `apiResponse(...)` 로 감쌀 수 없다.
     화면은 `image_url` 을 `<img src>` 에 그대로 물린다. */
  clanMasterClaimShow: {
    method: 'GET',
    path: '/clans/:clanSlug/master-claim',
    origin: 'designed',
    description: '클랜 마스터 인증 — 내 신청 상태',
    response: apiResponse(ClanMasterClaimState),
  },
  clanMasterClaimCreate: {
    method: 'POST',
    path: '/clans/:clanSlug/master-claim',
    origin: 'designed',
    description: '클랜 마스터 인증 — 인게임 스크린샷 1장 제출',
    response: apiResponse(ClanMasterClaimState),
  },
  clanMasterClaimCancel: {
    method: 'DELETE',
    path: '/clans/:clanSlug/master-claim',
    origin: 'designed',
    description: '클랜 마스터 인증 — 심사중인 신청 접기',
    response: apiResponse(ClanMasterClaimState),
  },

  /* -------------------------------- 리그 -------------------------------- */
  leagueList: {
    method: 'GET',
    path: '/leagues',
    origin: 'observed',
    description: '리그 목록 (대표 클랜 마크 포함)',
    response: paginatedResponse(LeagueListItem),
    query: CURSOR,
  },
  leagueShow: {
    method: 'GET',
    path: '/leagues/:leagueSlug',
    origin: 'observed',
    description: '리그 상세 (maps, player_limits, division_count, description)',
    response: apiResponse(League),
  },
  leagueClans: {
    method: 'GET',
    path: '/leagues/:leagueSlug/clans',
    origin: 'observed',
    description: '리그 참여 클랜 (커서)',
    response: paginatedResponse(LeagueClan),
    query: CURSOR,
  },
  leagueClanShow: {
    method: 'GET',
    path: '/leagues/:leagueSlug/clans/:clanSlug/show',
    origin: 'observed',
    description: '리그 내 클랜 상세 (요약 + 사이드 통계)',
    response: apiResponse(LeagueClanShow),
  },
  leagueClanPlayers: {
    method: 'GET',
    path: '/leagues/:leagueSlug/clans/:clanSlug/players',
    origin: 'designed',
    description: '리그 참여 클랜원 목록 (화면은 관측, 경로는 자체 설계)',
    response: paginatedResponse(PlayerRankRow),
    query: CURSOR,
  },
  leaguePlayerShow: {
    method: 'GET',
    path: '/leagues/:leagueSlug/players/:playerId',
    origin: 'observed',
    description: '리그 내 플레이어 상세 (match_summary 포함)',
    response: apiResponse(LeaguePlayerDetail),
  },
  leagueRankClans: {
    method: 'GET',
    path: '/leagues/:leagueId/ranks/clans',
    origin: 'observed',
    description: '클랜랭킹 (부리그별). 배치 완료 대상만, 1시간 주기 갱신',
    response: paginatedResponse(ClanRankRow),
    query: ['division', 'cursor'],
  },
  /**
   * 전체 통합 클랜 래더 — 부리그도 Tier 도 무시하고 rating 순 (D-104).
   *
   * ── 라우트는 원래부터 있었다. **레지스트리에 늦게 등록했을 뿐이다** (2026-09-01)
   *   `app/api/leagues/[league]/ranks/overall/route.ts` 는 Phase 11 부터 살아 있었는데
   *   화면이 부르지 않아 계약에 없었다. 메인 신전 히어로가 **IPL 1등 한 곳**을 필요로
   *   하면서 처음으로 화면이 부르게 됐고, 그래서 여기 올렸다 —
   *   등록해야 MSW 핸들러가 생기고 Mock 모드에서도 같은 값이 나온다.
   *
   * ── `limit` 을 새로 받는다
   *   히어로는 **1건**만 있으면 된다. 43건을 전부 받아 화면에서 최대값을 찾는 방식은
   *   쓰지 않는다 (D-238 — 그런 «작으니까 괜찮겠지» 가 쌓여서 운영이 500 이 났다).
   *   `limit` 이 없으면 예전처럼 전부 준다. **기존 호출자를 깨지 않는다.**
   */
  leagueRankOverall: {
    method: 'GET',
    path: '/leagues/:leagueId/ranks/overall',
    origin: 'designed',
    description: '전체 통합 클랜 래더 (부리그·Tier 무시). `limit=N` 이면 상위 N건만',
    response: apiResponse(z.array(ClanRankRow)),
    query: ['limit'],
  },
  leagueRankPlayers: {
    method: 'GET',
    path: '/leagues/:leagueId/ranks/players',
    origin: 'observed',
    description: '개인랭킹. `weapon=all|sniper|rifle` 로 무기 축을 고른다 (D-169, 신규)',
    response: paginatedResponse(PlayerRankRow),
    query: [...CURSOR, 'weapon'],
  },
  leagueRankForm: {
    method: 'GET',
    path: '/leagues/:leagueId/ranks/form',
    /* 원본에 없는 신규 기능이라 경로도 우리가 설계했다 (D-169) */
    origin: 'designed',
    description: '폼 TOP3 — 그날(KST) 얻은 래더 증감 합 상위 3명. 무기 축별',
    response: apiResponse(FormTop),
    query: ['weapon'],
  },
  leaguePlayerMatches: {
    method: 'GET',
    path: '/leagues/:leagueId/players/:playerId/matches',
    origin: 'observed',
    description: '개인 기록실 매치 목록 (커서)',
    response: paginatedResponse(MatchListItem),
    query: CURSOR,
  },
  leagueClanMatches: {
    method: 'GET',
    path: '/leagueclans/:leagueClanId/matches',
    origin: 'observed',
    description: '클랜 기록실 매치 목록 (커서)',
    response: paginatedResponse(MatchListItem),
    query: CURSOR,
  },
  matchShow: {
    method: 'GET',
    path: '/leagues/:leagueId/matches/:matchId',
    origin: 'observed',
    description: '경기 상세 (red/blue 전원 스탯)',
    response: apiResponse(MatchDetail),
  },
  leaguePlayerSeasons: {
    method: 'GET',
    path: '/leagueplayers/:leaguePlayerId/seasons',
    origin: 'observed',
    description: '개인 지난시즌',
    response: apiResponse(z.array(LeaguePlayerSeason)),
  },
  leagueClanSeasons: {
    method: 'GET',
    path: '/leagueclans/:leagueClanId/seasons',
    origin: 'designed',
    description: '클랜 지난시즌 (화면은 관측, 경로는 자체 설계)',
    response: apiResponse(z.array(LeagueClanSeason)),
  },
  mapList: {
    method: 'GET',
    path: '/maps',
    origin: 'designed',
    description: '리그 생성 폼의 맵 선택 목록 (실제 맵 목록은 [미확인])',
    response: apiResponse(z.array(GameMap)),
  },

  /* ------------------------------ 리그 관리 ------------------------------ */
  leagueCreate: {
    method: 'POST',
    path: '/leagues',
    origin: 'designed',
    description: '리그 만들기 (계정 연동 필요 + 캡차)',
    response: apiResponse(League),
  },
  leagueSlugAvailability: {
    method: 'GET',
    path: '/leagues/slug/:slug/availability',
    origin: 'designed',
    description: '리그 영문이름 중복 확인',
    response: apiResponse(SlugAvailability),
  },
  leagueClanLookup: {
    method: 'POST',
    path: '/leagues/:leagueSlug/clan_lookup',
    origin: 'designed',
    description: '넥슨 병영수첩 클랜 주소로 클랜 조회 (초대 전 미리보기)',
    response: apiResponse(ClanSummary),
  },
  leagueInvite: {
    method: 'POST',
    path: '/leagues/:leagueSlug/invitations',
    origin: 'designed',
    description: '클랜 초대 + 초대링크 발급',
    response: apiResponse(LeagueInvitation),
  },
  leagueClanRegister: {
    method: 'POST',
    path: '/leagues/:leagueSlug/clans',
    origin: 'designed',
    description: '리그 관리자가 클랜을 부리그/티어에 직접 등록 (무소속리그 티어 편성 · D-165)',
    response: apiResponse(LeagueClan),
  },
  leagueClanDivisionUpdate: {
    method: 'PUT',
    path: '/leagues/:leagueSlug/clans/:leagueClanId/division',
    origin: 'designed',
    description: '부리그 변경',
    response: apiResponse(LeagueClan),
  },
  leagueClanSuccession: {
    method: 'POST',
    path: '/leagues/:leagueSlug/clans/:leagueClanId/succession',
    origin: 'designed',
    description: '클랜변경(승계) 요청 — 새 클랜 마스터의 수락 필요',
    response: apiResponse(Ok),
  },
  leagueClanDelete: {
    method: 'DELETE',
    path: '/leagues/:leagueSlug/clans/:leagueClanId',
    origin: 'designed',
    description: '클랜삭제 (삭제대기 → 1주일 후 자동 삭제)',
    response: apiResponse(LeagueClanDeleteState),
  },
  leagueClanExpel: {
    method: 'POST',
    path: '/leagues/:leagueSlug/clans/:leagueClanId/expel',
    origin: 'designed',
    description: '추방 (`추방합니다` 입력 확인 필요, 되돌릴 수 없음)',
    response: apiResponse(Ok),
  },
  leagueContentUpdate: {
    method: 'PUT',
    path: '/leagues/:leagueSlug/content',
    origin: 'designed',
    description: '리그정보·리그소개 편집',
    response: apiResponse(League),
  },

  /* ------------------------------- 게시판 -------------------------------- */
  boardList: {
    method: 'GET',
    path: '/boards',
    origin: 'observed',
    description: '글 목록 (공지는 category=notice로 별도 호출해 상단 고정)',
    response: paginatedResponse(BoardListItem),
    query: ['category', 'cursor', 'type', 'q'],
  },
  boardShow: {
    method: 'GET',
    path: '/boards/:boardId',
    origin: 'observed',
    description: '글 상세',
    response: apiResponse(Board),
  },
  boardCreate: {
    method: 'POST',
    path: '/boards',
    origin: 'observed',
    description: '글 작성 (5분당 1글 rate limit + 캡차)',
    response: apiResponse(Board),
  },
  boardUpdate: {
    method: 'PUT',
    path: '/boards/:boardId',
    origin: 'observed',
    description: '글 수정',
    response: apiResponse(Board),
  },
  boardDelete: {
    method: 'DELETE',
    path: '/boards/:boardId',
    origin: 'observed',
    description: '글 삭제 (비로그인 글은 게시글 비밀번호 필요)',
    response: apiResponse(Ok),
  },
  boardVote: {
    method: 'POST',
    path: '/boards/:boardId/votes',
    origin: 'designed',
    description: '글 추천/비추천',
    response: apiResponse(Board),
  },
  commentList: {
    method: 'GET',
    path: '/comments',
    origin: 'observed',
    description: '댓글 목록 (1단계 대댓글 중첩)',
    response: apiResponse(z.array(Comment)),
    query: ['board_id'],
  },
  commentCreate: {
    method: 'POST',
    path: '/comments',
    origin: 'observed',
    description: '댓글/대댓글 작성',
    response: apiResponse(Comment),
  },
  commentUpdate: {
    method: 'PUT',
    path: '/comments/:commentId',
    origin: 'observed',
    description: '댓글 수정',
    response: apiResponse(Comment),
  },
  commentDelete: {
    method: 'DELETE',
    path: '/comments/:commentId',
    origin: 'observed',
    description: '댓글 삭제 (내용만 가리고 행은 남김)',
    response: apiResponse(Ok),
  },
  commentVote: {
    method: 'POST',
    path: '/comments/:commentId/votes',
    origin: 'designed',
    description: '댓글 추천/비추천',
    response: apiResponse(Comment),
  },
} satisfies Record<string, EndpointDef>

export type EndpointKey = keyof typeof endpoints

export const endpointKeys = Object.keys(endpoints) as EndpointKey[]

export const endpointList: ReadonlyArray<EndpointDef & { key: EndpointKey }> = endpointKeys.map(
  (key) => ({ key, ...(endpoints[key] as EndpointDef) }),
)

/** `/players/:playerId` + { playerId: '1' } → `/players/1` */
export function buildPath(path: string, params: Record<string, string | number> = {}): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, (_match, name: string) => {
    const value = params[name]
    if (value === undefined) {
      throw new Error(`경로 파라미터 누락: ${name} (${path})`)
    }
    return encodeURIComponent(String(value))
  })
}

/** 엔드포인트 식별 문자열 (`GET /players/:playerId`) — 핸들러 커버리지 대조에 사용 */
export function endpointSignature(def: Pick<EndpointDef, 'method' | 'path'>): string {
  return `${def.method} ${def.path}`
}
