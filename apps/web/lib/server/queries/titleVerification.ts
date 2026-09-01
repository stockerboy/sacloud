/**
 * 서든어택 계정 **소유권 증명** — 게임 칭호 `[용병]` 로 한다 (2026-09-01).
 *
 * ── 무엇을 푸는가
 *   Phase 7 이 남긴 숙제다: *"서든어택 계정 연동이 소유권을 증명하지 않는다.
 *   닉네임으로 연결만 한다"* (CLAUDE.md 8장). 넥슨 Open API 는 전부 **공개 조회**라
 *   OAuth 도 동의 흐름도 없다. 그래서 **그 계정에 실제로 로그인해야만 할 수 있는 일**을
 *   시켜서 증명한다 — 게임 안에서 칭호를 바꾸는 것이다.
 *
 * ── 흐름 (사용자 확정, 2026-09-01)
 * ```
 *   ① 회원이 자기 서든 닉네임을 넣는다
 *   ② 게임에서 칭호를 `[용병]` 으로 바꾼다
 *   ③ 「확인」 → 넥슨 조회 2회(닉→ouid, ouid→칭호) → 맞으면 **바로 승인**
 *   ④ 칭호는 다시 바꿔도 된다
 * ```
 *
 * ── ⚠ `docs/TITLE_VERIFICATION_SPEC.md` 와 다른 점
 *   SPEC 은 사람마다 **다른 1회용 문구**를 발급하는 설계였다. 사용자가 **고정 `[용병]`**
 *   으로 바꿨다. 발급 API 가 사라져 훨씬 단순하다. SPEC 문서는 지우지 않고
 *   「⚠ 정정」 절을 덧붙여 두었다 (CLAUDE.md 10-4).
 *
 * ── ⚠ 고정 칭호의 알려진 약점
 *   어쩌다 `[용병]` 을 달고 있는 **남의 닉네임**을 다른 사람이 자기 것이라고 주장할 수 있다.
 *   1회용 문구라면 없는 문제다. 줄이는 장치가 셋이다.
 *     ① **먼저 인증한 사람이 임자** — 부분 유니크 인덱스가 DB 에서 막는다
 *     ② 인증 시각과 **그때 읽은 칭호**를 남긴다 — 다툼이 생기면 근거가 된다
 *     ③ 시도 제한 — 남의 닉네임을 계속 찔러볼 수 없다
 *
 * ── 넥슨을 언제 부르는가
 *   **사람이 「확인」을 누를 때만** 부른다. 배경 폴링을 여기서 돌리지 않는다.
 *   키가 없으면 부르지 않고 `available: false` 로 답한다 — 있는 척하지 않는다.
 */
import { prisma } from '@sacloud/db'
import {
  REQUIRED_TITLE,
  TITLE_CHALLENGE_TTL_MINUTES,
  TITLE_CHALLENGE_MAX_ATTEMPTS,
  canManualTitleCheck,
  effectiveChallengeStatus,
  matchesRequiredTitle,
  normalizeTitleName,
  type TitleVerificationOutcome,
  type TitleVerificationState,
} from '@sacloud/contract'
import { NexonApiError, NexonClient, hasApiKey, readNexonConfig } from '@sacloud/nexon'
import { toKstIsoOrNull } from '../format'
import { toPlayerSummaryOrNull } from '../mappers'

/** 연결 근거. `NexonIdentity.linkReason` 에 그대로 들어간다 */
const LINK_REASON = 'title-challenge'

type ChallengeRow = {
  id: string
  userId: string
  ouid: string
  nickname: string | null
  status: string
  expiresAt: Date
  attempts: number
  lastCheckedAt: Date | null
  lastSeenTitle: string | null
  verifiedAt: Date | null
}

/* -------------------------------------------------------------------------- */
/* 소유 관문이 묻는 질문                                                          */
/* -------------------------------------------------------------------------- */

/**
 * **이 계정이 이 선수를 칭호 인증으로 증명했나.**
 *
 * `apps/web/lib/server/ownership.ts` 의 소유 관문이 이 함수를 부른다.
 * 관문이 500 나면 안 되므로 **어떤 경우에도 예외를 던지지 않는다.**
 * 판단이 서지 않으면 `false` — 모르면 못 하게 한다.
 */
export async function isTitleVerified(userId: string, playerId: string): Promise<boolean> {
  try {
    const link = await prisma.userPlayerLink.findUnique({ where: { userId } })
    if (!link || link.playerId !== playerId) return false

    const verified = await prisma.titleChallenge.findFirst({
      where: { userId, status: 'verified' },
      select: { id: true },
    })
    return verified !== null
  } catch (error) {
    console.error('[title-verification] isTitleVerified', error)
    return false
  }
}

