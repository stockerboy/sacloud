/**
 * ★★지난시즌 카드는 「서플라이공식리그」것만 쓴다★★ (2026-09-04 · Part 1 · 사장님 지시).
 *
 * > «다른 리그 카드 / 10mountain / 비공식 카드 / 이름이 비슷한 카드는 절대 섞지 않는다»
 * > «카드가 없으면 없음. 다른 카드를 대체재로 사용하지 않는다»
 *
 * ── ★섞일 수 없는 이유가 셋이다★
 * ```
 * ① 경로     원본이 리그마다 다른 `leaguePlayerId` 를 준다 —
 *            `/leagues/supply/players/{id}` 로 받은 것만 `/leagueplayers/{그것}/seasons` 에 쓴다
 *            ★같은 선수가 리그마다 다른 카드를 갖는다★ (실측 아래)
 * ② 구조     `LeaguePlayerSeason.leaguePlayerId` 가 리그에 매여 있다
 * ③ ★검사★  파일에 다른 리그 줄이 섞여 있으면 ★골라내지 않고 멈춘다★
 * ```
 *
 * ── ★③이 왜 필요한가 — ①②로 충분해 보이는데★
 *   ①②는 「우리가 올바른 파일을 넘겼을 때」 성립한다.
 *   ★잘못된 파일을 넘기는 것은 막지 못한다.★ 그리고 예전 코드는 그런 줄을
 *   ★조용히 건너뛰었다★ — 0건인지 5,000건인지 아무도 몰랐다.
 *   사장님 완료 조건이 「★그런 카드 0건★」이라 ★세어야 답할 수 있다.★
 *
 * ── 여기서 고정하는 것
 *   1. 같은 선수의 supply 카드와 sanply 카드가 ★실제로 다르다★ (실측 데이터로)
 *   2. 파일에 다른 리그 줄이 섞이면 ★던진다★ — 골라 넣지 않는다
 *   3. 카드가 없는 선수는 ★빈 배열★ 이고, 그 자리에 다른 것을 넣지 않는다
 */
import { describe, expect, it } from 'vitest'
import { createReadStream, existsSync } from 'node:fs'
import { createInterface } from 'node:readline'

const DATA = 'C:/Users/LG/Desktop/서플라이/packages/db/data'
const SUPPLY = `${DATA}/supply-seasons-supply.seasons.jsonl`
const SANPLY = `${DATA}/supply-seasons-sanply.seasons.jsonl`

interface Line {
  league_slug: string
  player_id: string
  league_player_id: number
  raw: Array<{ season: number; rank_count: number | null; win: number | null }>
}

async function read(path: string): Promise<Line[]> {
  if (!existsSync(path)) return []
  const out: Line[] = []
  const rl = createInterface({ input: createReadStream(path) })
  for await (const line of rl) {
    const t = line.trim()
    if (t) out.push(JSON.parse(t) as Line)
  }
  return out
}

const supply = await read(SUPPLY)
const sanply = await read(SANPLY)
const haveFiles = supply.length > 0 && sanply.length > 0

