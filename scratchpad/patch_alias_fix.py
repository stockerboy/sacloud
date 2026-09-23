# -*- coding: utf-8 -*-
"""이름표 오염 수정 패치 (2026-09-23 밤) — CRLF 보존"""
import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def P(rel): return os.path.join(ROOT, rel)
def rw(p): return open(p, encoding='utf-8', newline='').read()
def save(p, s): open(p, 'w', encoding='utf-8', newline='').write(s)
def rep(rel, old, new, cnt=1):
    p = P(rel); s = rw(p); nl = '\r\n' if '\r\n' in s else '\n'
    old = old.replace('\n', nl); new = new.replace('\n', nl)
    if new in s and old not in s:
        print('skip (already)', rel); return
    assert s.count(old) == cnt, (rel, old[:60], s.count(old))
    save(p, s.replace(old, new))

# 1. weighted greedy
p = 'apps/worker/src/lib/iplClanNames.ts'
rep(p, """export interface SideRow {
  subject: string
  red: string | null
  blue: string | null
}""", """export interface SideRow {
  subject: string
  red: string | null
  blue: string | null
  /**
   * ★이 줄이 몇 줄을 대신하나★ (2026-09-23 · `clan-alias-rebuild`).
   *   원문 76만 줄을 그대로 들고 오지 않고 `GROUP BY subject, red, blue` 로 뭉쳐 온다.
   *   비워 두면 1 — 옛 호출은 한 글자도 안 바뀐다.
   */
  weight?: number
}""")
rep(p, """  const bySubject = new Map<string, Array<{ red: string | null; blue: string | null }>>()
  for (const row of rows) {
    const list = bySubject.get(row.subject)
    if (list) list.push({ red: row.red, blue: row.blue })
    else bySubject.set(row.subject, [{ red: row.red, blue: row.blue }])
  }""", """  const bySubject = new Map<string, Array<{ red: string | null; blue: string | null; w: number }>>()
  for (const row of rows) {
    const w = row.weight !== undefined && row.weight > 0 ? row.weight : 1
    const list = bySubject.get(row.subject)
    if (list) list.push({ red: row.red, blue: row.blue, w })
    else bySubject.set(row.subject, [{ red: row.red, blue: row.blue, w }])
  }""")
rep(p, """    const uncovered = new Set(subjectRows.map((_, index) => index))
    const chosen: DerivedName[] = []
""", """    const uncovered = new Set(subjectRows.map((_, index) => index))
    const chosen: DerivedName[] = []
    const total = subjectRows.reduce((a, r) => a + r.w, 0)
""")
rep(p, """        for (const name of [row.red, row.blue]) {
          if (name) tally.set(name, (tally.get(name) ?? 0) + 1)
        }""", """        for (const name of [row.red, row.blue]) {
          if (name) tally.set(name, (tally.get(name) ?? 0) + row.w)
        }""")
rep(p, """        ratio: subjectRows.length === 0 ? 0 : bestCount / subjectRows.length,""",
       """        ratio: total === 0 ? 0 : bestCount / total,""")

# 2. clanNameBackfill switch
p = 'apps/worker/src/jobs/clanNameBackfill.ts'
rep(p, """const DEFAULT_LIMIT = 2000""", """const DEFAULT_LIMIT = 2000

/**
 * ★이름표를 여기서 쓰지 않는다★ (2026-09-23 밤 · 사장님 「자이언트 기록 누락」 원인)
 *   옛 판은 한 줄의 red·blue 를 ★둘 다★ `subject` 의 옛 이름으로 적었다.
 *   그러면 ★상대 클랜 이름이 전부 내 옛 이름이 된다★ — 실측 「afterpray」 가 12개 slug 의
 *   이름표에, 「QuasaR-」 가 11개에 들어갔고, 이름표 66,063행 중 대부분이 남의 이름이었다.
 *   투영은 그런 이름을 「같은 이름 다른 클랜」 으로 보고 ★310개 이름을 통째로 뺐다★ —
 *   deluxe · amaryllis · afterpray 가 거기 들어가 ★그 클랜들의 경기가 unknown_clan 으로 버려졌다.★
 *   이름표는 이제 `clan-alias-rebuild` 가 ★덮기(set cover)★ 로 만든다. 여기서는 칸만 채운다.
 *   옛 동작은 이 스위치로 남긴다.
 */
const ALIAS_FROM_BACKFILL = false""")
rep(p, """  if (aliasRows.length > 0) {
""", """  if (ALIAS_FROM_BACKFILL && aliasRows.length > 0) {
""")

