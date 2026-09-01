/**
 * 클랜명 검색 회귀 테스트.
 *
 * 여기가 틀리면 **유저가 자기 클랜을 못 찾는다.** 사용자가 직접 든 예
 * (`veritas` ← 베리타스 · `exOnePoinT` ← 원포) 는 아래 1~7번에 그대로 박아 두었다.
 *
 * 마지막 표는 **실제 클랜명 50개**에 «한글로 쳐서 찾아지는가» 를 세는 것이다.
 * 100% 가 목표가 아니다. **몇 개가 되고 몇 개가 안 되는지 숫자로 남기는 것**이 목표다.
 */
import { describe, expect, it } from 'vitest'
import {
  CLAN_SEARCH_HINT,
  chosungOf,
  clanNameMatches,
  hangulReadingsOf,
  normalizeClanQuery,
  searchClanNames,
} from '../clanSearch'

/** 표에서 «찾아지는지» 만 볼 때 쓰는 짧은 이름 */
const hit = (name: string, query: string): boolean => clanNameMatches(name, query)

describe('1. 그대로 친다 — 대소문자 무시 · 부분 일치', () => {
  it('veritas 는 veritas · VERITAS · veri 로 찾아진다', () => {
    expect(hit('veritas', 'veritas')).toBe(true)
    expect(hit('veritas', 'VERITAS')).toBe(true)
    expect(hit('veritas', 'veri')).toBe(true)
    expect(hit('veritas', 'ritas')).toBe(true)
  })

  it('상관없는 검색어는 걸리지 않는다', () => {
    expect(hit('veritas', 'zzz')).toBe(false)
    expect(hit('veritas', '해적')).toBe(false)
  })
})

describe('2. 한글 읽기로 찾는다', () => {
  it('veritas ← 베리타스 · 베리 · 리타스', () => {
    expect(hit('veritas', '베리타스')).toBe(true)
    expect(hit('veritas', '베리')).toBe(true)
    expect(hit('veritas', '리타스')).toBe(true) // 읽기의 **가운데** 도 걸린다
  })

  it('읽기 목록의 맨 앞은 가장 흔한 읽기다', () => {
    expect(hangulReadingsOf('veritas')[0]).toBe('베리타스')
    expect(hangulReadingsOf('resun')[0]).toBe('레순')
  })
})

describe('3. 읽기의 일부로 찾는다 — 사용자가 든 예', () => {
  it('exOnePoinT ← 원포 · 원포인트 · 엑스원', () => {
    expect(hangulReadingsOf('exOnePoinT')[0]).toBe('엑스원포인트')
    expect(hit('exOnePoinT', '원포')).toBe(true)
    expect(hit('exOnePoinT', '원포인트')).toBe(true)
    expect(hit('exOnePoinT', '엑스원')).toBe(true)
  })
})

describe('4. 특수문자는 무시한다 (다만 글자를 흉내 낸 것은 되살린다)', () => {
  it('des`per@do. ← desperado · 데스퍼라도 · desper', () => {
    // `@` 는 장식이 아니라 `a` 다. 지우면 두 검색어 모두 못 찾는다
    expect(hit('des`per@do.', 'desperado')).toBe(true)
    expect(hit('des`per@do.', '데스퍼라도')).toBe(true)
    expect(hit('des`per@do.', 'desper')).toBe(true)
    expect(hit('des`per@do.', '데스페라도')).toBe(true) // 읽는 법이 갈리면 둘 다 낸다
  })

  it('검색어 쪽 특수문자도 같이 무시한다', () => {
    expect(hit('des`per@do.', 'des-per-a-do')).toBe(true)
    expect(hit('QuasaR-', 'quasar')).toBe(true)
  })
})

