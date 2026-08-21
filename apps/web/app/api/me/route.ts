import { guard, ok, unauthorized } from '@/lib/server/respond'
import { currentUser } from '@/lib/server/session'
import { toUser } from '@/lib/server/mappers'

/** GET /api/me — 내 정보 */
export async function GET(request: Request) {
  return guard(async () => {
    const user = await currentUser(request)
    return user ? ok(toUser(user)) : unauthorized()
  })
}
