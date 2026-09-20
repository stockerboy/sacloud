import { prisma } from '@sacloud/db'
import { randomInt } from 'node:crypto'

/**
 * ★★자기소개 인증★★ — 병영수첩 프로필에 한 번 쓰는 문구를 적어 계정을 증명한다
 * (2026-09-20 사장님)
 *
 * > 「병영수첩에 자기아이디로 로그인하면 프로필들어와서 자기소개 바꿀 수있는데
 * >  여기다가 3분안에 sacloud 라고 쓰면 인증성공하고 그 아이디 연동되고」
 *
 * ── 흐름
 *
 *     ① 「인증 시작」    우리가 문구를 하나 만든다 — 예: `SACLOUD-7F3A`
 *     ② 사람이 병영수첩 프로필 → 자기소개에 그 문구를 적고 저장
 *     ③ 「확인」        우리가 그 계정의 프로필을 읽어 문구가 있는지 본다
 *     ④ 맞으면 연동     자기소개는 다시 바꿔도 된다
 *
 * ── ★왜 칭호 인증보다 나은가★
 *   칭호는 ★게임을 켜야 하고 가진 것 중에서만★ 고를 수 있다. 자기소개는
 *   ★브라우저만 있으면 되고 아무 글자나★ 쓸 수 있다. 그리고 우리는 그 선수의
 *   계정번호를 ★이미 알고 있어서★ 닉네임으로 사람을 찾는 단계가 통째로 없다.
 *
 * ── ★무엇이 이것을 안전하게 하나★
 *   · 문구는 ★그때 한 번 만드는 임의값★ 이다 — 남이 미리 써 둘 수 없다
 *   · ★3분★ 이 지나면 죽는다 (사장님이 정하신 시간)
 *   · 이미 남이 인증한 계정은 ★가져갈 수 없다★
 *   · 시도 횟수를 센다 — 무한정 두드릴 수 없다
 *
 * ⚠ ★칭호 인증을 지우지 않았다★ (CLAUDE.md 1-4). 둘 다 살아 있다.
 */

/** 문구가 살아 있는 시간 — 사장님: 「3분안에」 */
export const INTRO_TTL_MS = 3 * 60 * 1000

/** 한 도전에 몇 번까지 「확인」 을 눌러 볼 수 있나 */
const MAX_ATTEMPTS = 20

/**
 * ★문구를 만든다★ — `SACLOUD-XXXX`.
 *
 * ⚠ ★헷갈리는 글자를 뺐다★ (`0 O 1 I l`). 사람이 손으로 옮겨 적는 값이라
 *   한 글자만 틀려도 인증이 안 되는데, 그때 ★왜 안 되는지 알 길이 없다.★
 * ⚠ `Math.random` 을 쓰지 않는다 — 추측 가능한 값이면 관문이 아니다.
 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export function makeIntroPhrase(): string {
  let out = ''
  for (let i = 0; i < 4; i += 1) out += ALPHABET[randomInt(ALPHABET.length)]
  return `SACLOUD-${out}`
}

export interface IntroChallengeView {
  /** 적어야 하는 문구 */
  phrase: string
  /** 언제까지 (ISO) */
  expiresAt: string
  /** 도전을 시작할 때 적혀 있던 자기소개 — 끝나고 되돌릴 때 쓴다 */
  baseline: string | null
  attempts: number
}

/**
 * ★지금 열려 있는 도전을 준다. 없으면 새로 연다★
 *
 * ⚠ ★이미 남이 인증한 계정이면 열지 않는다.★ 모르는 채로 시간을 쓰게 두면 안 된다.
 */
