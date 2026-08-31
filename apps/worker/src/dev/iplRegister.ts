/**
 * IPL(무소속리그 `nolink`) 39곳을 **티어별로 등록한다.** 멱등하다.
 *
 * ```
 * pnpm --filter @sacloud/worker exec tsx src/dev/iplRegister.ts            # 미리보기
 * pnpm --filter @sacloud/worker exec tsx src/dev/iplRegister.ts --confirm  # 실제 반영
 * ```
 *
 * ── 티어는 사용자가 정한다 (`docs/IPL_SPEC.md` 4-2)
 *   명단과 티어의 정본은 `iplRoster.ts` 다. **여기서 티어를 계산하지 않는다.**
 *   2026-08-30 사용자 지시로 **1티어는 비운다** — 이미 1티어에 있는 클랜이 있으면 2티어로 옮긴다.
 *
 * ── 클랜을 찾는 순서
 *   1) 병영수첩 slug == 우리 `Clan.slug` **이면서 이름도 같은** 행
 *   2) 이름 완전일치 (**후보가 둘 이상이면 만들지도 고르지도 않고 보고만 한다**)
 *
 *   ⚠ **slug 만 같은 것은 근거가 되지 않는다.** 우리 `Clan.slug` 는 3rd.supply 에서 온 값이고
 *   병영수첩 slug 와 **우연히 겹칠 수 있다.** 실제로 겹쳤다 — `eee07` 은 우리 DB 에서
 *   `<#ever'wC>` 라는 **다른 클랜**이다. 이름 확인 없이 묶으면 남의 기록이 붙는다.
 *   이름이 같은 다른 클랜도 있다 (`hingˇ` 가 두 곳). 그래서 두 조건을 **함께** 본다.
 *
 * ── 없으면 만든다
 *   `slug` = 병영수첩 slug (이미 남이 쓰고 있으면 `ipl-<slug>`) ·
 *   `origin` = 'nexon' · `category` = 'independent'.
 *   **경기 기록은 만들지 않는다.** 이 스크립트는 명단과 티어만 세운다.
 */
import { prisma } from '@sacloud/db'
import {
  INDEPENDENT_LEAGUE_SLUG,
  ensureIndependentLeague,
  registerClanTier,
} from '@sacloud/db/ops'
import { iplRosterDriftSinceLastPurge } from '@sacloud/db/ops'
import { runIplSanplyCheck } from '../jobs/iplSanplyPurge.js'
import { IPL_ROSTER } from './iplRoster'

const confirm = process.argv.includes('--confirm')

/** 눈으로 같아 보이는 글자를 접어 비교한다. 비교 전용이고 저장하지 않는다 */
function fold(value: string): string {
  return value
    .replace(/Р/g, 'P')
    .replace(/Β/g, 'B')
    .replace(/[^0-9A-Za-z가-힣]/g, '')
    .toLowerCase()
}

interface Row {
  tier: number
  name: string
  barracks: string
  clanSlug: string | null
  how: '기존(slug)' | '기존(이름)' | '기존(옛이름)' | '새로 만듦' | '모호 — 사람이 판단'
}

