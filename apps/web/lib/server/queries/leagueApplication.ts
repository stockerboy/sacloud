/**
 * ★리그 참가 신청★ (2026-09-14 사장님) — 받는 쪽 · 보는 쪽 · 기다리는 클랜.
 *
 *   «참가신청은 IPL SPL 둘중에 하나 가능하고 / 신청방식은 내가 관리자 대시보드에서
 *     볼 수 있게 해줘 (…) ★로그인 회원가입 없이★ 신청 할 수 있게»
 *   «열산도 신청 양식에 넣어 예시도 보여줘»
 *
 * ── 로그인이 없으니 자물쇠를 다른 데 건다
 *   계정이 없으므로 «누가 냈나» 로는 막을 수 없다. ★(리그 + 클랜명)★ 에 건다 —
 *   이미 낸 클랜이 또 내면 새 줄을 만들지 않고 ★그 줄을 고친다.★ 신청서는 하나다.
 *   그래서 잘못 적었을 때 다시 내면 고쳐지고, 같은 클랜이 백 번 내도 줄은 하나다.
 *
 * ⚠ ★관리자가 이미 처리한 신청은 덮어쓰지 않는다★ — 승인/반려된 뒤에 또 들어오면
 *   그건 ★새 이야기★ 라서, 상태를 «대기» 로 되돌리고 관리자 메모는 남긴다.
 *   조용히 덮어쓰면 관리자가 처리한 기록이 사라진다.
 */
import { Prisma, prisma } from '@sacloud/db'
import {
  APPLICATION_STATUS,
  applicationKindOf,
  WAITING_CLAN_COUNT,
  WAITING_WINDOW_DAYS,
  type ApplicationWaiting,
  type LeagueApplicationInput,
  type LeagueApplicationRow,
} from '@sacloud/contract'

/** 저장할 때 주소를 다듬는다 — `https://` 를 안 적고 낸 사람이 반드시 있다 */
function normalizeUrl(v: string): string {
  const s = v.trim()
  return s.startsWith('http') ? s : `https://${s}`
}

export type SubmitResult =
  | { ok: true; id: string; updated: boolean }
  | { ok: false; message: string }

export async function submitLeagueApplication(
  input: LeagueApplicationInput,
  meta: { userAgent?: string | null },
): Promise<SubmitResult> {
  /**
   * ★어느 리그로 들어가는지는 「등록 종류」가 정한다★ (2026-09-14 저녁).
   *
   * 옛 양식은 리그를 직접 골랐다. 그런데 «IPL → LLM 전환등록» 은 리그가 ★둘★ 이라
   * 리그 하나로는 표현이 안 된다. 종류가 리그를 정하고, 신청은 ★가는 쪽★ 으로 들어간다.
   */
  const kind = applicationKindOf(input.kind)
  if (kind === null) return { ok: false, message: '모르는 등록 종류입니다' }
  const leagueSlug = kind.to

  const existing = await prisma.leagueApplication.findUnique({
    where: { leagueSlug_clanName: { leagueSlug, clanName: input.clan_name } },
    select: { id: true, status: true },
  })

  const data = {
    kind: input.kind,
    clanSlug: input.clan_slug,
    /* 명단에서 고른 클랜은 주소를 안 받는다 — 우리가 이미 아는 값이다 */
    clanUrl: input.clan_url === null ? null : normalizeUrl(input.clan_url),
    contactKind: input.contact_kind,
    contactId: input.contact_id,
    /*
     * ⚠ ★주요 멤버는 이제 안 받는다★ (2026-09-14 저녁 사장님: «주요멤버5명은 빼»).
     *   Json 칸에 «비었다» 를 넣으려면 ★`Prisma.DbNull`★ 이어야 한다 —
     *   그냥 `null` 은 «JSON 값으로서의 null» 이라 뜻이 다르다.
     *   ★옛 신청서의 멤버는 그대로 남아 있다★ — 이 줄은 새로 들어오는 것만 비운다.
     */
    members: Prisma.DbNull,
    note: input.note ?? null,
    userAgent: meta.userAgent ?? null,
  }

  if (existing === null) {
    const row = await prisma.leagueApplication.create({
      data: { leagueSlug, clanName: input.clan_name, ...data },
      select: { id: true },
    })
    return { ok: true, id: row.id, updated: false }
  }

  /*
   * 이미 처리된 신청이 또 들어왔다 — ★새 이야기★ 로 본다.
   * 상태를 대기로 되돌리되 ★관리자 메모는 지우지 않는다★ (그때 무슨 판단을 했는지가 남아야 한다).
   */
  await prisma.leagueApplication.update({
    where: { id: existing.id },
    data: {
      ...data,
      ...(existing.status === APPLICATION_STATUS.pending
        ? {}
        : { status: APPLICATION_STATUS.pending, handledAt: null, handledBy: null }),
    },
  })
  return { ok: true, id: existing.id, updated: true }
}

/* -------------------------------------------------------------------------- */
/* 관리자                                                                       */
/* -------------------------------------------------------------------------- */

export const APPLICATION_PAGE_SIZE = 30

