/**
 * **`placement` 칸을 쓰는 경로가 폐지된 규칙을 되살리지 않는가** (O-036 · 2026-09-03).
 *
 * ══ 왜 이 파일이 생겼나 ══
 *
 * 배치고사는 2026-09-01 에 폐지됐다 (사장님 지시 · `CLAUDE.md` 5장).
 * 그런데 `placement` **칸을 DB 에 쓰는 경로가 둘**이고 **서로 다른 규칙을 쓰고 있었다.**
 *
 * ```
 * apps/worker/src/jobs/season0Apply.ts   V2_RATING_CONSTANTS      0경기   ← 운영에서 매시간 돈다
 * apps/worker/src/jobs/rate.ts           DEFAULT_RATING_CONSTANTS ★10경기★ ← 상수를 안 주면 이것
 * ```
 * `rate.ts` 는 그 값으로 `placement: played < constants.placementMatches` 를
 * **DB 에 그대로 쓴다** (930·962행).
 *
 * ══ 「지금 아무도 안 부른다」가 아니었다 ══
 *
 * 워크플로에서 부르는 곳은 **0곳**이다. 그런데 **사람이 부르는 길이 열려 있었다.**
 * ```
 * package.json                      "nexon:rate"
 * docs/PRODUCTION_READINESS.md      6. 래더  pnpm nexon:rate --league supply
 * docs/GO_LIVE_CHECKLIST.md         … `nexon rate --league supply` 로 재replay
 * ```
 * **공개 전 절차서 둘이 이 명령을 시킨다.** 그대로 따랐으면 9판 이하 선수가
 * 전부 `placement=true` 로 되돌아가 랭킹에서 사라졌을 것이다.
 *
 * ══ 여기서 무엇을 지키나 ══
 *
 * CLI 의 `rate` 명령이 **운영과 같은 상수를 고르는지**를 원문으로 못 박는다.
 * 값 비교가 아니라 **호출부**를 보는 이유는, 이 사고가 「상수가 틀렸다」가 아니라
 * **「고르는 것이 틀렸다」**였기 때문이다.
 *
 * ⚠ `DEFAULT_RATING_CONSTANTS` 자체는 **고치지 않았다.** 상수 파일이
 *   *「옛 방식(10경기)을 그대로 둔다 … `DEFAULT` 를 바꾸면 IPL 클랜 집계까지 같이 움직인다」*
 *   고 일부러 적어 두었다. 그 뜻을 지킨다.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PLACEMENT_MATCHES, PLACEMENT_MATCHES_V1, V2_RATING_CONSTANTS } from '@sacloud/rating'

/* `apps/worker/src/__tests__` → 저장소 뿌리까지 네 단계 */
const REPO = join(__dirname, '..', '..', '..', '..')
const read = (path: string): string => readFileSync(join(REPO, path), 'utf8')

describe('배치고사 폐지 — `placement` 를 쓰는 경로 (O-036)', () => {
  it('운영 상수는 0경기다 (폐지가 실제로 반영돼 있다)', () => {
    expect(V2_RATING_CONSTANTS.placementMatches).toBe(0)
    expect(PLACEMENT_MATCHES).toBe(0)
  })

  it('옛 값 10경기는 지워지지 않았다 (CLAUDE.md 10-4)', () => {
    expect(PLACEMENT_MATCHES_V1).toBe(10)
  })

  it('★CLI 의 `rate` 명령이 운영과 같은 상수를 고른다★', () => {
    const cli = read('apps/worker/src/cli.ts')
    const rateCase = cli.slice(cli.indexOf("case 'rate': {"))
    const call = rateCase.slice(0, rateCase.indexOf('table('))
    expect(call).toContain('constants: V2_RATING_CONSTANTS')
  })

  it('★`season0Apply` 도 같은 상수를 고른다 — 두 경로가 갈라지면 안 된다★', () => {
    const apply = read('apps/worker/src/jobs/season0Apply.ts')
    expect(apply).toContain('V2_RATING_CONSTANTS.placementMatches')
  })

  it('공개 전 절차서 둘에 경고가 남아 있다', () => {
    /* 사람이 손으로 부르는 길이라 **코드만 고쳐서는 안 된다** — 절차서가 같이 말해야 한다 */
    for (const doc of ['docs/PRODUCTION_READINESS.md', 'docs/GO_LIVE_CHECKLIST.md']) {
      expect(read(doc), doc).toContain('O-036')
    }
  })
})
