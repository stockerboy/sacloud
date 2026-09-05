/**
 * ★리그마다 표본을 뽑아 원문과 킬·데스를 맞대 본다★ (2026-09-05 · Part 4). ★읽기만 한다.★
 *
 * ── ★처음에 틀리게 셌다★ (같은 날 · 남겨 둔다)
 *   원문 한 줄이 「누가 죽였다」 하나만 적는 줄 알고 `target_str_usn` 을 늘 피해자로 셌다.
 *   ★아니다.★ 원문은 ★주체 클랜의 시점★ 이다 —
 *   ```
 *   event_type='kill'   주체가 죽였다 → 상대(target)가 죽었다
 *   event_type='death'  ★주체가 죽었다★ → 상대(target)가 죽인 것
 *   ```
 *   그래서 한 팀은 킬이 0 으로, 다른 팀은 데스가 두 배로 나왔다.
 *   ★숫자가 이상하면 데이터가 아니라 내 자를 먼저 의심한다.★
 */
import { prisma, type Prisma } from '@sacloud/db'

const CUT = "TIMESTAMP '2026-09-02 22:00:00'"
const PER_LEAGUE = 4
/** 죽음으로 세는 줄. `g_death`(자살)는 세지 않는다 — `COUNTED_DEATH_KINDS` 와 같은 뜻 */
const DEATH_KIND: Record<string, string> = { death: 'kill', f_death: 'fall', g_death: 'self' }
const COUNTED = new Set(['kill', 'fall'])

interface Ev {
  round?: unknown; event_time?: unknown; event_key?: unknown
  event_type?: unknown; target_event_type?: unknown
  str_usn?: unknown; target_str_usn?: unknown
  user_nexon_sn?: unknown; target_user_nexon_sn?: unknown
}
const s = (v: unknown): string | null => {
  if (v === null || v === undefined) return null
  const t = String(v).trim()
  return t === '' ? null : t
}
const payloadOf = (value: Prisma.JsonValue): { battleLog?: unknown } => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  const h = value as { raw?: unknown; battleLog?: unknown }
  if (h.battleLog !== undefined) return h as { battleLog?: unknown }
  if (typeof h.raw === 'object' && h.raw !== null) return h.raw as { battleLog?: unknown }
  return {}
}

/** ★원문 줄을 직접 센다★ — 저장된 값과 따로 센다 */
function countFromRaw(list: readonly Ev[]): {
  kills: Map<string, number>
  deaths: Map<string, number>
  usnOfSn: Map<string, string>
} {
  const usnOfSn = new Map<string, string>()
  for (const e of list) {
    const a = s(e.str_usn), an = s(e.user_nexon_sn)
    if (a && an && an !== '0') usnOfSn.set(an, a)
    const b = s(e.target_str_usn), bn = s(e.target_user_nexon_sn)
    if (b && bn && bn !== '0') usnOfSn.set(bn, b)
  }

  const kills = new Map<string, number>()
  const deaths = new Map<string, number>()
  const seen = new Set<string>()
  const seenKill = new Set<string>()
  for (const e of list) {
    const sub = s(e.event_type)
    const tgt = s(e.target_event_type)
    const stamp = `${s(e.round) ?? ''}:${s(e.event_time) ?? ''}`
    const evKey =
      e.event_key !== null && e.event_key !== undefined ? `k:${String(e.event_key)}` : `t:${stamp}`

    /*
     * ── 킬
     *
     * ⚠ ★원문이 두 벌이면 같은 줄이 두 번 온다★ — 양쪽 클랜이 ★같은 배틀로그★ 를 받는다.
     *   ★처음에 이걸 안 걸러서 킬이 정확히 두 배로 나왔다★ (데스는 걸렀기에 딱 맞았다).
     *   ★한쪽만 맞고 한쪽만 틀리면 자를 의심할 자리다.★
     */
    const killer = sub === 'kill' ? s(e.str_usn) : tgt === 'kill' ? s(e.target_str_usn) : null
    if (killer) {
      const key = `${evKey}:${killer}:kill`
      if (!seenKill.has(key)) {
        seenKill.add(key)
        kills.set(killer, (kills.get(killer) ?? 0) + 1)
      }
    }

    /* ── 죽음. ★한 줄에 죽음은 하나다★ */
    let kind: string | undefined
    let usn: string | null = null
    let sn: string | null = null
    if (sub && DEATH_KIND[sub]) {
      kind = DEATH_KIND[sub]; usn = s(e.str_usn); sn = s(e.user_nexon_sn)
    } else if (tgt && DEATH_KIND[tgt]) {
      kind = DEATH_KIND[tgt]; usn = s(e.target_str_usn); sn = s(e.target_user_nexon_sn)
    }
    if (!kind || !COUNTED.has(kind)) continue
    if (sn === '0') sn = null
    if (usn === null && sn === null) continue
    const who = usn ?? `sn:${sn ?? ''}`
    const key =
      e.event_key !== null && e.event_key !== undefined
        ? `k:${String(e.event_key)}:${who}:${kind}`
        : `t:${s(e.round) ?? ''}:${s(e.event_time) ?? ''}:${who}:${kind}`
    if (seen.has(key)) continue
    seen.add(key)
    const victim = usn ?? (sn !== null ? (usnOfSn.get(sn) ?? null) : null)
    if (victim === null) continue
    deaths.set(victim, (deaths.get(victim) ?? 0) + 1)
  }
  return { kills, deaths, usnOfSn }
}

