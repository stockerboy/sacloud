/* ★큐 선택 규칙 — 관측 도구가 쓰는 사본★
 *
 * ⚠⚠ ★이 파일은 `apps/worker/src/jobs/barracksCollect.ts` 의 `pendingClans()` 와
 *      ★반드시 같은 규칙★ 이어야 한다.★ 어긋나면 관측 도구가 ★거짓 100%★ 를 낸다.
 *
 * 2026-09-08 22:20 에 실제로 어긋나 있었다 — 도구들이 아직 ★버그 있던 옛 판★
 * (`band = 0` 에 상한을 걸고 넘친 곳을 꼴찌로 미는 판) 으로 재고 있었다.
 * 그 판은 ★활동 중인 클랜을 55% 까지 굶겼던★ 바로 그 규칙이다.
 * 그 규칙으로 재면 진짜 큐가 퇴행해도 도구는 알아채지 못한다.
 *
 * 어긋남은 `apps/worker/src/__tests__/queueRuleMirror.test.ts` 가 잡는다.
 * 규칙을 고치면 ★두 곳을 같이★ 고쳐라.
 */

/** 방치된 클랜에 예약해 주는 앞자리 수 — 잡의 `STALE_BAND_CAP` 과 같아야 한다 */
export const STALE_BAND_CAP = 30

/**
 * ★리그마다 예약해 주는 앞자리 수★ — 잡의 `LEAGUE_MIN_SLOTS` 와 같아야 한다 (2026-09-10).
 *
 * 근거는 잡 쪽 주석에 숫자로 적혀 있다. 요약 (2026-09-10 · 운영 실측 · 최근 7일):
 * ```
 * 리그              등록   ★한 시간에 뛰는 서로 다른 클랜 (최대)★
 * IPL(nolink)        43              35
 * SPL(supply)        55              14
 * 10mountain(sanply)311              13
 * ```
 * ★리그당 25자리면 가장 바쁜 시간대를 덮는다.★ 3 × 25 = 75 로 150자리의 절반이고
 * ★남은 75자리는 옛 규칙 그대로★ 준다.
 */
export const LEAGUE_MIN_SLOTS = 25

/**
 * ★리그 몫 안에서 방치된 클랜에 주는 자리 수★ — 잡의 `LEAGUE_STALE_CAP` 과 같아야 한다.
 *
 * 전역 상한 30/150 = ★20%★ 를 리그 몫에 그대로 옮긴 값이다 (25 × 20% = 5).
 * ★안 줄이면 조용한 클랜이 그 리그의 몫을 통째로 먹는다★ — 10mountain 은 311곳 중
 * 289곳이 조용해서 시뮬에서 활동 클랜이 ★22시간★ 동안 안 뽑혔다.
 */
export const LEAGUE_STALE_CAP = 5

/** 큐에서 뽑는 클랜 수 (운영 셸의 `--clans`) */
export const CLAN_BUDGET = 150

/** 우리가 도는 리그 */
export const LEAGUES = ['nolink', 'supply', 'sanply']

/**
 * 지금 큐를 뽑으면 어떤 클랜이 어떤 순서로 나오는지 — ★잡과 같은 규칙★.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {number} limit
 */
