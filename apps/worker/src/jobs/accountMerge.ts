/**
 * ★★같은 계정이 두 선수로 갈라진 것을 합친다★★ (2026-09-10 · 사장님 지시)
 *
 * ── ★왜 갈라졌나★
 *   9/3~9/4 는 3rd.supply 미러에서, 9/4 부터는 병영수첩에서 경기가 들어왔다.
 *   두 출처가 선수 행을 각자 만들어서 ★한 사람이 두 줄★ 이 됐다.
 *   ```
 *   B입구  3rd.supply     sanply 21판  09-03 16:10 ~ 09-03 23:03
 *   B입구  nexon_barracks sanply 17판  09-05 01:50 ~ 09-08 03:21
 *   ```
 *   그래서 같은 사람의 기록이 반씩 나뉘고, 검색에 두 번 나온다.
 *
 * ── ★닉네임으로 합치지 않는다★
 *   위장닉이 섞인다 (D-221). 그리고 실측해 보니 ★2,080쌍 중 1,376쌍이 그 사이 개명★ 했다 —
 *   닉네임으로 했으면 그 1,376명을 통째로 놓치고, 엉뚱한 사람을 붙였을 것이다.
 *   ```
 *   Dybala → tsArbala · 무지성W → 되겠나ㅋㅋㅋㅋ? · yukie → 윤망치
 *   ```
 *
 * ── ★계정번호로 잇는다★ (2026-09-10 발견)
 *   ```
 *   Player.sourcePlayerId (숫자)  =  병영수첩 user_nexon_sn
 *   BarracksClanMember 가 그 계정의 str_usn 을 같이 준다
 *   Player.sourcePlayerId = 'BRK-<str_usn>'  ← 병영수첩 쪽 행
 *   ```
 *   ★계정 하나에 한 짝★ 이다. 실측 2,080쌍이 1:1 로 떨어졌고,
 *   ★같은 경기에 두 줄이 함께 있는 경우가 0건★ 이었다 — 같은 사람이라는 증거다.
 *   (한 사람이 한 경기에 두 번 나올 수는 없다)
 *
 * ── ★시즌0 안만 옮긴다★
 *   9/3 이전까지 옮기면 134만 줄이다. 사장님: «9/3이전기록은 (…) 필요없다고».
 *   창 안만 옮기면 ★1,699줄 · 232명★ 이다. 옛 기록은 ★한 줄도 안 건드린다.★
 *
 * ── ★지우지 않는다★ (`CLAUDE.md` 2장 2번)
 *   · `Player` 행을 지우지 않는다. 참가 기록의 주인만 옮긴다
 *   · 옛 행의 `LeaguePlayer`(집계 줄)는 ★손대지 않는다★ — 다음 `season0-apply` 가
 *     경기에서 다시 세므로 저절로 0판이 되어 랭킹에서 빠진다
 *   · 옮긴 내역을 파일로 남긴다. `--revert <파일>` 로 되돌린다
 *
 * ```
 * pnpm --filter @sacloud/worker nexon account-merge                # 미리보기
 * pnpm --filter @sacloud/worker nexon account-merge --confirm      # 반영
 * pnpm --filter @sacloud/worker nexon account-merge --all          # 시즌0 밖도 (134만 줄)
 * pnpm --filter @sacloud/worker nexon account-merge --revert <파일>
 * ```
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { prisma } from '@sacloud/db'
import { REPO_ROOT } from '../lib/env.js'
import { log } from '../lib/log.js'

/** 시즌0 시작 (KST 2026-09-03 07:00) */
const SEASON0_START = new Date('2026-09-02T22:00:00.000Z')

export interface AccountMergeResult {
  /** 계정번호로 이어진 짝 */
  pairs: number
  /** 그중 실제로 옮길 것이 있는 짝 */
  active: number
  /** 옮길 참가 기록 줄 */
  rows: number
  /** 실제로 옮긴 줄 */
  moved: number
  /** 닉네임이 달라진 짝 (개명) */
  renamed: number
  /** 같은 경기에 두 줄이 함께 있는 경우 — ★0 이어야 한다★ */
  conflicts: number
  windowOnly: boolean
  confirmed: boolean
  backupFile: string | null
  samples: Array<{ from: string; to: string; rows: number }>
}

interface Pair {
  oldId: string
  oldName: string
  brkId: string
  brkName: string
}

/** 계정번호로 이어진 짝을 찾는다. ★닉네임을 보지 않는다★ */
async function findPairs(): Promise<Pair[]> {
  return prisma.$queryRaw<Pair[]>`
    SELECT DISTINCT
           old."id"   AS "oldId",
           old."name" AS "oldName",
           brk."id"   AS "brkId",
           brk."name" AS "brkName"
      FROM "Player" old
      JOIN "BarracksClanMember" b ON b."userNexonSn" = old."sourcePlayerId"
      JOIN "Player" brk ON brk."sourcePlayerId" = 'BRK-' || b."strUsn"
     WHERE old."sourcePlayerId" ~ '^[0-9]+$'
       AND old."id" <> brk."id"`
}