const rows = await prisma.$queryRawUnsafe<
  Array<{ slug: string; matchId: string; key: string; startAt: Date }>
>(`
  SELECT slug, "matchId", key, "startAt" FROM (
    SELECT l.slug, m.id AS "matchId", m."sourceMatchId" AS key, m."startAt",
           ROW_NUMBER() OVER (PARTITION BY l.slug ORDER BY m."startAt" DESC) AS rn
    FROM "Match" m JOIN "League" l ON l.id = m."leagueId"
    JOIN "MatchPlayerStat" st ON st."matchId" = m.id
    JOIN "Player" p ON p.id = st."playerId" AND p."origin" = 'nexon_barracks'
    WHERE m."startAt" >= ${CUT} AND m."supersededAt" IS NULL
      AND m.origin = 'nexon_barracks' AND l.slug IN ('nolink','supply','sanply')
    GROUP BY 1,2,3,4
  ) t WHERE rn <= ${PER_LEAGUE} ORDER BY slug, "startAt" DESC`)

let bad = 0
for (const row of rows) {
  const stats = await prisma.matchPlayerStat.findMany({
    where: { matchId: row.matchId },
    select: { kill: true, death: true, side: true, player: { select: { sourcePlayerId: true, name: true } } },
  })
  const raws = await prisma.$queryRawUnsafe<Array<{ payload: Prisma.JsonValue }>>(
    `SELECT "payload" FROM "BarracksBattleLogRaw"
      WHERE "matchKey" = $1 AND "status"='ok' ORDER BY "fetchedAt" DESC`,
    row.key,
  )
  /* ★원문이 여러 벌이면 다 합쳐서 센다★ — 한 벌은 한 클랜의 시점이다 */
  const merged: Ev[] = raws.flatMap((r) => {
    const b = payloadOf(r.payload).battleLog
    return Array.isArray(b) ? (b as Ev[]) : []
  })
  const { kills, deaths } = countFromRaw(merged)

  const wrong: string[] = []
  for (const st of stats) {
    const usn = st.player.sourcePlayerId?.replace(/^BRK-/, '') ?? ''
    const wantK = kills.get(usn) ?? 0
    const wantD = deaths.get(usn) ?? 0
    if (st.kill !== wantK || st.death !== wantD)
      wrong.push(`${st.player.name} 저장 ${st.kill}/${st.death} vs 원문 ${wantK}/${wantD}`)
  }
  if (wrong.length) bad += 1
  const red = stats.filter((x) => x.side === 'red').length
  const blue = stats.filter((x) => x.side === 'blue').length
  const kSum = stats.reduce((n, x) => n + (x.kill ?? 0), 0)
  const dSum = stats.reduce((n, x) => n + (x.death ?? 0), 0)
  console.info(
    `  ${wrong.length ? '✘' : '✔'} ${row.slug.padEnd(8)} ${row.key} · ${stats.length}명` +
      ` (red ${red}·blue ${blue}) · 원문 ${raws.length}벌 · 합계 ${kSum}킬 ${dSum}데스` +
      (wrong.length ? `\n      ${wrong.join('\n      ')}` : ''),
  )
}
console.info(`\n  표본 ${rows.length}건 중 ★어긋난 경기 ${bad}건★`)
await prisma.$disconnect()
