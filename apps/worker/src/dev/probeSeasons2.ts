/** 개인 랭킹 목록에서 leaguePlayerId 를 한꺼번에 얻을 수 있는지 조사 (개발 전용) */
import { supplyGet, SupplyApiError } from '../lib/supplyClient.js'

async function tryPath(path: string, show = 1200): Promise<void> {
  try {
    const r = await supplyGet<unknown>(path)
    console.log(`OK   ${path}`)
    console.log(JSON.stringify(r).slice(0, show))
  } catch (e) {
    console.log(`${e instanceof SupplyApiError ? e.status : 'ERR'}  ${path}`)
  }
}

async function main(): Promise<void> {
  for (const p of [
    '/leagues/1/ranks/players',
    '/leagues/1/ranks/players?division=1',
    '/leagues/supply/ranks/players',
    '/leagues/1/players',
    '/leagues/supply/players',
    '/leagueclans/61/players',
    '/leagues/supply/clans/ddorr/players',
  ]) {
    await tryPath(p)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
