import { prisma } from '@sacloud/db'
import { PLAYER_SUMMARY_SELECT } from '../mappers'

/**
 * ★★그 리그 명부에 없지만 실제로 뛴 사람★★ (2026-09-09 · 사장님 지적)
 *
 * > «한사람이 여러리그에 참가할 수 있는데 SPL사람도 IPL게임하면서 랭크에 오를 수 있어
 * >  (…) 무조건 해결해야돼»  — 사장님, 2026-09-09
 *
 * ── ★무엇이 문제였나★ (운영 실측 2026-09-09)
 *   ```
 *   IPL 경기를 뛰었는데 IPL 명부에 없는 사람   ★502명★
 *     그중 SPL 선수         28명
 *     그중 10mountain 선수  59명
 *     어느 리그에도 없음    425명
 *   ```
 *   전부 ★시즌0(9/3) 이전에만 뛴 사람★ 이다. 집계(`season0Apply`)가 창 안의 선수만
 *   명부에 만들기 때문에 창 밖에서만 뛴 사람은 줄이 없다.
 *
 *   그래서 ★경기 상세 명단에는 이름이 뜨는데 누르면 404★ 였다.
 *
 *   ⚠ ★시즌0 안에서는 이런 일이 없다★ — 실측 2,864개 조합 중 빠진 것 0건.
 *     두 리그를 뛴 275명, 세 리그를 뛴 23명 모두 각 리그 랭킹에 올라 있다.
 *
 * ── ★명부에 줄을 만들지 않는 이유★
 *   만들면 ★0판짜리 502명이 기본점수 3000 으로 개인랭킹 한가운데 끼어든다.★
 *   랭킹은 그대로 두고 ★화면만 열어 준다.★ 순위는 `null` 이다 —
 *   ★없는 순위를 지어내지 않는다★ (`CLAUDE.md` 2장 1번).
 *
 * ── 돌려주는 것
 *   진짜 명부 줄과 ★같은 모양★ 의 임시 줄이다. 누적 칸은 전부 0 이지만
 *   화면의 전적·최근 경기는 이 값이 아니라 ★경기에서 직접 세므로★ (D-176) 제대로 나온다.
 *   그 리그에서 한 판도 안 뛴 사람이면 `null` — ★진짜로 없는 사람★ 이다.
 */
export async function absentLeaguePlayer(leagueId: string, playerId: string) {
  const playedHere = await prisma.matchPlayerStat.findFirst({
    where: { playerId, match: { leagueId, supersededAt: null } },
    select: { id: true },
  })
  if (!playedHere) return null

  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { ...PLAYER_SUMMARY_SELECT, position: true, note: true },
  })
  if (!player) return null

  return {
    /* 명부 줄이 없으니 ★선수 id 를 그대로 쓴다★. cuid 끼리라 진짜 명부 id 와 안 겹친다 */
    id: playerId,
    leagueId,
    clanId: null as string | null,
    /* 래더가 없다. 0 으로 두고 화면이 「기록 없음」으로 그린다 */
    rating: 0,
    win: 0,
    lose: 0,
    kill: 0,
    death: 0,
    assist: 0,
    headshot: 0,
    mvpCount: 0,
    placement: false,
    player,
    clan: null,
  }
}
