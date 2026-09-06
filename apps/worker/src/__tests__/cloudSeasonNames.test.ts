/**
 * ★★시즌 체계 두 개가 절대 섞이지 않는다★★ (2026-09-06 · Part 5 · 사장님 지시).
 *
 * ```
 * 3rd.supply 과거   시즌1 … 시즌6 · 시즌7   ← 원본 공식 기록 (시즌7은 우리가 기간 고정 집계)
 * SACLOUD 독자      Cloud 0 · Cloud 1 · …  ← 우리 기록
 * ```
 *
 * > «★내부 번호와 화면 표시 이름을 구분한다★» · «★화면에 내부 음수 번호를 노출하지 않는다★»
 * > «기존 데이터가 새 명칭 때문에 ★잘못된 시즌으로 이동하면 안 된다★»
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  ROOT_SEASON_LABEL,
  cloudSeasonLabel,
  officialSeasonLabel,
  rootSeasonNumber,
  seasonDisplayLabel,
  seasonWindowAt,
  sourceSeasonNumber,
  SEASON_WINDOWS,
} from '@sacloud/contract'
import { seasonLabel } from '@sacloud/db/ops'

const here = dirname(fileURLToPath(import.meta.url))
const unified = readFileSync(join(here, '..', 'jobs', 'unifiedProject.ts'), 'utf8')
const fixJob = readFileSync(join(here, '..', 'jobs', 'matchSeasonFix.ts'), 'utf8')
const season7 = readFileSync(join(here, '..', 'jobs', 'season7Build.ts'), 'utf8')

describe('이름 — 두 체계가 갈라져 있다', () => {
  it('★우리 시즌은 Cloud N★', () => {
    expect(cloudSeasonLabel(0)).toBe('Cloud 0')
    expect(cloudSeasonLabel(1)).toBe('Cloud 1')
    expect(seasonDisplayLabel({ number: 0, seasonType: 'official' })).toBe('Cloud 0')
    expect(seasonLabel({ number: 1, seasonType: 'official' })).toBe('Cloud 1')
  })

  it('★과거 카드는 원본 시즌 번호로 시즌 N★', () => {
    for (const source of [1, 2, 3, 4, 5, 6, 7]) {
      const internal = rootSeasonNumber(source)
      expect(seasonDisplayLabel({ number: internal, seasonType: 'legacy' })).toBe(`시즌 ${source}`)
      expect(seasonLabel({ number: internal, seasonType: 'legacy' })).toBe(`시즌 ${source}`)
    }
  })

  it('★내부 음수 번호가 이름에 한 글자도 안 나온다★', () => {
    for (const source of [1, 2, 3, 4, 5, 6, 7]) {
      const internal = rootSeasonNumber(source)
      const label = seasonDisplayLabel({ number: internal, seasonType: 'legacy' })
      expect(label).not.toContain('-')
      expect(label).not.toContain(String(internal))
    }
  })

  it('★영역 이름은 여전히 「근본 시즌」★ — 카드 이름과 다른 것이다', () => {
    expect(ROOT_SEASON_LABEL).toBe('근본 시즌')
  })

  it('★옛 표기 함수는 지우지 않았다★ (CLAUDE.md 1-4)', () => {
    expect(officialSeasonLabel(0)).toBe('시즌 0')
  })

  it('시즌7 과 Cloud 7 은 ★절대 같은 글자가 아니다★', () => {
    const past = seasonDisplayLabel({ number: rootSeasonNumber(7), seasonType: 'legacy' })
    const ours = seasonDisplayLabel({ number: 7, seasonType: 'official' })
    expect(past).toBe('시즌 7')
    expect(ours).toBe('Cloud 7')
    expect(past).not.toBe(ours)
  })
})

describe('경계 — Cloud 0 은 9/3 07:00 에 시작한다', () => {
  const at = (s: string) => seasonWindowAt(new Date(s))

  it('9/3 06:59:59 는 ★Cloud 0 이 아니다★', () => {
    const w = at('2026-09-03T06:59:59+09:00')
    expect(w?.number).not.toBe(0)
    expect(w?.seasonType).toBe('beta')
  })

  it('9/3 07:00:00 부터 ★Cloud 0★', () => {
    expect(at('2026-09-03T07:00:00+09:00')?.number).toBe(0)
    expect(at('2026-09-29T23:59:59+09:00')?.number).toBe(0)
  })

  it('10/1 00:00 부터 ★Cloud 1★', () => {
    expect(at('2026-10-01T00:00:00+09:00')?.number).toBe(1)
    expect(at('2026-09-30T23:59:59+09:00')?.number).toBe(0)
  })

  it('창끼리 겹치지 않는다', () => {
    for (let i = 1; i < SEASON_WINDOWS.length; i += 1) {
      const prev = SEASON_WINDOWS[i - 1]!
      const cur = SEASON_WINDOWS[i]!
      expect(prev.endedAt).not.toBeNull()
      expect(prev.endedAt?.getTime()).toBe(cur.startedAt.getTime())
    }
  })
})

describe('★규칙은 한 곳에서만 나온다★', () => {
  it('새 Collector 가 seasonWindowAt 을 쓴다 — 날짜를 따로 안 적는다', () => {
    expect(unified).toContain('seasonWindowAt')
    expect(unified).toContain('seasonId: seasonIdFor(leagueId, m.startAt)')
    expect(unified).not.toMatch(/new Date\('2026-/)
  })

  it('시즌 고치는 잡도 같은 함수를 쓴다', () => {
    expect(fixJob).toContain('seasonWindowAt')
    expect(fixJob).not.toMatch(/new Date\('2026-09-0[123]/)
  })

  it('★시즌 딱지 말고는 안 건드린다★', () => {
    /*
     * 이 잡이 DB 에 쓰는 자리는 ★`data:` 로만 열린다.★
     * 그 안의 칸이 전부 `seasonId` 면 ★다른 칸은 건드릴 수가 없다.★
     */
    const written = [...fixJob.matchAll(/data:\s*\{\s*(\w+)/g)].map((m) => m[1])
    expect(written.length).toBeGreaterThan(0)
    expect([...new Set(written)]).toEqual(['seasonId'])
  })

  it('★되돌리기 자료 없이는 못 쓴다★', () => {
    expect(fixJob).toContain('--backup 없이는 --confirm 을 받지 않는다')
  })
})

describe('시즌7 — 우리가 만든 마감 카드', () => {
  it('내부 번호는 ★-107★ 이고 원본 번호는 ★7★ 이다', () => {
    expect(rootSeasonNumber(7)).toBe(-107)
    expect(sourceSeasonNumber(-107)).toBe(7)
  })

  it('★순위를 넣지 않는다★ — 그 기간의 원본 rating/rank 가 없다', () => {
    expect(season7).toContain('rank: null')
    expect(season7).toContain('rankCount: null')
    expect(season7).toContain('rating: null')
  })

  it('★창이 두 곳에 안 적혀 있다★ — supply 리그 · 2024-04-01 · 9/3 07:00', () => {
    expect(season7).toContain("new Date('2024-04-01T00:00:00+09:00')")
    expect(season7).toContain("new Date('2026-09-03T07:00:00+09:00')")
    expect(season7).toContain("origin = '3rd.supply'")
  })

  it('★원본 카드가 아님을 남긴다★', () => {
    expect(season7).toContain('sacloud-computed:')
    expect(season7).toContain('imported: false')
  })

  it('★LeaguePlayer 를 새로 만들지 않는다★', () => {
    expect(season7).not.toContain('prisma.leaguePlayer.create')
    expect(season7).not.toContain('prisma.leaguePlayer.upsert')
  })
})