# 3. buildNameIndex defensive filter
p = 'apps/worker/src/jobs/unifiedProject.ts'
rep(p, """  let recovered = 0
  for (const [subject, names] of derived) {
    const owner = bySlug.get(subject)
    if (!owner) continue
    for (const n of names) {
      if (n.name === owner.clanName) continue
      entries.push({ name: n.name, clanId: owner.clanId, league: owner.league })
      recovered += 1
    }
  }
""", """  /*
   * ★남의 지금 이름은 내 옛 이름이 될 수 없다★ (2026-09-23 밤 · 사장님 「자이언트 기록 누락」)
   *   이름표가 한때 상대 이름까지 「내 옛 이름」 으로 담았다 (`clanNameBackfill` 의 옛 판).
   *   그 이름들이 색인에서 「같은 이름 다른 클랜」 으로 ★310개★ 빠지며 deluxe · amaryllis 의
   *   경기가 unknown_clan 으로 버려졌다. 이름표는 `clan-alias-rebuild` 가 다시 만들지만,
   *   여기서도 한 번 더 거른다 — ★`Clan` 표에 그 이름을 지금 쓰는 다른 클랜이 있으면 뺀다.★
   */
  const clanNames = await prisma.clan.findMany({ select: { id: true, name: true } })
  const ownersOfName = new Map<string, Set<string>>()
  for (const c of clanNames) {
    const set = ownersOfName.get(c.name) ?? new Set<string>()
    set.add(c.id)
    ownersOfName.set(c.name, set)
  }
  const isSomeoneElsesName = (name: string, clanId: string): boolean => {
    const owners = ownersOfName.get(name)
    if (!owners) return false
    for (const id of owners) if (id !== clanId) return true
    return false
  }

  let recovered = 0
  let foreignSkipped = 0
  for (const [subject, names] of derived) {
    const owner = bySlug.get(subject)
    if (!owner) continue
    for (const n of names) {
      if (n.name === owner.clanName) continue
      if (isSomeoneElsesName(n.name, owner.clanId)) {
        foreignSkipped += 1
        continue
      }
      entries.push({ name: n.name, clanId: owner.clanId, league: owner.league })
      recovered += 1
    }
  }
  if (foreignSkipped > 0) log(`  이름표에서 남의 지금 이름 ${foreignSkipped}개를 옛 이름으로 안 쳤다`)
""")

# 4. new job file
JOB = """/**
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
"""
open(P('apps/worker/src/jobs/clanAliasRebuild.ts'), 'w', encoding='utf-8', newline='\r\n').write(JOB)

# 5. CLI
p = 'apps/worker/src/cli.ts'
rep(p, """import { runClanNameBackfill } from './jobs/clanNameBackfill'
""", """import { runClanNameBackfill } from './jobs/clanNameBackfill'
import { runClanAliasRebuild } from './jobs/clanAliasRebuild.js'
""")
rep(p, """    case 'unified-project': {
      /*
       * ★통합 투영★ (Part 3 ④단계 · 2026-09-05) — IPL / SPL / 열산 중 정확히 하나로.""",
"""    case 'clan-alias-rebuild': {
      /*
       * ★클랜 이름표를 덮기(set cover)로 다시 만든다★ (2026-09-23 밤 · 자이언트 누락 원인)
       *
       *   nexon clan-alias-rebuild             미리보기 (몇 줄이 될지만)
       *   nexon clan-alias-rebuild --confirm   이름표를 지우고 다시 쓴다
       *
       * ⚠ 원문 76만 줄을 한 번 훑는다 (GROUP BY) — ★밤에만★ (`scripts/quiet-hours.sh`).
       */
      const out = await runClanAliasRebuild({ confirm: boolFlag(args, 'confirm') })
      table([
        {
          원문줄: out.rawRows,
          뭉침: out.groups,
          클랜: out.subjects,
          '이름표(전)': out.before,
          '이름표(후)': out.aliases,
          남의이름뺌: out.foreignDropped,
          얇아서뺌: out.thinDropped,
          걸린ms: out.ms,
        },
      ])
      if (!boolFlag(args, 'confirm')) log('미리보기다 — 한 줄도 안 썼다. --confirm 으로 다시 쓴다')
      return 0
    }

    case 'unified-project': {
      /*
       * ★통합 투영★ (Part 3 ④단계 · 2026-09-05) — IPL / SPL / 열산 중 정확히 하나로.""")

# 6. quiet-hours: alias rebuild + deep project pass after ①
p = 'scripts/quiet-hours.sh'
rep(p, """# ── ② MVP 설명 다시 만들기 ────────────────────────────────────────""",
"""# ── ①-2 클랜 이름표 다시 만들기 (2026-09-23 밤 · 자이언트 누락 원인) ──────
#   옛 이름표는 상대 이름까지 「내 옛 이름」 으로 담아 투영이 310개 이름을 버렸다.
#   덮기(set cover)로 다시 쓴다. 원문 76만 줄을 한 번 훑으니 밤에만.
if past_quiet; then
  say "사람이 오는 시간이다 — ①-2 는 내일 같은 시간에 한다"
else
  out=$(pnpm --filter @sacloud/worker nexon clan-alias-rebuild --confirm 2>&1 | grep "이름표" | tail -1 || true)
  say "  ①-2 이름표 다시 만듦 — ${out:-(출력을 못 읽었다)}"
fi

# ── ①-3 정규화 깊은 되감기 (2026-09-23 밤) ─────────────────────────
#   2분 예약은 「이미 만든 곳 − 2시간」 부터만 본다. 그보다 늦게 도착한 원문(상대가 며칠 뒤에
#   긁힌 경기)은 영영 안 만들어진다 — deluxe 5,944건이 그렇게 빠졌다. 하루 한 번 30시간을 되감는다.
if past_quiet; then
  say "사람이 오는 시간이다 — ①-3 은 내일 같은 시간에 한다"
else
  say "  ①-3 정규화 30시간 되감기 시작"
  PROJECT_REWIND_HOURS=30 flock -w 600 /var/lock/sac-project.lock sh scripts/project.sh >> "$LOG" 2>&1
  say "  ①-3 끝 (코드 $?)"
fi

# ── ② MVP 설명 다시 만들기 ────────────────────────────────────────""")
print('patched')
