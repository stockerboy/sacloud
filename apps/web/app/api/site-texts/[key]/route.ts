/**
 * GET /api/site-texts/{key} — 관리자 「화면 글」 한 덩어리를 공개로 읽는다 (2026-09-24).
 *
 * 게시판 에타 꼴의 ★공지 카드★(에타에서 광고가 앉던 자리)가 쓴다 — 사장님 「광고 안 넣으니 그 자리에 내가 공지사항 써서 넣을 수 있게」.
 * 관리자는 /admin/texts 에서 쓴다. 없거나 감춰졌으면 data: null (지어내지 않는다).
 * 열쇠는 허용 목록만 — 아무 열쇠나 읽히면 안 된다.
 */
import { guardPublic, okPublic } from '@/lib/server/respond'
import { boardNoticeKey, siteTextOf } from '@/lib/server/queries/siteText'

const PUBLIC_KEYS = new Set<string>([boardNoticeKey()])

export async function GET(request: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params
  if (!PUBLIC_KEYS.has(key)) return guardPublic(request, 60, async () => okPublic(null))
  return guardPublic(request, 60, async () => okPublic(await siteTextOf(key)))
}
