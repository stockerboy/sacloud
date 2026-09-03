import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * **사장님이 쓰신 글이 새지 않았나** (O-041 ③ · 2026-09-03).
 *
 * ══ 왜 이 파일이 생겼나 ══
 *
 * `O-004` 에서 소개 본문을 사장님 글로 바꾸고 **sha256 으로 한 글자까지 대조**했다
 * (`990cf5a03ac95fa1`). 그런데 그때 **무엇을 어떻게 이어 붙여 잰 것인지는 안 적었다.**
 * 오늘 O-041 로 그 글을 접는 카드에 넣으면서 다시 재려 했더니
 * **그 값을 되살릴 수가 없다** — 이어 붙이는 방법 6가지를 다 해 봤지만 안 맞았다.
 *
 * ```
 * 확인되는 것    줄 수 14 · 사장님 14줄 + 서약서 5줄이 파일에 그대로 있다
 * 확인 못 하는 것 990cf5a03ac95fa1 이 정확히 무엇의 해시였나 (방법이 안 적혀 있다)
 * ```
 * ⚠ 이건 **글이 바뀌었다는 뜻이 아니다.** 자를 잃어버린 것이다.
 *   그래서 자를 여기에 **박아 둔다** — 이 파일이 방법과 값을 같이 들고 있으므로
 *   다음 사람은 언제든 되살릴 수 있다. `docs/ORDERS.md` 의 옛 값은 이제 안 쓴다.
 *
 * ══ 무엇을 지키나 ══
 *
 * 이 글은 사장님 글이라 **한 글자도 못 고친다.** 접기·배경 사진·말 통일 같은
 * 작업이 지나갈 때 **한 줄이 조용히 빠지는 것**이 진짜 위험이다.
 * 줄 수와 해시가 같이 걸려 있으면 그 사고가 빨간 줄로 잡힌다.
 *
 * 고쳐야 할 일이 생기면 **사장님이 바꾼 뒤** 아래 값을 같이 고친다.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(HERE, '..', 'home', 'SiteIntro.tsx'), 'utf8')

/** `const NAME = '...'` 한 줄을 꺼낸다 */
function one(name: string): string {
  const found = new RegExp(String.raw`const ${name}\s*=\s*'([^']*)'`).exec(source)
  expect(found, `${name} 을 못 찾았다`).not.toBeNull()
  return found![1]!
}

/** `const NAME: readonly string[] = [ '...', ... ]` 를 꺼낸다 */
function many(name: string): string[] {
  const found = new RegExp(
    String.raw`const ${name}: readonly string\[\] = \[([\s\S]*?)\n\]`,
  ).exec(source)
  expect(found, `${name} 을 못 찾았다`).not.toBeNull()
  return [...found![1]!.matchAll(/^\s*'(.*)',\s*$/gm)].map((m) => m[1]!)
}

/** 서약서 다섯 줄 — 제목과 본문을 짝으로 꺼낸다 */
function pledges(): string[] {
  const block = /const PLEDGES: readonly Pledge\[\] = \[([\s\S]*?)\n\]/.exec(source)
  expect(block, 'PLEDGES 를 못 찾았다').not.toBeNull()
  return [...block![1]!.matchAll(/title: '(.*)',\s*\n\s*body: '(.*)',/g)].map(
    (m) => `${m[1]!}\n${m[2]!}`,
  )
}

/**
 * ★재는 방법★ — 줄들을 **줄바꿈 하나로 이어 붙이고** UTF-8 sha256 의 **앞 16자**를 본다.
 * (O-004 가 안 적어서 잃어버린 것이 바로 이 한 줄이다. 여기 있다.)
 */
function digest(lines: string[]): string {
  return createHash('sha256').update(lines.join('\n'), 'utf8').digest('hex').slice(0, 16)
}

describe('사장님이 쓰신 글', () => {
  const owner = [
    one('OPENING'),
    ...many('SEASON_NOTES'),
    ...many('RUNTIME'),
    one('STANCE_TITLE'),
    ...many('STANCE'),
  ]

  it('본문이 14줄 그대로다', () => {
    expect(owner).toHaveLength(14)
  })

  it('본문 한 글자도 안 바뀌었다', () => {
    expect(digest(owner)).toBe('ee185fe8632ff3df')
  })

  it('서약서가 다섯 줄 그대로다', () => {
    const five = pledges()
    expect(five).toHaveLength(5)
    expect(digest(five)).toBe('b3ac1bb7012d2e41')
  })

  it('이 글에만 있는 값들이 살아 있다', () => {
    /* 시즌 1 = 10월 1일 · 사이트는 2027-08-31 까지 — 다른 데 안 적힌 값이다 */
    const all = owner.join('\n')
    expect(all).toContain('시즌 1 — 10월 1일 시작')
    expect(all).toContain('2027년 8월 31일')
  })

  it('접는 카드가 글을 지우지 않았다 — 여전히 SiteIntro 안에 있다', () => {
    /* `FoldCard` 로 감쌌을 뿐이다. 접혀도 HTML 에는 그대로 들어간다 */
    expect(source).toContain('<FoldCard')
    expect(source).toContain('PLEDGES.map')
    expect(source).toContain('STANCE.map')
  })
})
