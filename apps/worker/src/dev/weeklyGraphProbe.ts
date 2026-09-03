/**
 * **O-045 주간 그래프 — 되짚을 수 있나** (2026-09-03 · ★읽기 전용★).
 *
 * ══ 먼저 바로잡을 것 ══
 *
 * `ORDERS.md` 에 «★IPL 은 못 되짚는다★ — sourceRatingDelta 가 0건» 이라고 적혀 있다.
 * ★그건 「래더 점수」 그래프 얘기다.★ 사장님이 요구하신 그래프는 —
 *
 * > «IPL **킬뎃**은 IPL킬뎃판에 SPL은 SPL판에»
 * > «승률도 그릴 수 있으면 진짜 좋다 (킬뎃은 빨간선 승률은 파란선)»
 *
 * ★킬뎃과 승률이다.★ 둘 다 `MatchPlayerStat.kill/death` 와 승패로 계산한다 —
 * ★`sourceRating` 계열이 아예 필요 없다.★ 그래서 IPL 도 되짚을 수 있는지 여기서 잰다.
 *
 * ══ 무엇을 재나 ══
 * ```
 * 1 리그마다 kill/death 가 실제로 있나        (없으면 킬뎃 그래프가 불가능하다)
 * 2 목요일 칸이 시즌 창과 맞아떨어지나
 * 3 ★선 규칙 세 경우가 실제로 다 나오나★      (24판 점선 · 25판 실선 · 25판인데 그 주 0판 점선)
 * 4 ★Beta 창이 평평하지 않은가★               (평평하면 되짚기가 헛것이다)
 * ```
 */
import { prisma } from '@sacloud/db'

const KST = 9 * 60 * 60 * 1000

/** 그 시각이 속한 주의 시작 — ★목요일 00:00 KST★ */
function thursdayOf(at: Date): Date {
  const k = new Date(at.getTime() + KST)
  /* getUTCDay: 목=4. 목요일부터 며칠 지났나 */
  const since = (k.getUTCDay() - 4 + 7) % 7
  const day = Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()) - since * 86400000
  return new Date(day - KST)
}

function kst(d: Date): string {
  return new Date(d.getTime() + KST).toISOString().slice(0, 16).replace('T', ' ')
}

interface Row {
  league: string
  playerId: string
  name: string
  startAt: Date
  kill: number | null
  death: number | null
  won: boolean
}

