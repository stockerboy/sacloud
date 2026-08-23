/**
 * 기준 경기 대조 — 3rd.supply 공식리그 경기가 Nexon Open API에 존재하는가 (D-126 조사).
 *
 * 3rd.supply 공개 페이지에서 확보한 **제3보급창고 5vs5 실경기**의 match_id를
 * Open API `/match-detail`로 직접 조회한다.
 *
 * 목적은 다음을 확정하는 것이다.
 *   · 그 경기가 Open API에 **존재하는가**
 *   · `match_type` 실제 값
 *   · `match_map` 실제 표기 (제3보급창고인가, 다른 이름인가)
 *   · 참가자가 **10명**인가
 *
 * 읽기 전용이다. DB에 아무것도 쓰지 않는다.
 */
import { NexonClient, readNexonConfig, hasApiKey } from '@sacloud/nexon'
import { loadEnvFiles } from '../lib/env.js'

/** 3rd.supply 클랜 페이지(UlsaN_CIaN)에서 읽은 실제 경기 id */
const REFERENCE_MATCH_IDS = [
  '260818140312124001', // 제3보급창고 · UlsaN_CIaN vs Iatency- · 5v5 · 래더 -8
  '260724214851125001',
  '260724213834125001',
  '260603164839124001',
  '260508214956124001',
]

async function main(): Promise<void> {
  loadEnvFiles()
  const config = readNexonConfig()
  if (!hasApiKey(config)) {
    console.error('NEXON_API_KEY가 없다')
    process.exitCode = 1
    return
  }
  const client = new NexonClient({ config })

  for (const matchId of REFERENCE_MATCH_IDS) {
    try {
      const response = await client.getMatchDetail(matchId)
      const data = response.data as {
        match_id?: string
        match_type?: string
        match_mode?: string
        match_map?: string
        date_match?: string
        match_detail?: unknown[]
      }
      const participants = Array.isArray(data.match_detail) ? data.match_detail.length : 0
      console.info(
        `${matchId}  존재 ✔  type="${data.match_type ?? '-'}"  mode="${data.match_mode ?? '-'}"  ` +
          `map="${data.match_map ?? '-'}"  date=${data.date_match ?? '-'}  참가자=${participants}명`,
      )
      if (participants > 0 && Array.isArray(data.match_detail)) {
        const rows = data.match_detail as { user_name?: string; guild_name?: string; team_id?: string }[]
        const byTeam = new Map<string, string[]>()
        for (const row of rows) {
          const team = row.team_id ?? '?'
          const bucket = byTeam.get(team) ?? []
          bucket.push(`${row.user_name ?? '?'}(${row.guild_name ?? '-'})`)
          byTeam.set(team, bucket)
        }
        for (const [team, names] of byTeam) {
          console.info(`    team ${team} (${names.length}명): ${names.join(' ')}`)
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.info(`${matchId}  조회 실패 ✘  ${message}`)
    }
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
