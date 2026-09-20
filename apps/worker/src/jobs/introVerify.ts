import { prisma } from '@sacloud/db'
import { barracksBrowser } from '../nexon/browserFetch.js'
import { log } from '../lib/log.js'

/**
 * ★★자기소개 인증 — 워커가 대신 읽어 준다★★ (2026-09-20 사장님)
 *
 * > 「병영수첩에 자기아이디로 로그인하면 프로필들어와서 자기소개 바꿀 수있는데
 * >  여기다가 3분안에 sacloud 라고 쓰면 인증성공하고」
 *
 * ── ★왜 워커가 하나★
 *   병영수첩은 ★서버에서 부르면 403★ 이다 (실측 · `api/ingest/barracks` 주석).
 *   헤더를 위조해 뚫지 않는다 (CLAUDE.md 3-4). 진짜 브라우저를 띄울 수 있는 것은
 *   ★VPS 의 워커★ 뿐이라, 사이트는 「확인해 달라」 는 표시만 남기고 여기서 읽는다.
 *
 * ── 하는 일
 *   ① 「확인」 을 부탁받았고 아직 안 끝난 도전을 고른다
 *   ② 그 계정의 병영수첩 프로필을 읽는다
 *   ③ 자기소개에 ★그 사람에게 준 문구★ 가 들어 있으면 인증 완료
 *
 * ⚠ ★포함만 되면 통과다★ — 원래 적어 둔 소개를 지우게 만들 이유가 없다.
 * ⚠ ★대소문자를 가리지 않는다★ — 손으로 옮겨 적는 값이다.
 * ⚠ 넥슨이 답을 안 주면 ★실패로 세지 않는다★ — 그 사람 잘못이 아니다.
 */

const PROFILE_PATH = '/api/Profile/GetProfileMain/'

/** 한 판에 몇 명까지 봐 주나 — 30초마다 도는 잡이라 크게 잡을 이유가 없다 */
const BATCH = 20

export interface IntroVerifyResult {
  looked: number
  verified: number
  notYet: number
  expired: number
  unreadable: number
  /** ★실제로 계정을 이어 준 수★ — 인증만 되고 안 이어지면 사람 눈엔 실패다 */
  linked: number
}

/** 병영수첩 프로필에서 자기소개를 읽는다. 못 읽으면 `null` 이 아니라 던진다 */
async function readIntro(usn: string): Promise<string | null> {
  const r = await barracksBrowser().call('POST', PROFILE_PATH + encodeURIComponent(usn), '{}')
  if (r.status !== 200) throw new Error('프로필 응답 ' + r.status)
  const doc = JSON.parse(r.body) as { result?: { profileInfo?: { user_intro?: string | null } } }
  return doc.result?.profileInfo?.user_intro ?? null
}

export async function runIntroVerify(input: { confirm: boolean }): Promise<IntroVerifyResult> {
  const now = new Date()
  const out: IntroVerifyResult = { looked: 0, verified: 0, notYet: 0, expired: 0, unreadable: 0, linked: 0 }

  /* 시간이 지난 도전부터 닫는다 — 읽어 봐야 소용이 없다 */
  if (input.confirm) {
    const closed = await prisma.introChallenge.updateMany({
      where: { status: 'pending', expiresAt: { lte: now } },
      data: { status: 'expired' },
    })
    out.expired = closed.count
  }

  const waiting = await prisma.introChallenge.findMany({
    where: { status: 'pending', expiresAt: { gt: now }, checkRequestedAt: { not: null } },
    orderBy: { checkRequestedAt: 'asc' },
    take: BATCH,
  })

  for (const row of waiting) {
    out.looked += 1
    let seen: string | null
    try {
      seen = await readIntro(row.usn)
    } catch {
      out.unreadable += 1
      continue
    }
    const hit = (seen ?? '').toUpperCase().includes(row.expectedIntro.toUpperCase())
    if (hit) out.verified += 1
    else out.notYet += 1

    if (!input.confirm) continue
    await prisma.introChallenge.update({
      where: { id: row.id },
      data: {
        attempts: { increment: 1 },
        lastCheckedAt: now,
        lastSeenIntro: seen,
        /* ★본 뒤에는 부탁을 지운다★ — 안 지우면 같은 사람을 계속 다시 읽는다 */
        checkRequestedAt: null,
        ...(hit ? { status: 'verified', verifiedAt: now } : {}),
      },
    })

    /*
     * ★★인증이 끝나면 계정을 실제로 잇는다★★ (2026-09-20 · 사장님이 잡아 주셨다)
     *
     * > 「나 계정인증 성공했는데 여기 준비중이라고 떠」
     *
     *   ⚠ 처음에는 ★도전을 `verified` 로 바꾸기만★ 했다. 그러면 인증은 됐는데
     *     ★마이페이지의 「서든어택 계정」 이 그대로 비어 있다.★ 사람 눈에는
     *     ★인증이 안 된 것★ 이다. 연동은 `UserPlayerLink` 한 곳이 말한다 —
     *     칭호 인증도 거기에 쓴다. 두 길이 ★같은 자리★ 에 닿아야 한다.
     *
     * ⚠ ★남의 것을 빼앗지 않는다★ — 그 선수가 이미 다른 회원에게 붙어 있으면 둔다.
     * ⚠ 이 단계가 실패해도 ★인증 자체는 남긴다★ — 다음 판에 다시 이어 줄 수 있다.
     */
    if (hit && row.playerId) {
      try {
        const owned = await prisma.userPlayerLink.findUnique({ where: { playerId: row.playerId } })
        if (!owned || owned.userId === row.userId) {
          await prisma.userPlayerLink.upsert({
            where: { userId: row.userId },
            create: { userId: row.userId, playerId: row.playerId, verifiedAt: now },
            update: { playerId: row.playerId, verifiedAt: now },
          })
          out.linked += 1
        }
      } catch {
        /* 못 이어도 인증은 남는다 — 다음 판에 다시 해 볼 수 있다 */
      }
    }
  }

  log(
    `자기소개 인증 — 본 사람 ${out.looked} · 성공 ${out.verified} · 아직 ${out.notYet} · ` +
      `시간지남 ${out.expired} · 못읽음 ${out.unreadable} · ★연동 ${out.linked}★` +
      (input.confirm ? '' : ' (미리보기)'),
  )
  return out
}
