/**
 * ★표본 대조★ — DB 에 들어간 값이 ★원본이 준 값 그대로★ 인가 (2026-09-04 · Part 1).
 *
 * ⚠ 파일과 대조하는 것이 아니라 ★원본(3rd.supply)에 다시 물어서★ 대조한다.
 *   파일과 맞는 것은 「우리가 파일을 잘 옮겼다」까지만 증명한다.
 *   사장님 조건은 «실제 선수 표본을 여러 명 골라 ★3rd.supply 원본과★ 대조» 다.
 *
 * ★읽기만 한다.★ 요청은 표본 수만큼(선수당 1건)이다.
 */
import { prisma } from '@sacloud/db'
import { supplyGet } from '../lib/supplyClient.js'
import { sourceSeasonNumber } from '@sacloud/contract'

/** 카드 수가 많은 것·적은 것을 섞어 뽑은 표본 (dev/sample 로 고른 값) */
const SAMPLE = ['1006959881', '1007042754', '1308627283', '722026904', '1879197401', '990890895']

interface SrcRow {
  season: number
  rank: number | null
  rank_count: number | null
  win: number | null
  lose: number | null
  win_rate: number | null
  kill: number | null
  death: number | null
  kd_rate: number | null
}

let allOk = true
for (const sourcePlayerId of SAMPLE) {
  const lp = await prisma.leaguePlayer.findFirst({
    where: { player: { sourcePlayerId }, league: { slug: 'supply' } },
    select: { id: true, sourceLeaguePlayerId: true, player: { select: { name: true } } },
  })
  if (!lp || !lp.sourceLeaguePlayerId) {
    console.info(`\n✘ ${sourcePlayerId} — DB 에서 못 찾았다`)
    allOk = false
    continue
  }

  /* ★원본에 다시 묻는다★ */
  const res = await supplyGet<SrcRow[]>(`/leagueplayers/${lp.sourceLeaguePlayerId}/seasons`)
  const src = new Map((res.data ?? []).map((r) => [r.season, r]))

  const ours = await prisma.leaguePlayerSeason.findMany({
    where: { leaguePlayerId: lp.id },
    select: {
      season: true, rank: true, rankCount: true, win: true, lose: true,
      winRate: true, kill: true, death: true, kdRate: true,
      sourceLeagueSlug: true, legacyLeaguePlayerId: true, legacyPlayerId: true,
      seasonRef: { select: { number: true, seasonType: true } },
    },
    orderBy: { season: 'desc' },
  })

  console.info(`\n── ${lp.player.name} (원본 player ${sourcePlayerId} · leaguePlayer ${lp.sourceLeaguePlayerId})`)
  console.info(`   원본 카드 ${src.size}장 · DB 카드 ${ours.length}장`)
  if (src.size !== ours.length) { console.info('   ✘ 장수가 다르다'); allOk = false }

  for (const row of ours) {
    const s = src.get(row.season)
    if (!s) { console.info(`   ✘ 시즌 ${row.season} — 원본에 없다 (지어낸 카드다)`); allOk = false; continue }
    const same =
      row.rank === s.rank && row.rankCount === s.rank_count &&
      row.win === s.win && row.lose === s.lose && row.winRate === s.win_rate &&
      row.kill === s.kill && row.death === s.death && row.kdRate === s.kd_rate
    const league = row.sourceLeagueSlug === 'supply'
    const internal = row.seasonRef.number
    const backToSource = sourceSeasonNumber(internal)
    const numbering = backToSource === row.season
    const ok = same && league && numbering
    if (!ok) allOk = false
    console.info(
      `   ${ok ? '✔' : '✘'} 원본시즌 ${row.season} → 내부 ${internal}` +
        ` · ${s.rank_count ?? '?'}명중 ${s.rank ?? '?'}위 · ${s.win ?? '?'}승 ${s.lose ?? '?'}패` +
        ` · 승률 ${s.win_rate ?? '?'}% · 킬뎃 ${s.kd_rate ?? '?'}%` +
        ` · 출처 ${row.sourceLeagueSlug}${same ? '' : '  ★값이 다르다★'}${numbering ? '' : '  ★번호가 안 맞다★'}`,
    )
  }
}
console.info(`\n${allOk ? '★표본 전부 원본과 일치★' : '★★어긋난 것이 있다★★'}`)
await prisma.$disconnect()
