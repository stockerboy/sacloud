/**
 * 지난시즌 엔드포인트 탐색용 일회성 조사 도구 (개발 전용).
 *
 * 운영 파이프라인이 아니다. `docs/` 에 응답 모양을 적기 위한 소량 호출만 한다.
 */
import { supplyGet, supplyRoutes, SupplyApiError } from '../lib/supplyClient.js'

async function tryPath(path: string, show = 4000): Promise<unknown | null> {
  try {
    const r = await supplyGet<unknown>(path)
    console.log(`OK   ${path}`)
    console.log(JSON.stringify(r).slice(0, show))
    return r
  } catch (e) {
    const status = e instanceof SupplyApiError ? e.status : 'ERR'
    console.log(`${status}  ${path}`)
    return null
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const leagueSlug = args[0] ?? 'supply'
  const playerIds = (args[1] ?? '168409011,318904732,1560601152').split(',')

  const league = await supplyGet<{ id: number; name: string; slug: string }>(
    supplyRoutes.league(leagueSlug),
  )
  console.log(`league ${leagueSlug} id=${league.data.id}`)

  for (const pid of playerIds) {
    const lp = (await tryPath(`/leagues/${leagueSlug}/players/${pid}`, 300)) as {
      data: { id: number; player: { name: string } }
    } | null
    if (!lp) continue
    const lpId = lp.data.id
    console.log(`  player ${pid} → leaguePlayerId ${lpId} (${lp.data.player.name})`)
    await tryPath(`/leagueplayers/${lpId}/seasons`, 6000)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
