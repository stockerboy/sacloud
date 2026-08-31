import { prisma } from '@sacloud/db'
import { forbidden, guard, ok } from '@/lib/server/respond'
import { requireAdmin } from '@/lib/server/session'

/**
 * `GET /api/admin/eggs?kind=clan|player&league=<slug>&query=` — **알 목록과 깨짐 상태**.
 *
 * 관리자가 시험 삼아 하나씩 깨 볼 수 있게, 대상과 지금 상태를 함께 준다
 * (`docs/EGG_SYSTEM_SPEC.md`).
 *
 * ── 왜 관리자 전용인가
 *   깨짐 여부 자체는 공개 정보지만(화면에 보인다), **목록 전체를 한 번에 주는 것**은
 *   다르다. 깨는 버튼과 같은 화면에서 쓰는 것이라 관리자에게만 연다.
 */
export async function GET(request: Request) {
  return guard(async () => {
    const admin = await requireAdmin(request)
    if (!admin) return forbidden('관리자만 접근할 수 있습니다')

    const url = new URL(request.url)
    const kind = url.searchParams.get('kind') === 'player' ? 'player' : 'clan'
    const leagueSlug = url.searchParams.get('league')?.trim() || null
    const query = url.searchParams.get('query')?.trim() || null

    /* 깨진 것들을 한 번에 읽어 메모리에서 맞춘다 — 대상마다 조회하면 왕복이 수백 번이다 */
    const broken = new Map(
      (
        await prisma.eggBreak.findMany({
          where: { targetKind: kind },
          select: { targetId: true, reason: true, brokenAt: true, note: true },
        })
      ).map((b) => [b.targetId, b]),
    )

    if (kind === 'clan') {
      const rows = await prisma.leagueClan.findMany({
        where: {
          ...(leagueSlug ? { league: { slug: leagueSlug } } : {}),
          ...(query ? { clan: { name: { contains: query, mode: 'insensitive' } } } : {}),
        },
        select: {
          division: true,
          league: { select: { slug: true, name: true } },
          clan: { select: { slug: true, name: true, markBgUrl: true } },
        },
        orderBy: [{ league: { slug: 'asc' } }, { division: 'asc' }, { rating: 'desc' }],
        take: 500,
      })
      return ok(
        rows.map((r) => {
          const b = broken.get(r.clan.slug)
          return {
            kind: 'clan' as const,
            id: r.clan.slug,
            name: r.clan.name,
            league: r.league.slug,
            leagueName: r.league.name,
            division: r.division,
            mark: r.clan.markBgUrl,
            broken: Boolean(b),
            reason: b?.reason ?? null,
            brokenAt: b?.brokenAt?.toISOString() ?? null,
            note: b?.note ?? null,
          }
        }),
      )
    }

    const rows = await prisma.leaguePlayer.findMany({
      where: {
        ...(leagueSlug ? { league: { slug: leagueSlug } } : {}),
        ...(query ? { player: { name: { contains: query, mode: 'insensitive' } } } : {}),
      },
      select: {
        league: { select: { slug: true, name: true } },
        player: { select: { id: true, name: true } },
        clan: { select: { name: true } },
      },
      orderBy: [{ league: { slug: 'asc' } }, { rating: 'desc' }],
      take: 500,
    })
    return ok(
      rows.map((r) => {
        const b = broken.get(r.player.id)
        return {
          kind: 'player' as const,
          id: r.player.id,
          name: r.player.name,
          league: r.league.slug,
          leagueName: r.league.name,
          clanName: r.clan?.name ?? null,
          broken: Boolean(b),
          reason: b?.reason ?? null,
          brokenAt: b?.brokenAt?.toISOString() ?? null,
          note: b?.note ?? null,
        }
      }),
    )
  })
}