export function pickedClans(prisma, limit = CLAN_BUDGET) {
  return prisma.$queryRaw`
    WITH act AS (
      SELECT z."lcid", MAX(z."startAt") AS "lastMatch"
        FROM (
          SELECT m."redLeagueClanId"  AS "lcid", m."startAt" FROM "Match" m WHERE m."supersededAt" IS NULL
          UNION ALL
          SELECT m."blueLeagueClanId" AS "lcid", m."startAt" FROM "Match" m WHERE m."supersededAt" IS NULL
        ) z
       GROUP BY z."lcid"
    ),
    pool AS (
      /* ★리그를 같이 들고 나온다★ — 몫을 떼려면 어느 리그인지 알아야 한다 (2026-09-10) */
      SELECT DISTINCT l."slug" AS lg, c."slug", c."name", q."requestedAt", a."lastMatch"
        FROM "LeagueClan" lc
        JOIN "League" l ON l."id" = lc."leagueId"
        JOIN "Clan" c   ON c."id" = lc."clanId"
        LEFT JOIN "BarracksListRequest" q ON q."subject" = c."slug"
        LEFT JOIN act a ON a."lcid" = lc."id"
       WHERE l."slug" = ANY(${LEAGUES}) AND lc."expelledAt" IS NULL
    ),
    graded AS (
      SELECT p.*,
             CASE
               WHEN p."lastMatch" >= NOW() - INTERVAL '1 hour'   THEN 1
               WHEN p."lastMatch" >= NOW() - INTERVAL '6 hours'  THEN 2
               WHEN p."lastMatch" >= NOW() - INTERVAL '24 hours' THEN 3
               ELSE 4
             END AS band,
             (p."requestedAt" IS NULL OR p."requestedAt" < NOW() - INTERVAL '6 hours') AS starving
        FROM pool p
    ),
    ranked AS (
      SELECT g.*,
             CASE WHEN g.starving
                  THEN ROW_NUMBER() OVER (
                         PARTITION BY g.starving
                         ORDER BY g."requestedAt" ASC NULLS FIRST, g."slug")
                  ELSE NULL END AS starveRn,
             /* ★리그 안에서의 굶주림 순번★ — 몫 안에 전역 상한을 그대로 넣으면
                조용한 클랜이 그 리그의 몫을 통째로 먹는다 (LEAGUE_STALE_CAP 주석) */
             CASE WHEN g.starving
                  THEN ROW_NUMBER() OVER (
                         PARTITION BY g.lg, g.starving
                         ORDER BY g."requestedAt" ASC NULLS FIRST, g."slug")
                  ELSE NULL END AS leagueStarveRn
        FROM graded g
    ),
    seated AS (
      /* ★리그 안에서 몇 번째인가★ — 고르는 기준은 옛 규칙 그대로고,
         상한만 리그 크기에 맞춰 줄였다 (30/150 = 5/25 · 같은 20%) */
      SELECT r.*,
             ROW_NUMBER() OVER (
               PARTITION BY r.lg
               ORDER BY
                 CASE WHEN r.starving AND r.leagueStarveRn <= ${LEAGUE_STALE_CAP} THEN 0 ELSE 1 END,
                 r.band,
                 r."requestedAt" ASC NULLS FIRST,
                 r."slug") AS leagueRn
        FROM ranked r
    )
    SELECT s."lg", s."slug", s."name", s."lastMatch", s."requestedAt", s."band", s."starving",
           s.leagueRn AS "leagueRn"
      FROM seated s
     ORDER BY
       /* ① ★리그마다 앞자리 ${LEAGUE_MIN_SLOTS}개는 예약석이다★ */
       CASE WHEN s.leagueRn <= ${LEAGUE_MIN_SLOTS} THEN 0 ELSE 1 END,
       /* ② ★예약석은 라운드로빈★ — 각 리그 1등끼리, 2등끼리… */
       CASE WHEN s.leagueRn <= ${LEAGUE_MIN_SLOTS} THEN s.leagueRn ELSE NULL END,
       /* ③ 그 뒤는 ★옛 규칙과 같다★ */
       CASE WHEN s.starving AND s.starveRn <= ${STALE_BAND_CAP} THEN 0 ELSE 1 END,
       s.band,
       s."requestedAt" ASC NULLS FIRST,
       s."slug"
     LIMIT ${limit}
  `
}

/**
 * ★포함률★ — 최근 `hours` 시간 안에 경기한 클랜 중 몇 %가 이번 큐에 들어오나.
 * 이 숫자가 100 이 아니면 ★놓치는 클랜이 있다는 뜻★ 이다.
 */
export async function coverage(prisma, { hours = 18, limit = CLAN_BUDGET } = {}) {
  const picked = await pickedClans(prisma, limit)
  const inQueue = picked.filter(
    (c) => c.lastMatch && Date.now() - new Date(c.lastMatch).getTime() <= hours * 3600_000,
  ).length
  const rows = await prisma.$queryRaw`
    SELECT
      (SELECT COUNT(DISTINCT c."slug")::int FROM "Match" m
         JOIN "LeagueClan" lc ON lc."id" IN (m."redLeagueClanId", m."blueLeagueClanId")
         JOIN "Clan" c ON c."id" = lc."clanId"
        WHERE m."supersededAt" IS NULL
          AND m."startAt" >= NOW() - (${hours} || ' hours')::interval) AS total,
      (SELECT COUNT(*)::int FROM "LeagueClan" lc
         JOIN "League" l ON l."id" = lc."leagueId"
         JOIN "Clan" c ON c."id" = lc."clanId"
         LEFT JOIN "BarracksListRequest" q ON q."subject" = c."slug"
        WHERE l."slug" = ANY(${LEAGUES}) AND lc."expelledAt" IS NULL
          AND q."subject" IS NULL) AS never`
  const total = rows[0].total
  return { inQueue, total, never: rows[0].never, pct: total ? Math.round((inQueue / total) * 100) : 100 }
}
