import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * ★★패키지 안에서 `.js` 확장자로 서로를 가리키지 않는다★★ (2026-09-20)
 *
 * ── 왜 이 시험이 있나
 *
 *   2026-09-20 에 ★배포가 30분 넘게 막혔다.★ 새로 만든 파일 둘이
 *   `from './roundState.js'` 로 썼는데 `roundState.js` 라는 파일은 없다 —
 *   `roundState.ts` 뿐이다.
 *
 *   ⚠ ★타입도 시험도 전부 초록이었다.★
 *     `tsc` 와 `vitest` 는 `.js` → `.ts` 를 풀어 주는데
 *     ★`next build` 의 webpack 만 안 풀어 준다.★
 *
 *     그래서 「왜 반영이 안 되나」 를 30분 동안 헤맸고, 그 사이 민 것이
 *     ★하나도 운영에 안 올라갔다.★
 *
 *   비판 검수가 ★`@sacloud/rating` 에 같은 지뢰가 그대로★ 있는 것을 찾았다 —
 *   운영 파일 넷이 전부 `./constants.js` 를 가리키는데 그런 파일은 없다.
 *   지금은 `apps/web` 이 그 패키지를 안 써서 안 터질 뿐이고,
 *   ★화면 한 곳이 래더 상수 하나를 가져다 쓰는 순간 같은 30분을 다시 잃는다.★
 *
 * ── 이 시험이 막는 것
 *
 *   패키지들의 `src` 안의 ★상대 경로 import 에 `.js` 를 붙이는 것★ 하나다.
 *   붙이면 여기서 빨개진다 — ★빌드를 돌리기 전에★ 잡힌다.
 *
 * ⚠ ★남의 소스 글자를 외우는 시험이 아니다.★ 「이 함수를 import 해야 한다」 같은
 *   것을 박아 두면 ★옳은 수정을 막는다.★ 이 시험이 보는 것은 ★빌드가 깨지는 꼴★
 *   하나뿐이고, 그 꼴은 어떻게 고쳐도 사라진다.
 */

/** 저장소의 `packages` 폴더 — 이 파일에서 세 칸 위다 */
const PACKAGES = join(import.meta.dirname, '..', '..', '..')

/** 상대 경로 import 에 `.js` 가 붙은 줄 */
const BAD = /from\s+'(\.\.?\/[^']*)\.js'/g

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    /*
     * ⚠ ★안 보는 곳★
     *   · `generated`·`dist` — 만들어진 것이라 ★진짜 `.js` 가 있다★
     *   · `__tests__` — ★webpack 을 안 탄다.★ 게다가 이 시험 자신의 주석에
     *     `.js` 가 예시로 적혀 있어 스스로를 잡는다
     */
    if (name === 'node_modules' || name === 'generated' || name === 'dist') continue
    if (name === '__tests__' || name.endsWith('.test.ts') || name.endsWith('.test.tsx')) continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (name.endsWith('.ts') || name.endsWith('.tsx')) out.push(path)
  }
  return out
}

describe('패키지 안에서 .js 확장자로 서로를 가리키지 않는다', () => {
  it('★상대 경로 import 에 .js 를 붙이면 next build 가 깨진다★', () => {
    const packages = readdirSync(PACKAGES).filter((name) => {
      try {
        return statSync(join(PACKAGES, name, 'src')).isDirectory()
      } catch {
        return false
      }
    })
    /* 패키지를 하나도 못 찾으면 이 시험이 아무것도 안 지키는 것이다 */
    expect(packages.length).toBeGreaterThan(3)

    const bad: string[] = []
    for (const pkg of packages) {
      for (const file of walk(join(PACKAGES, pkg, 'src'))) {
        const text = readFileSync(file, 'utf8')
        for (const m of text.matchAll(BAD)) {
          /* ★만들어진 것을 가리키는 것은 진짜 `.js` 다★ — `db` 가 prisma 결과를 그렇게 쓴다 */
          if ((m[1] ?? '').includes('generated/')) continue
          bad.push(`${pkg}: ${file.slice(PACKAGES.length + 1)} → ${m[1]}.js`)
        }
      }
    }

    expect(bad, `\n★.js 를 떼라★ — tsc·vitest 는 통과하지만 next build 가 깨진다:\n${bad.join('\n')}\n`).toEqual([])
  })
})