export async function runAccountMerge(input: {
  all?: boolean
  confirm: boolean
  revert?: string
}): Promise<AccountMergeResult> {
  const windowOnly = !input.all

  /* ── 되돌리기 ─────────────────────────────────────────────── */
  if (input.revert) {
    const doc = JSON.parse(readFileSync(input.revert, 'utf8')) as {
      moves: Array<{ statId: string; from: string }>
    }
    let back = 0
    for (let i = 0; i < doc.moves.length; i += 500) {
      const chunk = doc.moves.slice(i, i + 500)
      for (const m of chunk) {
        await prisma.matchPlayerStat.update({
          where: { id: m.statId },
          data: { playerId: m.from },
        })
        back += 1
      }
    }
    log(`되돌렸다 — ${back}줄`)
    return {
      pairs: 0,
      active: 0,
      rows: back,
      moved: back,
      renamed: 0,
      conflicts: 0,
      windowOnly,
      confirmed: true,
      backupFile: input.revert,
      samples: [],
    }
  }

  const pairs = await findPairs()
  const result: AccountMergeResult = {
    pairs: pairs.length,
    active: 0,
    rows: 0,
    moved: 0,
    renamed: pairs.filter((p) => p.oldName !== p.brkName).length,
    conflicts: 0,
    windowOnly,
    confirmed: input.confirm,
    backupFile: null,
    samples: [],
  }
  if (pairs.length === 0) {
    log('이어지는 짝이 없다')
    return result
  }

  const oldIds = pairs.map((p) => p.oldId)
  const brkOf = new Map(pairs.map((p) => [p.oldId, p]))
  const since = windowOnly ? SEASON0_START : new Date(0)

  /*
   * ★같은 경기에 두 줄이 함께 있으면 옮기지 않는다★ — 옮기면 유일키가 깨진다.
   * 실측 0건이지만 ★안전장치는 값이 0 이어도 둔다.★
   */
  const conflict = await prisma.$queryRaw<Array<{ statId: string }>>`
    SELECT a."id" AS "statId"
      FROM "MatchPlayerStat" a
      JOIN "Match" m ON m."id" = a."matchId"
     WHERE a."playerId" = ANY(${oldIds})
       AND m."startAt" >= ${since}
       AND EXISTS (
         SELECT 1 FROM "MatchPlayerStat" c
          WHERE c."matchId" = a."matchId"
            AND c."playerId" IN (
              SELECT brk."id" FROM "Player" brk
                JOIN "BarracksClanMember" b ON brk."sourcePlayerId" = 'BRK-' || b."strUsn"
                JOIN "Player" o ON b."userNexonSn" = o."sourcePlayerId"
               WHERE o."id" = a."playerId"))`
  const conflictIds = new Set(conflict.map((c) => c.statId))
  result.conflicts = conflictIds.size

  const moves = await prisma.$queryRaw<Array<{ statId: string; playerId: string }>>`
    SELECT s."id" AS "statId", s."playerId"
      FROM "MatchPlayerStat" s
      JOIN "Match" m ON m."id" = s."matchId"
     WHERE s."playerId" = ANY(${oldIds})
       AND m."startAt" >= ${since}
       AND m."supersededAt" IS NULL`

  const plan = moves.filter((m) => !conflictIds.has(m.statId))
  result.rows = plan.length

  const byPlayer = new Map<string, number>()
  for (const m of plan) byPlayer.set(m.playerId, (byPlayer.get(m.playerId) ?? 0) + 1)
  result.active = byPlayer.size
  result.samples = [...byPlayer.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([oldId, rows]) => {
      const p = brkOf.get(oldId)
      return { from: p?.oldName ?? oldId, to: p?.brkName ?? '?', rows }
    })

  if (input.confirm && plan.length > 0) {
    /* ★먼저 되돌리기 파일을 쓴다.★ 쓰기 전에 남긴다 — 중간에 죽어도 되돌릴 수 있다 */
    const dir = path.join(REPO_ROOT, 'backup')
    mkdirSync(dir, { recursive: true })
    const file = path.join(dir, `account-merge-${Date.now()}.json`)
    writeFileSync(
      file,
      JSON.stringify(
        { at: new Date().toISOString(), moves: plan.map((m) => ({ statId: m.statId, from: m.playerId })) },
        null,
        0,
      ),
      'utf8',
    )
    result.backupFile = file
    log(`되돌리기 파일 — ${file}`)

    /* 새 주인별로 묶어서 한 번에 쓴다 */
    const toBrk = new Map<string, string[]>()
    for (const m of plan) {
      const brk = brkOf.get(m.playerId)?.brkId
      if (!brk) continue
      const got = toBrk.get(brk)
      if (got) got.push(m.statId)
      else toBrk.set(brk, [m.statId])
    }
    for (const [brkId, statIds] of toBrk) {
      for (let i = 0; i < statIds.length; i += 500) {
        const r = await prisma.matchPlayerStat.updateMany({
          where: { id: { in: statIds.slice(i, i + 500) } },
          data: { playerId: brkId },
        })
        result.moved += r.count
      }
    }
  }

  log(
    `계정으로 이어진 짝 ${result.pairs.toLocaleString()} · 개명 ${result.renamed.toLocaleString()} · ` +
      `옮길 사람 ${result.active} · 줄 ${result.rows.toLocaleString()} · 옮김 ${result.moved.toLocaleString()} · ` +
      `충돌 ${result.conflicts}${result.windowOnly ? ' · 시즌0만' : ' · 전 기간'}` +
      `${result.confirmed ? '' : ' (미리보기)'}`,
  )
  return result
}
