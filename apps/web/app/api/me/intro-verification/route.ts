/**
 * ★★자기소개로 계정 증명★★ (2026-09-20 사장님)
 *
 * > 「병영수첩에 자기아이디로 로그인하면 프로필들어와서 자기소개 바꿀 수있는데
 * >  여기다가 3분안에 sacloud 라고 쓰면 인증성공하고 그 아이디 연동되고」
 *
 * ```
 *   GET     지금 내 인증이 어디까지 왔나
 *   POST    { nickname }          문구를 받는다 (도전 시작)
 *   PUT     { nickname }          「확인해 주세요」  ← 읽는 것은 워커다
 *   DELETE                        진행 중인 도전을 접는다
 * ```
 *
 * ── ⚠ ★여기서는 병영수첩을 부르지 않는다★
 *   서버에서 부르면 403 이다 (실측 · `api/ingest/barracks` 주석). 진짜 브라우저를
 *   띄울 수 있는 것은 ★VPS 워커★ 뿐이라, 여기서는 ★부탁만 남기고★ 워커가 읽는다.
 *   그래서 이 끝점은 넥슨을 한 번도 안 부른다 — 빠르고, 막힐 일이 없다.
 *
 * ── 전부 로그인 필요
 *   개인 정보다. 엣지 캐시(`okPublic`)를 쓰지 않는다 — 엣지는 쿠키를 구분하지 않아
 *   남의 인증 상태가 섞여 나간다.
 *
 * ── 회원가입을 막지 않는다
 *   인증은 ★가입 후 선택★ 이다. 여기서 실패해도 계정에는 아무 일도 없다.
 */
import { prisma } from '@sacloud/db'
import { badRequest, guard, notFound, ok, tooManyRequests, unauthorized } from '@/lib/server/respond'
import { jsonBody } from '@/lib/server/request'
import { currentUserId } from '@/lib/server/session'
import { clientIdentity, consumeQuota, logThrottle } from '@/lib/server/rateLimit'
import {
  cancelIntroChallenge,
  introVerificationState,
  openIntroChallenge,
  requestIntroCheck,
} from '@/lib/server/queries/introVerification'

/**
 * 시도 제한 — ★계정당 1시간에 40회★.
 *
 * 칭호 인증(30회)보다 조금 넉넉하다. 이쪽은 ★확인을 여러 번 누르게 되는 구조★ 라서다 —
 * 워커가 읽어 줄 때까지 기다리다 한 번 더 누르는 일이 흔하다.
 * ⚠ 그래도 상한은 둔다. 없으면 남의 닉네임을 계속 찔러볼 수 있다.
 */
const QUOTA = { limit: 40, windowSeconds: 60 * 60 }

/** ★닉네임 → 병영수첩 계정번호★ — 우리 표에서 찾는다. 넥슨을 부르지 않는다 */
async function usnOfNickname(nickname: string): Promise<{ usn: string; playerId: string } | null> {
  const player = await prisma.player.findFirst({
    where: { name: { equals: nickname, mode: 'insensitive' }, sourcePlayerId: { startsWith: 'BRK-' } },
    select: { id: true, sourcePlayerId: true },
    orderBy: { createdAt: 'asc' },
  })
  const src = player?.sourcePlayerId
  if (!player || !src) return null
  return { usn: src.slice('BRK-'.length), playerId: player.id }
}

function nicknameOf(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null
  const v = (body as Record<string, unknown>).nickname
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length > 0 && t.length <= 40 ? t : null
}

/** GET — 지금 상태 */
export async function GET(request: Request) {
  return guard(async () => {
    const userId = await currentUserId(request)
    if (!userId) return unauthorized()
    return ok(await introVerificationState(userId))
  })
}

/** POST — 문구를 받는다 */
export async function POST(request: Request) {
  return guard(async () => {
    const userId = await currentUserId(request)
    if (!userId) return unauthorized()

    const nickname = nicknameOf(await jsonBody(request))
    if (!nickname) return badRequest('서든어택 닉네임을 입력해주세요')

    const found = await usnOfNickname(nickname)
    if (!found) {
      /* ★없는 닉이라고 말해 준다★ — 「안 된다」 고만 하면 사람이 고칠 수가 없다 */
      return notFound('그 닉네임으로 기록이 없습니다. 경기 기록이 쌓인 뒤에 인증할 수 있습니다')
    }

    const made = await openIntroChallenge({
      userId,
      usn: found.usn,
      playerId: found.playerId,
      nickname,
      baseline: null,
    })
    if ('taken' in made) {
      return badRequest('이미 다른 계정이 인증한 아이디입니다')
    }
    return ok(await introVerificationState(userId, found.usn))
  })
}

/** PUT — 「확인해 주세요」 */
export async function PUT(request: Request) {
  return guard(async () => {
    const userId = await currentUserId(request)
    if (!userId) return unauthorized()

    const nickname = nicknameOf(await jsonBody(request))
    if (!nickname) return badRequest('서든어택 닉네임을 입력해주세요')

    const key = `intro-verify:user:${userId}`
    const verdict = await consumeQuota(key, QUOTA)
    if (!verdict.allowed) {
      logThrottle({
        route: 'me/intro-verification',
        reason: 'account',
        key,
        retryAfterSeconds: verdict.retryAfterSeconds,
        trust: clientIdentity(request).trust,
      })
      return tooManyRequests(
        '확인을 너무 많이 눌렀습니다. 잠시 후 다시 시도해주세요',
        verdict.retryAfterSeconds,
      )
    }

    const found = await usnOfNickname(nickname)
    if (!found) return notFound('그 닉네임으로 기록이 없습니다')
    return ok(await requestIntroCheck(userId, found.usn))
  })
}

/** DELETE — 접기 */
export async function DELETE(request: Request) {
  return guard(async () => {
    const userId = await currentUserId(request)
    if (!userId) return unauthorized()
    await cancelIntroChallenge(userId)
    return ok(await introVerificationState(userId))
  })
}
