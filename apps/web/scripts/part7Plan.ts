/**
 * ★★집계 잡을 지금 돌리면 실측과 맞는가★★ (2026-09-06 · Part 7 조사). ★읽기만 한다.★
 *
 * `season0Apply --leagues <slug>` 를 ★dry-run★ 으로 돌리면 계획 파일이 남는다.
 * 그 안에는 ★그 잡이 계산한 선수별 값★ 이 그대로 들어 있다.
 *
 * ```
 * 계획 == 실측   ★공식은 맞다.★ DB 에 저장된 값이 옛것일 뿐이다 (= 데이터가 밀림)
 * 계획 != 실측   ★공식/집계가 틀렸다.★
 * ```
 */
import { readFileSync } from 'node:fs'
import { prisma } from '@sacloud/db'
import { SEASON0_FROM, SEASON0_TO, SEASON0_ORIGINS } from '../lib/server/queries/season0Scope'

interface PlanPlayer {
  playerId: string
  rating: number
  win: number
  lose: number
  kill: number
  death: number
  placement: boolean
  placementPlayed: number
}

async function main(): Promise<void> {
  const file = process.argv[2]
  const slug = process.argv[3] ?? 'nolink'
  if (!file) {
    console.error('★계획 파일 경로가 필요하다★')
    process.exit(1)
  }
  const plan = JSON.parse(readFileSync(file, 'utf8')) as {
    confirmed: boolean
    plans: Array<{ slug: string; players: PlanPlayer[] }>
  }
  const one = plan.plans.find((p) => p.slug === slug)
  if (!one) {
    console.error(`★계획에 ${slug} 이 없다★`)
    process.exit(1)
  }
  console.info(`══ 계획(dry-run 계산값) vs 실측 vs DB 저장값 — ${slug} ══`)
  console.info(`  계획 파일 confirmed=${plan.confirmed} · 선수 ${one.players.length}명\n`)

  const league = await prisma.league.findUniqueOrThrow({ where: { slug }, select: { id: true } })
  const live = new Map<string, { win: number; lose: number; kill: number; death: number }>()
  for (const r of await prisma.$queryRawUnsafe<
    Array<{ playerId: string; win: number; lose: number; kill: number; death: number }>
  >(`
    SELECT ps."playerId",
           COUNT(*) FILTER (WHERE ps.side = m."winnerSide")::int  AS win,
           COUNT(*) FILTER (WHERE ps.side <> m."winnerSide")::int AS lose,
           COALESCE(SUM(ps.kill),0)::int  AS kill,
           COALESCE(SUM(ps.death),0)::int AS death
      FROM "MatchPlayerStat" ps JOIN "Match" m ON m.id = ps."matchId"
     WHERE m."leagueId" = $1 AND m."startAt" >= $2 AND m."startAt" < $3
       AND m."supersededAt" IS NULL
       AND (m."redRatingUpdate" IS NOT NULL OR m.origin = ANY($4::text[]))
     GROUP BY 1`, league.id, SEASON0_FROM, SEASON0_TO ?? new Date('2100-01-01'), [...SEASON0_ORIGINS]))
    live.set(r.playerId, r)

  const stored = new Map<string, { win: number; lose: number; kill: number; death: number }>()
  for (const r of await prisma.leaguePlayer.findMany({
    where: { leagueId: league.id },
    select: { playerId: true, win: true, lose: true, kill: true, death: true },
  }))
    stored.set(r.playerId, r)

  let planVsLive = 0
  let storedVsLive = 0
  let planVsStored = 0
  const samples: string[] = []
  for (const p of one.players) {
    const l = live.get(p.playerId)
    const s = stored.get(p.playerId)
    const eqLive = l ? p.win === l.win && p.lose === l.lose && p.kill === l.kill && p.death === l.death : false
    const storedEqLive = s && l ? s.win === l.win && s.lose === l.lose && s.kill === l.kill && s.death === l.death : false
    const planEqStored = s ? p.win === s.win && p.lose === s.lose && p.kill === s.kill && p.death === s.death : false
    if (!eqLive) planVsLive += 1
    if (!storedEqLive) storedVsLive += 1
    if (!planEqStored) planVsStored += 1
    if (!eqLive && samples.length < 5 && l) {
      samples.push(
        `      계획 ${p.win}승 ${p.lose}패 ${p.kill}킬 ${p.death}데스 · ` +
          `실측 ${l.win}/${l.lose}/${l.kill}/${l.death} · ` +
          `저장 ${s ? `${s.win}/${s.lose}/${s.kill}/${s.death}` : '-'}`,
      )
    }
  }

  console.info(`  ★계획 ≠ 실측★   ${planVsLive}명   ← 0 이면 ★공식은 맞다★`)
  console.info(`  저장 ≠ 실측      ${storedVsLive}명   ← 이게 지금 화면에 보이는 어긋남`)
  console.info(`  계획 ≠ 저장      ${planVsStored}명   ← 지금 돌리면 바뀔 선수 수`)
  if (samples.length) {
    console.info('\n  계획이 실측과 다른 표본')
    for (const s of samples) console.info(s)
  }

  const onlyLive = [...live.keys()].filter((id) => !one.players.some((p) => p.playerId === id))
  console.info(`\n  실측에는 있는데 계획에 없는 선수 ${onlyLive.length}명`)

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
