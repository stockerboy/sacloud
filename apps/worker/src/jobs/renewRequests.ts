import { AGGREGATE_LEAGUE_SLUGS } from '@sacloud/contract'
import { prisma } from '@sacloud/db'
import { spawn } from 'node:child_process'

import { log, warn } from '../lib/log.js'
import { barracksBrowser, closeBarracksBrowser, useChromeFetch } from '../nexon/browserFetch.js'

/**
 * ★★「정보갱신」 을 진짜로 만든다★★ (2026-09-21 · 사장님 지시)
 *
 * > 「정보갱신 누르면 ★현재 병영수첩상 닉네임과 클랜으로 최신화★ 되는 기능
 * >  탑재한거야? ★안되는데?★」
 *
 * ── 여태 무엇을 하고 있었나 (사실대로)
 *
 *   ★아무것도 안 했다.★ 단추를 누르면 —
 *   ```
 *   renewPlayer()   Player.renewedAt 을 지금으로 바꾼다
 *                   ImportJob 에 'nexon:renew:player:<id>' 를 pending 으로 넣는다
 *   ```
 *   그리고 ★그 큐를 읽는 사람이 아무도 없었다.★ 「갱신했습니다」 라고 적힌
 *   시각만 새것이 되고 닉네임도 클랜도 그대로였다.
 *
 * ── 이 잡이 그 큐를 비운다
 *
 *   ```
 *   선수  POST /api/Profile/GetProfileMain/{str_usn}
 *           → user_nick              ← ★지금 닉네임★
 *           → clan_name · clan_id    ← ★지금 클랜★
 *   클랜  POST /api/ClanHome/GetClanUserList  {clan_no}
 *           → 클랜원 전원의 str_usn · user_nick
 *   ```
 *
 * ── ★사람의 키는 닉네임이 아니라 계정(str_usn)이다★ (D-221)
 *
 *   위장닉이 있어서 닉으로 이으면 남의 기록이 붙는다. 그래서 ★계정을 아는
 *   사람만★ 갱신한다. 모르면 「계정을 몰라 못 했다」 고 ★사실대로 센다.★
 *
 * ── 안 하는 것
 *
 *   ⚠ ★경기 당시 소속(matchTime*)은 한 칸도 안 건드린다.★
 *   ⚠ ★우리 리그 밖 클랜은 만들지 않는다★ — 그대로 둔다 (D-106).
 *   ⚠ ★빈 닉네임으로 덮지 않는다.★
 *   ⚠ ★막히면(403/429) 그 자리에서 멈춘다.★ 재시도하지 않는다 — 큐에 그대로 남아
 *     다음 판이 잇는다.
 *
 * ```
 * pnpm --filter @sacloud/worker nexon renew-requests             # 미리보기
 * pnpm --filter @sacloud/worker nexon renew-requests --confirm   # 반영
 * pnpm --filter @sacloud/worker nexon renew-requests --limit 20
 * ```
 */

const ORIGIN = 'https://barracks.sa.nexon.com'
const DEFAULT_DELAY_MS = 900
const MIN_DELAY_MS = 600
const REQUEST_TIMEOUT_S = 20
const MAX_BYTES = 4_000_000

/** 한 판에 몇 건을 처리하나. 예약이 자주 도니 조금씩 꾸준히 비운다 */
export const RENEW_BATCH = 25

/** 큐에 들어가는 열쇠의 머리 — `apps/web/lib/server/queries/ingestQueue.ts` 와 같은 글자 */
const KEY_PREFIX = 'nexon:renew:'

export interface RenewRequestsResult {
  /** 큐에서 꺼낸 건수 */
  taken: number
  /** 선수 갱신 성공 */
  players: number
  /** 클랜 갱신 성공 */
  clans: number
  /** 닉네임이 실제로 바뀐 사람 */
  renamed: number
  /** 소속이 실제로 바뀐 줄 */
  moved: number
  /** 계정(str_usn)이나 클랜번호를 몰라 못 한 건 */
  noAccount: number
  /** 병영수첩이 답을 안 준 건 */
  failed: number
  blocked: boolean
  confirmed: boolean
  samples: string[]
}

