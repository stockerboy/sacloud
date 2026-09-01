/**
 * 운영의 **클랜 육각형 V2 현재값을 통째로 뜬다** — 밀어 넣기 전의 되돌림 지점 (2026-09-02).
 *
 * ```
 * node scripts/prod-run.mjs clan-hex-v2-backup
 * node scripts/prod-run.mjs clan-hex-v2-backup --out-dir apps/worker/backups/hexagon
 * ```
 *
 * ── ⛔ **읽기 전용이다. `--confirm` 이 없다**
 *   이 파일에는 `create` · `update` · `upsert` · `delete` 가 **한 줄도 없다.**
 *   부르면 언제나 읽고 파일로 쓸 뿐이다. 그래서 미리보기 개념이 없다.
 *
 * ── 왜 필요한가 — **이것이 사실상 유일한 되돌리기다**
 *   `clan-hex-v2-push` · `clan-hex-v2-summary-push` 는 `upsert` 로 미는데,
 *   두 표의 유니크 키에 **`formulaVersion` 이 없다**:
 *
 *   ```
 *   MatchClanHexV2    @@unique([matchId, leagueClanId])
 *   ClanHexV2Summary  @@unique(leagueClanId)
 *   ```
 *
 *   그래서 새 판(`clan-hex-v2.3`)을 밀면 **같은 줄의 옛 판이 덮인다.** 두 판을 나란히
 *   둘 자리가 표에 없다 — 「옛 행을 남긴다」는 정책이 아니라 **구조적으로 불가능**하다.
 *
 *   그리고 되돌릴 재료도 운영에는 없다. 육각형의 원재료인 배틀로그 원문
 *   (`BarracksBattleLogRaw`)은 **로컬에만 있다** (D-236). 운영에서 다시 접는 길이 없다.
 *
 *   ```
 *   덮기 전에 이 파일을 안 뜨면 → 옛 값을 되살릴 방법이 없다
 *   ```
 *
 * ── 되돌리는 법
 *   뜬 파일은 `clan-hex-v2-export.json` · `clan-hex-v2-summary-export.json` 과 **같은 모양**이다.
 *   그래서 그대로 밀기 도구의 입력이 된다.
 *
 *   ```
 *   node scripts/prod-run.mjs clan-hex-v2-push --file <백업 경기 파일> --confirm
 *   node scripts/prod-run.mjs clan-hex-v2-summary-push --file <백업 요약 파일> --confirm
 *   ```
 *
 * ── 키는 `id` 가 아니다
 *   `id` 는 `cuid()` 라 DB 마다 다르다. 옮기는 키는 **리그 slug + 클랜 slug**
 *   (경기는 `sourceMatchId` 를 더한다). 밀기 도구와 같은 관례다.
 *
 * ── 파일은 **`.gitignore` 에 있어야 한다**
 *   경기 쪽이 18MB 급이다. 커밋에 딸려 가면 안 된다.
 *   기본 자리인 `apps/worker/backups/` 는 이미 무시된다.
 */
import { mkdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { prisma } from '@sacloud/db'
import { REPO_ROOT } from '../lib/env.js'

/** 한 번에 읽을 행 수 (D-225). 경기 쪽은 `tally` 가 커서 크게 잡지 않는다 */
const BATCH = 500

const argIndex = (name: string): number => process.argv.indexOf(name)
const argValue = (name: string): string | undefined => {
  const at = argIndex(name)
  return at >= 0 ? process.argv[at + 1] : undefined
}

const outDir = argValue('--out-dir') ?? join(REPO_ROOT, 'apps', 'worker', 'backups', 'hexagon')
mkdirSync(outDir, { recursive: true })

/** 파일 이름에 **시각과 「무엇의 원본인지」**가 드러나야 한다 */
const stamp = new Date().toISOString().replace(/[:.]/g, '-')

interface Counted {
  scanned: number
  byFormula: Map<string, number>
  byLeague: Map<string, number>
  skipped: number
}
const counted = (): Counted => ({
  scanned: 0,
  byFormula: new Map(),
  byLeague: new Map(),
  skipped: 0,
})
const bump = (map: Map<string, number>, key: string): void => {
  map.set(key, (map.get(key) ?? 0) + 1)
}
const asObject = (map: Map<string, number>): Record<string, number> =>
  Object.fromEntries([...map].sort((a, b) => b[1] - a[1]))

/* -------------------------------------------------------------------------- */
/* 1) 경기 × 클랜                                                               */
/* -------------------------------------------------------------------------- */

interface MatchRow {
  leagueSlug: string
  sourceMatchId: string
  clanSlug: string
  clanName: string
  clanNo: string | null
  teamNo: string
  foeTeamNo: string | null
  rounds: number
  sidedRounds: number
  redRounds: number
  foeSnipers: number
  axesMeasured: number
  formulaVersion: string
  tally: unknown
}

const matchRows: MatchRow[] = []
const matchStat = counted()
let matchCursor: string | undefined

for (;;) {
  const batch = await prisma.matchClanHexV2.findMany({
    select: {
      id: true,
      clanNo: true,
      teamNo: true,
      foeTeamNo: true,
      rounds: true,
      sidedRounds: true,
      redRounds: true,
      foeSnipers: true,
      axesMeasured: true,
      formulaVersion: true,
      tally: true,
      match: { select: { sourceMatchId: true, league: { select: { slug: true } } } },
      leagueClan: { select: { clan: { select: { slug: true, name: true } } } },
    },
    orderBy: { id: 'asc' },
    take: BATCH,
    ...(matchCursor ? { cursor: { id: matchCursor }, skip: 1 } : {}),
  })
  if (batch.length === 0) break
  matchCursor = batch[batch.length - 1]?.id

  for (const row of batch) {
    matchStat.scanned += 1
    bump(matchStat.byFormula, row.formulaVersion)
    const sourceMatchId = row.match.sourceMatchId
    if (!sourceMatchId) {
      /* 되돌릴 때 이을 키가 없다. **추측해서 붙이지 않는다** (`CLAUDE.md` 3장 7번) */
      matchStat.skipped += 1
      continue
    }
    bump(matchStat.byLeague, row.match.league.slug)
    matchRows.push({
      leagueSlug: row.match.league.slug,
      sourceMatchId,
      clanSlug: row.leagueClan.clan.slug,
      clanName: row.leagueClan.clan.name,
      clanNo: row.clanNo,
      teamNo: row.teamNo,
      foeTeamNo: row.foeTeamNo,
      rounds: row.rounds,
      sidedRounds: row.sidedRounds,
      redRounds: row.redRounds,
      foeSnipers: row.foeSnipers,
      axesMeasured: row.axesMeasured,
      formulaVersion: row.formulaVersion,
      tally: row.tally,
    })
  }
}

/* -------------------------------------------------------------------------- */
/* 2) 클랜 요약                                                                 */
/* -------------------------------------------------------------------------- */

interface SummaryRow {
  leagueSlug: string
  clanSlug: string
  clanName: string
  formulaVersion: string
  matches: number
  axesMeasured: number
  tally: unknown
}

const summaryRows: SummaryRow[] = []
const summaryStat = counted()
let summaryCursor: string | undefined

for (;;) {
  const batch = await prisma.clanHexV2Summary.findMany({
    select: {
      id: true,
      formulaVersion: true,
      matches: true,
      axesMeasured: true,
      tally: true,
      league: { select: { slug: true } },
      leagueClan: { select: { clan: { select: { slug: true, name: true } } } },
    },
    orderBy: { id: 'asc' },
    take: BATCH,
    ...(summaryCursor ? { cursor: { id: summaryCursor }, skip: 1 } : {}),
  })
  if (batch.length === 0) break
  summaryCursor = batch[batch.length - 1]?.id

  for (const row of batch) {
    summaryStat.scanned += 1
    bump(summaryStat.byFormula, row.formulaVersion)
    bump(summaryStat.byLeague, row.league.slug)
    summaryRows.push({
      leagueSlug: row.league.slug,
      clanSlug: row.leagueClan.clan.slug,
      clanName: row.leagueClan.clan.name,
      formulaVersion: row.formulaVersion,
      matches: row.matches,
      axesMeasured: row.axesMeasured,
      tally: row.tally,
    })
  }
}

/* -------------------------------------------------------------------------- */
/* 쓰기 — **여기서만 파일을 만든다. DB 는 한 줄도 안 건드렸다**                     */
/* -------------------------------------------------------------------------- */

const matchOut = join(outDir, `prod-hex-v2-match-${stamp}.json`)
const summaryOut = join(outDir, `prod-hex-v2-summary-${stamp}.json`)
writeFileSync(matchOut, JSON.stringify(matchRows), 'utf8')
writeFileSync(summaryOut, JSON.stringify(summaryRows), 'utf8')

console.info(
  JSON.stringify(
    {
      '무엇': '운영 클랜 육각형 원본 백업 (읽기 전용 · 밀기 전 되돌림 지점)',
      '뜬 시각': stamp,
      MatchClanHexV2: {
        scanned: matchStat.scanned,
        exported: matchRows.length,
        'sourceMatchId 없어 뺀 행': matchStat.skipped,
        formulaVersions: asObject(matchStat.byFormula),
        리그별: asObject(matchStat.byLeague),
        out: matchOut,
        bytes: statSync(matchOut).size,
      },
      ClanHexV2Summary: {
        scanned: summaryStat.scanned,
        exported: summaryRows.length,
        formulaVersions: asObject(summaryStat.byFormula),
        리그별: asObject(summaryStat.byLeague),
        out: summaryOut,
        bytes: statSync(summaryOut).size,
      },
      '되돌리는 법': [
        `clan-hex-v2-push --file ${matchOut} --confirm`,
        `clan-hex-v2-summary-push --file ${summaryOut} --confirm`,
      ],
    },
    null,
    2,
  ),
)

await prisma.$disconnect()