describe('5. 한글 클랜명 — 그대로도, 초성으로도', () => {
  it('베이직 ← 베이직 · 베이 · ㅂㅇㅈ', () => {
    expect(hit('베이직', '베이직')).toBe(true)
    expect(hit('베이직', '베이')).toBe(true)
    expect(hit('베이직', 'ㅂㅇㅈ')).toBe(true)
  })

  it('초성이 다르면 걸리지 않는다', () => {
    expect(hit('베이직', 'ㅅㅇㅈ')).toBe(false)
    expect(hit('전설', 'ㅎㅈ')).toBe(false)
  })

  it('로마자 클랜명도 **읽기의 초성**으로 찾아진다', () => {
    expect(chosungOf('베리타스')).toBe('ㅂㄹㅌㅅ')
    expect(hit('veritas', 'ㅂㄹㅌㅅ')).toBe(true)
  })
})

describe('6. 띄어쓰기는 무시한다', () => {
  it('One PoinT ← 원포인트 · 원포 · onepoint', () => {
    expect(hit('One PoinT', '원포인트')).toBe(true)
    expect(hit('One PoinT', '원포')).toBe(true)
    expect(hit('One PoinT', 'onepoint')).toBe(true)
    expect(hit('One PoinT', 'one point')).toBe(true)
  })
})

describe('7. 빈 검색어는 거르지 않는다', () => {
  const items = ['veritas', '베이직', 'exOnePoinT']

  it('빈 문자열 · 공백 · 특수문자만 있는 검색어는 전부 통과다', () => {
    expect(hit('veritas', '')).toBe(true)
    expect(hit('veritas', '   ')).toBe(true)
    expect(hit('veritas', '///')).toBe(true)
  })

  it('목록도 순서까지 그대로 돌려준다', () => {
    expect(searchClanNames(items, '', (s) => s)).toEqual(items)
    expect(searchClanNames(items, '  ', (s) => s)).toEqual(items)
  })
})

describe('대문자 I 로 소문자 l 을 흉내 낸 이름', () => {
  it('ceIestial · FlexibIe 는 눈에 보이는 대로(l) 쳐도 찾아진다', () => {
    expect(hit('ceIestial', 'celestial')).toBe(true)
    expect(hit('ceIestial', '셀레스티얼')).toBe(true)
    expect(hit('FlexibIe', 'flexible')).toBe(true)
    expect(hit('FlexibIe', '플렉시블')).toBe(true)
  })

  it('쓰인 그대로(I) 쳐도 찾아진다 — 둘 다 살려 둔다', () => {
    expect(hit('ceIestial', 'ceiestial')).toBe(true)
  })

  it('대문자만으로 된 이름의 I 는 건드리지 않는다', () => {
    expect(hit('IPL', 'ipl')).toBe(true)
  })
})

describe('정렬 — 좋은 순서로 돌려준다', () => {
  const clans = ['veritasrz', 'veritas', 'exVeritas', '베리타스클랜', 'somethingelse']

  it('정확 일치 → 앞에서 시작 → 부분 일치 순이다', () => {
    expect(searchClanNames(clans, 'veritas', (s) => s)).toEqual(['veritas', 'veritasrz', 'exVeritas'])
  })

  it('한글 읽기로 걸린 것은 이름으로 걸린 것보다 뒤다', () => {
    const order = searchClanNames(['veritas', '베리타스클랜'], '베리타스', (s) => s)
    expect(order).toEqual(['베리타스클랜', 'veritas'])
  })

  it('같은 등급이면 이름이 짧은 것이 먼저다', () => {
    expect(searchClanNames(['aimenvyclan', 'aimenvy'], 'aim', (s) => s)).toEqual(['aimenvy', 'aimenvyclan'])
  })

  it('결정적이다 — 같은 입력이면 늘 같은 순서', () => {
    const once = searchClanNames(clans, '베리', (s) => s)
    const twice = searchClanNames([...clans].reverse(), '베리', (s) => s)
    expect(twice).toEqual(once)
  })

  it('객체 목록도 nameOf 로 걸러 낸다', () => {
    const rows = [
      { slug: 'a', name: 'veritas' },
      { slug: 'b', name: '해적' },
    ]
    expect(searchClanNames(rows, '베리타스', (r) => r.name)).toEqual([rows[0]])
  })
})

