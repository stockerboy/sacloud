/**
 * ★★명부에 빠진 사람은 프로필로 확인한다★★ (2026-09-09 · 사장님 지시)
 *
 * ── ★왜 필요한가★
 *   > "SPL이나 열산 클랜 소속이면 그 클랜마크가 떠야지 무소속이라고 뜨면 안되고"
 *   >   — 사장님, 2026-09-09
 *
 *   클랜원 명부(`barracks-roster`)만으로는 부족하다. 실측 (2026-09-09 · 30명 표본):
 *   ```
 *   시즌0 에 뛰었는데 아직 무소속인 IPL 선수 30명
 *     진짜 무소속            11명
 *     ★클랜이 있는데 안 뜸★  19명
 *   ```
 *   ★`ceIestial` 은 IPL 클랜인데도 안 떴다.★ 명부는 64명인데 그 선수가 없고,
 *   정작 본인 프로필에는 `ceIestial` 이라고 적혀 있다.
 *   ★병영수첩 클랜 명부가 전원을 다 내려 주지 않는다.★
 *
 *   그래서 ★사람 하나에 요청 하나★ 로 확인한다. 명부보다 비싸지만 정확하다.
 *
 * ── ★요청★
 *   ```
 *   POST /api/Profile/GetProfileMain/{str_usn}   {}
 *     → result.characterInfo.{ clan_name, clan_id }   ← clan_id 가 병영수첩 주소
 *   ```
 *
 * ── ★누구를 물어보나★
 *   ```
 *   ① 계정(str_usn)을 아는 사람          — 없으면 물어볼 수가 없다
 *   ② 지금 소속이 비어 있는 사람          — 이미 아는 사람을 다시 묻지 않는다
 *   ③ 최근에 실제로 뛴 사람 (기본 시즌0)  — 옛날에 한 판 뛴 사람까지 다 묻지 않는다
 *   ```
 *
 * ── ★못 찾으면 지어내지 않는다★
 *   프로필의 클랜이 ★우리 DB 에 없는 클랜★ 이면 그대로 무소속(구름)으로 둔다.
 *   우리 리그 밖 클랜이라 클랜 행 자체가 없다 — 없는 클랜을 만들지 않는다.
 *
 * ── ★경기 당시 소속은 한 칸도 안 건드린다★
 *
 * ```
 * pnpm --filter @sacloud/worker nexon player-profile-clan                 # 미리보기
 * pnpm --filter @sacloud/worker nexon player-profile-clan --confirm       # 반영
 * pnpm --filter @sacloud/worker nexon player-profile-clan --limit 50
 * pnpm --filter @sacloud/worker nexon player-profile-clan --all           # 시즌0 밖도
 * ```
 */
import { spawn } from 'node:child_process'
import { prisma } from '@sacloud/db'
import { barracksBrowser, closeBarracksBrowser, useChromeFetch } from '../nexon/browserFetch.js'
import { log, warn } from '../lib/log.js'

const ORIGIN = 'https://barracks.sa.nexon.com'
const DEFAULT_LEAGUES = ['nolink', 'supply', 'sanply'] as const

/** 시즌0 시작 (KST 2026-09-03 07:00) — 「최근에 뛴 사람」의 기준 */
const SEASON0_START = new Date('2026-09-02T22:00:00.000Z')

const DEFAULT_DELAY_MS = 1200
const MIN_DELAY_MS = 800
const REQUEST_TIMEOUT_S = 20
const MAX_BYTES = 2_000_000

export interface PlayerProfileClanResult {
  leagues: string[]
  /** 물어본 사람 수 */
  asked: number
  /** 클랜이 있다고 답한 사람 */
  hasClan: number
  /** 그 클랜이 우리 DB 에 있어서 실제로 채운 사람 */
  filled: number
  /** 클랜은 있는데 ★우리 리그 밖★ 이라 못 채운 사람 */
  outsideClan: number
  /** 병영수첩도 무소속이라고 답한 사람 — 구름이 맞다 */
  reallyNone: number
  /** 답을 못 받은 사람 */
  failed: number
  blocked: boolean
  timeUp: boolean
  /** 아직 안 물어본 사람 */
  remaining: number
  confirmed: boolean
  /** 우리 리그 밖 클랜 이름 (많이 나온 순) */
  outsideTop: Array<{ clan: string; people: number }>
  samples: Array<{ nick: string; clan: string }>
}

