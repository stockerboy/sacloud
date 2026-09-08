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
      SELECT DISTINCT c."slug", c."name", q."requestedAt", a."lastMatch"
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
                  ELSE NULL END AS starveRn
        FROM graded g
    )
    SELECT r."slug", r."name", r."lastMatch", r."requestedAt", r."band", r."starving"
      FROM ranked r
     ORDER BY
       CASE WHEN r.starving AND r.starveRn <= ${STALE_BAND_CAP} THEN 0 ELSE 1 END,
       r.band,
       r."requestedAt" ASC NULLS FIRST,
       r."slug"
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
