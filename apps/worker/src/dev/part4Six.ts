/**
 * ★SPL 6대6 — 왜 완전한 명단을 만들 수 없나★ (2026-09-06 · 사장님 지시). ★읽기만 한다.★
 *
 * > «원본에 선수 12명 전체 명단이 없으므로 추측해서 MatchPlayerStat 을 만들지 않는다»
 * > «이 정책을 구현하기 전에 실제 원문 구조를 몇 건 표본으로 다시 확인하고
 * >  ★왜 완전한 명단을 만들 수 없는지 증거를 남겨라★»
 *
 * ★말로 「없다」고 하지 않는다. 원문의 칸을 열어서 보인다.★
 */
import { prisma, type Prisma } from '@sacloud/db'

const CUT = "TIMESTAMP '2026-09-02 22:00:00'"
const SAMPLES = 3

const obj = (v: Prisma.JsonValue): Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
const unwrap = (v: Prisma.JsonValue): Record<string, unknown> => {
  const h = obj(v)
  if (h['battleLog'] !== undefined || h['teamList'] !== undefined) return h
  if (typeof h['raw'] === 'object' && h['raw'] !== null) return h['raw'] as Record<string, unknown>
  return h
}
const arr = (v: unknown): Array<Record<string, unknown>> =>
  Array.isArray(v) ? (v as Array<Record<string, unknown>>) : []

/* ── 라인업이 없는 SPL 경기 ─────────────────────────────────────────── */
const rows = await prisma.$queryRawUnsafe<Array<{ key: string; matchId: string }>>(`
  SELECT m."sourceMatchId" AS key, m.id AS "matchId"
  FROM "Match" m JOIN "League" l ON l.id = m."leagueId"
  LEFT JOIN (SELECT DISTINCT "matchId" FROM "MatchPlayerStat") x ON x."matchId" = m.id
  JOIN (SELECT DISTINCT "matchKey" FROM "BarracksBattleLogRaw"
        WHERE "subjectKind"='clan' AND "status"='ok') r ON r."matchKey" = m."sourceMatchId"
  WHERE m."startAt" >= ${CUT} AND m."supersededAt" IS NULL AND m.origin='nexon_barracks'
    AND x."matchId" IS NULL AND l.slug='supply'
  ORDER BY m."startAt" DESC`)

console.info(`══ 라인업이 없는 SPL 경기 ${rows.length}건 · 앞 ${SAMPLES}건을 연다 ══`)

for (const row of rows.slice(0, SAMPLES)) {
  console.info(`\n════════ ${row.key} ════════`)

  /* ① 매치목록 원문 — 여기에 명단이 있나 */
  const mlist = await prisma.$queryRawUnsafe<Array<{ subject: string; payload: Prisma.JsonValue }>>(
    `SELECT "subject","payload" FROM "BarracksClanMatchRaw"
      WHERE "matchKey"=$1 AND "status"='ok' ORDER BY "id"`, row.key)
  console.info(`\n  ① 매치목록 원문 ${mlist.length}벌`)
  for (const m of mlist.slice(0, 1)) {
    const p = obj(m.payload)
    console.info(`     주체 ${m.subject} · 칸 ${Object.keys(p).length}개`)
    console.info(`     ${Object.keys(p).join(' · ')}`)
    const listy = Object.entries(p).filter(([, v]) => Array.isArray(v))
    console.info(
      listy.length
        ? `     ★배열 칸★ — ${listy.map(([k, v]) => `${k}(${(v as unknown[]).length}개)`).join(' · ')}`
        : `     ★배열로 된 칸이 없다 — 명단을 담을 자리가 없다★`,
    )
    console.info(`     plimit=${String(p['plimit'])} (한 팀 인원 ★상한★)`)
  }

  /* ② 배틀로그 원문 — teamList 와 이벤트 */
  const blogs = await prisma.$queryRawUnsafe<Array<{ subject: string; payload: Prisma.JsonValue }>>(
    `SELECT "subject","payload" FROM "BarracksBattleLogRaw"
      WHERE "matchKey"=$1 AND "status"='ok' ORDER BY "fetchedAt" DESC`, row.key)
  console.info(`\n  ② 배틀로그 원문 ${blogs.length}벌`)
  const seenByTeam = new Map<string, Set<string>>()
  for (const b of blogs) {
    const p = unwrap(b.payload)
    const tl = arr(p['teamList'])
    const ev = arr(p['battleLog'])
    console.info(
      `     주체 ${b.subject} · 칸 ${Object.keys(p).join(' · ')}` +
        `\n       teamList ${tl.length}줄 — 칸 ${tl[0] ? Object.keys(tl[0]).join(' · ') : '(비었다)'}` +
        `\n       battleLog ${ev.length}줄`,
    )
    for (const e of ev) {
      for (const [t, u] of [
        [e['team_no'], e['str_usn']],
        [e['target_team_no'], e['target_str_usn']],
      ] as Array<[unknown, unknown]>) {
        const team = t === null || t === undefined ? null : String(t).trim()
        const usn = u === null || u === undefined ? null : String(u).trim()
        if (!team || !usn) continue
        if (!seenByTeam.has(team)) seenByTeam.set(team, new Set())
        seenByTeam.get(team)?.add(usn)
      }
    }
  }
  console.info(
    `\n  ③ ★이벤트에 나온 사람★ — ${[...seenByTeam]
      .map(([t, s]) => `팀${t} ${s.size}명`)
      .join(' · ')}  ← ★죽이거나 죽은 사람만 나온다★`,
  )
  console.info(
    `  ④ ★명단을 담은 칸★ — 매치목록: 없음 · teamList: 팀 ${blogs.length ? '2줄(클랜 정보뿐)' : '?'} · ` +
      `이벤트: ★참가자 명단이 아니다★`,
  )
}

/* 전체 모양 세기는 `part4SixShape.ts` 로 뺐다 — 한 판이 너무 길어졌다 */
await prisma.$disconnect()
