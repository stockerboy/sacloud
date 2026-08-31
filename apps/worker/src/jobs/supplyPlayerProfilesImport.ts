/**
 * 3rd.supply 선수 프로필 수집 파일 → 우리 DB (D-161).
 *
 * **네트워크를 쓰지 않는다.** 입력은 `supply-player-profiles` 가 쌓아 둔 `.jsonl` 뿐이다.
 * 판단(코드→표기 · 무엇을 쓸지)은 전부 `@sacloud/db/ops` 의 `applySupplyPlayerProfiles`
 * 가 한다 — 여기서는 파일을 **흘려 읽어** 덩어리로 넘기기만 한다.
 *
 * 파일은 통째로 `JSON.parse` 하지 않는다. 줄마다 필요한 네 칸만 뽑아 들고 있어
 * 응답 본문(`raw`)은 메모리에 남지 않는다. 예전 단일 JSON 이 그렇게 죽었다.
 */
import { supplyMarkUrlToNexon } from '@sacloud/contract'
import {
  applySupplyPlayerProfiles,
  createSupplyPlayerProfilesResult,
  type SupplyPlayerProfileInput,
  type SupplyPlayerProfilesApplyResult,
} from '@sacloud/db/ops'
import { readJsonl } from '../lib/jsonlStore.js'
import { log } from '../lib/log.js'
import type { SupplyPlayerProfileRecord } from './supplyPlayerProfiles.js'

function assertLocalDatabase(): void {
  if (process.env['SACLOUD_ALLOW_REMOTE_WRITE'] === 'yes') return
  const url = process.env['DATABASE_URL'] ?? ''
  if (/@(127\.0\.0\.1|localhost)[:/]/.test(url)) return
  throw new Error(
    '중단한다 — DATABASE_URL 이 로컬 개발 DB 가 아니다. ' +
      '운영 반영은 사람이 한다. 의도한 것이면 SACLOUD_ALLOW_REMOTE_WRITE=yes 를 넣어라.',
  )
}

export interface SupplyPlayerProfilesImportResult extends SupplyPlayerProfilesApplyResult {
  file: string
  /** 원본에 선수가 없어(404) 내용이 비어 있던 줄 */
  emptyRows: number
}

const CHUNK = 500

export async function runSupplyPlayerProfilesImport(input: {
  file: string
  confirm: boolean
  limit?: number | null
}): Promise<SupplyPlayerProfilesImportResult> {
  const { file, confirm } = input
  if (confirm) assertLocalDatabase()

  const result = createSupplyPlayerProfilesResult(confirm)
  let emptyRows = 0
  let taken = 0
  const limit = input.limit ?? null

  /* 흘려 읽으며 CHUNK 마다 넘긴다. `readJsonl` 은 동기 콜백이라 여기 모아 두고
     바깥에서 한 번에 처리한다 — 순서를 보장하려고 대기열을 직접 돌린다 */
  const pending: SupplyPlayerProfileInput[] = []
  const chunks: SupplyPlayerProfileInput[][] = []

  const stats = await readJsonl<SupplyPlayerProfileRecord>(file, (record) => {
    if (limit !== null && taken >= limit) return
    if (!record.raw) {
      emptyRows += 1
      return
    }
    taken += 1
    const clan = record.raw.clan
    pending.push({
      playerId: record.player_id,
      name: record.raw.name ?? null,
      position: record.raw.position ?? null,
      note: record.raw.note ?? null,
      renewedAt: record.raw.renewed_at ?? null,
      /* 원본이 준 값만 옮긴다. 없는 칸을 만들어 내지 않는다 */
      clan: clan
        ? {
            sourceClanId: String(clan.id),
            name: clan.name,
            slug: clan.slug,
            /* 원본 사이트 주소를 **들어오는 자리에서** 넥슨으로 되돌린다 (D-227).
               여기를 막지 않으면 다음 동기화 때 `static.3rd.supply` 가 도로 들어온다.
               못 푸는 주소는 `null` 이다 — 반쯤 바뀐 주소를 넣지 않는다 */
            markBgUrl: supplyMarkUrlToNexon(clan.mark_bg),
            markFrontUrl: supplyMarkUrlToNexon(clan.mark_front),
          }
        : null,
    })
    if (pending.length >= CHUNK) chunks.push(pending.splice(0, pending.length))
  })
  if (pending.length > 0) chunks.push(pending.splice(0, pending.length))

  log(`파일 ${stats.lines}줄 (깨진 줄 ${stats.broken}) · 내용 있는 줄 ${taken}`)
  if (!confirm) log('미리보기다 — 한 줄도 쓰지 않는다. 반영하려면 --confirm 을 붙인다')

  for (const chunk of chunks) {
    await applySupplyPlayerProfiles(chunk, { confirm, result })
  }

  return { ...result, file, emptyRows }
}
