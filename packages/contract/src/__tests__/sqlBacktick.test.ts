import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * ★★SQL 템플릿 안에 백틱을 쓰지 않는다★★ (2026-09-20)
 *
 * ── 왜 이 시험이 있나
 *
 *   `$queryRaw` 와 `$executeRaw` 는 ★템플릿 리터럴★ 이다. 그 안 주석에 백틱을
 *   쓰면 ★템플릿이 거기서 끝난다.★
 *
 *   ⚠ ★2026-09-20 하루에만 일곱 번 밟았다.★
 *   ⚠ 두 곳에 ★주석으로 경고를 적어 뒀는데도★ 계속 밟았다 —
 *     `badgeOwners.ts` 「백틱은 이 SQL 템플릿 안에 쓸 수 없다 (…) 배지 페이지가
 *     통째로 500 이었다」 · `leagues.ts` 「이 세션에서 일곱 번 밟았다」.
 *
 *     ★주석은 실행되지 않는다.★ 두 번 적고 일곱 번 밟았다는 것이 그 증거다.
 *
 * ── 왜 잡기 어려웠나
 *
 *   tsc 가 잡아 주긴 한다. 그런데 ★백틱을 쓴 줄이 아니라 저 아래 엉뚱한 줄★ 에서
 *   터져서 매번 처음부터 찾아야 했다. 이 시험은 ★그 줄을 짚어 준다.★
 *
 * ⚠ ★남의 소스 글자를 외우는 시험이 아니다.★ 보는 것은 ★파서가 깨지는 꼴★ 하나뿐이고,
 *   백틱을 빼기만 하면 어떻게 고쳐도 통과한다.
 */

/** 저장소 뿌리 — 이 파일에서 다섯 칸 위다 */
const ROOT = join(import.meta.dirname, '..', '..', '..', '..')

/** SQL 템플릿이 시작하는 곳 */
const START = /\$(?:queryRaw|executeRaw)(?:Typed)?\s*(?:<[^>]*>\s*)?`/g

/** 주석 표시 — 이 파일 자신이 그 꼴을 품지 않게 쪼개 둔다 */
const COMMENT_OPEN = '/' + '*'
const COMMENT_CLOSE = '*' + '/'
const BACKSLASH = String.fromCharCode(92)
const BACKTICK = String.fromCharCode(96)
const NEWLINE = String.fromCharCode(10)

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'generated' || name === 'dist' || name === '.next') continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (name.endsWith('.ts') || name.endsWith('.tsx')) out.push(path)
  }
  return out
}

/**
 * 그 파일에서 SQL 템플릿이 ★일찍 끊긴★ 자리 (줄 번호).
 *
 * ── ⚠ ★처음에 판정을 거꾸로 짰다★ (2026-09-20)
 *
 *   「여는 백틱 ~ 닫는 백틱 사이에 백틱이 있나」 로 봤는데,
 *   ★백틱을 넣는 순간 그것이 「닫는 백틱」 이 된다.★ 그래서 아무것도 안 잡혔다.
 *   ★일부러 깨뜨려 보고 알았다 — 시험은 깨뜨려 봐야 시험이다.★
 *
 * ── 바른 판정
 *
 *   백틱이 주석 안에 있으면 ★주석이 안 닫힌 채 템플릿이 끝난다.★
 *   즉 템플릿 내용에 ★여는 주석 표시가 닫는 것보다 많다.★
 */
function offendersIn(text: string): number[] {
  const bad: number[] = []
  for (const m of text.matchAll(START)) {
    const open = m.index + m[0].length
    /* 여는 백틱 다음의 첫 백틱까지 — 보간과 탈출은 건너뛴다 */
    let i = open
    let depth = 0
    while (i < text.length) {
      const ch = text[i]
      if (ch === BACKSLASH) {
        i += 2
        continue
      }
      if (ch === '$' && text[i + 1] === '{') {
        depth += 1
        i += 2
        continue
      }
      if (ch === '}' && depth > 0) {
        depth -= 1
        i += 1
        continue
      }
      if (ch === BACKTICK && depth === 0) break
      i += 1
    }
    const body = text.slice(open, i)
    const opens = body.split(COMMENT_OPEN).length - 1
    const closes = body.split(COMMENT_CLOSE).length - 1
    /* 짝이 맞으면 멀쩡한 템플릿이다 */
    if (opens <= closes) continue
    bad.push(text.slice(0, open).split(NEWLINE).length)
  }
  return bad
}

describe('SQL 템플릿 안에 백틱을 쓰지 않는다', () => {
  it('★$queryRaw / $executeRaw 안의 백틱은 템플릿을 끊는다★', () => {
    const dirs = [join(ROOT, 'apps'), join(ROOT, 'packages')].filter((d) => {
      try {
        return statSync(d).isDirectory()
      } catch {
        return false
      }
    })
    /* 폴더를 못 찾으면 이 시험이 아무것도 안 지키는 것이다 */
    expect(dirs.length).toBe(2)

    const bad: string[] = []
    for (const dir of dirs) {
      for (const file of walk(dir)) {
        /* 이 시험 자신은 본문에 예시가 있다 */
        if (file.endsWith('sqlBacktick.test.ts')) continue
        const text = readFileSync(file, 'utf8')
        if (!text.includes('$queryRaw') && !text.includes('$executeRaw')) continue
        for (const line of offendersIn(text)) {
          bad.push(`${file.slice(ROOT.length + 1)}:${line}`)
        }
      }
    }

    expect(
      bad,
      `${NEWLINE}★SQL 템플릿 안에서 백틱을 빼라★ — 템플릿이 거기서 끊긴다.` +
        `${NEWLINE}설명은 템플릿 밖에 적는다:${NEWLINE}${bad.join(NEWLINE)}${NEWLINE}`,
    ).toEqual([])
  })
})
