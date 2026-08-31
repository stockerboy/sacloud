/**
 * 신원 감시 — **닉·클랜이 바뀌는 순간을 잡는다** (D-220 · D-221).
 *
 * ── 무엇을 하나
 *   `GET /suddenattack/v1/user/basic` 을 ouid 로 물어 `user_name` 과 `clan_name` 을 받고,
 *   **직전 관측과 달라졌을 때만** `NexonIdentityObservation` 에 한 줄 붙인다.
 *
 * ── 왜 이걸 만드나
 *   사용자 지시: "인게임의 변경사항이 우리 사이트에 반영되는 속도가 병영수첩보다 아득히 빨라야 해".
 *   병영수첩은 클랜 가입이 늦게 뜬다. Open API 는 `clan_name` 을 계정 단위로 바로 준다.
 *   그래서 **우리가 얼마나 자주 물어보느냐**가 곧 우리 속도다.
 *
 * ── 못 하는 것 (D-221 · 정직하게)
 *   **위장닉은 이 경로로 못 잡는다.** Open API 가 위장닉을 모른다 (실측 13.3% vs 73.3%).
 *   위장닉은 병영수첩에만 있고, 병영수첩은 우리 출처다 — 자기 출처보다 빠를 수 없다.
 *   이 잡이 잡는 것은 **본닉 변경**과 **클랜 가입/탈퇴**다.
 *
 * ── 안전
 *   `--dry-run` 이면 요청을 한 건도 보내지 않는다. 403 을 만나면 즉시 멈춘다(우회 금지).
 */
import { prisma } from '@sacloud/db'
import { log, warn } from '../lib/log.js'
import {
  diffIdentity,
  nextWatchAt,
  nextWatchTier,
  sweepSeconds,
  type IdentityChange,
  type IdentitySnapshot,
} from '../lib/identityWatch.js'
import { handleJobError, requireClient, type JobContext } from './context.js'

const JOB_KEY = 'identity-watch'

export interface IdentityWatchResult {
  attempted: number
  polled: number
  changed: number
  failed: number
  /** 한 바퀴 도는 데 걸리는 예상 시간(초). "얼마나 빠른가" 를 이 숫자로 답한다 */
  sweepSeconds: number
}

/** 직전 관측 — 없으면 `NexonIdentity.userName` 을 기준선으로 삼는다 */
async function previousSnapshot(ouid: string): Promise<{
  snapshot: IdentitySnapshot | null
  lastChangedAt: Date | null
}> {
  const last = await prisma.nexonIdentityObservation.findFirst({
    where: { ouid },
    orderBy: { observedAt: 'desc' },
    select: { userName: true, clanName: true, observedAt: true, changed: true },
  })
  if (last) {
    return {
      snapshot: { userName: last.userName, clanName: last.clanName },
      // `first` 는 기준점일 뿐 변경이 아니다
      lastChangedAt: last.changed === 'first' ? null : last.observedAt,
    }
  }
  return { snapshot: null, lastChangedAt: null }
}

/**
 * 감시 대상을 고른다.
 *
 * 지금은 ouid 를 아는 계정 전부가 대상이다. `NexonPollState.nextPollAt` 은 **매치 폴링**의
 * 것이라 여기서 쓰지 않는다 — 주기가 다르다(여기가 훨씬 짧다).
 * 대신 **가장 오래 안 본 것부터** 본다.
 */
export async function selectWatchTargets(limit: number): Promise<Array<{ ouid: string }>> {
  const rows = await prisma.$queryRaw<Array<{ ouid: string }>>`
    SELECT i."ouid"
    FROM "NexonIdentity" i
    LEFT JOIN LATERAL (
      SELECT o."observedAt"
      FROM "NexonIdentityObservation" o
      WHERE o."ouid" = i."ouid"
      ORDER BY o."observedAt" DESC
      LIMIT 1
    ) last ON TRUE
    WHERE i."supersededByOuid" IS NULL
    ORDER BY last."observedAt" ASC NULLS FIRST
    LIMIT ${limit}
  `
  return rows
}

export async function runIdentityWatch(
  ctx: JobContext,
  options: { limit?: number } = {},
): Promise<IdentityWatchResult> {
  const limit = options.limit ?? ctx.limit ?? 200
  const targets = await selectWatchTargets(limit)

  const result: IdentityWatchResult = {
    attempted: targets.length,
    polled: 0,
    changed: 0,
    failed: 0,
    sweepSeconds: sweepSeconds(targets.length, ctx.config.requestsPerSecond),
  }

  log(
    `신원 감시 대상 ${targets.length}명 · 초당 ${ctx.config.requestsPerSecond}회 → ` +
      `한 바퀴 약 ${Math.round(result.sweepSeconds)}초`,
  )

  if (ctx.dryRun) {
    log('--dry-run: 요청을 보내지 않는다. 대상 선정까지만 확인했다.')
    return result
  }

  const client = requireClient(ctx)

  for (const target of targets) {
    const now = new Date()
    try {
      const res = await client.getUserBasic(target.ouid)
      result.polled += 1

      const next: IdentitySnapshot = {
        userName: res.data.user_name ?? null,
        clanName: res.data.clan_name ?? null,
      }
      const { snapshot: prev, lastChangedAt } = await previousSnapshot(target.ouid)
      const changed: IdentityChange = diffIdentity(prev, next)

      if (changed) {
        await prisma.nexonIdentityObservation.create({
          data: {
            ouid: target.ouid,
            userName: next.userName,
            clanName: next.clanName,
            changed,
            prevUserName: prev?.userName ?? null,
            prevClanName: prev?.clanName ?? null,
            observedAt: now,
          },
        })
        if (changed !== 'first') {
          result.changed += 1
          log(
            `변경 감지 ${target.ouid.slice(0, 10)}… [${changed}] ` +
              `닉 "${prev?.userName ?? '-'}" → "${next.userName ?? '-'}" · ` +
              `클랜 "${prev?.clanName ?? '무소속'}" → "${next.clanName ?? '무소속'}"`,
          )
        }
        // 지금 값을 신원 행에도 반영한다 (화면은 이 값을 본다)
        await prisma.nexonIdentity.update({
          where: { ouid: target.ouid },
          data: { userName: next.userName, lastSeenAt: now, lastVerifiedAt: now },
        })
      } else {
        await prisma.nexonIdentity.update({
          where: { ouid: target.ouid },
          data: { lastVerifiedAt: now },
        })
      }

      // 다음에 언제 볼지는 등급으로 정한다 (로그로만 남긴다 — 별도 상태표를 아직 두지 않는다)
      const tier = nextWatchTier(changed, lastChangedAt, now)
      void nextWatchAt(tier, now)
    } catch (error) {
      result.failed += 1
      await handleJobError({
        error,
        source: 'nexon',
        jobKey: JOB_KEY,
        sourceId: target.ouid,
      })
    }
  }

  if (result.failed) warn(`실패 ${result.failed}건 — ImportFailure 에 남겼다`)
  log(
    `신원 감시 끝 — 조회 ${result.polled} · 변경 ${result.changed} · 실패 ${result.failed}`,
  )
  return result
}
