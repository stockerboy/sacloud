/**
 * 병영수첩 계정 ↔ Open API `ouid` 를 **잇는다** (D-221).
 *
 * ── 흐름
 *   ```
 *   배틀로그 원문 → (계정, 가장 최근 닉)
 *     → /id 로 ouid 조회
 *     → user/basic 으로 되돌려 확인 (user_name 이 그 닉과 같은가)
 *     → 같을 때만 NexonIdentity 에 barracksNexonSn / barracksUsn 을 채운다
 *   ```
 *
 * ── 왜 되돌려 확인하나
 *   `/id` 는 **지금 그 닉을 쓰는 사람**을 준다. 옛 닉으로 부르면 그 닉을 물려받은
 *   **다른 사람**이 붙는다 (D-221 실측). 그러면 남의 닉·클랜을 우리 선수에 붙이게 된다.
 *
 * ── 못 잇는 것
 *   위장닉을 쓰는 계정은 `/id` 가 모른다 (D-221). **영영 못 잇는다.** 지어내지 않는다.
 *
 * ── 안전
 *   `--dry-run` 이면 요청을 한 건도 보내지 않는다. 403 이면 즉시 멈춘다.
 *   멱등하다 — 이미 이어진 계정은 건너뛴다.
 */
import { prisma } from '@sacloud/db'
import { NexonApiError } from '@sacloud/nexon'
import { log, warn } from '../lib/log.js'
import { estimateCalls, judgeLink, looksLikeDisguise, orderByRecency } from '../lib/barracksLink.js'
import { handleJobError, requireClient, type JobContext } from './context.js'

const JOB_KEY = 'barracks-link'

export interface BarracksLinkResult {
  candidates: number
  attempted: number
  linked: number
  disguise: number
  notFound: number
  mismatch: number
  failed: number
  estimatedCalls: number
}

interface Candidate {
  nexonSn: string
  usn: string
  nick: string
  lastSeenKey: string
}

/**
 * 배틀로그에서 **계정마다 가장 최근 닉**을 뽑는다.
 *
 * payload 가 커서 배치로 흘려 읽는다. 집계만 남긴다 (전량을 메모리에 올리면 죽는다).
 */
export async function collectCandidates(): Promise<Candidate[]> {
  const byAccount = new Map<string, Candidate>()

  const BATCH = 100
  let cursor: string | undefined

  for (;;) {
    const rows = await prisma.barracksBattleLogRaw.findMany({
      where: { subjectKind: 'clan', status: 'ok' },
      select: { id: true, matchKey: true, payload: true },
      orderBy: { id: 'asc' },
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    })
    if (!rows.length) break
    cursor = rows[rows.length - 1]!.id

    for (const r of rows) {
      const p = r.payload as { battleLog?: Array<Record<string, unknown>> } | null
      if (!p?.battleLog) continue
      const note = (snRaw: unknown, usnRaw: unknown, nickRaw: unknown) => {
        if (snRaw == null || usnRaw == null || nickRaw == null) return
        const nexonSn = String(snRaw)
        const usn = String(usnRaw)
        const nick = String(nickRaw).trim()
        if (!nexonSn || !usn || !nick) return
        const cur = byAccount.get(nexonSn)
        if (!cur || r.matchKey > cur.lastSeenKey) {
          byAccount.set(nexonSn, { nexonSn, usn, nick, lastSeenKey: r.matchKey })
        }
      }
      for (const ev of p.battleLog) {
        note(ev.user_nexon_sn, ev.str_usn, ev.user_nick)
        note(ev.target_user_nexon_sn, ev.target_str_usn, ev.target_user_nick)
      }
    }
  }

  return orderByRecency([...byAccount.values()])
}

export async function runBarracksLink(
  ctx: JobContext,
  options: { limit?: number } = {},
): Promise<BarracksLinkResult> {
  const all = await collectCandidates()

  // 이미 이어진 계정은 건너뛴다 (멱등)
  const linkedSns = new Set(
    (
      await prisma.nexonIdentity.findMany({
        where: { barracksNexonSn: { not: null } },
        select: { barracksNexonSn: true },
      })
    ).map((r) => r.barracksNexonSn!),
  )

  const pending = all.filter((c) => !linkedSns.has(c.nexonSn) && !looksLikeDisguise(c.nick))
  const limit = options.limit ?? ctx.limit ?? 300
  const targets = pending.slice(0, limit)

  const result: BarracksLinkResult = {
    candidates: all.length,
    attempted: targets.length,
    linked: 0,
    disguise: all.filter((c) => looksLikeDisguise(c.nick)).length,
    notFound: 0,
    mismatch: 0,
    failed: 0,
    estimatedCalls: estimateCalls(targets.length),
  }

  log(
    `배틀로그 계정 ${all.length.toLocaleString()} · 이미 이어짐 ${linkedSns.size} · ` +
      `위장닉으로 걸러냄 ${result.disguise} · 이번 대상 ${targets.length}`,
  )
  log(
    `예상 호출 ${result.estimatedCalls}회 · 초당 ${ctx.config.requestsPerSecond}회 → ` +
      `약 ${Math.round(result.estimatedCalls / ctx.config.requestsPerSecond)}초`,
  )

  if (ctx.dryRun) {
    log('--dry-run: 요청을 보내지 않는다. 대상 선정까지만 확인했다.')
    return result
  }

  const client = requireClient(ctx)

  for (const c of targets) {
    try {
      /*
        닉을 못 찾으면 `/id` 는 **400** 을 준다. 그건 오류가 아니라 "그런 닉 없음" 이다.
        (위장닉이거나 이미 바뀐 닉이다 — D-221)
        실패로 기록하면 `ImportFailure` 가 정상 결과로 가득 차서 진짜 실패가 묻힌다.
      */
      let ouid: string | null = null
      try {
        const idRes = await client.getOuid(c.nick)
        ouid = idRes.data.ouid ?? null
      } catch (error) {
        if (error instanceof NexonApiError && error.kind === 'bad_request') {
          result.notFound += 1
          continue
        }
        throw error
      }

      let apiUserName: string | null = null
      if (ouid) {
        const basic = await client.getUserBasic(ouid)
        apiUserName = basic.data.user_name ?? null
      }

      const verdict = judgeLink({ battlelogNick: c.nick, ouid, apiUserName })

      if (verdict.ok && ouid) {
        await prisma.nexonIdentity.upsert({
          where: { ouid },
          create: {
            ouid,
            userName: apiUserName,
            barracksNexonSn: c.nexonSn,
            barracksUsn: c.usn,
            barracksLinkNick: c.nick,
            barracksLinkedAt: new Date(),
          },
          update: {
            userName: apiUserName,
            barracksNexonSn: c.nexonSn,
            barracksUsn: c.usn,
            barracksLinkNick: c.nick,
            barracksLinkedAt: new Date(),
            lastSeenAt: new Date(),
          },
        })
        result.linked += 1
      } else if (verdict.reason === 'not_found') {
        result.notFound += 1
      } else if (verdict.reason === 'mismatch') {
        result.mismatch += 1
        warn(`불일치 — 배틀로그 "${c.nick}" vs API "${verdict.apiUserName ?? '-'}" (안 잇는다)`)
      }
    } catch (error) {
      result.failed += 1
      await handleJobError({ error, source: 'nexon', jobKey: JOB_KEY, sourceId: c.nick })
    }
  }

  log(
    `연결 끝 — 이음 ${result.linked} · 못찾음 ${result.notFound} · ` +
      `불일치 ${result.mismatch} · 실패 ${result.failed}`,
  )
  return result
}
