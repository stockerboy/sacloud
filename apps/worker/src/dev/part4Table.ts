/**
 * ★Part 4 최종 표 — 리그별 다섯 칸★ (2026-09-06 · 사장님 지시). ★읽기만 한다.★
 *
 * > 전체 대상 경기 / 라인업 성공 / 라인업 불완전 / 매핑 실패 / 아직 RAW 미수집
 * > «열산은 첫 바퀴가 아직 끝나지 않았으므로 ★「완료율」과 「첫 바퀴 진행 중」을 구분★»
 *
 * ★칸이 겹치지 않게 나눈다★ — 합이 「전체 대상」과 맞아야 한다.
 */
import { prisma } from '@sacloud/db'

const CUT = "TIMESTAMP '2026-09-02 22:00:00'"
const LABEL: Record<string, string> = { nolink: 'IPL', supply: 'SPL', sanply: '10mountain' }

const rows = await prisma.$queryRawUnsafe<
  Array<{
    slug: string; total: number; ok: number; incomplete: number
    unmapped: number; noRaw: number; pending: number
  }>
>(`
  WITH m AS (
    SELECT mm.id, l.slug,
           EXISTS (SELECT 1 FROM "MatchPlayerStat" s WHERE s."matchId" = mm.id) AS "hasStat",
           EXISTS (SELECT 1 FROM "BarracksBattleLogRaw" b
                    WHERE b."matchKey" = mm."sourceMatchId"
                      AND b."subjectKind"='clan' AND b."status"='ok')          AS "hasRaw",
           mm."lineupSkipReason" AS reason
      FROM "Match" mm JOIN "League" l ON l.id = mm."leagueId"
     WHERE mm."startAt" >= ${CUT} AND mm."supersededAt" IS NULL
       AND mm.origin = 'nexon_barracks' AND l.slug IN ('nolink','supply','sanply')
  )
  SELECT slug,
    COUNT(*)::int                                                            AS total,
    COUNT(*) FILTER (WHERE "hasStat")::int                                   AS ok,
    COUNT(*) FILTER (WHERE NOT "hasStat" AND "hasRaw"
                       AND reason IS NOT NULL AND reason <> 'clan_unmapped')::int AS incomplete,
    COUNT(*) FILTER (WHERE NOT "hasStat" AND "hasRaw" AND reason = 'clan_unmapped')::int AS unmapped,
    COUNT(*) FILTER (WHERE NOT "hasStat" AND NOT "hasRaw")::int              AS "noRaw",
    COUNT(*) FILTER (WHERE NOT "hasStat" AND "hasRaw" AND reason IS NULL)::int AS pending
  FROM m GROUP BY 1 ORDER BY 1`)

console.info('══ 기준시각(2026-09-03 07:00 KST) 이후 · 우리가 수집한 경기 ══\n')
console.info('  리그         전체대상  라인업성공  라인업불완전  매핑실패  RAW미수집  아직판정전')
for (const r of rows) {
  console.info(
    `  ${(LABEL[r.slug] ?? r.slug).padEnd(12)}` +
      `${String(r.total).padStart(8)}${String(r.ok).padStart(12)}` +
      `${String(r.incomplete).padStart(14)}${String(r.unmapped).padStart(10)}` +
      `${String(r.noRaw).padStart(11)}${String(r.pending).padStart(12)}`,
  )
  const sum = r.ok + r.incomplete + r.unmapped + r.noRaw + r.pending
  if (sum !== r.total) console.info(`     ⚠ ★합이 안 맞는다 — ${sum} ≠ ${r.total}★`)
}

/* ── ★완료율은 「원문이 온 것」 기준으로만 낸다★ ─────────────────────── */
console.info('\n══ 완료율 — ★원문이 도착한 경기 기준★ (안 온 것은 분모에 안 넣는다) ══\n')
for (const r of rows) {
  const arrived = r.total - r.noRaw
  const pct = arrived === 0 ? '—' : `${((r.ok / arrived) * 100).toFixed(1)}%`
  console.info(
    `  ${(LABEL[r.slug] ?? r.slug).padEnd(12)} 원문 온 경기 ${String(arrived).padStart(5)} 중 ` +
      `라인업 ${String(r.ok).padStart(5)} → ★${pct}★`,
  )
}

/* ── 첫 바퀴가 끝났나 ────────────────────────────────────────────────── */
console.info('\n══ 수집 첫 바퀴 — 등록 클랜을 다 훑었나 ══\n')
const lap = await prisma.$queryRawUnsafe<Array<{ slug: string; live: number; seen: number }>>(`
  SELECT l.slug, COUNT(DISTINCT lc."clanId")::int AS live,
         COUNT(DISTINCT CASE WHEN r."subject" IS NOT NULL THEN lc."clanId" END)::int AS seen
  FROM "LeagueClan" lc JOIN "League" l ON l.id = lc."leagueId" JOIN "Clan" c ON c.id = lc."clanId"
  LEFT JOIN (SELECT DISTINCT "subject" FROM "BarracksClanMatchRaw") r ON r."subject" = c.slug
  WHERE lc."expelledAt" IS NULL AND l.slug IN ('nolink','supply','sanply')
  GROUP BY 1 ORDER BY 1`)
for (const t of lap) {
  const done = t.seen >= t.live
  console.info(
    `  ${(LABEL[t.slug] ?? t.slug).padEnd(12)} ${String(t.seen).padStart(4)} / ${String(t.live).padStart(4)}곳 ` +
      (done ? '· ★첫 바퀴 끝★' : `· ★첫 바퀴 진행 중 (남은 ${t.live - t.seen}곳)★`),
  )
}
console.info('\n  ★첫 바퀴가 안 끝난 리그의 「RAW 미수집」은 실패가 아니라 ★아직 안 온 것★ 이다.')
await prisma.$disconnect()
