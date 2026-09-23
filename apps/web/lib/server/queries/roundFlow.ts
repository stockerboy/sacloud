/**
 * ★라운드 흐름★ — 배틀로그 원문(`BarracksBattleLogRaw`) 한 응답 → 계약 `RoundFlow` (2026-09-23 사장님).
 *
 * ── 왜 여기서 그 자리에서 펴나 (워커가 미리 접지 않고)
 *   경기 하나에 원문 행이 1~2개뿐이고(`matchKey` 인덱스), 펴는 일은 순수 함수 하나다.
 *   표(스키마)를 늘리지 않아도 되고 VPS 잡을 새로 돌리지 않아도 된다.
 *   ⚠ 「리그 전체를 읽는」 길이 아니다 — D-238 이 죽인 것은 리그 전체 스캔이었다. 이건 한 경기다.
 *
 * ── 슬롯(red/blue) 짝짓기
 *   응답의 `team_no` 는 클랜 번호지 진영이 아니다 (D-184). `MatchClanHexV2.tally.teamNo` 가
 *   이미 「이 경기에서 그 클랜의 team_no」 를 갖고 있으니 그걸로 red 슬롯의 팀 번호를 안다.
 *   그 행이 없으면(육각을 아직 못 만든 경기) 응답의 `teamList` 로 `clan_no` 를 잇고
 *   `BarracksClanAlias`… 까지는 안 간다 — ★모르면 null★ (D-106 · 사장님 답 ⑤ 「비움」).
 *
 * ── 한 응답만 쓴다
 *   `win_flag` 가 응답 주인 기준이라 두 응답을 합치면 승패가 전부 null 이 된다 (`roundFlow.ts` 머리).
 */
import { prisma } from '@sacloud/db'
import { clanByTeamNo, roundFlowOf, type RoundFlowEvent } from '@sacloud/nexon'
import type { RoundFlow } from '@sacloud/contract'

interface RawShape {
  battleLog?: RoundFlowEvent[]
  teamList?: { team_no?: string | null; clan_no?: string | null }[]
}
const rawOf = (payload: unknown): RawShape => {
  if (typeof payload !== 'object' || payload === null) return {}
  const holder = payload as { raw?: unknown }
  const raw = typeof holder.raw === 'object' && holder.raw !== null ? holder.raw : payload
  return raw as RawShape
}

export async function matchRoundFlow(input: {
  sourceMatchId: string | null
  redLeagueClanId: string
  blueLeagueClanId: string
  /** 경기 상세가 이미 읽은 `MatchClanHexV2` 두 행 — 왕복을 안 늘린다 */
  hexRows: readonly { leagueClanId: string; tally: unknown }[]
}): Promise<RoundFlow | null> {
  if (!input.sourceMatchId) return null
  const teamNoOf = (leagueClanId: string): string | null => {
    const row = input.hexRows.find((r) => r.leagueClanId === leagueClanId)
    const tally = row?.tally as { teamNo?: unknown } | null | undefined
    return typeof tally?.teamNo === 'string' ? tally.teamNo : null
  }
  const redTeamNo = teamNoOf(input.redLeagueClanId)
  const blueTeamNo = teamNoOf(input.blueLeagueClanId)
  if (redTeamNo === null || blueTeamNo === null || redTeamNo === blueTeamNo) return null

  const rows = await prisma.barracksBattleLogRaw.findMany({
    where: { matchKey: input.sourceMatchId, status: 'ok' },
    select: { subject: true, payload: true },
    orderBy: { fetchedAt: 'asc' },
    take: 4,
  })
  for (const row of rows) {
    const raw = rawOf(row.payload)
    const events = raw.battleLog ?? []
    if (events.length === 0) continue
    const clanByTeam = clanByTeamNo(raw.teamList ?? [])
    const teamNo = [...clanByTeam.entries()].find(([, no]) => no === row.subject)?.[0]
    if (teamNo === undefined) continue
    if (teamNo !== redTeamNo && teamNo !== blueTeamNo) continue
    const flow = roundFlowOf({ events, teamNo })
    if (flow === null) continue
    /* 응답 주인(`mine`)이 어느 슬롯인가 */
    const mineSide: 'red' | 'blue' = teamNo === redTeamNo ? 'red' : 'blue'
    const foeSide: 'red' | 'blue' = mineSide === 'red' ? 'blue' : 'red'
    const slot = (t: 'mine' | 'foe' | null): 'red' | 'blue' | null => (t === null ? null : t === 'mine' ? mineSide : foeSide)
    return {
      team_size: { red: mineSide === 'red' ? flow.teamSize.mine : flow.teamSize.foe, blue: mineSide === 'blue' ? flow.teamSize.mine : flow.teamSize.foe },
      second_half_from: flow.secondHalfFrom,
      rounds: flow.rounds.map((r) => ({
        round: r.round,
        start: r.start,
        end: r.end,
        defence: slot(r.defence),
        winner: slot(r.winner),
        deaths: r.deaths.map((d) => ({ at: d.at, side: slot(d.team) as 'red' | 'blue' })),
      })),
    }
  }
  return null
}
