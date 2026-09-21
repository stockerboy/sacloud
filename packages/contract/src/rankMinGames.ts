/**
 * ★★랭킹에 올리는 최소 판수 — 한 곳에서만 정한다★★ (2026-09-20)
 *
 * ── 왜 여기 있나
 *
 *   이 값이 ★세 곳★ 에 흩어져 있었다 —
 *
 *     워커 (점수 매기기)   PL 25 · IPL 40   (`scoreLadderBuild`)
 *     화면 (목록 거르기)   ★15 고정★        (`rankings.ts`)
 *     화면 (배지 목록)     문턱 없음        (`badgeOwners.ts`)
 *
 *   그래서 사장님이 화면에서 잡으셨다 —
 *
 *   > 「이건 아니잖아 진짜 말이되냐 ★DF가 저 등수인게..?★」
 *     PL 개인랭킹 15위에 ★17판에 승률 35%★ 인 선수가 서 있었다.
 *
 *   ★점수를 못 매긴 사람이 목록에는 들어온 것★ 이다. 두 문턱이 갈라져서다.
 *
 * ── 리그마다 다른 이유 (2026-09-20 실측)
 *
 *   ```
 *              40판+   30판+   25판+   20판+
 *     PL       ★69★    100     110     127
 *     IPL       528     691     820     932     ← 8배 차이
 *   ```
 *
 *   PL 에 40 을 걸면 ★69명★ 이라 목록이 너무 얇고, 얇으면 화면이
 *   ★옛 Elo 래더로 떨어진다★ — Elo 는 판수를 안 봐서 17판짜리가 올라온다.
 *
 * ⚠ ★0 으로 두면 그 리그는 문턱이 꺼진다★ (CLAUDE.md 1-4).
 * ⚠ 여기 없는 리그는 기본값을 쓴다.
 */

/** 옛 기본 문턱 — 사장님: 「몇판 하지도 않은 애들이 100위 안에 있는 게 젤 싫어」 */
export const RANK_MIN_GAMES_DEFAULT_V1 = 40

/**
 * ★★2026-09-21 — 문턱을 걷었다★★ (사장님: 「★순위 전부 다 공개해★」)
 *
 *   기본정보 카드에 IPL 이 ★「순위 없음」★ 으로 떠 있었다 — 39전이라
 *   문턱(40판)을 한 판 차이로 못 넘겨서였다. ★기록이 있는데 등수가 없었다.★
 *
 * ⚠ ★옛 값은 위에 `_V1` 로 남겼다★ (`CLAUDE.md` 1-4).
 *   되돌리려면 아래를 `RANK_MIN_GAMES_DEFAULT_V1` 로 바꾸고 `BY_LEAGUE_V1` 을
 *   `BY_LEAGUE` 자리에 도로 쓰면 된다.
 */
export const RANK_MIN_GAMES_DEFAULT = 0

/**
 * 리그마다 다른 문턱.
 *
 * `supply`(PL) 를 25 로 둔 이유 — 110명이면 다섯 쪽짜리 목록이라 옛 래더로
 * 안 떨어진다. 20 이면 127명이지만 ★20판은 사장님이 싫어하신 그 자리★ 다.
 */
export const BY_LEAGUE_V1: Readonly<Record<string, number>> = {
  supply: 25,
  /*
   * ★C1★ (2026-09-20 밤) — 열 클랜끼리 한 경기만 모은 리그라 판이 적다.
   *
   *   실측 — 40판+ ★58명★ · 25판+ ★120명★.
   *   58명이면 ★세 쪽★ 이라 PL 과 같은 병(옛 Elo 로 떨어짐)이 난다.
   *   PL 과 같은 25 로 둔다.
   */
  c1: 25,
}

/** ★지금은 리그마다 다른 문턱을 두지 않는다★ — 전부 공개다 (2026-09-21) */
const BY_LEAGUE: Readonly<Record<string, number>> = {}

/** 그 리그에서 랭킹에 올리는 최소 판수. ★0 이면 문턱이 없다★ */
export function rankMinGamesOf(leagueSlug: string | null | undefined): number {
  if (leagueSlug === null || leagueSlug === undefined) return RANK_MIN_GAMES_DEFAULT
  return BY_LEAGUE[leagueSlug] ?? RANK_MIN_GAMES_DEFAULT
}
