/**
 * 열산(`sanply`)에서 **IPL 클랜끼리의 경기를 지우고, IPL 클랜을 열산에서 뺀다.**
 *
 * ```
 * pnpm --filter @sacloud/worker exec tsx src/dev/iplSanplyPurge.ts            # 미리보기 (아무것도 안 쓴다)
 * pnpm --filter @sacloud/worker exec tsx src/dev/iplSanplyPurge.ts --confirm  # 실제 반영
 * ```
 *
 * 2026-08-30 사용자 지시:
 *   "열산리그에서 발견한 IPL클랜끼리의 기록을 전부 지우고
 *    열산클랜으로 등록돼있는 IPL클랜들 전부 등록해제해버려"
 *
 * ⚠ 이 지시는 `docs/IPL_SPEC.md` 1장(열산과 IPL 은 겹쳐도 된다)을 **뒤집는다.** 사용자가 정한다.
 *
 * ── 지우기 전에 원본을 파일로 남긴다
 *   `CLAUDE.md` 3-A 1번(원본을 버리지 않는다) · 7번(과거 시즌을 hard delete 하지 않는다)에
 *   정면으로 걸리는 작업이다. 사용자가 명시적으로 지시했으므로 실행하되,
 *   **지우는 행 전부를 JSON 으로 먼저 떠 둔다.** 되돌릴 수 있어야 한다.
 *
 * ── `expelledAt` 을 쓰지 않는 이유
 *   그 값은 투영 잡(`jobs/project.ts`)만 보고 **랭킹 질의는 보지 않는다.**
 *   추방 표시만 남기면 열산 랭킹에 그대로 남아 "등록 해제" 가 되지 않는다.
 *   그래서 `LeagueClan` 행 자체를 지운다 — 단 **남은 참조가 없을 때만.**
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { prisma } from '@sacloud/db'

const confirm = process.argv.includes('--confirm')
const OUT_DIR = path.join(process.cwd(), '..', '..', 'backups')

async function main(): Promise<void> {
  const ipl = await prisma.league.findUnique({ where: { slug: 'nolink' }, select: { id: true } })
  const san = await prisma.league.findUnique({ where: { slug: 'sanply' }, select: { id: true } })
  if (!ipl || !san) {
    console.error('리그를 찾지 못했다 (nolink / sanply)')
    return
  }

  const iplClanIds = new Set(
    (
      await prisma.leagueClan.findMany({ where: { leagueId: ipl.id }, select: { clanId: true } })
    ).map((r) => r.clanId),
  )
  console.info(`IPL 등록 클랜 ${iplClanIds.size}곳`)

  /* 열산에 등록된 IPL 클랜 */
  const sanRows = await prisma.leagueClan.findMany({
    where: { leagueId: san.id, clanId: { in: [...iplClanIds] } },
    select: { id: true, division: true, clan: { select: { name: true, slug: true } } },
  })
  const sanLcIds = new Set(sanRows.map((r) => r.id))
  console.info(`열산에 등록된 IPL 클랜 ${sanRows.length}곳`)
  for (const r of sanRows) console.info(`  ${r.clan.name} (${r.clan.slug}) ${r.division}부`)

  /* 열산에서 **양쪽 다** IPL 클랜인 경기 */
  const both = await prisma.match.findMany({
    where: {
      leagueId: san.id,
      redLeagueClanId: { in: [...sanLcIds] },
      blueLeagueClanId: { in: [...sanLcIds] },
    },
    select: { id: true, startAt: true },
  })
  console.info(`\n열산 · IPL끼리의 경기 ${both.length}건`)
  if (both.length > 0) {
    /* Date 는 기본 정렬이 문자열 비교라 뒤섞인다. 비교 함수를 준다 */
    const dates = both.map((m) => m.startAt).sort((a, b) => a.getTime() - b.getTime())
    console.info(`  기간 ${dates[0]?.toISOString().slice(0, 10)} ~ ${dates[dates.length - 1]?.toISOString().slice(0, 10)}`)
  }

  /* 지운 뒤에도 이 LeagueClan 행을 가리키는 경기가 남는가 */
  const remaining = await prisma.match.findMany({
    where: {
      leagueId: san.id,
      OR: [{ redLeagueClanId: { in: [...sanLcIds] } }, { blueLeagueClanId: { in: [...sanLcIds] } }],
      id: { notIn: both.map((m) => m.id) },
    },
    select: { redLeagueClanId: true, blueLeagueClanId: true },
  })
  const stillUsed = new Set<string>()
  for (const m of remaining) {
    if (sanLcIds.has(m.redLeagueClanId)) stillUsed.add(m.redLeagueClanId)
    if (sanLcIds.has(m.blueLeagueClanId)) stillUsed.add(m.blueLeagueClanId)
  }
  console.info(
    `\n지운 뒤에도 열산 경기가 남는 IPL 클랜 ${stillUsed.size}곳 · 남는 경기 ${remaining.length}건`,
  )

  if (!confirm) {
    console.info('\n미리보기다. 실제로 지우려면 --confirm')
    return
  }

  /* --- 백업 --- */
  mkdirSync(OUT_DIR, { recursive: true })
  const full = await prisma.match.findMany({
    where: { id: { in: both.map((m) => m.id) } },
    include: { stats: true },
  })
  const backup = path.join(OUT_DIR, `ipl-sanply-purge-${both.length}건.json`)
  writeFileSync(
    backup,
    JSON.stringify(
      { takenAt: new Date().toISOString(), leagueSlug: 'sanply', matches: full, leagueClans: sanRows },
      (_k, v) => (typeof v === 'bigint' ? String(v) : v),
      1,
    ),
    'utf8',
  )
  console.info(`\n백업 ${backup}`)

  /* --- 삭제 (MatchPlayerStat 은 onDelete: Cascade 로 함께 지워진다) --- */
  const del = await prisma.match.deleteMany({ where: { id: { in: both.map((m) => m.id) } } })
  console.info(`경기 ${del.count}건 삭제`)

  /* --- 열산 등록 해제 ---
     행을 지우는 쪽이 깔끔하지만, 이 클랜들에는 **IPL 상대가 아닌 열산 경기가 22,000건 넘게**
     남아 있고 그 경기들이 이 행을 가리킨다. 행을 지우면 그 경기가 통째로 깨진다.
     사용자 지시는 **IPL끼리의 기록만** 지우라는 것이었으므로 남의 경기까지 지우지 않는다.
     그래서 참조가 남은 곳은 `expelledAt` 으로 뺀다 — 그리고 랭킹 질의가 그 값을 보도록
     함께 고쳤다(그 전에는 아무도 안 봐서 추방해도 랭킹에 그대로 남았다). */
  let deleted = 0
  let expelled = 0
  for (const row of sanRows) {
    if (stillUsed.has(row.id)) {
      await prisma.leagueClan.update({
        where: { id: row.id },
        data: { expelledAt: new Date() },
      })
      expelled += 1
      continue
    }
    await prisma.leagueClan.delete({ where: { id: row.id } })
    deleted += 1
  }
  console.info(`열산 등록 해제 — 행 삭제 ${deleted}곳 · 추방표시 ${expelled}곳`)
}

main()
  .catch((e) => {
    console.error(String(e).slice(0, 900))
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
