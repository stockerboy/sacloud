/**
 * IPL 39곳이 **우리 DB 에 있는가** 를 대조한다 (읽기 전용 · 아무것도 쓰지 않는다).
 *
 * 이름으로 찾되, 동형문자 때문에 못 찾는 경우가 있어 세 단계로 넓혀 본다.
 *   1) 이름 완전일치
 *   2) 사용자 표기(`given`) 완전일치
 *   3) 동형문자를 라틴 소문자로 접은 뒤 비교 (`I`→`l`, 키릴 `Р`→`p`, 그리스 `Β`→`b`)
 *
 * 3단계는 **후보 제시일 뿐 자동 확정이 아니다.** 사람이 보고 판단한다 (D-036 과 같은 태도).
 */
import { prisma } from '@sacloud/db'
import { IPL_ROSTER } from './iplRoster'

/** 눈으로 같아 보이는 글자를 한 글자로 접는다. 비교 전용이고 저장하지 않는다 */
function fold(value: string): string {
  return value
    .replace(/[Ι|Ⅰ]/g, 'I')
    .replace(/Р/g, 'P')
    .replace(/Β/g, 'B')
    .replace(/[^0-9A-Za-z가-힣]/g, '')
    .toLowerCase()
}

async function main(): Promise<void> {
  const clans = await prisma.clan.findMany({
    select: { id: true, slug: true, name: true, tier: true, category: true },
  })
  const byName = new Map(clans.map((c) => [c.name, c]))
  const byFold = new Map<string, typeof clans>()
  for (const c of clans) {
    const key = fold(c.name)
    byFold.set(key, [...(byFold.get(key) ?? []), c])
  }

  let exact = 0
  let folded = 0
  const missing: string[] = []

  for (const row of IPL_ROSTER) {
    const hit = byName.get(row.name) ?? byName.get(row.given)
    if (hit) {
      exact += 1
      console.info(
        `${String(row.tier)}티어 ${row.name.padEnd(14)} → 있음  slug=${hit.slug} tier=${hit.tier ?? '-'} category=${hit.category ?? '-'}`,
      )
      continue
    }
    const cands = byFold.get(fold(row.name)) ?? byFold.get(fold(row.given)) ?? []
    if (cands.length > 0) {
      folded += 1
      console.info(
        `${String(row.tier)}티어 ${row.name.padEnd(14)} → 후보 ${cands.map((c) => `${c.name}(${c.slug})`).join(' , ')}`,
      )
      continue
    }
    missing.push(`${row.tier}티어 ${row.name} (${row.barracks})`)
  }

  console.info(`\n완전일치 ${exact} · 동형문자 후보 ${folded} · 못 찾음 ${missing.length}`)
  for (const m of missing) console.info(`  없음 ${m}`)

  const tiers = new Map<number, number>()
  for (const r of IPL_ROSTER) tiers.set(r.tier, (tiers.get(r.tier) ?? 0) + 1)
  console.info(
    `\n명단 티어 분포  ${[1, 2, 3, 4, 5, 6].map((t) => `${t}티어 ${tiers.get(t) ?? 0}`).join(' · ')}  합 ${IPL_ROSTER.length}`,
  )
}

main()
  .catch((e) => console.error(String(e).slice(0, 600)))
  .finally(() => prisma.$disconnect())