interface CurlResult {
  status: number
  body: string
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

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

/** 노트북은 curl · 서버는 크롬 — `barracksCollect.ts` 와 같은 규칙 */
async function callBarracks(path: string, body: string): Promise<CurlResult> {
  if (!useChromeFetch()) return curlPost(path, body)
  const r = await barracksBrowser().call('POST', path, body)
  return { status: r.status, body: r.body }
}

export async function runPlayerProfileClan(input: {
  leagues?: string[]
  limit?: number
  delayMs?: number
  maxMinutes?: number
  /** 시즌0 밖에서만 뛴 사람까지 전부 물어본다 */
  all?: boolean
  confirm: boolean
}): Promise<PlayerProfileClanResult> {
  const leagues = input.leagues?.length ? input.leagues : [...DEFAULT_LEAGUES]
  const delay = Math.max(MIN_DELAY_MS, input.delayMs ?? DEFAULT_DELAY_MS)
  const since = input.all ? new Date(0) : SEASON0_START

  const targets = await prisma.$queryRaw<
    Array<{ leaguePlayerId: string; nick: string; usn: string }>
  >`
    SELECT lp."id" AS "leaguePlayerId",
           p."name" AS nick,
           substring(p."sourcePlayerId" from 5) AS usn
      FROM "LeaguePlayer" lp
      JOIN "League" l ON l."id" = lp."leagueId"
      JOIN "Player" p ON p."id" = lp."playerId"
     WHERE l."slug" = ANY(${leagues})
       AND lp."clanId" IS NULL
       AND p."sourcePlayerId" LIKE 'BRK-%'
       AND EXISTS (
         SELECT 1 FROM "MatchPlayerStat" s
           JOIN "Match" m ON m."id" = s."matchId"
          WHERE s."playerId" = lp."playerId"
            AND m."supersededAt" IS NULL
            AND m."startAt" >= ${since})
     ORDER BY lp."rating" DESC`

  /* 병영수첩 주소 → 우리 클랜. ★우리에게 없는 클랜은 만들지 않는다★ */
  const clanRows = await prisma.$queryRaw<Array<{ slug: string; id: string }>>`
    SELECT "slug", "id" FROM "Clan"`
  const clanBySlug = new Map(clanRows.map((c) => [c.slug, c.id]))

  const result: PlayerProfileClanResult = {
    leagues,
    asked: 0,
    hasClan: 0,
    filled: 0,
    outsideClan: 0,
    reallyNone: 0,
    failed: 0,
    blocked: false,
    timeUp: false,
    remaining: 0,
    confirmed: input.confirm,
    outsideTop: [],
    samples: [],
  }

  const list = input.limit ? targets.slice(0, input.limit) : targets
  const deadline = input.maxMinutes ? Date.now() + input.maxMinutes * 60_000 : null
  const outside = new Map<string, number>()
  const writes: Array<{ id: string; clanId: string }> = []

  for (let i = 0; i < list.length; i += 1) {
    const t = list[i]!
    if (deadline && Date.now() > deadline) {
      result.timeUp = true
      result.remaining = list.length - i
      break
    }
    result.asked += 1

    let res: CurlResult
    try {
      res = await callBarracks(`/api/Profile/GetProfileMain/${encodeURIComponent(t.usn)}`, '{}')
    } catch {
      result.failed += 1
      await sleep(delay)
      continue
    }
    if (res.status === 403 || res.status === 429) {
      warn(`병영수첩이 막았다 (HTTP ${res.status}) — 여기서 멈춘다`)
      result.blocked = true
      result.remaining = list.length - i
      break
    }
    if (res.status !== 200) {
      result.failed += 1
      await sleep(delay)
      continue
    }

    let clanName: string | null = null
    let clanSlug: string | null = null
    try {
      const doc = JSON.parse(res.body) as {
        result?: { characterInfo?: { clan_name?: string | null; clan_id?: string | null } }
      }
      clanName = doc.result?.characterInfo?.clan_name ?? null
      clanSlug = doc.result?.characterInfo?.clan_id ?? null
    } catch {
      result.failed += 1
      await sleep(delay)
      continue
    }

    if (!clanSlug || !clanName) {
      /* 병영수첩도 무소속이라고 한다 — ★구름이 맞다★ */
      result.reallyNone += 1
      await sleep(delay)
      continue
    }
    result.hasClan += 1

    const clanId = clanBySlug.get(clanSlug)
    if (!clanId) {
      /* 우리 리그 밖 클랜이다. ★없는 클랜을 지어내지 않는다★ */
      result.outsideClan += 1
      outside.set(clanName, (outside.get(clanName) ?? 0) + 1)
      await sleep(delay)
      continue
    }
    result.filled += 1
    writes.push({ id: t.leaguePlayerId, clanId })
    if (result.samples.length < 15) result.samples.push({ nick: t.nick, clan: clanName })
    await sleep(delay)
  }

  if (input.confirm && writes.length > 0) {
    const byClan = new Map<string, string[]>()
    for (const w of writes) {
      const got = byClan.get(w.clanId)
      if (got) got.push(w.id)
      else byClan.set(w.clanId, [w.id])
    }
    for (const [clanId, ids] of byClan) {
      for (let i = 0; i < ids.length; i += 500) {
        await prisma.leaguePlayer.updateMany({
          where: { id: { in: ids.slice(i, i + 500) } },
          data: { clanId },
        })
      }
    }
  }

  result.outsideTop = [...outside.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([clan, people]) => ({ clan, people }))

  if (useChromeFetch()) closeBarracksBrowser()

  log(
    `프로필 ${result.asked}명 물어봄 · 클랜있음 ${result.hasClan} · 채움 ${result.filled} · ` +
      `리그밖 ${result.outsideClan} · 진짜무소속 ${result.reallyNone} · 실패 ${result.failed}` +
      `${result.timeUp ? ` · ★시간종료 — 남은 사람 ${result.remaining}★` : ''}` +
      `${result.confirmed ? '' : ' (미리보기)'}`,
  )
  return result
}
