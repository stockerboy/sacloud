/**
 * 재구성된 경기를 **사람이 읽을 수 있게** 풀어 쓴다 (D-133 검수용).
 *
 * 숫자 요약만으로는 "정말 맞게 복원됐는가"를 판단할 수 없다.
 * 경기 하나를 골라 넥슨이 준 것 · 라인업이 보탠 것 · 최종 판정을 나란히 본다.
 *
 * 읽기 전용이다. DB에 아무것도 쓰지 않는다.
 *
 *   pnpm --filter @sacloud/worker nexon explain-matches [--league supply] [--limit 5]
 *   pnpm --filter @sacloud/worker nexon explain-matches --match-id <ID>[,<ID>]
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { prisma } from '@sacloud/db'
import { log } from '../lib/log.js'

interface LineupMatch {
  id: string
  red: [number | null, string | null, number | null, number | null][]
  blue: [number | null, string | null, number | null, number | null][]
}

function loadLineups(): Map<string, LineupMatch> {
  const path = join(process.cwd(), '..', '..', 'packages/db/data/supply-official-matches.json')
  const snapshot = JSON.parse(readFileSync(path, 'utf8')) as { matches: LineupMatch[] }
  return new Map(snapshot.matches.map((match) => [match.id, match]))
}

export async function explainMatches(input: {
  leagueSlug: string
  sourceMatchIds?: readonly string[]
  limit?: number
}): Promise<void> {
  const lineups = loadLineups()
  const league = await prisma.league.findUniqueOrThrow({
    where: { slug: input.leagueSlug },
    select: { id: true },
  })

  const matches = await prisma.match.findMany({
    where: {
      leagueId: league.id,
      ...(input.sourceMatchIds?.length ? { sourceMatchId: { in: [...input.sourceMatchIds] } } : {}),
    },
    orderBy: { startAt: 'desc' },
    take: input.sourceMatchIds?.length ? undefined : (input.limit ?? 5),
    select: {
      id: true,
      sourceMatchId: true,
      startAt: true,
      official: true,
      winnerSide: true,
      participantCompleteness: true,
      evidenceConfidence: true,
      map: { select: { name: true } },
      redClan: { select: { id: true, clan: { select: { name: true } } } },
      blueClan: { select: { id: true, clan: { select: { name: true } } } },
      stats: {
        orderBy: { side: 'asc' },
        select: {
          side: true,
          kill: true,
          death: true,
          assist: true,
          participantRole: true,
          ratingUpdate: true,
          matchTimeClanName: true,
          matchTimeClanSource: true,
          player: { select: { name: true } },
        },
      },
    },
  })

  for (const match of matches) {
    const staging = await prisma.nexonMatch.findFirst({
      where: { sourceMatchId: match.sourceMatchId ?? '' },
      select: {
        participantCount: true,
        reconstruction: true,
        winnerMembersConfirmed: true,
        loserMembersConfirmed: true,
        winnerMercenariesConfirmed: true,
        loserMercenariesConfirmed: true,
        participants: { select: { userName: true } },
      },
    })
    const lineup = lineups.get(match.sourceMatchId ?? '')
    const lineupNames = lineup
      ? [...lineup.red, ...lineup.blue].map((row) => row[1]).filter(Boolean).length
      : 0
    const nexonNames = new Set((staging?.participants ?? []).map((row) => row.userName))
    const evidence = (staging?.reconstruction ?? {}) as Record<string, unknown>

    log('')
    log(`━━ ${match.sourceMatchId}  ${match.startAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`)
    log(`   맵 ${match.map.name} · ${match.redClan.clan.name}(red) vs ${match.blueClan.clan.name}(blue) · 승리 ${match.winnerSide}`)
    log(
      `   넥슨 상세 참가자 ${staging?.participantCount ?? 0}명 · 3rd.supply 라인업 ${lineupNames}명 · ` +
        `우리가 확정한 참가자 ${match.stats.length}명 (확인수준 ${match.participantCompleteness ?? '-'} · ${match.evidenceConfidence ?? '-'})`,
    )
    log(
      `   본클랜원 승/패 ${staging?.winnerMembersConfirmed ?? 0}/${staging?.loserMembersConfirmed ?? 0} · ` +
        `용병 ${staging?.winnerMercenariesConfirmed ?? 0}/${staging?.loserMercenariesConfirmed ?? 0} · ` +
        `팀식별 보조증거 ${evidence.sideEvidenceUsed ?? '없음(넥슨으로 확정)'}`,
    )
    log(`   판정 ${match.official ? '공식 — 래더 반영' : '비공식 — 래더 미반영'}`)
    for (const stat of match.stats) {
      const fromNexon = nexonNames.has(stat.player.name) ? '넥슨상세' : '목록관측'
      log(
        `     ${stat.side.padEnd(4)} ${stat.player.name.padEnd(16)} ` +
          `${stat.kill}/${stat.death}/${stat.assist}  ${stat.participantRole === 'member' ? '본클랜원' : '용병  '}  ` +
          `당시 ${stat.matchTimeClanName ?? '알수없음'}(${stat.matchTimeClanSource ?? '-'})  ` +
          `래더 ${stat.ratingUpdate ?? '-'}  [${fromNexon}]`,
      )
    }
  }
}
