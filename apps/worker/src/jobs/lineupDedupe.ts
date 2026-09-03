/**
 * **한 경기에 두 번 들어간 라인업을 걷어낸다** (2026-09-04 · D-273).
 *
 * ══ ★왜 필요한가★ ══
 *
 * 사장님: ★«경기 상세에 10명 다 보여야 한다»★
 * 그런데 라인업 붙은 IPL 경기의 ★38.5%가 13~20명★ 이었다. 펼쳐 보니 —
 * ```
 * blue 고지슈  ★3rd.supply★      16킬 8데스
 * blue 슈한    ★nexon_barracks★  16킬 8데스   ← ★같은 사람. 닉만 다르다★
 * ```
 * ★미러가 넣어 둔 라인업 위에 병영수첩 라인업을 또 넣었다.★ 두 출처의 `Player` 가
 * 다른 행이라 겹치는 걸 못 막았다. ★킬·데스가 두 배로 잡힌다.★
 *
 * ── ★앞으로는 안 생긴다★
 *   `battlelogLineup` 이 ★라인업이 이미 있는 경기는 비켜 간다.★ 이 잡은 ★이미 들어간 것★ 을 치운다.
 *
 * ── ★★어느 쪽을 남기나 — 「더 온전한 쪽」이다★★
 *
 *   처음엔 ★「무조건 미러를 남긴다」★ 로 짰다. 미러가 ★무기·어시스트·헤드샷·데미지★ 까지
 *   갖고 있으니까 (D-034). ★그런데 미리보기를 돌려 보고 틀린 걸 알았다★ —
 * ```
 * 겹친 경기 1,184건 중
 *   지운 뒤 ★10명이 되는 것 561건★     ← 미러가 10명이다. ★미러를 남기는 게 맞다★
 *   지운 뒤 ★10명이 아닌 것 623건★     ← ★미러가 불완전하다.★ 지우면 ★더 나빠진다★
 * ```
 *   ★「좋은 출처」가 아니라 「이 경기에서 온전한 쪽」을 남겨야 한다.★
 *
 * ```
 * 미러 10명                → ★병영수첩 것을 지운다★
 * 미러 10명 아님 · 병영 10명 → ★미러 것을 지운다★ (덜 알지만 ★사람이 다 있다★)
 * 둘 다 10명 아님           → ★건드리지 않는다★ — 지우면 더 나빠진다. ★사람이 봐야 한다★
 * ```
 *   ⚠ ★「어느 출처가 낫다」로 정하면 안 된다.★ ★경기마다 다르다.★
 *
 * ── ★안전★
 * ```
 * · `--confirm` 없이는 ★한 줄도 안 지운다★. 기본은 미리보기다
 * · ★양쪽이 다 있는 경기에서만★ 지운다 — 병영수첩 것만 있는 경기는 ★건드리지 않는다★
 *   (1,321경기가 그렇다. ★그건 지우면 라인업이 통째로 사라진다★)
 * · 지워도 ★배틀로그 원문은 그대로다★ — 다시 만들 수 있다
 * · ★한 경기씩 세어 보고한다.★ 「됐습니다」로 끝내지 않는다
 * ```
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { prisma } from '@sacloud/db'
import { log } from '../lib/log.js'

const DEFAULT_LEAGUE_SLUG = 'nolink'
/** 이 표식을 가진 선수의 참가 기록만 지운다 */
const BARRACKS_ORIGIN = 'nexon_barracks'

export interface LineupDedupeResult {
  /** 양쪽 라인업이 다 있는 경기 */
  matches: number
  /** ★미러가 10명이라 병영수첩 것을 지우는 경기★ */
  dropBarracks: number
  /** ★병영수첩이 10명이라 미러 것을 지우는 경기★ */
  dropMirror: number
  /** ⚠ ★둘 다 10명이 아니라 건드리지 않는 경기★ — 사람이 봐야 한다 */
  leaveAlone: number
  /** 지울 참가 기록 전부 */
  rows: number
  /** 손댄 경기 중 ★10명이 되는 것★ */
  becomeTen: number
  written: boolean
}

