import { prisma } from '@sacloud/db'
import type { MatchListItem } from '@sacloud/contract'
import { CLAN_HEX_V2_CONFIG } from '@sacloud/contract'
import {
  MATCH_SELECT,
  leagueClanIdsOf,
  loadCurrentClanContext,
  loadLeagueClanContext,
  playerIdsOf,
  toMatchListItem,
} from './matches'
import { todayWindow } from './todayTopMatchup'

/**
 * ★그 날 가장 치열했던 경기★ (2026-09-24 사장님 「이거 없애고 경기분석에서 라운드별 분석 그거를
 * 여기 펼쳐놔줘(그 날 하루 가장 치열하게 경기한 게임 - 라운드가 많을수록 치열)」).
 *
 * ── 「치열」을 무엇으로 재나
 *   ★라운드 수★ 다. 오래 끈 경기일수록 팽팽했다는 뜻이다(사장님 정의 그대로).
 *   라운드 수는 5분마다 도는 육각형 집계(`MatchClanHexV2.rounds`)에 이미 있다 — 경기마다
 *   배틀로그 원문을 다시 펴서 세지 않는다(그건 상세 화면 하나 열 때나 하는 무거운 일이다).
 *   ★막 들어온 경기는 육각이 아직 안 잡혀 후보에서 빠진다★ — 몇 분 늦는 정도라
 *   「오늘 가장 치열했던 경기」 라는 말 자체에는 문제가 없다.
 *
 * ⚠ 하루의 경계는 「상대전적」(`todayTopMatchup.ts`)과 ★같은 창★(KST 15:00) 이다 —
 *   다른 기준을 쓰면 이 자리에 있던 두 카드가 서로 다른 「오늘」 을 말하게 된다.
 */
export async function todayHeatedMatch(
  leagueId: string,
  now: Date = new Date(),
): Promise<MatchListItem | null> {
  const { from, to } = todayWindow(now)

  const top = await prisma.matchClanHexV2.findFirst({
    where: {
      formulaVersion: CLAN_HEX_V2_CONFIG.formulaVersion,
      match: {
        leagueId,
        supersededAt: null,
        startAt: { gte: from, lt: to },
        /* ★등록된 클랜끼리만★ — 「상대전적」 과 같은 조건 (D-146) */
        redClan: { clan: { active: true } },
        blueClan: { clan: { active: true } },
      },
    },
    orderBy: [{ rounds: 'desc' }, { builtAt: 'desc' }],
    select: { matchId: true, rounds: true },
  })
  /* 라운드 0(집계 전·기록 없음)은 「치열했다」 고 할 수 없다 */
  if (!top || top.rounds <= 0) return null

  const match = await prisma.match.findUnique({ where: { id: top.matchId }, select: MATCH_SELECT })
  if (!match) return null

  const [clans, current] = await Promise.all([
    loadLeagueClanContext(leagueId, leagueClanIdsOf([match])),
    loadCurrentClanContext(leagueId, playerIdsOf([match])),
  ])

  /* ★보는 쪽을 정하지 않는다★ — 이 카드는 특정 클랜 편이 아니다. 목록과 같이 레드를 기본으로 둔다 */
  return toMatchListItem(match, match.redLeagueClanId, null, clans, current)
}
