/**
 * ★클랜 이름표(`BarracksClanAlias`)를 덮기(set cover)로 다시 만든다★ (2026-09-23 밤)
 *
 * ── 왜
 *   사장님: 「이사람(자이언트/deluxe) 기록 누락됐음 아마릴리스랑 한거 … 원인조사하고 누락된 기록 싹 다 채워놔」
 *   원인: `clan-name-backfill` 의 옛 판이 한 줄의 red·blue 를 ★둘 다★ subject 의 옛 이름으로 적었다.
 *   → 상대 이름이 전부 「내 옛 이름」 이 됐다 (afterpray 12곳 · QuasaR- 11곳 · 이름표 66,063행).
 *   → 투영의 이름 색인이 그 이름들을 「같은 이름 다른 클랜」 으로 ★310개★ 뺐다.
 *   → deluxe · amaryllis · afterpray 의 경기가 unknown_clan 으로 버려졌다 (9/3 이후 5,944건 실측).
 *
 * ── 어떻게
 *   원문을 `GROUP BY subject, red, blue` 로 뭉쳐 온 뒤(76만 줄 → 수만 줄) `deriveClanNames` 의
 *   덮기를 ★무게(weight)★ 로 돌린다. 한 slug 의 줄에는 그 클랜 이름이 반드시 한쪽에 있으니
 *   ★주인 이름이 먼저 뽑히고★ 상대는 그 줄들이 이미 덮여 안 뽑힌다. 개명 전 이름은 남은 줄을 덮으며 뽑힌다.
 *   그래도 남의 ★지금 이름★ 과 같은 것은 뺀다 (`Clan` 표 기준).
 *
 * ── 무게
 *   원문 표는 758,851행 · 1.63GB 라 어느 칸을 읽든 heap 을 다 훑는다 (2026-09-20 진단). 그래서
 *   ★밤에만★ 돈다 (`scripts/quiet-hours.sh`). 질의 한도는 10분으로 올린다 (세션 풀러).
 */
import { prisma } from '@sacloud/db'
import { deriveClanNames, type SideRow } from '../lib/iplClanNames.js'

export interface ClanAliasRebuildOptions {
  confirm?: boolean
}

export interface ClanAliasRebuildResult {
  /** 뭉친 (subject, red, blue) 줄 수 */
  groups: number
  /** 원문 줄 수 (무게 합) */
  rawRows: number
  subjects: number
  /** 새로 만든 이름표 줄 수 */
  aliases: number
  /** 남의 지금 이름이라 뺀 것 */
  foreignDropped: number
  /** 덮은 비율이 너무 작아 뺀 것 */
  thinDropped: number
  /** 지우기 전의 이름표 줄 수 */
  before: number
  ms: number
}

const REBUILD_TIMEOUT_MS = 600_000
/**
 * ★너무 얇은 이름은 안 믿는다★ — 한 줄만 덮는 이름은 잘못 긁힌 줄일 확률이 높다.
 *   첫 이름(주인 이름)은 무조건 남긴다. 그 다음부터는 2줄 이상 ★또는★ 1% 이상 덮어야 한다.
 */
const MIN_ROWS = 2
const MIN_RATIO = 0.01

export function pickAliases(
  derived: Map<string, Array<{ name: string; rows: number; ratio: number }>>,
  ownersOfName: Map<string, Set<string>>,
): { rows: Array<{ subject: string; name: string }>; foreignDropped: number; thinDropped: number } {
  const rows: Array<{ subject: string; name: string }> = []
  let foreignDropped = 0
  let thinDropped = 0
  for (const [subject, names] of derived) {
    names.forEach((n, i) => {
      if (i > 0 && n.rows < MIN_ROWS && n.ratio < MIN_RATIO) {
        thinDropped += 1
        return
      }
      const owners = ownersOfName.get(n.name)
      if (owners && [...owners].some((slug) => slug !== subject)) {
        foreignDropped += 1
        return
      }
      rows.push({ subject, name: n.name })
    })
  }
  return { rows, foreignDropped, thinDropped }
}

export async function runClanAliasRebuild(
  options: ClanAliasRebuildOptions = {},
): Promise<ClanAliasRebuildResult> {
  const startedAt = Date.now()
  await prisma.$executeRawUnsafe(`SET statement_timeout = ${REBUILD_TIMEOUT_MS}`)

  const grouped = await prisma.$queryRawUnsafe<
    { subject: string; red: string | null; blue: string | null; n: number }[]
  >(
    `SELECT "subject", "redClanName" AS "red", "blueClanName" AS "blue", COUNT(*)::int AS "n"
       FROM "BarracksClanMatchRaw"
      WHERE "status" = 'ok'
        AND ("redClanName" IS NOT NULL OR "blueClanName" IS NOT NULL)
      GROUP BY 1, 2, 3`,
  )
  const sideRows: SideRow[] = grouped.map((g) => ({ subject: g.subject, red: g.red, blue: g.blue, weight: g.n }))
  const derived = deriveClanNames(sideRows)

  const clans = await prisma.clan.findMany({ select: { slug: true, name: true } })
  const ownersOfName = new Map<string, Set<string>>()
  for (const c of clans) {
    const set = ownersOfName.get(c.name) ?? new Set<string>()
    set.add(c.slug)
    ownersOfName.set(c.name, set)
  }

  const picked = pickAliases(derived, ownersOfName)
  const before = await prisma.barracksClanAlias.count()

  const out: ClanAliasRebuildResult = {
    groups: grouped.length,
    rawRows: grouped.reduce((a, g) => a + g.n, 0),
    subjects: derived.size,
    aliases: picked.rows.length,
    foreignDropped: picked.foreignDropped,
    thinDropped: picked.thinDropped,
    before,
    ms: 0,
  }

  if (options.confirm && picked.rows.length > 0) {
    await prisma.$transaction([
      prisma.barracksClanAlias.deleteMany({}),
      prisma.barracksClanAlias.createMany({ data: picked.rows, skipDuplicates: true }),
    ])
  }
  out.ms = Date.now() - startedAt
  return out
}