async function main(): Promise<void> {
  const ensured = await ensureIndependentLeague({ dryRun: !confirm })
  console.info(
    `리그 ${INDEPENDENT_LEAGUE_SLUG} · 티어수 ${ensured.league.divisionCount} · ${confirm ? '반영' : '미리보기'}` +
      (ensured.fixed.length > 0 ? ` · 고침 ${ensured.fixed.join(', ')}` : ''),
  )

  const rows: Row[] = []

  for (const entry of IPL_ROSTER) {
    const bySlug = await prisma.clan.findUnique({
      where: { slug: entry.barracks },
      select: { slug: true, name: true },
    })
    /* slug 가 같아도 **이름이 다르면 다른 클랜이다.** 묶지 않는다 */
    if (bySlug && fold(bySlug.name) === fold(entry.name)) {
      rows.push({ ...entry, clanSlug: bySlug.slug, how: '기존(slug)' })
      continue
    }
    if (bySlug) {
      console.info(
        `  ⚠ slug ${entry.barracks} 는 이미 다른 클랜이다 — 우리 DB: ${bySlug.name} / 명단: ${entry.name}`,
      )
    }

    const byName = await prisma.clan.findMany({
      where: { name: entry.name },
      select: { slug: true, name: true },
    })
    if (byName.length === 1 && byName[0]) {
      rows.push({ ...entry, clanSlug: byName[0].slug, how: '기존(이름)' })
      continue
    }

    /* 사용자가 준 옛 표기로도 찾아 본다 — 클랜이 이름을 바꾼 경우가 있다.
       `nightbloom` → `pIacebo` 가 그렇고, 같은 클랜이라고 **사용자가 확정했다**
       (`docs/IPL_SPEC.md` 2장). 새로 만들면 과거 기록이 끊긴다.
       given 과 name 이 같으면 위에서 이미 걸렀으므로 여기 오는 것은 이름이 바뀐 경우뿐이다 */
    if (entry.given !== entry.name) {
      const byGiven = await prisma.clan.findMany({
        where: { name: entry.given },
        select: { slug: true, name: true },
      })
      if (byGiven.length === 1 && byGiven[0]) {
        console.info(`  옛 이름으로 이었다 — ${entry.given} (${byGiven[0].slug}) = ${entry.name}`)
        rows.push({ ...entry, clanSlug: byGiven[0].slug, how: '기존(옛이름)' })
        continue
      }
      if (byGiven.length > 1) {
        rows.push({ ...entry, clanSlug: null, how: '모호 — 사람이 판단' })
        console.info(
          `  ⚠ 옛 이름 ${entry.given} 이 ${byGiven.length}곳 — ${byGiven.map((c) => c.slug).join(', ')}`,
        )
        continue
      }
    }
    if (byName.length > 1) {
      /* 지어내지 않는다. 사람이 고른다 */
      rows.push({ ...entry, clanSlug: null, how: '모호 — 사람이 판단' })
      console.info(
        `  ⚠ ${entry.name} 이름이 같은 클랜이 ${byName.length}곳 — ${byName.map((c) => c.slug).join(', ')}`,
      )
      continue
    }

    /* 병영수첩 slug 를 남이 쓰고 있으면 접두사를 붙여 새 slug 를 만든다 */
    const newSlug = bySlug ? `ipl-${entry.barracks}` : entry.barracks
    if (confirm) {
      await prisma.clan.create({
        data: {
          slug: newSlug,
          name: entry.name,
          category: 'independent',
          tier: entry.tier,
          origin: 'nexon',
        },
      })
    }
    rows.push({ ...entry, clanSlug: newSlug, how: '새로 만듦' })
  }

  /* --- 1티어 비우기: 이미 1티어에 있는 클랜을 2티어로 옮긴다 --- */
  const leagueRow = await prisma.league.findUnique({
    where: { slug: INDEPENDENT_LEAGUE_SLUG },
    select: { id: true },
  })
  const tierOne = leagueRow
    ? await prisma.leagueClan.findMany({
        where: { leagueId: leagueRow.id, division: 1 },
        select: { clan: { select: { slug: true, name: true } } },
      })
    : []
  if (tierOne.length > 0) {
    console.info(`\n1티어에 ${tierOne.length}곳이 있다 — 2티어로 옮긴다 (사용자 지시)`)
    for (const t of tierOne) {
      const result = await registerClanTier({
        leagueSlug: INDEPENDENT_LEAGUE_SLUG,
        clanSlug: t.clan.slug,
        tier: 2,
        dryRun: !confirm,
      })
      console.info(`  ${t.clan.name} → 2티어 ${result.ok ? 'OK' : `실패(${result.reason})`}`)
    }
  }

  /* --- 등록 --- */
  let ok = 0
  let failed = 0
  const skipped: string[] = []
  for (const row of rows) {
    if (!row.clanSlug) {
      skipped.push(`${row.tier}티어 ${row.name}`)
      continue
    }
    const result = await registerClanTier({
      leagueSlug: INDEPENDENT_LEAGUE_SLUG,
      clanSlug: row.clanSlug,
      tier: row.tier,
      dryRun: !confirm,
    })
    if (result.ok) ok += 1
    else {
      failed += 1
      console.info(`  실패 ${row.tier}티어 ${row.name} (${row.clanSlug}) — ${result.reason}`)
    }
    for (const w of result.warnings) console.info(`  주의 ${w}`)
  }

  console.info('\n--- 어떻게 이어졌나 ---')
  for (const r of rows) {
    console.info(
      `${r.tier}티어 ${r.name.padEnd(14)} 병영=${r.barracks.padEnd(13)} → ${String(r.clanSlug).padEnd(16)} ${r.how}`,
    )
  }

  const how = new Map<string, number>()
  for (const r of rows) how.set(r.how, (how.get(r.how) ?? 0) + 1)
  console.info(`\n찾은 방법  ${[...how.entries()].map(([k, v]) => `${k} ${v}`).join(' · ')}`)
  console.info(`등록 성공 ${ok} · 실패 ${failed} · 보류 ${skipped.length}`)
  for (const s of skipped) console.info(`  보류 ${s}`)
  if (!confirm) console.info('\n미리보기다. 실제로 넣으려면 --confirm')

  /* --- 등록이 청소를 부른다 (D-210 후속) ------------------------------
   *
   * 명단에 클랜이 하나 들어오면 그 클랜의 **과거 열산 경기가 소급해서 「IPL끼리」가 된다.**
   * 2026-08-31 에 그렇게 63건이 남았다 — 등록은 했고 청소는 안 돌렸다.
   *
   * 그래서 이 스크립트가 **직접 대조를 돌린다.** 사람이 기억하지 않아도 되게.
   * 다만 **여기서 지우지는 않는다** — 운영 `Match` 삭제는 백업을 뜨고 사람이 판단한다.
   * 대신 **못 지웠다는 사실을 시끄럽게 남긴다.**
   */
  await reportCleanupNeeded()
}

