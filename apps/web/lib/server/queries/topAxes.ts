/**
 * ★부문별 1위★ — 홈 검색창 밑 판 (2026-09-12 사장님)
 *
 * > «개인 6각 특성 스나수까지 총 7개부문 1위 (마크) 닉네임 성공률 퍼센티지
 * >  ex 스나싸움 성공률 60퍼센트 (…) 스나수면 스코프 표시»
 *
 * ── 왜 일곱 줄인가
 *   여섯 축인데 ★싸움만 무기별로 둘★ 이다 — 스나싸움(스나수 안)·샷싸움(라플수 안).
 *   그 두 값은 잣대가 아예 달라 한 줄로 묶을 수 없다
 *   (`apps/worker/src/lib/playerHexScore.ts` 의 모집단 주석).
 *
 * ── 어디서 읽나
 *   등수는 잡(`player-hex-build`)이 이미 접어 뒀다 — `saveRank = 1` 인 줄을 찾으면 된다.
 *   여기서 다시 줄 세우지 않는다. 화면과 잡이 다른 답을 내면 안 된다.
 *
 * ── 못 잰 축
 *   1위가 없으면 ★그 줄을 아예 안 보낸다.★ 빈 칸을 만들지 않는다 (D-106).
 */
import { prisma } from '@sacloud/db'
import { PLAYER_HEX_AXIS_ORDER, playerHexLabelOf, type TopAxisLeader } from '@sacloud/contract'
import {
  CLAN_SUMMARY_SELECT,
  PLAYER_SUMMARY_SELECT,
  toClanSummaryOrNull,
  toPlayerSummary,
} from '../mappers'

/** 캐리력만 «판당 킬» 이고 나머지는 % 다 (`PlayerHexAxis.unit` 과 같은 규칙) */
const PER_GAME_AXES: ReadonlySet<string> = new Set(['carry'])

/** 화면에 세울 차례 — 싸움 둘을 앞에 두고 나머지는 계약 차례 그대로 */
const SLOTS: readonly { key: string; weapon: 0 | 1 | null }[] = [
  { key: 'duel', weapon: 1 },
  { key: 'duel', weapon: 0 },
  ...PLAYER_HEX_AXIS_ORDER.filter((key) => key !== 'duel').map((key) => ({ key, weapon: null })),
]

const SELECT = {
  weapon: true,
  save: true,
  duel: true,
  carry: true,
  opening: true,
  burst: true,
  outnumbered: true,
  saveTotal: true,
  duelTotal: true,
  carryTotal: true,
  openingTotal: true,
  burstTotal: true,
  outnumberedTotal: true,
  leaguePlayer: {
    select: {
      player: { select: PLAYER_SUMMARY_SELECT },
      clan: { select: CLAN_SUMMARY_SELECT },
    },
  },
} as const

export async function leagueTopAxes(leagueId: string): Promise<TopAxisLeader[]> {
  const rows = await Promise.all(
    SLOTS.map(async (slot) => {
      const found = await prisma.leaguePlayerHex.findFirst({
        where: {
          leaguePlayer: { leagueId, placement: false },
          /* 싸움은 그 무기 사람만 본다 — 등수 자체가 무기 안에서 매겨진 값이다 */
          ...(slot.weapon === null ? {} : { weapon: slot.weapon }),
          [`${slot.key}Rank`]: 1,
        },
        select: SELECT,
      })
      if (!found) return null
      const value = (found as unknown as Record<string, number | null>)[slot.key]
      if (value === null || value === undefined) return null
      const total = (found as unknown as Record<string, number | null>)[`${slot.key}Total`] ?? null
      return {
        key: slot.key,
        /* 이름도 무기를 따라간다 — 스나싸움 / 샷싸움 */
        label: playerHexLabelOf(slot.key as never, slot.weapon),
        weapon: slot.weapon,
        player: toPlayerSummary(found.leaguePlayer.player),
        clan: toClanSummaryOrNull(found.leaguePlayer.clan),
        value,
        unit: PER_GAME_AXES.has(slot.key) ? ('per_game' as const) : ('percent' as const),
        total,
      }
    }),
  )
  return rows.filter((row): row is TopAxisLeader => row !== null)
}