export async function runLineupDedupe(
  options: { confirm?: boolean; leagueSlug?: string } = {},
): Promise<LineupDedupeResult> {
  const leagueSlug = options.leagueSlug ?? DEFAULT_LEAGUE_SLUG

  const rows = await prisma.$queryRaw<
    { matchId: string; mir: bigint; brk: bigint }[]
  >`
    SELECT m."id" AS "matchId",
           count(*) FILTER (WHERE p."origin" <> ${BARRACKS_ORIGIN}) AS mir,
           count(*) FILTER (WHERE p."origin" =  ${BARRACKS_ORIGIN}) AS brk
      FROM "Match" m
      JOIN "League" l ON l."id" = m."leagueId" AND l."slug" = ${leagueSlug}
      JOIN "MatchPlayerStat" s ON s."matchId" = m."id"
      JOIN "Player" p ON p."id" = s."playerId"
     GROUP BY m."id"
    HAVING count(*) FILTER (WHERE p."origin" <> ${BARRACKS_ORIGIN}) > 0
       AND count(*) FILTER (WHERE p."origin" =  ${BARRACKS_ORIGIN}) > 0
  `

  /* ★경기마다 어느 쪽을 지울지 정한다★ — 「좋은 출처」가 아니라 「이 경기에서 온전한 쪽」이다 */
  const TEAM_FULL = 10
  const dropBarracks: string[] = []
  const dropMirror: string[] = []
  const leaveAlone: { matchId: string; mir: number; brk: number }[] = []
  for (const r of rows) {
    const mir = Number(r.mir)
    const brk = Number(r.brk)
    if (mir === TEAM_FULL) dropBarracks.push(r.matchId)
    else if (brk === TEAM_FULL) dropMirror.push(r.matchId)
    else leaveAlone.push({ matchId: r.matchId, mir, brk })
  }
  const rowsOf = (ids: readonly string[], pick: 'mir' | 'brk'): number =>
    rows
      .filter((r) => ids.includes(r.matchId))
      .reduce((a, r) => a + Number(pick === 'mir' ? r.mir : r.brk), 0)

  const result: LineupDedupeResult = {
    matches: rows.length,
    dropBarracks: dropBarracks.length,
    dropMirror: dropMirror.length,
    leaveAlone: leaveAlone.length,
    rows: rowsOf(dropBarracks, 'brk') + rowsOf(dropMirror, 'mir'),
    becomeTen: dropBarracks.length + dropMirror.length,
    written: options.confirm === true,
  }

  log(`양쪽 라인업이 다 있는 경기 ★${result.matches.toLocaleString()}건★`)
  log(`  ★미러가 10명 → 병영수첩 것을 지운다★   ${result.dropBarracks.toLocaleString()}건`)
  log(`  ★병영수첩이 10명 → 미러 것을 지운다★   ${result.dropMirror.toLocaleString()}건`)
  log(
    `  ⚠ ★둘 다 10명이 아니다 → 안 건드린다★   ${result.leaveAlone.toLocaleString()}건` +
      ' — ★지우면 더 나빠진다. 사람이 봐야 한다★',
  )
  log(`지울 참가 기록 ★${result.rows.toLocaleString()}행★ · ★10명이 되는 경기 ${result.becomeTen.toLocaleString()}건★`)
  if (leaveAlone.length > 0) {
    log('  안 건드리는 경기의 인원 (최대 8건)')
    for (const x of leaveAlone.slice(0, 8)) {
      log(`    미러 ${x.mir}명 · 병영수첩 ${x.brk}명`)
    }
  }

  if (!options.confirm) {
    log('')
    log('★미리보기다. 한 줄도 안 지웠다.★ 지우려면 `--confirm` 을 준다')
    return result
  }

  /*
   * ── ★★지우기 전에 파일로 떠 둔다★★
   *
   * 병영수첩 것은 원문(`BarracksBattleLogRaw`)이 남아 있어 다시 만들 수 있다.
   * ★그런데 미러 것은 다시 만들 길이 확실하지 않다.★ ★그래서 지울 행을 통째로 떠 둔다.★
   * ★뜨지 못하면 지우지 않는다.★ 되돌릴 수 없는 일을 되돌릴 준비 없이 하지 않는다.
   */
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = join(process.cwd(), `lineup-dedupe-backup-${stamp}.json`)
  const backup = await prisma.matchPlayerStat.findMany({
    where: {
      OR: [
        { matchId: { in: dropBarracks }, player: { origin: BARRACKS_ORIGIN } },
        { matchId: { in: dropMirror }, player: { origin: { not: BARRACKS_ORIGIN } } },
      ],
    },
  })
  writeFileSync(backupPath, JSON.stringify(backup, null, 1), 'utf8')
  log(`★지울 ${backup.length.toLocaleString()}행을 먼저 떠 뒀다★ — ${backupPath}`)
  if (backup.length !== result.rows) {
    log(
      `⚠ ★뜬 행(${backup.length})과 셀 때의 행(${result.rows})이 다르다 — 지우지 않는다★`,
    )
    return result
  }

  /* ★한 번에 지우지 않는다★ — 큰 삭제가 한 트랜잭션에 묶이면 되돌릴 창이 사라진다 */
  const CHUNK = 200
  let done = 0
  const sweep = async (ids: readonly string[], origin: 'is' | 'not'): Promise<void> => {
    for (let i = 0; i < ids.length; i += CHUNK) {
      const part = ids.slice(i, i + CHUNK)
      const del =
        origin === 'is'
          ? await prisma.$executeRaw`
              DELETE FROM "MatchPlayerStat" s
               USING "Player" p
               WHERE p."id" = s."playerId"
                 AND p."origin" = ${BARRACKS_ORIGIN}
                 AND s."matchId" = ANY(${part}::text[])`
          : await prisma.$executeRaw`
              DELETE FROM "MatchPlayerStat" s
               USING "Player" p
               WHERE p."id" = s."playerId"
                 AND p."origin" <> ${BARRACKS_ORIGIN}
                 AND s."matchId" = ANY(${part}::text[])`
      done += del
      log(`  지움 ${done.toLocaleString()} / ${result.rows.toLocaleString()}행`)
    }
  }
  await sweep(dropBarracks, 'is')
  await sweep(dropMirror, 'not')
  log(`★끝났다 — ${done.toLocaleString()}행을 지웠다★`)
  return result
}