/**
 * `isTitleVerified` 의 다른 이름. 두 팀이 서로 다른 이름을 쓰다 안 붙는 일이 없게 둘 다 낸다.
 * **새 코드는 `isTitleVerified` 를 쓴다.**
 */
export const isVerifiedOwner = isTitleVerified

/* -------------------------------------------------------------------------- */
/* 상태 조회                                                                     */
/* -------------------------------------------------------------------------- */

/** 넥슨 조회 수단이 있나. 없으면 화면이 「준비 중」으로 막는다 */
export function titleVerificationAvailable(): boolean {
  return hasApiKey(readNexonConfig())
}

/** 지금 이 회원의 증명 상태 */
export async function titleVerificationState(
  userId: string,
  outcome: TitleVerificationOutcome | null = null,
  now: Date = new Date(),
): Promise<TitleVerificationState> {
  const [challenge, link] = await Promise.all([
    prisma.titleChallenge.findFirst({
      where: { userId },
      /* 인증된 줄이 있으면 그것이 답이다. 없으면 가장 최근 시도 */
      orderBy: [{ verifiedAt: 'desc' }, { issuedAt: 'desc' }],
    }),
    prisma.userPlayerLink.findUnique({ where: { userId }, include: { player: true } }),
  ])

  const available = titleVerificationAvailable()

  if (!challenge) {
    return {
      status: 'none',
      required_title: REQUIRED_TITLE,
      nickname: null,
      last_seen_title: null,
      outcome,
      attempts_left: null,
      expires_at: null,
      verified_at: null,
      player: null,
      available,
    }
  }

  const status = effectiveChallengeStatus(challenge, now)

  return {
    status,
    required_title: REQUIRED_TITLE,
    nickname: challenge.nickname,
    last_seen_title: challenge.lastSeenTitle,
    outcome,
    attempts_left:
      status === 'pending' ? Math.max(0, TITLE_CHALLENGE_MAX_ATTEMPTS - challenge.attempts) : null,
    expires_at: status === 'pending' ? toKstIsoOrNull(challenge.expiresAt) : null,
    verified_at: toKstIsoOrNull(challenge.verifiedAt),
    /* 인증된 사람에게만 연결된 선수를 보여 준다. 여기 값이 있으면 프로필 관리가 열린다 */
    player: status === 'verified' ? toPlayerSummaryOrNull(link?.player) : null,
    available,
  }
}

/* -------------------------------------------------------------------------- */
/* 확인                                                                         */
/* -------------------------------------------------------------------------- */

export interface CheckResult {
  outcome: TitleVerificationOutcome
  /** 사람이 너무 빨리 다시 눌렀다. 몇 초 뒤에 되는지 */
  retryAfterSeconds?: number
}

/**
 * 「확인」 — 닉네임을 받아 지금 칭호를 읽고 판정한다.
 *
 * **넥슨 호출은 최대 2회다** (닉→ouid, ouid→칭호). 그 외에는 부르지 않는다.
 */
