/**
 * 화면 경로 조립 — **id를 잘못 넣는 사고를 막기 위한 한 곳**.
 *
 * 실제로 겪은 버그: 참여중인 리그 카드가 기록실 경로에 `league_player_id`(리그 참가 레코드 ID)를
 * 넣어서, 클릭하면 API가 404를 돌려주고 화면이 **빈 페이지**가 됐다.
 * 두 값은 둘 다 문자열 숫자라 타입으로는 걸리지 않는다.
 *
 * 그래서 경로를 문자열 템플릿으로 흩어 쓰지 않고 여기서만 만든다.
 * 인자 이름이 곧 "무엇을 넣어야 하는지"의 문서다.
 *
 *   playerId       — `Player.id` (전역 플레이어 ID, 예: 500013135)
 *   leaguePlayerId — `LeaguePlayer.id` (리그 참가 레코드 ID, 예: 6115) ← 경로에 쓰지 않는다
 */

/** 플레이어 기본정보 `/player/{playerId}` */
export function playerPath(playerId: string): string {
  return `/player/${playerId}`
}

/**
 * 리그 기록실 `/league/{slug}/player/{playerId}`.
 *
 * API 경로가 `/leagues/:leagueSlug/players/:playerId`이므로 **playerId**를 넣어야 한다.
 */
export function leaguePlayerPath(leagueSlug: string, playerId: string): string {
  return `/league/${leagueSlug}/player/${playerId}`
}

/** 리그 지난시즌 `/league/{slug}/player/{playerId}/season` */
export function leaguePlayerSeasonPath(leagueSlug: string, playerId: string): string {
  return `${leaguePlayerPath(leagueSlug, playerId)}/season`
}

/** 리그 클랜 기록실 `/league/{slug}/clan/{clanSlug}` — 클랜은 **슬러그**를 쓴다 */
export function leagueClanPath(leagueSlug: string, clanSlug: string): string {
  return `/league/${leagueSlug}/clan/${clanSlug}`
}