describe('안내 문구', () => {
  it('예시를 담고 있다 — 이 기능이 있다는 걸 아는 유일한 단서다', () => {
    expect(CLAN_SEARCH_HINT).toContain('veritas')
    expect(CLAN_SEARCH_HINT).toContain('베리타스')
    expect(CLAN_SEARCH_HINT.length).toBeLessThan(120) // 한 줄로 들어가야 한다
  })
})

describe('검색어 다듬기', () => {
  it('특수문자·공백을 버리고 소문자로 맞춘다. 초성 낱자는 살린다', () => {
    expect(normalizeClanQuery('  Veri-Tas! ')).toBe('veritasi') // `!` 는 i 로 되살아난다
    expect(normalizeClanQuery('ㅂㅇㅈ')).toBe('ㅂㅇㅈ')
    expect(normalizeClanQuery('   ')).toBe('')
  })
})

describe('순수 함수인가 · 빠른가', () => {
  it('같은 이름은 늘 같은 읽기를 낸다', () => {
    expect(hangulReadingsOf('exOnePoinT')).toEqual(hangulReadingsOf('exOnePoinT'))
  })

  it('읽기 개수가 폭발하지 않는다 (상한 48)', () => {
    for (const name of SAMPLE_NAMES) {
      expect(hangulReadingsOf(name).length).toBeLessThanOrEqual(48)
    }
  })

  it('클랜 105개 × 검색어 1개가 1ms 안에 끝난다 (읽기 캐시가 데워진 뒤)', () => {
    // 105개를 채운다 — 표본 50개를 두 번 반복하고 접미사를 붙여 서로 다른 이름으로 만든다
    const many: string[] = []
    while (many.length < 105) {
      const base = SAMPLE_NAMES[many.length % SAMPLE_NAMES.length] ?? 'clan'
      many.push(many.length < SAMPLE_NAMES.length ? base : `${base}${many.length}`)
    }
    for (const n of many) hangulReadingsOf(n) // 부르는 쪽이 캐시한다는 전제

    /*
     * 여러 묶음으로 나눠 재고 **가장 빠른 묶음**을 쓴다.
     * 처음 한두 묶음은 JIT 가 덜 데워져 서너 배로 찍힌다 (같은 코드인데 1.7ms → 0.42ms).
     * 평균을 내면 그 워밍업 비용이 섞여 «느려졌다» 는 잘못된 신호를 준다.
     */
    const batches: number[] = []
    for (let batch = 0; batch < 6; batch++) {
      const rounds = 100
      const started = performance.now()
      for (let i = 0; i < rounds; i++) searchClanNames(many, '베리', (s) => s)
      batches.push((performance.now() - started) / rounds)
    }
    const perSearch = Math.min(...batches)

    console.info(`[clanSearch] 105개 검색 1회 = ${perSearch.toFixed(3)}ms (묶음별 ${batches.map((b) => b.toFixed(2)).join(' · ')})`)
    expect(perSearch).toBeLessThan(1)
  })
})

/* ────────────────────────────────────────────────────────────────────────────
 * 실제 클랜명 표 — «한글로 쳐서 찾아지는가»
 *
 * 왼쪽은 실제로 쓰이는 클랜명, 오른쪽은 **사용자가 칠 법한 한글**이다.
 * 오른쪽은 우리가 고른 값이고 «사람이 실제로 이렇게 친다» 가 검증된 값은 아니다 —
 * 애매하면 **불리한 쪽**(우리 읽기와 다른 쪽)으로 적었다. 후하게 세지 않기 위해서다.
 * ──────────────────────────────────────────────────────────────────────────── */

