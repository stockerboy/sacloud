import { AGGREGATE_LEAGUE_SLUGS } from '@sacloud/contract'
import { prisma } from '@sacloud/db'
import { spawn } from 'node:child_process'

import { log, warn } from '../lib/log.js'
import { barracksBrowser, closeBarracksBrowser, useChromeFetch } from '../nexon/browserFetch.js'
import { barracksClanIdOf } from './barracksCollect.js'

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
  attempts: number
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

  /*
   * ★★실패한 건이 큐 앞을 막지 않게★★ (2026-09-21 사장님: 「★갱신안된다니까★」)
   *
   * ── 무엇이 막고 있었나 (실측)
   *
   *   ```
   *   09-21 18:00  정보갱신 — 꺼냄 3 · 선수 0 · 클랜 0 · ★실패 3★
   *   09-21 18:05  정보갱신 — 꺼냄 4 · 선수 1 · 클랜 0 · ★실패 3★
   *   ```
   *   ★9월 11일부터 열흘째 실패하는 세 건★ 이 있었다 —
   *   `ipl-backspace00` 처럼 ★병영수첩에 없는 가짜 주소★ 다.
   *   실패해도 `pending` 인 채 `updatedAt` 이 옛날이라 ★매번 맨 앞에 다시 뽑혔다.★
   *   사장님이 방금 누른 건은 ★그 뒤에서 기다렸다.★
   *
   * ── 이제
   *
   *   실패하면 `attempts` 를 세고 ★뒤로 미룬다★(`nextRetryAt`). 그동안은 안 뽑힌다.
   *   ★다섯 번 실패하면 접는다★ — 병영수첩에 없는 것을 백 번 물어도 없다.
   *   ⚠ 접어도 ★지우지 않는다★ (`status: 'failed'`) — 왜 못 했는지가 남는다.
   */
  const pending = await prisma.importJob.findMany({
    where: {
      jobKey: { startsWith: KEY_PREFIX },
      status: 'pending',
      OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }],
    },
    orderBy: { updatedAt: 'asc' },
    take: limit,
    select: { id: true, jobKey: true, attempts: true },
  })

  const jobs: Job[] = []
  for (const row of pending) {
    const parsed = parseRenewKey(row.jobKey)
    if (parsed === null) continue
    jobs.push({ id: row.id, kind: parsed.kind, targetId: parsed.targetId, attempts: row.attempts })
  }
  result.taken = jobs.length
  if (jobs.length === 0) {
    log('정보갱신 — 큐가 비어 있다')
    return result
  }

  /* 병영수첩 주소 → 우리 클랜. ★우리에게 없는 클랜은 만들지 않는다★ (D-106) */
  const clanRows = await prisma.clan.findMany({
    select: { id: true, slug: true, name: true, markBgUrl: true, markFrontUrl: true },
  })

  /* 집계하는 리그 — 소속은 이 리그들에만 적는다 */
  const leagues = await prisma.league.findMany({
    where: { slug: { in: [...AGGREGATE_LEAGUE_SLUGS] } },
    select: { id: true },
  })
  const leagueIds = leagues.map((l) => l.id)

  const done: string[] = []
  /** ★몇 번까지 다시 해 보나★ — 병영수첩에 없는 것을 백 번 물어도 없다 */
  const MAX_ATTEMPTS = 5
  /** 다음에 다시 해 볼 때까지 얼마나 미루나 — 시도할수록 길어진다 */
  const backoffMs = (n: number): number => Math.min(6 * 60 * 60_000, 5 * 60_000 * 2 ** n)

  /** 실패를 적고 뒤로 미룬다. 다섯 번이면 접는다 */
  async function noteFailure(job: Job, why: string): Promise<void> {
    result.failed += 1
    if (!confirm) return
    const next = job.attempts + 1
    await prisma.importJob.update({
      where: { id: job.id },
      data:
        next >= MAX_ATTEMPTS
          ? { status: 'failed', attempts: next, lastError: why, finishedAt: new Date() }
          : { attempts: next, lastError: why, nextRetryAt: new Date(Date.now() + backoffMs(next)) },
    })
  }

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
        await noteFailure(job, '병영수첩을 못 불렀다')
        await sleep(delay)
        continue
      }
      if (res.status === 403 || res.status === 429) {
        warn(`병영수첩이 막았다 (HTTP ${res.status}) — 멈춘다. 큐는 그대로 남는다`)
        result.blocked = true
        break
      }
      if (res.status !== 200) {
        await noteFailure(job, '병영수첩을 못 불렀다')
        await sleep(delay)
        continue
      }

      let nick: string | null
      let clanName: string | null
      let markBg: string | null
      let markFront: string | null
      try {
        const doc = JSON.parse(res.body) as {
          result?: {
            characterInfo?: {
              user_nick?: string | null
              clan_name?: string | null
              clan_id?: string | null
              clan_mark1?: string | null
              clan_mark2?: string | null
            }
          }
        }
        const info = doc.result?.characterInfo
        nick = trimmed(info?.user_nick)
        clanName = trimmed(info?.clan_name)
        markBg = trimmed(info?.clan_mark1)
        markFront = trimmed(info?.clan_mark2)
      } catch {
        await noteFailure(job, '병영수첩을 못 불렀다')
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
      /*
       * ★★클랜은 ★이름★ 으로 찾는다★★ (2026-09-21 실측으로 알았다)
       *
       * ── 왜 여태 안 됐나
       *   병영 프로필의 `clan_id` 를 ★우리 주소(slug)★ 로 알고 찾고 있었다. 그런데 —
       *   ```
       *   clan_id   "042222741"        ← ★병영 안에서만 쓰는 번호★
       *   우리 slug  "ferwfwfwfwf"      ← 전혀 다른 값
       *   clanNo    "150531000663"     ← 이것도 아니다
       *   ```
       *   ★못 찾으니 「리그밖 클랜」 으로 넘기고 소속을 영영 안 고쳤다.★
       *   사장님이 「정보갱신 안된다」 고 하신 까닭이 이것이다.
       *
       * ── 이제
       *   ★`clan_name` 으로 찾는다.★ 우리 이름도 병영에서 온 값이라 그대로 맞는다.
       *   ⚠ 같은 이름 클랜이 ★아홉 쌍★ 있다 (grave 둘 등). 그때는 ★마크로 가린다★ —
       *     병영이 `clan_mark1/2` 를 같이 주기 때문이다.
       *   ⚠ 마크로도 못 가리면 ★안 고친다★ — 틀린 클랜에 넣느니 그대로 둔다 (D-106).
       */
      let clan: { id: string; slug: string; name: string } | null = null
      if (clanName !== null) {
        const sameName = clanRows.filter((c) => c.name === clanName)
        if (sameName.length === 1) {
          clan = sameName[0] ?? null
        } else if (sameName.length > 1) {
          const byMark = sameName.filter(
            (c) => c.markBgUrl === markBg && c.markFrontUrl === markFront,
          )
          clan = byMark.length === 1 ? (byMark[0] ?? null) : null
          if (clan === null) changes.push(`같은 이름 ${sameName.length}곳 — 못 가림`)
        }
      }
      const nextClanId = clan === null ? null : clan.id
      if (clanName !== null && clan === null) {
        /* 우리 리그 밖 클랜이다 — ★없는 클랜을 지어내지 않는다★ */
        changes.push(`리그밖 클랜 ${clanName}`)
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
    /*
     * ⚠ ★명부는 `clan_id`(주소) 로 부른다★ — 2026-09-21 실측으로 고쳤다.
     *
     *   처음에 `clan_no`(클랜 번호) 로 보냈더니 ★클랜 다섯 건이 전부 실패★ 했다.
     *   매시 도는 `barracks-roster` 는 ★`{ clan_id: slug }`★ 로 보내고 잘 받는다.
     *   ★도는 것과 같은 모양으로 맞춘다.★ 번호도 필요 없어졌다.
     */
    let res: CurlResult
    try {
      res = await callBarracks(
        '/api/ClanHome/GetClanUserList',
        /* ★slug 와 병영 clan_id 가 다른 클랜(deluxe=ferwfwfwfwf→042222741)은 오버라이드로 부른다★
           (2026-09-24 사장님 「정보갱신 안된다」 — 매시 barracks-roster 는 오버라이드를 쓰는데 갱신만 빠져 있었다) */
        JSON.stringify({ clan_id: barracksClanIdOf(clan.slug) }),
      )
    } catch {
      await noteFailure(job, '병영수첩을 못 불렀다')
      await sleep(delay)
      continue
    }
    if (res.status === 403 || res.status === 429) {
      warn(`병영수첩이 막았다 (HTTP ${res.status}) — 멈춘다. 큐는 그대로 남는다`)
      result.blocked = true
      break
    }
    if (res.status !== 200) {
      await noteFailure(job, '병영수첩을 못 불렀다')
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
        await noteFailure(job, '병영수첩을 못 불렀다')
        await sleep(delay)
        continue
      }
      members = doc.resultClanUserList ?? []
    } catch {
      await noteFailure(job, '병영수첩을 못 불렀다')
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

      /*
       * ⚠ ★★클랜 로스터 닉으로 이름을 덮어쓰지 않는다★★ (2026-09-24 사장님 「자이언트 정보갱신되니까 다른 애들은 옛날에 썼던 닉으로 다 돌아가는데 머야 이건?」)
       *
       *   `GetClanUserList` 의 `user_nick` 은 ★클랜 명부에 박힌 옛 닉★ 이라 개인 프로필(`GetProfileMain`)보다 늦다.
       *   이걸로 player.name 을 고치면 ★방금 고쳐진 최신 닉이 옛 닉으로 되돌아간다.★ 실측: deluxe 클랜을 갱신하니
       *   멤버 전원이 옛 닉으로 회귀했다(내가 barracksClanIdOf 로 클랜 갱신을 되살리자 이 잠복 버그가 드러났다).
       *   ★이름의 진실은 개인 프로필 갱신(위 플레이어 경로)뿐이다.★ 클랜 로스터는 ★소속(clanId)만★ 맞춘다.
       *   옛 판(로스터로 개명)은 CLAN_ROSTER_RENAMES 를 true 로. 켜지 마라 — 닉을 되돌린다.
       */
      const CLAN_ROSTER_RENAMES = false
      if (CLAN_ROSTER_RENAMES) {
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
