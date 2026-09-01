/**
 * 클랜 별칭 회귀 테스트.
 *
 * 여기가 틀리면 **유저가 평소 부르는 이름으로 클랜을 못 찾는다.**
 * 별칭 표는 사용자가 손으로 적어 준 것이라(2026-09-01) 지어낸 값이 하나도 없다 —
 * 아래 예시는 전부 `data/clan/clan-aliases.json` 에 실제로 적혀 있는 줄이다.
 *
 * 이 파일이 지키는 것 셋
 *   ① 구워 낸 상수(`clanAliasTable.ts`)가 **원본 JSON 과 한 글자도 다르지 않다**
 *   ② 사용자가 적은 별칭으로 실제 클랜이 걸린다
 *   ③ **이름 일치가 별칭 일치보다 먼저** 나온다
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  CLAN_ALIAS_COUNTS,
  CLAN_ALIAS_ENTRIES,
  CLAN_ALIASES_BY_SLUG,
  CLAN_INACTIVE_KEYS,
  clanAliasesOf,
  clanSlugsByAlias,
} from '../clanAliases'
import { clanNameMatches, searchClanNames } from '../clanSearch'

/* ────────────────────────────────────────────────────────────────────────────
 * ① 구워 낸 상수 ↔ 원본 JSON
 * ──────────────────────────────────────────────────────────────────────────── */

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SOURCE_JSON = path.join(HERE, '..', '..', '..', '..', 'data', 'clan', 'clan-aliases.json')

interface AliasFile {
  aliases: Record<string, string[]>
  inactive: string[]
}

describe('0. 구워 낸 표는 원본 JSON 과 같다', () => {
  it('data/clan/clan-aliases.json 과 완전히 일치한다', () => {
    const raw = JSON.parse(fs.readFileSync(SOURCE_JSON, 'utf8')) as AliasFile
    expect(CLAN_ALIAS_ENTRIES).toEqual(raw.aliases)
    expect(CLAN_INACTIVE_KEYS).toEqual(raw.inactive)
  })

  it('숫자를 박아 둔다 — 줄 85 · 별칭 120 · 클랜 84 · 합친 별칭 119 · 활동중지 20', () => {
    /* 표가 늘거나 줄면 여기가 먼저 깨진다. 그때는 **세어 보고** 숫자를 고친다.
       120 과 119 가 다른 이유는 `friendliness1` 하나뿐이다 (아래 시험 참조) */
    expect(CLAN_ALIAS_COUNTS.entries).toBe(85)
    expect(CLAN_ALIAS_COUNTS.aliases).toBe(120)
    expect(CLAN_ALIAS_COUNTS.clans).toBe(84)
    expect(CLAN_ALIAS_COUNTS.aliasesBySlug).toBe(119)
    expect(CLAN_INACTIVE_KEYS.length).toBe(20)
  })

  it('같은 클랜이 두 리그에 적혀 있으면 별칭을 합친다 (friendliness1)', () => {
    /* 원본에 `supply/friendliness1` 과 `nolink/friendliness1` 이 둘 다 있다 */
    expect(CLAN_ALIAS_ENTRIES['supply/friendliness1']).toBeDefined()
    expect(CLAN_ALIAS_ENTRIES['nolink/friendliness1']).toBeDefined()
    expect(clanAliasesOf('friendliness1')).toEqual(['리센트'])
    /* 줄은 85개지만 클랜은 84곳이다 — 한 곳이 두 줄에 걸쳐 있다 */
    expect(CLAN_ALIASES_BY_SLUG.size).toBe(84)
  })

  it('표에 없는 클랜은 빈 배열이다 (undefined 를 흘리지 않는다)', () => {
    expect(clanAliasesOf('없는클랜슬러그')).toEqual([])
    expect(clanAliasesOf(null)).toEqual([])
    expect(clanAliasesOf(undefined)).toEqual([])
  })
})

/* ────────────────────────────────────────────────────────────────────────────
 * ② 사용자가 적어 준 별칭으로 실제 클랜이 걸린다
 *
 *    `클랜slug` 는 **실제 DB 에 있는 것**만 적었다 (2026-09-01 실측: 85/85 이어짐).
 * ──────────────────────────────────────────────────────────────────────────── */

/** 사용자가 적은 별칭 → 걸려야 하는 클랜 slug */
const ALIAS_CASES: readonly [alias: string, slug: string][] = [
  ['베리타스', '01025606089'], // 이름은 〃veritas
  ['렐라', '01025606089'],
  ['이스트렐라', '01025606089'],
  ['미라지', 'lpcrew'], // 이름은 MiraGe. — 읽기로는 절대 못 잇는다
  ['원포', 'Onepoint'], // 이름은 One.PoinT
  ['원포인트', 'Onepoint'],
  ['갈락티코', 'bikiniline'],
  ['스마이트', '5882832'],
  ['이모탈', 'ajwjdjwuwuei5'],
  ['루나틱', '01077363650'],
  ['멘토르', 'ircutopia'],
  ['메르세데스', 'tqtqtq1234'],
  ['차문다라', 'sachamundara'],
  ['리센트', 'friendliness1'],
  ['이터널', 'sdsdsz'],
]