export async function checkTitleVerification(input: {
  userId: string
  nickname: string
  now?: Date
}): Promise<CheckResult> {
  const now = input.now ?? new Date()
  const nickname = input.nickname.trim()
  if (nickname === '') return { outcome: 'unknown-nickname' }

  /* 이미 인증을 마쳤으면 넥슨을 부를 이유가 없다 */
  const done = await prisma.titleChallenge.findFirst({
    where: { userId: input.userId, status: 'verified' },
    select: { id: true },
  })
  if (done) return { outcome: 'verified' }

  const config = readNexonConfig()
  if (!hasApiKey(config)) return { outcome: 'unavailable' }

  /* 연타 방지 — 열려 있는 도전에 마지막으로 찍힌 시각을 본다 */
  const open = await prisma.titleChallenge.findFirst({
    where: { userId: input.userId, status: 'pending' },
    orderBy: { issuedAt: 'desc' },
  })
  if (open && !canManualTitleCheck(open.lastCheckedAt, now)) {
    const waited = now.getTime() - (open.lastCheckedAt?.getTime() ?? 0)
    return { outcome: 'closed', retryAfterSeconds: Math.max(1, Math.ceil((10_000 - waited) / 1000)) }
  }
  if (open && effectiveChallengeStatus(open, now) !== 'pending') {
    /* 만료·소진된 줄을 닫아 둔다. 부분 유니크 인덱스가 영구 선점되지 않게 하는 장치다 */
    await closeChallenge(open.id, effectiveChallengeStatus(open, now))
  }

  const client = new NexonClient({ config })

  /* ① 닉네임 → ouid. `/id` 는 **지금 그 닉을 쓰는 사람**을 준다 (D-220).
        소유권 증명에서는 그게 정확히 우리가 원하는 사람이다 */
  let ouid: string
  try {
    const result = await client.getOuid(nickname)
    /* 넥슨 스키마는 관대하다 — 값이 없거나 빈 문자열이면 `ouid` 가 `null` 로 온다
       (`packages/nexon/src/schemas.ts` 의 `LooseString`). 그 닉을 쓰는 사람이 없다는 뜻이므로
       **값을 지어내지 않고** 「모르는 닉」으로 돌려준다 */
    if (result.data.ouid === null) return { outcome: 'unknown-nickname' }
    ouid = result.data.ouid
  } catch (error) {
    return { outcome: nexonOutcome(error, 'unknown-nickname') }
  }

  /* ② 먼저 인증한 사람이 임자 — 남이 이미 증명한 계정은 가져갈 수 없다 */
  const takenBySomeoneElse = await prisma.titleChallenge.findFirst({
    where: { ouid, status: 'verified', NOT: { userId: input.userId } },
    select: { id: true },
  })
  if (takenBySomeoneElse) return { outcome: 'taken' }

  const challenge = await openChallenge({ userId: input.userId, ouid, nickname, now })
  if (!challenge) return { outcome: 'taken' }

  /* ③ 칭호를 읽는다 */
  let observedTitle: string | null
  try {
    const basic = await client.getUserBasic(ouid)
    observedTitle = normalizeTitleName(basic.data.title_name)
  } catch (error) {
    await prisma.titleChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 }, lastCheckedAt: now },
    })
    return { outcome: nexonOutcome(error, 'unavailable') }
  }

  /* ④ 판정. 관측한 칭호는 **성공이든 실패든 남긴다** — 나중의 근거다 */
  const passed = matchesRequiredTitle(observedTitle)
  await prisma.titleChallenge.update({
    where: { id: challenge.id },
    data: {
      attempts: { increment: 1 },
      lastCheckedAt: now,
      lastSeenTitle: observedTitle,
      ...(passed ? { status: 'verified', verifiedAt: now } : {}),
    },
  })

  if (!passed) {
    /* 넥슨이 칭호를 안 주면 `알수없음` 이고 인증 실패다. 지어내지 않는다 */
    return { outcome: observedTitle === null ? 'no-title' : 'wrong-title' }
  }

  await grantOwnership({ userId: input.userId, ouid, nickname, now })
  return { outcome: 'verified' }
}

/** 진행 중인 증명을 접는다 */
export async function cancelTitleVerification(userId: string): Promise<void> {
  await prisma.titleChallenge.updateMany({
    where: { userId, status: 'pending' },
    data: { status: 'cancelled' },
  })
}

/* -------------------------------------------------------------------------- */
/* 내부                                                                         */
/* -------------------------------------------------------------------------- */

function nexonOutcome(
  error: unknown,
  onBadRequest: TitleVerificationOutcome,
): TitleVerificationOutcome {
  if (error instanceof NexonApiError) {
    /* 400 = 그런 닉네임이 없다. 그 외(403·429·5xx·네트워크)는 우리 사정이다 */
    if (error.kind === 'bad_request') return onBadRequest
    console.error('[title-verification] nexon', error.kind, error.httpStatus)
    return 'unavailable'
  }
  console.error('[title-verification] nexon', error)
  return 'unavailable'
}

async function closeChallenge(id: string, status: string): Promise<void> {
  await prisma.titleChallenge.updateMany({
    where: { id, status: 'pending' },
    data: { status },
  })
}

/**
 * 이 `ouid` 에 대한 열린 도전을 잡는다.
 *
 * `ouid` 당 열린 도전은 하나뿐이다 (부분 유니크 인덱스). 남이 잡고 있으면 `null` —
 * 여럿이 같은 계정에 도전을 걸어 두고 하나가 우연히 맞기를 기다리는 것을 막는다.
 * 그 줄이 이미 만료됐으면 닫고 넘겨받는다. **영구 선점은 없다.**
 */
async function openChallenge(input: {
  userId: string
  ouid: string
  nickname: string
  now: Date
}): Promise<ChallengeRow | null> {
  const expiresAt = new Date(input.now.getTime() + TITLE_CHALLENGE_TTL_MINUTES * 60_000)

  const existing = await prisma.titleChallenge.findFirst({
    where: { ouid: input.ouid, status: 'pending' },
  })

  if (existing) {
    const status = effectiveChallengeStatus(existing, input.now)
    if (status === 'pending') {
      if (existing.userId !== input.userId) return null
      return existing
    }
    /* 만료·소진 — 닫고 새로 연다 */
    await closeChallenge(existing.id, status)
  }

  try {
    return await prisma.titleChallenge.create({
      data: {
        userId: input.userId,
        ouid: input.ouid,
        nickname: input.nickname,
        expectedTitle: REQUIRED_TITLE,
        /* 고정 칭호 방식에서는 기준 칭호를 쓰지 않는다 (칸은 남겨 둔다) */
        baselineTitle: null,
        expiresAt,
      },
    })
  } catch (error) {
    /* 부분 유니크 인덱스 위반 = 그 사이에 남이 잡았다. 경합은 조용히 진다 */
    console.warn('[title-verification] open race', error)
    return null
  }
}

