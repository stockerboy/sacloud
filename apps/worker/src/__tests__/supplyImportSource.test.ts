/**
 * 수집 파일 어댑터 — **두 포맷을 같은 통로로** 읽는지 고정한다 (D-153).
 *
 *   (구) `<base>.json` 하나에 matches/details 까지 전부   ← daerule · sanply
 *   (신) `<base>.json` + `.matches.jsonl` + `.details.jsonl`  ← supply
 *
 * 여기서 고정하는 것
 *   1. 두 포맷이 **같은 판독 결과**를 낸다
 *   2. 상세가 없는 경기는 넣지 않고 `detail_missing` 으로 **센다**
 *   3. 상세만 있고 목록에 없는 줄 · 중복 줄 · 깨진 줄도 사유별로 센다
 *   4. `--limit` 은 거기서 멈춘다 (그때는 detail_missing 을 세지 않는다)
 *   5. 판독 결과를 배열로 모으지 않는다 — 통로가 async iterable 이다
 */
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { openSupplyMirrorSource } from '../jobs/supplyImport.js'

const RED_CLAN = { id: 69, name: 'iramors+', slug: 'iramorszz', mark_bg: 'bg', mark_front: 'fr' }
const BLUE_CLAN = { id: 109, name: '엘리게이터', slug: 'alligatorteam', mark_bg: null, mark_front: null }

function row(id: string) {
  return {
    id,
    map: '프로방스',
    mvp_player_id: 1,
    player_count: 10,
    start_at: '2026-07-25 21:39:28',
    end_at: '2026-07-25 21:55:00',
    play_time: '15분 32초',
    rating_update: 9,
    win: true,
    blue_team: false,
    placement: false,
    opponent: { id: 2658, rating: 1754, division: 2, placement: false, clan: BLUE_CLAN },
    summary: { red: [{ player: { id: 1, name: 'a', clan: RED_CLAN }, weapon: 0 }], blue: [] },
    _seenFrom: 'iramorszz',
  }
}

function detail(id: string) {
  const one = (pid: number, name: string, clan: unknown, win: boolean) => ({
    player: { id: pid, name, clan },
    kill: 4,
    death: 10,
    assist: 6,
    headshot: 0,
    damage: 820,
    win,
    dropout: false,
    weapon: 0,
    rating: 2910,
    rating_update: 6,
    placement: false,
  })
  return {
    _matchId: id,
    red: [one(1, 'a', RED_CLAN, true), one(2, 'b', RED_CLAN, true)],
    blue: [one(3, 'c', BLUE_CLAN, false), one(4, 'd', BLUE_CLAN, false)],
  }
}

const checkpoint = {
  source: '3rd.supply',
  leagueSlug: 'daerule',
  leagueId: 2,
  capturedAt: '2026-08-27',
  clans: {
    iramorszz: { leagueClanId: 70, clanId: 69, name: 'iramors+', division: 1 },
    alligatorteam: { leagueClanId: 2658, clanId: 109, name: '엘리게이터', division: 2 },
  },
  failures: [],
}

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'supply-import-'))
}