export async function openIntroChallenge(input: {
  userId: string
  usn: string
  playerId: string | null
  nickname: string | null
  baseline: string | null
  now?: Date
}): Promise<IntroChallengeView | { taken: true }> {
  const now = input.now ?? new Date()

  const taken = await prisma.introChallenge.findFirst({
    where: { usn: input.usn, status: 'verified', NOT: { userId: input.userId } },
    select: { id: true },
  })
  if (taken) return { taken: true }

  const open = await prisma.introChallenge.findFirst({
    where: { userId: input.userId, usn: input.usn, status: 'pending', expiresAt: { gt: now } },
    orderBy: { issuedAt: 'desc' },
  })
  if (open) {
    return {
      phrase: open.expectedIntro,
      expiresAt: open.expiresAt.toISOString(),
      baseline: open.baselineIntro,
      attempts: open.attempts,
    }
  }

  /* 지난 도전은 ★지우지 않고★ 만료로 닫는다 — 언제 무엇을 했는지 남는다 */
  await prisma.introChallenge.updateMany({
    where: { userId: input.userId, usn: input.usn, status: 'pending' },
    data: { status: 'expired' },
  })

  const made = await prisma.introChallenge.create({
    data: {
      userId: input.userId,
      usn: input.usn,
      playerId: input.playerId,
      nickname: input.nickname,
      expectedIntro: makeIntroPhrase(),
      baselineIntro: input.baseline,
      expiresAt: new Date(now.getTime() + INTRO_TTL_MS),
    },
  })
  return {
    phrase: made.expectedIntro,
    expiresAt: made.expiresAt.toISOString(),
    baseline: made.baselineIntro,
    attempts: 0,
  }
}

export type IntroCheckOutcome =
  | 'verified'
  | 'not-yet'
  | 'expired'
  | 'no-challenge'
  | 'too-many'
  | 'taken'
  | 'unreadable'

export interface IntroCheckResult {
  outcome: IntroCheckOutcome
  /** 마지막으로 읽은 자기소개 — 「안 된다」 고만 하면 사람이 고칠 수가 없다 */
  seen?: string | null
  phrase?: string
}

/**
 * ★확인★ — 지금 병영수첩에 적힌 자기소개를 읽어 문구와 맞춰 본다.
 *
 * `readIntro` 를 밖에서 받는다. 이 파일은 ★넥슨을 어떻게 읽는지 모른다★ —
 * 시험이 가짜 읽기를 끼워 넣을 수 있어야 하고, 읽는 길이 바뀌어도 여기는 안 바뀐다.
 */
export async function checkIntroChallenge(input: {
  userId: string
  usn: string
  readIntro: (usn: string) => Promise<string | null>
  now?: Date
}): Promise<IntroCheckResult> {
  const now = input.now ?? new Date()

  const open = await prisma.introChallenge.findFirst({
    where: { userId: input.userId, usn: input.usn, status: 'pending' },
    orderBy: { issuedAt: 'desc' },
  })
  if (!open) return { outcome: 'no-challenge' }

  if (open.expiresAt.getTime() <= now.getTime()) {
    await prisma.introChallenge.update({ where: { id: open.id }, data: { status: 'expired' } })
    return { outcome: 'expired', phrase: open.expectedIntro }
  }
  if (open.attempts >= MAX_ATTEMPTS) {
    await prisma.introChallenge.update({ where: { id: open.id }, data: { status: 'expired' } })
    return { outcome: 'too-many', phrase: open.expectedIntro }
  }

  /* 그 사이에 남이 가져갔을 수 있다 — 쓰기 직전에 한 번 더 본다 */
  const taken = await prisma.introChallenge.findFirst({
    where: { usn: input.usn, status: 'verified', NOT: { userId: input.userId } },
    select: { id: true },
  })
  if (taken) return { outcome: 'taken', phrase: open.expectedIntro }

  let seen: string | null
  try {
    seen = await input.readIntro(input.usn)
  } catch {
    /* 넥슨이 답을 안 준 것은 ★그 사람 잘못이 아니다★ — 시도 횟수를 올리지 않는다 */
    return { outcome: 'unreadable', phrase: open.expectedIntro }
  }

  /*
   * ⚠ ★포함만 되면 통과다★ — 사장님 말씀대로 「여기다가 쓰면」 이다.
   *   원래 적어 둔 소개를 지우게 만들 이유가 없다. 앞뒤에 다른 말이 있어도 된다.
   * ⚠ 대소문자는 가리지 않는다 — 손으로 옮겨 적는 값이다.
   */
  const hit = (seen ?? '').toUpperCase().includes(open.expectedIntro.toUpperCase())

  await prisma.introChallenge.update({
    where: { id: open.id },
    data: {
      attempts: { increment: 1 },
      lastCheckedAt: now,
      lastSeenIntro: seen,
      ...(hit ? { status: 'verified', verifiedAt: now } : {}),
    },
  })

  return { outcome: hit ? 'verified' : 'not-yet', seen, phrase: open.expectedIntro }
}

