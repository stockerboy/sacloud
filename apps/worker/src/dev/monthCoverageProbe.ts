/**
 * **3~9월 중 무엇이 있고 무엇이 없나 — 달마다 센다** (2026-09-04 · ★읽기 전용★).
 *
 * 사장님이 ★«병영수첩 8월은 거짓말이야 정확하게 알아보고 와»★ 라고 하셨다.
 * 나는 ★「병영수첩은 최근 것만 준다」고 보고했다. 그게 틀렸다★ —
 * ★`seq_no` 커서로 뒤로 넘어간다★ (`fetchClanMatchList` 주석에 근거를 적었다).
 *
 * 그러면 남은 물음은 ★「지금 우리한테 어느 달이 얼마나 있나」★ 다.
 * ★병영수첩을 다시 두드리지 않고★ 우리 표만으로 답한다 — ★밤샘 수집이 도는 중이라★
 * 같은 곳을 두 배로 두드리면 안 된다.
 *
 * ══ 세는 것 ══
 * ```
 * ① 경기(Match·nolink)          달마다 몇 건    ← 서플라이에서 받아 온 것
 * ② 배틀로그(BarracksBattleLogRaw) 달마다 몇 건  ← 병영수첩에서 우리가 받은 것
 * ③ 라인업이 붙은 경기            달마다 몇 건    ← ★화면에 실제로 보이는 것★
 * ④ 목록 원문(BarracksClanMatchRaw) 달마다 몇 건
 * ```
 * ⚠ ★③이 진짜 숫자다.★ ①만 많고 ③이 0 이면 ★화면에는 아무것도 없다.★
 */
import { prisma } from '@sacloud/db'

interface MonthRow {
  ym: string
  n: bigint
}

const pct = (a: number, b: number): string => (b === 0 ? '  —  ' : `${((100 * a) / b).toFixed(0)}%`)

async function main(): Promise<void> {
  /* ① 경기 — 달마다 */
  const matches = await prisma.$queryRaw<MonthRow[]>`
    SELECT to_char(m."startAt" AT TIME ZONE 'Asia/Seoul', 'YYYY-MM') AS ym, count(*) AS n
      FROM "Match" m
      JOIN "League" l ON l."id" = m."leagueId" AND l."slug" = 'nolink'
     GROUP BY 1 ORDER BY 1
  `

  /* ③ 라인업이 붙은 경기 — 달마다. ★이게 화면에 보이는 것★ */
  const withLineup = await prisma.$queryRaw<MonthRow[]>`
    SELECT to_char(m."startAt" AT TIME ZONE 'Asia/Seoul', 'YYYY-MM') AS ym, count(*) AS n
      FROM "Match" m
      JOIN "League" l ON l."id" = m."leagueId" AND l."slug" = 'nolink'
     WHERE EXISTS (SELECT 1 FROM "MatchPlayerStat" s WHERE s."matchId" = m."id")
     GROUP BY 1 ORDER BY 1
  `

  /*
   * ② · ④ 병영수첩 원문 — ★달을 경기키에서 뽑는다★.
   *   `matchKey` 는 ★`YYMMDD…` 18자리★ 다 (260904013633125001 = 2026-09-04).
   *   ⚠ ★`fetchedAt` 으로 세면 안 된다★ — 그건 ★우리가 받은 날★ 이지 ★경기가 열린 날★ 이 아니다.
   */
  const logs = await prisma.$queryRaw<MonthRow[]>`
    SELECT '20' || substr("matchKey", 1, 2) || '-' || substr("matchKey", 3, 2) AS ym, count(*) AS n
      FROM "BarracksBattleLogRaw"
     WHERE "matchKey" ~ '^[0-9]{12}'
     GROUP BY 1 ORDER BY 1
  `
  const lists = await prisma.$queryRaw<MonthRow[]>`
    SELECT '20' || substr("matchKey", 1, 2) || '-' || substr("matchKey", 3, 2) AS ym, count(*) AS n
      FROM "BarracksClanMatchRaw"
     WHERE "matchKey" ~ '^[0-9]{12}'
     GROUP BY 1 ORDER BY 1
  `

  const m = new Map<string, number>()
  const put = (rows: MonthRow[], _k: string): Map<string, number> => {
    const out = new Map<string, number>()
    for (const r of rows) out.set(r.ym, Number(r.n))
    return out
  }
  const M = put(matches, 'm')
  const L = put(withLineup, 'l')
  const B = put(logs, 'b')
  const C = put(lists, 'c')
  for (const k of [...M.keys(), ...L.keys(), ...B.keys(), ...C.keys()]) m.set(k, 1)
  const months = [...m.keys()].sort()

  console.info('══ ★달마다 무엇이 있나★ (IPL · KST) ══\n')
  console.info('  달        경기      ★라인업 붙은 경기★        배틀로그원문   목록원문')
  console.info('  ' + '─'.repeat(74))
  let tm = 0
  let tl = 0
  for (const ym of months) {
    const a = M.get(ym) ?? 0
    const b = L.get(ym) ?? 0
    tm += a
    tl += b
    const bar = b === 0 && a > 0 ? '  ★★없다★★' : ''
    console.info(
      `  ${ym}  ${String(a).padStart(6)}   ` +
        `★${String(b).padStart(6)}★ (${pct(b, a)})      ` +
        `${String(B.get(ym) ?? 0).padStart(7)}   ${String(C.get(ym) ?? 0).padStart(7)}${bar}`,
    )
  }
  console.info('  ' + '─'.repeat(74))
  console.info(`  합계    ${String(tm).padStart(6)}   ★${String(tl).padStart(6)}★ (${pct(tl, tm)})\n`)

  console.info('★읽는 법★')
  console.info('  ★「라인업 붙은 경기」가 0 인 달은 화면에 아무것도 없는 달이다.★')
  console.info('  경기는 있는데 라인업이 0 이면 ★배틀로그를 아직 안 받은 것★ 이다 (지금 밤새 받는 중).')
  console.info('  경기 자체가 0 인 달은 ★서플라이에서도 안 왔다★ —')
  console.info('  ★그 달은 병영수첩 목록을 `--list-pages` 로 뒤로 넘겨야 생긴다★ (2026-09-04 확인).')
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