/** 신 포맷 3종 파일을 쓴다 */
function writeJsonl(dir: string, rows: unknown[], details: unknown[]): string {
  const base = join(dir, 'm.json')
  writeFileSync(base, JSON.stringify(checkpoint), 'utf8')
  writeFileSync(join(dir, 'm.matches.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8')
  if (details.length > 0) {
    writeFileSync(
      join(dir, 'm.details.jsonl'),
      details.map((d) => JSON.stringify(d)).join('\n') + '\n',
      'utf8',
    )
  }
  return base
}

/** 구 포맷 단일 파일을 쓴다 */
function writeLegacy(dir: string, rows: ReturnType<typeof row>[], details: ReturnType<typeof detail>[]): string {
  const base = join(dir, 'legacy.json')
  const matches: Record<string, unknown> = {}
  for (const r of rows) matches[r.id] = r
  const byId: Record<string, unknown> = {}
  for (const d of details) byId[d._matchId] = { red: d.red, blue: d.blue }
  writeFileSync(base, JSON.stringify({ ...checkpoint, matches, details: byId }), 'utf8')
  return base
}

async function collect(base: string, limit?: number) {
  const source = await openSupplyMirrorSource(base, { limit: limit ?? null })
  const out = []
  for await (const match of source.matches()) out.push(match)
  return { source, out }
}

describe('수집 파일 어댑터', () => {
  it('예전 단일 JSON 을 읽는다', async () => {
    const dir = tempDir()
    const base = writeLegacy(dir, [row('260725213928124003')], [detail('260725213928124003')])
    const { out } = await collect(base)
    expect(out).toHaveLength(1)
    expect(out[0]?.redClan?.slug).toBe('iramorszz')
    expect(out[0]?.blueClan?.slug).toBe('alligatorteam')
    expect(out[0]?.participants).toHaveLength(4)
  })

  it('줄 단위(JSONL) 를 읽고 **같은 결과**를 낸다', async () => {
    const legacyDir = tempDir()
    const jsonlDir = tempDir()
    const id = '260725213928124003'
    const legacy = await collect(writeLegacy(legacyDir, [row(id)], [detail(id)]))
    const jsonl = await collect(writeJsonl(jsonlDir, [row(id)], [detail(id)]))

    expect(jsonl.out).toHaveLength(1)
    expect(JSON.stringify(jsonl.out)).toBe(JSON.stringify(legacy.out))
  })

  it('클랜 마크는 요약 라인업에서 거둬 사전에 남는다 (색인에서는 버린다)', async () => {
    const dir = tempDir()
    const { source } = await collect(writeJsonl(dir, [row('1')], [detail('1')]))
    const red = source.clans.find((clan) => clan.slug === 'iramorszz')
    expect(red?.markBgUrl).toBe('bg')
    expect(red?.division).toBe(1)
  })

  it('상세가 없는 경기는 넣지 않고 detail_missing 으로 센다', async () => {
    const dir = tempDir()
    const base = writeJsonl(dir, [row('1'), row('2')], [detail('1')])
    const { source, out } = await collect(base)
    expect(out).toHaveLength(1)
    expect(source.unparsed).toEqual({ detail_missing: 1 })
  })

  it('상세 파일이 아직 없으면 전부 detail_missing 이다', async () => {
    const dir = tempDir()
    const base = writeJsonl(dir, [row('1'), row('2')], [])
    const { source, out } = await collect(base)
    expect(out).toHaveLength(0)
    expect(source.unparsed).toEqual({ detail_missing: 2 })
  })

  it('짝 없는 상세 · 중복 줄 · 깨진 줄을 사유별로 센다', async () => {
    const dir = tempDir()
    const base = join(dir, 'm.json')
    writeFileSync(base, JSON.stringify(checkpoint), 'utf8')
    writeFileSync(join(dir, 'm.matches.jsonl'), `${JSON.stringify(row('1'))}\n`, 'utf8')
    writeFileSync(
      join(dir, 'm.details.jsonl'),
      [
        JSON.stringify(detail('1')),
        JSON.stringify(detail('1')), // 중복
        JSON.stringify(detail('9')), // 목록에 없는 상세
        '{"_matchId": "2", "red": [', // 쓰다가 죽은 줄
      ].join('\n') + '\n',
      'utf8',
    )
    const { source, out } = await collect(base)
    expect(out).toHaveLength(1)
    expect(source.unparsed).toEqual({
      duplicate_detail_line: 1,
      detail_without_match_row: 1,
      broken_detail_line: 1,
    })
  })

  it('--limit 은 거기서 멈추고, 그때는 detail_missing 을 세지 않는다', async () => {
    const dir = tempDir()
    const base = writeJsonl(dir, [row('1'), row('2'), row('3')], [detail('1'), detail('2'), detail('3')])
    const { source, out } = await collect(base, 2)
    expect(out).toHaveLength(2)
    expect(source.unparsed['detail_missing']).toBeUndefined()
  })

  it('중복된 목록 줄은 나중 것이 이긴다 (덧붙이기만 하는 파일이다)', async () => {
    const dir = tempDir()
    const first = row('1')
    const second = { ...row('1'), map: '올드타운' }
    const base = writeJsonl(dir, [first, second], [detail('1')])
    const { out } = await collect(base)
    expect(out).toHaveLength(1)
    expect(out[0]?.mapName).toBe('올드타운')
  })
})