async function main(): Promise<void> {
  /* ── 1 · 리그마다 킬/데스가 있나 ─────────────────────────────── */
  console.info('══ 1 · ★리그마다 kill/death 가 있나★ ══\n')
  const cover = await prisma.$queryRaw<
    { league: string; n: bigint; haveKd: bigint; first: Date; last: Date }[]
  >`
    SELECT l."slug" AS league,
           count(*)                                              AS n,
           count(*) FILTER (WHERE s."kill" IS NOT NULL
                              AND s."death" IS NOT NULL)         AS "haveKd",
           min(m."startAt")                                    AS first,
           max(m."startAt")                                    AS last
      FROM "MatchPlayerStat" s
      JOIN "Match" m  ON m."id" = s."matchId"
      JOIN "League" l ON l."id" = m."leagueId"
     GROUP BY 1 ORDER BY 2 DESC
  `
  for (const c of cover) {
    const n = Number(c.n)
    const kd = Number(c.haveKd)
    const pct = n === 0 ? 0 : (100 * kd) / n
    console.info(
      `  ${c.league.padEnd(8)} ${n.toLocaleString().padStart(10)}행` +
        `  킬뎃 있음 ★${pct.toFixed(1)}%★` +
        `  ${kst(c.first)} ~ ${kst(c.last)}`,
    )
  }

  /* ── 2 · 목요일 칸이 시즌 창과 맞나 ──────────────────────────── */
  console.info('\n══ 2 · ★시즌 경계가 목요일인가★ ══\n')
  for (const iso of ['2026-03-05', '2026-07-02', '2026-10-01']) {
    const d = new Date(`${iso}T00:00:00+09:00`)
    const t = thursdayOf(d)
    console.info(
      `  ${iso}  ${t.getTime() === d.getTime() ? '★목요일 00시 — 칸 경계와 정확히 일치★' : `어긋남 → ${kst(t)}`}`,
    )
  }

  /* ── 3 · 선 규칙 세 경우가 실제로 나오나 (시즌0 · SPL) ─────────── */
  console.info('\n══ 3 · ★선 규칙 세 경우★ (시즌0 · 리그별) ══\n')
  const S0 = new Date('2026-07-02T00:00:00+09:00')
  for (const league of ['supply', 'nolink', 'sanply']) {
    const rows = await prisma.$queryRaw<Row[]>`
      SELECT l."slug" AS league, s."playerId", p."name",
             m."startAt", s."kill", s."death",
             (m."winnerSide" = s."side") AS won
        FROM "MatchPlayerStat" s
        JOIN "Match" m  ON m."id" = s."matchId"
        JOIN "League" l ON l."id" = m."leagueId"
        JOIN "Player" p ON p."id" = s."playerId"
       WHERE l."slug" = ${league}
         AND m."startAt" >= ${S0}
    `
    if (rows.length === 0) {
      console.info(`  ${league.padEnd(8)} ★시즌0 경기 0건★`)
      continue
    }

    /* 주 → 선수 → 그 주 판수 · 시즌 통산 판수 */
    const weeks = [...new Set(rows.map((r) => thursdayOf(r.startAt).getTime()))].sort(
      (a, b) => a - b,
    )
    const last = weeks[weeks.length - 1]!
    const inWeek = new Map<string, number>()
    const total = new Map<string, number>()
    for (const r of rows) {
      total.set(r.playerId, (total.get(r.playerId) ?? 0) + 1)
      if (thursdayOf(r.startAt).getTime() === last) {
        inWeek.set(r.playerId, (inWeek.get(r.playerId) ?? 0) + 1)
      }
    }
    let solid = 0
    let dashUnder25 = 0
    let dashIdle = 0
    for (const [pid, t] of total) {
      const w = inWeek.get(pid) ?? 0
      if (t >= 25 && w >= 1) solid += 1
      else if (t < 25) dashUnder25 += 1
      else dashIdle += 1
    }
    console.info(
      `  ${league.padEnd(8)} 주 ${weeks.length}칸 · 선수 ${total.size.toLocaleString()}명` +
        `  ★실선 ${solid}★ / 점선(25판미만) ${dashUnder25} / ★점선(25판인데 그주 0판) ${dashIdle}★`,
    )
  }

  /* ── 4 · Beta 창이 평평하지 않은가 ───────────────────────────── */
  console.info('\n══ 4 · ★Beta 창(3~6월) 이 평평하지 않은가★ ══\n')
  const B0 = new Date('2026-03-05T00:00:00+09:00')
  const B1 = new Date('2026-07-02T00:00:00+09:00')
  for (const league of ['supply', 'nolink']) {
    const top = await prisma.$queryRaw<{ playerId: string; name: string; n: bigint }[]>`
      SELECT s."playerId", p."name", count(*) AS n
        FROM "MatchPlayerStat" s
        JOIN "Match" m  ON m."id" = s."matchId"
        JOIN "League" l ON l."id" = m."leagueId"
        JOIN "Player" p ON p."id" = s."playerId"
       WHERE l."slug" = ${league}
         AND m."startAt" >= ${B0} AND m."startAt" < ${B1}
         AND s."kill" IS NOT NULL AND s."death" IS NOT NULL
       GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 1
    `
    const t = top[0]
    if (!t) {
      console.info(`  ${league.padEnd(8)} ★Beta 창 경기 0건★`)
      continue
    }
    const rows = await prisma.$queryRaw<Row[]>`
      SELECT l."slug" AS league, s."playerId", p."name",
             m."startAt", s."kill", s."death",
             (m."winnerSide" = s."side") AS won
        FROM "MatchPlayerStat" s
        JOIN "Match" m  ON m."id" = s."matchId"
        JOIN "League" l ON l."id" = m."leagueId"
        JOIN "Player" p ON p."id" = s."playerId"
       WHERE l."slug" = ${league} AND s."playerId" = ${t.playerId}
         AND m."startAt" >= ${B0} AND m."startAt" < ${B1}
       ORDER BY m."startAt"
    `
    /* 목요일마다 그 시점까지의 시즌 누적 킬뎃 · 승률 */
    const byWeek = new Map<number, { k: number; d: number; w: number; n: number }>()
    let k = 0
    let d = 0
    let w = 0
    let n = 0
    for (const r of rows) {
      k += r.kill ?? 0
      d += r.death ?? 0
      if (r.won) w += 1
      n += 1
      byWeek.set(thursdayOf(r.startAt).getTime(), { k, d, w, n })
    }
    const series = [...byWeek.entries()].sort((a, b) => a[0] - b[0])
    const kds = series.map(([, v]) => (v.d === 0 ? v.k : v.k / v.d))
    const flat = kds.length > 1 && kds.every((x) => Math.abs(x - kds[0]!) < 1e-9)
    console.info(
      `  ${league.padEnd(8)} ${t.name} (${Number(t.n).toLocaleString()}판) · 주 ${series.length}칸` +
        `  ${flat ? '★★평평하다 — 되짚기가 헛것이다★★' : '★평평하지 않다 (되짚기 된다)★'}`,
    )
    for (const [ts, v] of series.slice(0, 6)) {
      console.info(
        `      ${kst(new Date(ts))}  킬뎃 ${(v.d === 0 ? v.k : v.k / v.d).toFixed(3)}` +
          `  승률 ${((100 * v.w) / v.n).toFixed(1)}%  누적 ${v.n}판`,
      )
    }
    if (series.length > 6) console.info(`      … ${series.length - 6}칸 더`)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