interface CurlResult {
  status: number
  body: string
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

function curlPost(path: string, body: string): Promise<CurlResult> {
  const args = [
    '-sS',
    '--max-time',
    String(REQUEST_TIMEOUT_S),
    '-w',
    '\\n__STATUS__%{http_code}',
    '-X',
    'POST',
    '-H',
    'Content-Type: application/json',
    '--data',
    body,
    `${ORIGIN}${path}`,
  ]
  return new Promise((resolve, reject) => {
    const child = spawn('curl', args, { windowsHide: true })
    let out = ''
    let killed = false
    child.stdout.on('data', (c: Buffer) => {
      out += c.toString('utf8')
      if (out.length > MAX_BYTES && !killed) {
        killed = true
        child.kill()
      }
    })
    child.on('error', reject)
    child.on('close', () => {
      if (killed) return reject(new Error('응답이 너무 크다'))
      const at = out.lastIndexOf('__STATUS__')
      if (at < 0) return reject(new Error('상태코드를 못 읽었다'))
      resolve({ status: Number(out.slice(at + 10).trim()), body: out.slice(0, at) })
    })
  })
}

/** 노트북은 curl · 서버는 크롬 — `playerProfileClan.ts` 와 같은 규칙 */
async function callBarracks(path: string, body: string): Promise<CurlResult> {
  if (!useChromeFetch()) return curlPost(path, body)
  const r = await barracksBrowser().call('POST', path, body)
  return { status: r.status, body: r.body }
}

const trimmed = (v: unknown): string | null => {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s === '' ? null : s
}

interface Job {
  id: string
  kind: 'player' | 'clan'
  targetId: string
}

/** `nexon:renew:player:cku…` → `{ kind, targetId }`. 모르는 꼴은 버린다 */
export function parseRenewKey(
  jobKey: string,
): { kind: 'player' | 'clan'; targetId: string } | null {
  if (!jobKey.startsWith(KEY_PREFIX)) return null
  const rest = jobKey.slice(KEY_PREFIX.length)
  const at = rest.indexOf(':')
  if (at < 0) return null
  const kind = rest.slice(0, at)
  const targetId = rest.slice(at + 1)
  if (targetId === '') return null
  if (kind !== 'player' && kind !== 'clan') return null
  return { kind, targetId }
}

export async function runRenewRequests(
  options: { confirm?: boolean; limit?: number; delayMs?: number } = {},
): Promise<RenewRequestsResult> {
  const confirm = options.confirm ?? false
  const limit = options.limit ?? RENEW_BATCH
  const delay = Math.max(MIN_DELAY_MS, options.delayMs ?? DEFAULT_DELAY_MS)

  const result: RenewRequestsResult = {
    taken: 0,
    players: 0,
    clans: 0,
    renamed: 0,
    moved: 0,
    noAccount: 0,
    failed: 0,
    blocked: false,
    confirmed: confirm,
    samples: [],
  }

  const pending = await prisma.importJob.findMany({
    where: { jobKey: { startsWith: KEY_PREFIX }, status: 'pending' },
    orderBy: { updatedAt: 'asc' },
    take: limit,
    select: { id: true, jobKey: true },
  })

  const jobs: Job[] = []
  for (const row of pending) {
    const parsed = parseRenewKey(row.jobKey)
    if (parsed === null) continue
    jobs.push({ id: row.id, kind: parsed.kind, targetId: parsed.targetId })
  }
  result.taken = jobs.length
  if (jobs.length === 0) {
    log('정보갱신 — 큐가 비어 있다')
    return result
  }

  /* 병영수첩 주소 → 우리 클랜. ★우리에게 없는 클랜은 만들지 않는다★ (D-106) */
  const clanRows = await prisma.clan.findMany({ select: { id: true, slug: true, name: true } })
  const clanBySlug = new Map(clanRows.map((c) => [c.slug, c]))

  /* 집계하는 리그 — 소속은 이 리그들에만 적는다 */
  const leagues = await prisma.league.findMany({
    where: { slug: { in: [...AGGREGATE_LEAGUE_SLUGS] } },
    select: { id: true },
  })
  const leagueIds = leagues.map((l) => l.id)

  const done: string[] = []

  for (const job of jobs) {
    if (result.blocked) break

    if (job.kind === 'player') {
      const player = await prisma.player.findUnique({
        where: { id: job.targetId },
        select: { id: true, name: true, sourcePlayerId: true },
      })
      if (player === null) {
        done.push(job.id)
        continue
      }
      /* ★계정을 모르면 못 한다★ — 닉으로 잇지 않는다 (D-221) */
      const src = player.sourcePlayerId
      const usn = src !== null && src.startsWith('BRK-') ? src.slice(4) : null
      if (usn === null) {
        result.noAccount += 1
        done.push(job.id)
        continue
      }

      let res: CurlResult
      try {
        res = await callBarracks(`/api/Profile/GetProfileMain/${encodeURIComponent(usn)}`, '{}')
      } catch {
        result.failed += 1
        await sleep(delay)
        continue
      }
      if (res.status === 403 || res.status === 429) {
        warn(`병영수첩이 막았다 (HTTP ${res.status}) — 멈춘다. 큐는 그대로 남는다`)
        result.blocked = true
        break
      }
      if (res.status !== 200) {
        result.failed += 1
        await sleep(delay)
        continue
      }

      let nick: string | null
      let clanSlug: string | null
      let clanName: string | null
      try {
        const doc = JSON.parse(res.body) as {
          result?: {
            characterInfo?: {
              user_nick?: string | null
              clan_name?: string | null
              clan_id?: string | null
            }
          }
        }
        const info = doc.result?.characterInfo
        nick = trimmed(info?.user_nick)
        clanName = trimmed(info?.clan_name)
        clanSlug = trimmed(info?.clan_id)
      } catch {
        result.failed += 1
        await sleep(delay)
        continue
      }

      result.players += 1
      const changes: string[] = []

      /* ★빈 닉네임으로 덮지 않는다★ */
      if (nick !== null && nick !== player.name) {
        result.renamed += 1
        changes.push(`닉 ${player.name} → ${nick}`)
        if (confirm) await prisma.player.update({ where: { id: player.id }, data: { name: nick } })
      }

      /*
       * ★소속★ — 우리 DB 에 있는 클랜일 때만 적는다.
       *   ⚠ 병영수첩이 ★무소속이라고 답하면 비운다★ — 클랜을 나간 것이 사실이다.
       *     「모르면 그대로」 와 다르다. 이건 ★없다고 말한 것★ 이다.
       */
      const clan = clanSlug === null ? null : (clanBySlug.get(clanSlug) ?? null)
      const nextClanId = clan === null ? null : clan.id
      if (clanSlug !== null && clan === null) {
        /* 우리 리그 밖 클랜이다 — ★없는 클랜을 지어내지 않는다★ */
        changes.push(`리그밖 클랜 ${clanName ?? clanSlug}`)
      } else if (leagueIds.length > 0) {
        const mine = await prisma.leaguePlayer.findMany({
          where: { playerId: player.id, leagueId: { in: leagueIds } },
          select: { id: true, clanId: true },
        })
        const stale = mine.filter((m) => m.clanId !== nextClanId).map((m) => m.id)
        if (stale.length > 0) {
          result.moved += stale.length
          changes.push(`소속 → ${clan === null ? '무소속' : clan.name}`)
          if (confirm) {
            await prisma.leaguePlayer.updateMany({
              where: { id: { in: stale } },
              data: { clanId: nextClanId },
            })
            await prisma.player.update({ where: { id: player.id }, data: { clanId: nextClanId } })
          }
        }
      }

      if (changes.length > 0 && result.samples.length < 20) {
        result.samples.push(`${nick ?? player.name}: ${changes.join(' · ')}`)
      }
      done.push(job.id)
      await sleep(delay)
      continue
    }

    /* ── 클랜 ───────────────────────────────────────────────────────────── */
    const clan = await prisma.clan.findUnique({
      where: { id: job.targetId },
      select: { id: true, slug: true, name: true },
    })
    if (clan === null) {
      done.push(job.id)
      continue
    }
    const no = await prisma.barracksClanNumber.findFirst({
      where: { clanId: clan.id },
      orderBy: { linkedAt: 'desc' },
      select: { clanNo: true },
    })
    if (no === null) {
      /* ★번호를 모르면 명부를 못 받는다★ — 매시 도는 `barracks-roster` 가 채워 준다 */
      result.noAccount += 1
      done.push(job.id)
      continue
    }

    let res: CurlResult
    try {
      res = await callBarracks(
        '/api/ClanHome/GetClanUserList',
        JSON.stringify({ clan_no: no.clanNo }),
      )
    } catch {
      result.failed += 1
      await sleep(delay)
      continue
    }
    if (res.status === 403 || res.status === 429) {
      warn(`병영수첩이 막았다 (HTTP ${res.status}) — 멈춘다. 큐는 그대로 남는다`)
      result.blocked = true
      break
    }
    if (res.status !== 200) {
      result.failed += 1
      await sleep(delay)
      continue
    }

    let members: Array<{ str_usn?: string; user_nick?: string }>
    try {
      const doc = JSON.parse(res.body) as {
        rtnCode?: number
        resultClanUserList?: Array<{ str_usn?: string; user_nick?: string }> | null
      }
      if (doc.rtnCode !== 0) {
        result.failed += 1
        await sleep(delay)
        continue
      }
      members = doc.resultClanUserList ?? []
    } catch {
      result.failed += 1
      await sleep(delay)
      continue
    }

    result.clans += 1
    const usns = members.map((m) => trimmed(m.str_usn)).filter((v): v is string => v !== null)
    if (usns.length > 0) {
      const people = await prisma.player.findMany({
        where: { sourcePlayerId: { in: usns.map((u) => `BRK-${u}`) } },
        select: { id: true, name: true, sourcePlayerId: true },
      })
      const byUsn = new Map<string, { id: string; name: string }>()
      for (const person of people) {
        const src = person.sourcePlayerId
        if (src === null) continue
        byUsn.set(src.slice(4), { id: person.id, name: person.name })
      }

      for (const m of members) {
        const usn = trimmed(m.str_usn)
        const nick = trimmed(m.user_nick)
        if (usn === null) continue
        const person = byUsn.get(usn)
        if (person === undefined) continue
        if (nick !== null && nick !== person.name) {
          result.renamed += 1
          if (result.samples.length < 20) result.samples.push(`닉 ${person.name} → ${nick}`)
          if (confirm) await prisma.player.update({ where: { id: person.id }, data: { name: nick } })
        }
      }

      /* ★명부에 있는 사람은 이 클랜 소속이다★ — 리그마다 맞춘다 */
      const ids = [...byUsn.values()].map((p) => p.id)
      if (ids.length > 0 && leagueIds.length > 0) {
        const mine = await prisma.leaguePlayer.findMany({
          where: { playerId: { in: ids }, leagueId: { in: leagueIds } },
          select: { id: true, clanId: true },
        })
        const stale = mine.filter((m) => m.clanId !== clan.id).map((m) => m.id)
        if (stale.length > 0) {
          result.moved += stale.length
          if (result.samples.length < 20) {
            result.samples.push(`${clan.name} 명부로 소속 ${stale.length}줄 맞춤`)
          }
          if (confirm) {
            for (let i = 0; i < stale.length; i += 500) {
              await prisma.leaguePlayer.updateMany({
                where: { id: { in: stale.slice(i, i + 500) } },
                data: { clanId: clan.id },
              })
            }
          }
        }
      }
    }

    done.push(job.id)
    await sleep(delay)
  }

  /* ★끝난 건만 큐에서 지운다★ — 막혀서 못 한 건은 그대로 두어 다음 판이 잇는다 */
  if (confirm && done.length > 0) {
    await prisma.importJob.updateMany({
      where: { id: { in: done } },
      data: { status: 'done', finishedAt: new Date(), lastError: null },
    })
  }

  if (useChromeFetch()) closeBarracksBrowser()

  log(
    `정보갱신 — 꺼냄 ${result.taken} · 선수 ${result.players} · 클랜 ${result.clans} · ` +
      `닉 ${result.renamed} · 소속 ${result.moved} · 계정모름 ${result.noAccount} · ` +
      `실패 ${result.failed}${result.blocked ? ' · ★막힘★' : ''}` +
      (confirm ? '' : ' (미리보기)'),
  )
  for (const s of result.samples) log(`  ${s}`)
  return result
}