/**
 * 등록이 끝난 뒤 **청소가 필요한지 스스로 확인하고 시끄럽게 남긴다.**
 *
 * 지우지는 않는다. 운영 `Match` 삭제는 백업을 뜨고 사람이 판단하는 일이라
 * 자동화하지 않았다 — 그 대신 **돌릴 명령을 그대로 찍고 종료 코드를 1 로 만든다.**
 */
async function reportCleanupNeeded(): Promise<void> {
  const drift = iplRosterDriftSinceLastPurge()
  console.info('')
  console.info('=== 등록이 끝났다. 열산에 소급 발생한 IPL끼리 경기가 있는지 본다 (D-210) ===')

  let remaining: number
  try {
    const scope = await runIplSanplyCheck()
    remaining = scope.matchIds.length
  } catch (error) {
    /* 대조가 못 돌았다는 사실을 삼키지 않는다 (3-A 6번) */
    console.error(`  ⚠ 대조를 돌리지 못했다 — ${String(error).split('\n')[0]}`)
    console.error('  ⚠ **청소가 필요한지 확인되지 않았다.** 직접 돌려라:')
    console.error('       node scripts/prod-run.mjs ipl-sanply-check')
    process.exitCode = 1
    return
  }

  if (remaining === 0 && !drift.drifted) {
    console.info('  남은 경기 0건 · 명단도 마지막 청소 때 그대로 — 더 할 일이 없다')
    return
  }

  console.error('')
  console.error('  ################################################################')
  console.error('  #  청소가 필요하다. **이 스크립트는 지우지 않는다**')
  if (remaining > 0) console.error(`  #  열산에 남은 IPL끼리의 경기 ${remaining}건`)
  if (drift.added.length > 0) {
    console.error(`  #  마지막 청소 뒤 들어온 클랜: ${drift.added.join(', ')}`)
  }
  if (drift.removed.length > 0) {
    console.error(`  #  마지막 청소 뒤 빠진 클랜: ${drift.removed.join(', ')}`)
  }
  console.error('  #')
  console.error('  #  지금 이 명령을 돌려라 (백업을 뜨고 지운다):')
  console.error('  #    node scripts/prod-run.mjs ipl-sanply-purge --confirm')
  console.error('  #')
  console.error('  #  그 다음 packages/db/ops/iplSanplyPurgeLog.ts 를 갱신한다.')
  console.error('  #  갱신하지 않으면 supply-incremental 워크플로가 계속 빨갛다.')
  console.error('  ################################################################')
  /* 등록 자체는 성공했지만 **뒤처리가 남았다.** 종료 코드로도 남긴다 */
  process.exitCode = 1
}

main()
  .catch((e) => {
    console.error(String(e).slice(0, 800))
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