export async function adminApplicationList(args: {
  status?: number | null
  offset?: number
}): Promise<{ rows: LeagueApplicationRow[]; total: number; pending: number }> {
  const where = args.status === null || args.status === undefined ? {} : { status: args.status }
  const [rows, total, pending] = await Promise.all([
    prisma.leagueApplication.findMany({
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      skip: Math.max(0, args.offset ?? 0),
      take: APPLICATION_PAGE_SIZE,
    }),
    prisma.leagueApplication.count({ where }),
    prisma.leagueApplication.count({ where: { status: APPLICATION_STATUS.pending } }),
  ])

  return {
    rows: rows.map((r) => ({
      id: r.id,
      league: r.leagueSlug,
      kind: r.kind,
      clan_name: r.clanName,
      clan_slug: r.clanSlug,
      clan_url: r.clanUrl,
      contact_kind: r.contactKind,
      contact_id: r.contactId,
      members: Array.isArray(r.members)
        ? (r.members as { position: string; name: string; url: string }[])
        : [],
      note: r.note,
      status: r.status,
      admin_note: r.adminNote,
      created_at: r.createdAt.toISOString(),
      handled_at: r.handledAt === null ? null : r.handledAt.toISOString(),
    })),
    total,
    pending,
  }
}

export async function adminSetApplicationStatus(args: {
  id: string
  status: number
  adminNote?: string | null
  by: string
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const known = Object.values(APPLICATION_STATUS) as number[]
  if (!known.includes(args.status)) return { ok: false, message: '모르는 상태입니다' }

  const row = await prisma.leagueApplication.findUnique({ where: { id: args.id }, select: { id: true } })
  if (row === null) return { ok: false, message: '신청을 찾을 수 없습니다' }

  await prisma.leagueApplication.update({
    where: { id: args.id },
    data: {
      status: args.status,
      /* 메모를 안 보냈으면 있던 메모를 지우지 않는다 */
      ...(args.adminNote === undefined ? {} : { adminNote: args.adminNote }),
      handledAt: args.status === APPLICATION_STATUS.pending ? null : new Date(),
      handledBy: args.status === APPLICATION_STATUS.pending ? null : args.by,
    },
  })
  return { ok: true }
}

/* -------------------------------------------------------------------------- */
/* 참가대기 클랜 — 신청 화면이 «이런 클랜들이 뜁니다» 로 보여 준다                    */
/* -------------------------------------------------------------------------- */

/** 화면에 쓰는 리그 이름. 계약의 `LeagueLabel` 과 같은 말이다 */
const LEAGUE_LABEL: Readonly<Record<string, string>> = {
  nolink: 'IPL',
  supply: 'PL',
  sanply: '열산리그',
}

/**
 * ★활동량이 많은 클랜 넷★ (사장님: «활동량 가장 많은 클랜 마크 4개씩 하고 등등 으로»).
 *
 * ★활동량 = 최근 7일 경기 수★ 로 잡았다. 래더가 높은 순이 아니다 —
 * 신청하려는 사람이 알고 싶은 것은 «지금 여기가 돌아가고 있나» 이지 «누가 세나» 가 아니다.
 */
export async function applicationWaiting(): Promise<ApplicationWaiting> {
  const since = new Date(Date.now() - WAITING_WINDOW_DAYS * 24 * 60 * 60 * 1000)

  const leagues = await prisma.league.findMany({
    where: { slug: { in: Object.keys(LEAGUE_LABEL) } },
    select: { id: true, slug: true },
  })

  const out = await Promise.all(
    leagues.map(async (league) => {
      /*
       * ★한 경기에 두 클랜이 뛴다.★ `Match` 는 red/blue 두 칸으로 들고 있으므로
       * 양쪽을 각각 한 줄로 펼쳐 놓고 센다 — 한쪽만 세면 활동량이 절반으로 보인다.
       * 다시 수집된 경기(`supersededAt`)는 뺀다 — 두 번 세게 된다.
       */
      const rows = (await prisma.$queryRawUnsafe(
        `WITH played AS (
           SELECT "redLeagueClanId"  AS "leagueClanId" FROM "Match"
            WHERE "leagueId" = $1 AND "supersededAt" IS NULL AND "startAt" >= $2
           UNION ALL
           SELECT "blueLeagueClanId" AS "leagueClanId" FROM "Match"
            WHERE "leagueId" = $1 AND "supersededAt" IS NULL AND "startAt" >= $2
         )
         SELECT c.name, c.slug, c."markBgUrl", c."markFrontUrl", COUNT(*)::int AS n
           FROM played p
           JOIN "LeagueClan" lc ON lc.id = p."leagueClanId"
           JOIN "Clan" c ON c.id = lc."clanId"
          WHERE lc."expelledAt" IS NULL
          GROUP BY c.name, c.slug, c."markBgUrl", c."markFrontUrl"
          ORDER BY n DESC
          LIMIT $3`,
        league.id,
        since,
        WAITING_CLAN_COUNT,
      )) as { name: string; slug: string; markBgUrl: string | null; markFrontUrl: string | null; n: number }[]

      const total = await prisma.leagueClan.count({ where: { leagueId: league.id, expelledAt: null } })

      return {
        league: league.slug,
        label: LEAGUE_LABEL[league.slug] ?? league.slug,
        clans: rows.map((r) => ({
          name: r.name,
          slug: r.slug,
          mark: { bg: r.markBgUrl, front: r.markFrontUrl },
          recent_matches: r.n,
        })),
        total,
      }
    }),
  )

  /* 화면 차례를 고정한다 — IPL · SPL · 10mountain */
  const order = Object.keys(LEAGUE_LABEL)
  out.sort((a, b) => order.indexOf(a.league) - order.indexOf(b.league))
  return { leagues: out }
}