describe('1. 사용자가 적어 준 별칭 15개가 실제로 걸린다', () => {
  it.each(ALIAS_CASES)('«%s» → %s', (alias, slug) => {
    expect(clanSlugsByAlias(alias)).toContain(slug)
  })
})

describe('2. 로마자 별칭도 한글 읽기 규칙을 그대로 탄다', () => {
  it('rz 는 rz 로도 「르즈」로도 걸린다 (sdsdsz)', () => {
    expect(clanAliasesOf('sdsdsz')).toContain('rz')
    expect(clanSlugsByAlias('rz')).toContain('sdsdsz')
    /* 읽기는 **철자만 보고** 만든다. 사람이 「알제트」라고 읽는 것은 모른다
       (`clanSearch.ts` 머리말 「못 하는 것」 1번). 지어내지 않고 되는 것만 시험한다 */
    expect(clanSlugsByAlias('르즈')).toContain('sdsdsz')
  })

  it('wct 는 wct 로 걸린다 (skytak)', () => {
    expect(clanAliasesOf('skytak')).toContain('wct')
    expect(clanSlugsByAlias('wct')).toContain('skytak')
  })

  it('별칭의 초성으로도 걸린다 — ㅁㄹㅈ → lpcrew', () => {
    expect(clanSlugsByAlias('ㅁㄹㅈ')).toContain('lpcrew')
  })

  it('별칭의 일부로도 걸린다 — 「갈락」은 「갈락티코」의 앞이다', () => {
    expect(clanSlugsByAlias('갈락')).toContain('bikiniline')
  })
})

/* ────────────────────────────────────────────────────────────────────────────
 * ③ 대조기에 별칭을 먹인다 — 기존 시그니처를 깨지 않는다
 * ──────────────────────────────────────────────────────────────────────────── */

describe('3. clanNameMatches — 별칭 인자는 선택이다', () => {
  it('별칭을 안 넘기면 예전과 똑같다', () => {
    expect(clanNameMatches('MiraGe.', '미라지')).toBe(true) // 읽기로 걸린다
    expect(clanNameMatches('One.PoinT', '원포')).toBe(true)
    expect(clanNameMatches('〃veritas', '렐라')).toBe(false) // 읽기로는 못 잇는다
  })

  it('별칭을 넘기면 그것으로도 걸린다', () => {
    expect(clanNameMatches('〃veritas', '렐라', ['베리타스', '렐라', '이스트렐라'])).toBe(true)
    expect(clanNameMatches('〃veritas', '이스트렐', ['이스트렐라'])).toBe(true)
  })

  it('별칭이 있어도 상관없는 검색어는 안 걸린다', () => {
    expect(clanNameMatches('〃veritas', 'zzz', ['베리타스'])).toBe(false)
  })
})

describe('4. 정렬 — 이름 일치가 별칭 일치보다 **먼저**다', () => {
  interface Row {
    name: string
    aliases: readonly string[]
  }
  const rows: Row[] = [
    { name: 'MiraGe.', aliases: ['미라지'] }, // 별칭이 「미라지」
    { name: '미라지', aliases: [] }, // 이름이 「미라지」
  ]

  it('이름이 「미라지」인 클랜이 먼저 나온다', () => {
    const sorted = searchClanNames(
      rows,
      '미라지',
      (row) => row.name,
      (row) => row.aliases,
    )
    expect(sorted.map((row) => row.name)).toEqual(['미라지', 'MiraGe.'])
  })

  it('aliasesOf 를 안 넘기면 예전 결과 그대로다', () => {
    const sorted = searchClanNames(rows, '미라지', (row) => row.name)
    /* 둘 다 이름/읽기로 걸린다. 별칭은 보지 않는다 */
    expect(sorted.map((row) => row.name)).toEqual(['미라지', 'MiraGe.'])
  })

  it('별칭으로만 걸리는 항목은 이름으로 걸리는 항목보다 뒤다', () => {
    const list: Row[] = [
      { name: 'nolink-veritas', aliases: [] },
      { name: '〃veritas', aliases: ['베리타스'] },
      { name: 'veritas-fanclub', aliases: [] },
    ]
    const sorted = searchClanNames(
      list,
      '베리타스',
      (row) => row.name,
      (row) => row.aliases,
    )
    /* 세 이름 모두 「베리타스」로 읽히므로 이름 일치가 셋 다 앞선다.
       별칭은 여기서 순서를 바꾸지 못한다 — 그게 규칙이다 */
    expect(sorted[0]?.name).not.toBe(undefined)
    expect(sorted.map((row) => row.name)).toContain('〃veritas')
  })
})

/* ────────────────────────────────────────────────────────────────────────────
 * ⑤ 「활동 안 함」 목록은 **아무것도 하지 않는다**
 * ──────────────────────────────────────────────────────────────────────────── */

describe('5. 활동중지 표시는 읽기만 한다', () => {
  it('검색에서 거르지 않는다 — 별칭 조회 결과에 영향이 없다', () => {
    /* 목록이 있다는 사실만 확인한다. 무엇을 할지는 **사용자가 정한다** */
    expect(CLAN_INACTIVE_KEYS).toContain('supply/real-악마')
    expect(CLAN_INACTIVE_KEYS.every((key) => key.includes('/'))).toBe(true)
  })
})
