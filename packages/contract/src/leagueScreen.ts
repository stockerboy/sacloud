/**
 * **리그가 무엇을 보여 주는가** — 한 곳에 모아 둔 설정 (2026-09-01 사용자 지시).
 *
 * ── 왜 이 파일이 생겼나
 *   사용자가 리그마다 다른 것을 요구했다.
 *
 *   > "리그홈은 다 없애고 클랜랭킹이랑 개인랭킹만 해"
 *   > "우리는 리그 세개뿐이다 SPL IPL 10🏔️ · 열산은 킬뎃(킬/데스) 승률 (전승패) 이것만"
 *
 *   D-204 는 *"리그별로 칸을 감추는 분기를 만들지 마라"* 고 했다. 그 규칙의 뜻은
 *   **분기를 화면마다 흩뿌리지 말라**는 것이다. 그래서 화면에 `if (slug === 'sanply')`
 *   를 뿌리는 대신 규칙을 여기 한 곳에 모으고, 화면은 이 표를 읽기만 한다.
 *   새 리그가 생기면 여기 한 줄이면 되고, 되돌리려면 여기 한 줄을 지우면 된다.
 *
 * ── 지금 있는 리그는 셋뿐이다
 *   ```
 *   SPL    supply   클랜랭킹 · 개인랭킹 · 래더 있음
 *   IPL    nolink   클랜랭킹 · 개인랭킹 · 래더 있음 (티어별)
 *   10🏔️  sanply   개인랭킹만 · **래더도 순위도 없다**
 *   ```
 *   `daerule`(대룰)은 준비중이라 어느 화면에도 걸지 않는다 (D-178).
 */

/** 랭킹 표에서 보여 줄 칸 */
export interface RankColumns {
  /** 순위 숫자 */
  rank: boolean
  /** 승률 (아래에 `N승 N패`) */
  winRate: boolean
  /** 킬뎃 (아래에 평균킬) — 클랜랭킹에는 원래 없는 칸이다 */
  kd: boolean
  /** 래더 점수 */
  rating: boolean
}

export interface LeagueScreenSpec {
  /** 클랜랭킹 화면이 있는가. 없으면 탭에서도 빠진다 */
  clanRank: boolean
  /** 개인랭킹 표의 칸 */
  playerColumns: RankColumns
  /** 클랜랭킹 표의 칸 */
  clanColumns: RankColumns
}

/** 공식 래더가 있는 리그의 기본값 — 지금까지의 화면 그대로다 */
const WITH_LADDER: LeagueScreenSpec = {
  clanRank: true,
  playerColumns: { rank: true, winRate: true, kd: true, rating: true },
  /* 클랜랭킹에는 킬뎃 칸이 원래 없다 */
  clanColumns: { rank: true, winRate: true, kd: false, rating: true },
}

/**
 * `10🏔️`(`sanply`) — **킬뎃과 승률만** 보여 준다 (2026-09-01 사용자 지시).
 *
 * 비공식이라 래더가 없고, 래더가 없으니 순위도 없다.
 * 클랜 화면은 D-245 에서 이미 감췄다 — **데이터는 지우지 않았고 화면에서만 빠진다.**
 *
 * ⚠ 알(`docs/EGG_SYSTEM_SPEC.md`)이 승률·킬뎃을 덮는다. 그래서 알을 깨기 전에는
 *   이 표에 닉네임만 남는다. 그것은 알 시스템이 의도한 모습이지만, 래더·순위까지
 *   빠지면 **덮이지 않는 칸이 하나도 없다.** 사용자에게 확인이 필요한 지점이다.
 */
const NO_LADDER: LeagueScreenSpec = {
  clanRank: false,
  playerColumns: { rank: false, winRate: true, kd: true, rating: false },
  clanColumns: { rank: false, winRate: true, kd: false, rating: false },
}

const BY_SLUG: Readonly<Record<string, LeagueScreenSpec>> = {
  supply: WITH_LADDER,
  nolink: WITH_LADDER,
  sanply: NO_LADDER,
}

/** 이 리그가 보여 줄 화면과 칸. 모르는 slug 는 «래더 있는 리그» 로 본다 */
export function leagueScreen(slug: string): LeagueScreenSpec {
  return BY_SLUG[slug] ?? WITH_LADDER
}

/**
 * 리그를 누르면 갈 곳 (2026-09-01 사용자 지시 — *"리그홈 … 없애버리고 누르면 바로 랭킹"*).
 *
 * 클랜랭킹이 있으면 클랜랭킹, 없으면 개인랭킹이다.
 * **리그홈 라우트는 지우지 않았다** — 들어오는 링크가 있으면 여기로 보낼 뿐이다
 * (`CLAUDE.md` 10-4).
 */
export function leagueLandingPath(slug: string): string {
  return leagueScreen(slug).clanRank
    ? `/league/${slug}/rank/clan`
    : `/league/${slug}/rank/player`
}
