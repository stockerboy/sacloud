/**
 * ★랭킹을 손으로 조율해 보는 자료★ (2026-09-20 사장님)
 *
 * > 「IPL 개인랭킹이랑 PL개인랭킹 ★내가 싹 조율 할 수 있게★ 아티팩트로 줘
 * >  ★통합에서 조정하고 조정한거 바탕으로★ 스나만 모아서 랭킹보고
 * >  리플만모아서 보고 이런식으로 할 수 있게 해줘」
 *
 * ```
 * pnpm --filter @sacloud/worker exec tsx src/dev/rankTuneExport.ts
 * ```
 *
 * ── 무엇을 내나
 *
 *   리그마다 선수 한 줄씩 — ★여섯 축의 백분위★ 와 ★무게를 매길 재료★ 를 전부.
 *   화면(아티팩트)이 무게를 바꿔 가며 ★그 자리에서 다시 줄을 세운다.★
 *
 * ⚠ ★점수를 여기서 다시 계산하지 않는다★ — 이미 잡이 접어 둔 값을 그대로 낸다.
 *   여기서 새로 셈하면 화면과 갈라진다.
 * ⚠ ★백분위가 `null` 인 축은 그대로 `null`★ 이다 — 0으로 우기지 않는다 (D-106).
 *
 * 아무것도 저장하지 않는다 — 읽기만 한다.
 */
import { prisma } from '@sacloud/db'
import { AXIS_WEIGHT, HEX_BASE, HEX_SPREAD, HEX_SHRINK_K } from '../lib/playerHexScore.js'

const LEAGUES = ['nolink', 'supply'] as const

interface Row {
  name: string
  clan: string | null
  /** 0 라플 · 1 스나 · null 모름 */
  weapon: number | null
  games: number
  winRate: number | null
  /** 여섯 축의 ★백분위★ (0~100). 못 잰 축은 null */
  pct: Record<string, number | null>
  /** 지금 점수와 등수 — 견주는 기준이다 */
  score: number | null
  rank: number | null
  /** 상위권 클랜 보정 (×100) */
  clanBonus: number
  tierFactor: number
  shrink: number
}

const out: Record<string, Row[]> = {}

for (const slug of LEAGUES) {
  const league = await prisma.league.findFirst({ where: { slug }, select: { id: true } })
  if (!league) continue

  const rows = await prisma.leaguePlayerHex.findMany({
    where: { leaguePlayer: { leagueId: league.id, placement: false } },
    select: {
      weapon: true,
      games: true,
      winRate: true,
      savePct: true,
      duelPct: true,
      carryPct: true,
      openingPct: true,
      burstPct: true,
      outnumberedPct: true,
      winRatePct: true,
      score: true,
      scoreRank: true,
      clanBonus: true,
      tierFactor: true,
      shrink: true,
      leaguePlayer: {
        select: {
          player: { select: { name: true } },
          clan: { select: { name: true } },
        },
      },
    },
  })

  out[slug] = rows.map((r) => ({
    name: r.leaguePlayer.player.name,
    clan: r.leaguePlayer.clan?.name ?? null,
    weapon: r.weapon,
    games: r.games,
    winRate: r.winRate,
    /*
     * ⚠ ★칸 이름이 축 이름과 다르다★ — DB 는 옛 축 이름(`carry`·`opening`·`burst`)을
     *   그대로 쓰고, 화면은 지금 이름(`chance`·`safe`·`gap`)으로 부른다.
     *   ★여기 한 곳에서만 옮긴다★ — 두 곳에서 옮기면 갈라진다.
     */
    pct: {
      save: r.savePct,
      duel: r.duelPct,
      chance: r.carryPct,
      safe: r.openingPct,
      gap: r.burstPct,
      outnumbered: r.outnumberedPct,
      winRate: r.winRatePct,
    },
    score: r.score,
    rank: r.scoreRank,
    clanBonus: r.clanBonus,
    tierFactor: r.tierFactor,
    shrink: r.shrink,
  }))
}

console.info(
  JSON.stringify(
    {
      /* 화면이 「지금 값」 으로 되돌릴 수 있게 함께 낸다 */
      weights: AXIS_WEIGHT,
      base: HEX_BASE,
      spread: HEX_SPREAD,
      shrinkK: HEX_SHRINK_K,
      leagues: out,
    },
    null,
    1,
  ),
)
await prisma.$disconnect()