describe.skipIf(!haveFiles)('원본이 리그마다 다른 카드를 준다 (실측 데이터)', () => {
  it('supply 파일은 ★전부 league_slug = supply★ 다', () => {
    const slugs = new Set(supply.map((r) => r.league_slug))
    expect([...slugs]).toEqual(['supply'])
  })

  it('sanply 파일은 전부 league_slug = sanply 다', () => {
    const slugs = new Set(sanply.map((r) => r.league_slug))
    expect([...slugs]).toEqual(['sanply'])
  })

  it('★같은 선수라도 리그마다 leaguePlayerId 가 다르다★ — 그래서 카드가 안 섞인다', () => {
    const bySup = new Map(supply.map((r) => [r.player_id, r]))
    let both = 0
    let sameId = 0
    for (const r of sanply) {
      const s = bySup.get(r.player_id)
      if (!s) continue
      both += 1
      if (s.league_player_id === r.league_player_id) sameId += 1
    }
    expect(both).toBeGreaterThan(1000) // 두 리그에 다 있는 선수가 많다
    expect(sameId).toBe(0) // ★단 한 명도 같지 않다★
  })

  it('★같은 선수의 두 리그 카드 내용이 실제로 다르다★ — 잘못 가져오면 거짓말이 된다', () => {
    const bySan = new Map(sanply.map((r) => [r.player_id, r]))
    let compared = 0
    let different = 0
    for (const s of supply) {
      if (s.raw.length === 0) continue
      const o = bySan.get(s.player_id)
      if (!o || o.raw.length === 0) continue
      compared += 1
      const a = JSON.stringify(s.raw.map((x) => [x.season, x.rank_count, x.win]).sort())
      const b = JSON.stringify(o.raw.map((x) => [x.season, x.rank_count, x.win]).sort())
      if (a !== b) different += 1
    }
    expect(compared).toBeGreaterThan(100)
    /* 거의 전부 달라야 한다. 같으면 그건 우연이지 규칙이 아니다 */
    expect(different / compared).toBeGreaterThan(0.95)
  })

  it('카드가 없는 선수는 ★빈 배열★ 이다 — 다른 리그 값이 들어와 있지 않다', () => {
    const empty = supply.filter((r) => r.raw.length === 0)
    expect(empty.length).toBeGreaterThan(0)
    for (const r of empty.slice(0, 200)) {
      expect(r.raw).toEqual([])
      expect(r.league_slug).toBe('supply')
    }
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
 * ★섞인 파일을 넘기면 멈추는가★ — 골라 넣지 않는다
 *
 * ⚠ `confirm: false` 로 부른다. ★한 줄도 쓰지 않는다★ —
 *   검사는 파일을 읽은 직후, 쓰기보다 ★먼저★ 걸리게 두었기 때문에 이걸로 충분하다.
 *   (그 순서 자체가 이 테스트가 지키는 것이다)
 * ═══════════════════════════════════════════════════════════════════════════ */
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { prisma } from '@sacloud/db'
import { runSupplySeasonsImport } from '../jobs/supplySeasonsImport.js'

const dbUp = await prisma
  .$queryRawUnsafe('select 1')
  .then(() => true)
  .catch(() => false)
const hasSupplyLeague =
  dbUp && (await prisma.league.findUnique({ where: { slug: 'supply' }, select: { id: true } })) !== null

const line = (slug: string, playerId: string, lpid: number) =>
  JSON.stringify({
    source: '3rd.supply',
    endpoint: `/leagueplayers/${lpid}/seasons`,
    fetched_at: '2026-08-28T01:00:00.000Z',
    league_slug: slug,
    player_id: playerId,
    league_player_id: lpid,
    raw: [{ id: 1, season: 6, rank: 10, rank_count: 100, win: 3, lose: 1, win_rate: 75, kill: 40, death: 20, kd_rate: 66.7 }],
  })

describe.skipIf(!hasSupplyLeague)('섞인 파일은 거부한다 (쓰지 않는다)', () => {
  it('★sanply 줄이 한 줄이라도 섞이면 던진다★ — 골라 넣지 않는다', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cardguard-'))
    const file = join(dir, 'mixed.seasons.jsonl')
    writeFileSync(file, [line('supply', '111', 1), line('sanply', '222', 2)].join('\n'))
    try {
      await expect(
        runSupplySeasonsImport({ file, leagueSlug: 'supply', confirm: false }),
      ).rejects.toThrow(/다른 리그 카드가 1줄/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('supply 줄만 있으면 통과한다 (미리보기라 쓰지는 않는다)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cardguard-'))
    const file = join(dir, 'clean.seasons.jsonl')
    writeFileSync(file, [line('supply', '111', 1), line('supply', '333', 3)].join('\n'))
    try {
      const out = await runSupplySeasonsImport({ file, leagueSlug: 'supply', confirm: false })
      expect(out.foreignLeagueRows).toBe(0)
      expect(out.seenLeagueSlugs).toEqual(['supply'])
      expect(out.readPlayers).toBe(2)
      /* 미리보기다 — 쓴 것이 없어야 한다 */
      expect(out.rowsCreated).toBe(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