const SAMPLE: readonly (readonly [name: string, korean: string])[] = [
  ['MiraGe.', '미라지'],
  ['One.PoinT', '원포인트'],
  ['dravelior', '드라벨리어'],
  ['FootMania', '풋매니아'],
  ['AimEnvy', '에임엔비'],
  ['resun', '레순'],
  ['TOGS', '톡스'],
  ['eternalrz', '이터널'],
  ['des`per@do.', '데스퍼라도'],
  ['Xenics-Storm', '제닉스스톰'],
  ['sometimes', '썸타임즈'],
  ['amaryllis', '아마릴리스'],
  ['igloo', '이글루'],
  ['idylic', '이딜릭'],
  ['grave', '그레이브'],
  ['nightbloom', '나이트블룸'],
  ['ceIestial', '셀레스티얼'],
  ['luvme', '러브미'],
  ['methodcrew', '메소드크루'],
  ['QuasaR-', '콰사르'],
  ['Atraxia', '아트락시아'],
  ['dominator:', '도미네이터'],
  ['imperium:', '임페리움'],
  ['Envy', '엔비'],
  ['adererror', '아더에러'],
  ['izmir-', '이즈미르'],
  ['supernova^', '슈퍼노바'],
  ['vAN`kA', '반카'],
  ['publicity', '퍼블리시티'],
  ['romantico', '로만티코'],
  ['Major-', '메이저'],
  ['whitelie:', '화이트라이'],
  ['souffler', '수플레'],
  ['FlexibIe', '플렉시블'],
  ['Lyrical:', '리리컬'],
  ["Raze'", '레이즈'],
  ['everwhite', '에버화이트'],
  ['lpcrew', '엘피크루'],
  ['LaonJN', '라온'],
  ['pigforever', '포에버'],
  ['uava01', '우아바'],
  ['OhMyLoVe', '오마이러브'],
  ['JJUN', '준'],
  ['luverduck', '러버덕'],
  ['veritas', '베리타스'],
  ['exOnePoinT', '원포'],
  ['베이직', 'ㅂㅇㅈ'],
  ['전설', '전설'],
  ['해적', '해적'],
  ['악마', '악마'],
]

const SAMPLE_NAMES = SAMPLE.map(([name]) => name)

/**
 * 지금 통과하는 개수. **100% 가 아니다.**
 *
 * 이 숫자는 «여기까지는 된다» 는 바닥이다. 규칙을 고쳐서 이 아래로 떨어지면
 * 어딘가를 망가뜨린 것이다. 올라가는 건 언제든 환영이고, 그때 이 값을 올려 둔다.
 */
const SAMPLE_EXPECTED_HITS = 40

describe('실제 클랜명 표 — 한글로 쳐서 찾아지는가', () => {
  it(`50개 중 ${SAMPLE_EXPECTED_HITS}개가 한글 검색으로 걸린다 (안 되는 것도 그대로 센다)`, () => {
    const passed: string[] = []
    const failed: string[] = []
    const lines: string[] = []

    for (const [name, korean] of SAMPLE) {
      const found = clanNameMatches(name, korean)
      ;(found ? passed : failed).push(name)
      lines.push(
        `${found ? 'O' : 'X'}  ${name.padEnd(14)}${korean.padEnd(10)}${hangulReadingsOf(name).slice(0, 3).join(' · ')}`,
      )
    }

    console.info(
      [
        '',
        '── 클랜명 한글 검색 실측 ──────────────────────────────',
        ...lines,
        `── ${passed.length}/${SAMPLE.length} (${Math.round((passed.length / SAMPLE.length) * 100)}%) · 못 찾는 것: ${failed.join(', ')}`,
        '',
      ].join('\n'),
    )

    expect(passed.length).toBe(SAMPLE_EXPECTED_HITS)
  })

  it('한글로 못 찾는 이름도 **로마자로는 전부 찾아진다** — 검색 자체가 막히면 안 된다', () => {
    for (const [name] of SAMPLE) {
      // 특수문자를 뺀 이름 그대로 친 경우
      const typed = normalizeClanQuery(name)
      expect(clanNameMatches(name, typed), name).toBe(true)
    }
  })

  it('표본 전체가 서로를 잡아먹지 않는다 — 검색어 하나에 목록 전체가 걸리지 않는다', () => {
    const found = searchClanNames([...SAMPLE_NAMES], '베리타스', (s) => s)
    expect(found).toEqual(['veritas'])
  })
})