/**
 * 인증 성공 처리.
 *
 * ① `NexonIdentity` 에 연결 근거를 남긴다
 * ② 선수를 찾거나(없으면) 만든다
 * ③ `UserPlayerLink` 를 만든다 → **여기가 열리면 프로필 관리가 열린다**
 * ④ `EggBreak` 를 남긴다 — **이미 깨져 있으면 손대지 않는다**
 *
 * 이 단계가 실패해도 `TitleChallenge.status='verified'` 는 이미 남아 있다.
 * 증명 사실과 그 뒤처리를 분리해 둔다 — 뒤처리는 다시 시도할 수 있다.
 */
async function grantOwnership(input: {
  userId: string
  ouid: string
  nickname: string
  now: Date
}): Promise<void> {
  try {
    const playerId = await resolvePlayerId(input.ouid, input.nickname)

    await prisma.nexonIdentity.upsert({
      where: { ouid: input.ouid },
      create: {
        ouid: input.ouid,
        userName: input.nickname,
        playerId,
        linkedAt: input.now,
        linkReason: LINK_REASON,
        linkedBy: input.userId,
      },
      update: {
        userName: input.nickname,
        playerId,
        linkedAt: input.now,
        linkReason: LINK_REASON,
        linkedBy: input.userId,
        lastSeenAt: input.now,
        /* `status` 는 건드리지 않는다 — 신원 병합(`playerMerge`)이 쓰는 값이라
           여기서 바꾸면 그쪽 판단이 흔들린다 */
      },
    })

    if (!playerId) return

    /* 그 선수가 이미 **다른 회원**에게 붙어 있으면 빼앗지 않는다 */
    const owned = await prisma.userPlayerLink.findUnique({ where: { playerId } })
    if (owned && owned.userId !== input.userId) return

    await prisma.userPlayerLink.upsert({
      where: { userId: input.userId },
      create: { userId: input.userId, playerId, verifiedAt: input.now },
      update: { playerId, verifiedAt: input.now },
    })

    /* 알을 깬다. **이미 깨져 있으면 그대로 둔다** —
       `reason='admin'`(관리자 시험)을 `verified` 로 덮으면 그 흔적이 사라진다 (D-222) */
    const broken = await prisma.eggBreak.findUnique({
      where: { targetKind_targetId: { targetKind: 'player', targetId: playerId } },
    })
    if (!broken) {
      await prisma.eggBreak.create({
        data: {
          targetKind: 'player',
          targetId: playerId,
          reason: 'verified',
          brokenByUserId: input.userId,
        },
      })
    }
  } catch (error) {
    /* 증명 자체는 이미 기록됐다. 뒤처리 실패로 인증을 되돌리지 않는다 */
    console.error('[title-verification] grantOwnership', error)
  }
}

/**
 * `ouid` 에 해당하는 선수를 찾는다. 없으면 만든다.
 *
 * ── 왜 닉네임 일치를 조심하는가 (D-220)
 *   닉은 식별자가 아니다. 같은 닉의 옛 주인이 남긴 선수 행에 붙이면 **남의 전적**을
 *   가져가게 된다. 그래서 닉으로 찾은 행은 **주인도 없고 ouid 도 안 붙은 것만** 받아들인다.
 */
async function resolvePlayerId(ouid: string, nickname: string): Promise<string | null> {
  const byOuid = await prisma.player.findUnique({ where: { nexonOuid: ouid }, select: { id: true } })
  if (byOuid) return byOuid.id

  const identity = await prisma.nexonIdentity.findUnique({
    where: { ouid },
    select: { playerId: true },
  })
  if (identity?.playerId) return identity.playerId

  const byName = await prisma.player.findFirst({
    where: { name: nickname, nexonOuid: null, userLink: null },
    select: { id: true },
  })
  if (byName) {
    await prisma.player.update({ where: { id: byName.id }, data: { nexonOuid: ouid } })
    return byName.id
  }

  const created = await prisma.player.create({
    data: { name: nickname, nexonOuid: ouid, origin: 'sacloud' },
    select: { id: true },
  })
  return created.id
}
