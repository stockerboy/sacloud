import { prisma } from '@sacloud/db'
import {
  PASSWORD_RESET_MAIL_ENABLED,
  PASSWORD_RESET_UNAVAILABLE_MESSAGE,
  PasswordForgetInput,
} from '@sacloud/contract'
import { badRequest, guard, ok, serviceUnavailable } from '@/lib/server/respond'
import { jsonBody } from '@/lib/server/request'
import { issueAuthToken } from '@/lib/server/queries/auth'

/**
 * POST /api/auth/password/forget — 비밀번호 재설정 메일 발송
 *
 * **가입되지 않은 이메일이어도 같은 답을 준다.** 답이 갈리면 어떤 이메일이
 * 가입돼 있는지 확인하는 수단이 된다.
 *
 * ── ★2026-09-02 (O-010) — 「보냈습니다」라고 거짓말하던 것을 막았다★
 *
 *   메일 발송기가 저장소에 **한 줄도 없다** (nodemailer·resend·sendgrid·SMTP 0건).
 *   그런데 이 라우트는 토큰만 만들고 `{"ok":true}` 를 돌려줬다. 화면은 그걸 받아
 *   「메일을 보냈습니다. 받은편지함을 확인해 주세요」라고 말했다.
 *   **토큰은 만들어지는데 사람에게 갈 길이 없다.**
 *
 *   화면은 2026-09-02 에 닫혔는데 **여기는 안 닫혀 있었다** — 운영에서 직접 찔러
 *   `200 {"ok":true}` 를 받았다. 게시판과 똑같은 모양이다(O-011): 화면 안의 상수로
 *   닫아서 서버가 그 값을 몰랐다. 그래서 스위치를 계약으로 올렸다.
 *
 *   ⚠ **토큰을 만들지 않는 것도 이 고침의 일부다.** 그전에는 아무나 남의 이메일로
 *     이 라우트를 두들겨 `AuthToken` 행을 만들 수 있었다. 로그인도 필요 없었다.
 *     쓸모없는 행이 쌓이는 것이고, 메일이 붙는 날 그 토큰들이 살아 있으면 곤란하다.
 *
 *   ⚠ 라우트·`issueAuthToken`·`/auth/password/reset` 는 **하나도 안 지웠다.**
 *     메일이 붙으면 `PASSWORD_RESET_MAIL_ENABLED` 한 줄로 그대로 돌아온다.
 */
export async function POST(request: Request) {
  return guard(async () => {
    /* 입력 검사를 **먼저** 한다 — 꺼져 있어도 잘못된 요청은 잘못된 요청이다.
       그리고 이메일이 가입돼 있든 아니든 아래에서 **같은 답**이 나가야 한다 */
    const parsed = PasswordForgetInput.safeParse(await jsonBody(request))
    if (!parsed.success) return badRequest('입력값을 확인해주세요')

    if (!PASSWORD_RESET_MAIL_ENABLED) {
      return serviceUnavailable(PASSWORD_RESET_UNAVAILABLE_MESSAGE)
    }

    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email },
      select: { id: true },
    })
    if (user) await issueAuthToken(user.id, 'password_reset', 60)

    return ok({ ok: true })
  })
}