/** ★이 계정이 이 사람 것으로 증명됐나★ — 관문이 묻는다. 모르면 `false` 다 */
export async function isIntroVerified(userId: string, usn: string): Promise<boolean> {
  try {
    const row = await prisma.introChallenge.findFirst({
      where: { userId, usn, status: 'verified' },
      select: { id: true },
    })
    return row !== null
  } catch {
    return false
  }
}

/* -------------------------------------------------------------------------- */
/* 화면이 묻는 것                                                                */
/* -------------------------------------------------------------------------- */

export interface IntroState {
  /** idle | waiting | checking | verified | expired */
  status: 'idle' | 'waiting' | 'checking' | 'verified' | 'expired'
  /** 적어야 하는 문구 (없으면 `null`) */
  phrase: string | null
  /** 언제까지 (ISO) */
  expiresAt: string | null
  /** 인증된 계정의 닉 — 끝난 뒤 「누구로 인증됐나」 를 보여 준다 */
  nickname: string | null
  /** 마지막으로 읽은 자기소개 — 안 맞을 때 사람이 고칠 수 있어야 한다 */
  seen: string | null
  attempts: number
}

/**
 * ★지금 내 인증이 어디까지 왔나★
 *
 * ⚠ ★「확인하는 중」 을 따로 둔다★ — 워커가 읽어 줄 때까지 최대 1분이 걸린다.
 *   그 사이 화면이 「아직 안 됐다」 라고만 하면 ★사람이 문구를 다시 적는다.★
 */
export async function introVerificationState(userId: string, usn?: string): Promise<IntroState> {
  const now = new Date()
  const row = await prisma.introChallenge.findFirst({
    where: { userId, ...(usn ? { usn } : {}) },
    orderBy: [{ status: 'asc' }, { issuedAt: 'desc' }],
  })
  /* `verified` 가 있으면 그게 우선이다 — 위 정렬로는 보장이 안 된다 */
  const done = await prisma.introChallenge.findFirst({
    where: { userId, status: 'verified', ...(usn ? { usn } : {}) },
    orderBy: { verifiedAt: 'desc' },
  })
  const pick = done ?? row
  if (!pick) {
    return { status: 'idle', phrase: null, expiresAt: null, nickname: null, seen: null, attempts: 0 }
  }
  const base = {
    phrase: pick.expectedIntro,
    expiresAt: pick.expiresAt.toISOString(),
    nickname: pick.nickname,
    seen: pick.lastSeenIntro,
    attempts: pick.attempts,
  }
  if (pick.status === 'verified') return { ...base, status: 'verified' }
  if (pick.status !== 'pending' || pick.expiresAt.getTime() <= now.getTime()) {
    return { ...base, status: 'expired' }
  }
  return { ...base, status: pick.checkRequestedAt ? 'checking' : 'waiting' }
}

/**
 * ★「확인해 주세요」 표시만 남긴다★ — 읽는 것은 워커다.
 *
 * 사이트는 병영수첩을 직접 못 읽는다 (서버에서 부르면 403).
 * 그래서 여기서는 ★시각만 찍고★ 화면은 「확인하는 중」 으로 기다린다.
 */
export async function requestIntroCheck(userId: string, usn: string): Promise<IntroState> {
  await prisma.introChallenge.updateMany({
    where: { userId, usn, status: 'pending', expiresAt: { gt: new Date() } },
    data: { checkRequestedAt: new Date() },
  })
  return introVerificationState(userId, usn)
}

/** ★진행 중인 도전을 접는다★ — 지우지 않고 만료로 닫는다 */
export async function cancelIntroChallenge(userId: string): Promise<void> {
  await prisma.introChallenge.updateMany({
    where: { userId, status: 'pending' },
    data: { status: 'expired' },
  })
}
