/**
 * ★★3rd.supply 신규 경기를 만들 수 있는 길이 0개인가★★ (2026-09-04 · Part 2 · 사장님 지시).
 *
 * > «각 경로를 실제 코드 기준으로 추적해서 ★신규 Match 쓰기 가능 경로가 0개인지★ 확인해라»
 *
 * ── ★왜 「확인」이 아니라 「검사」인가★
 *   Part 2 는 눈으로 훑으면 끝나는 일이다. 그런데 ★눈은 다음 주에 없다.★
 *   길은 조용히 다시 생긴다 — 워크플로에 `schedule:` 한 줄, 새 잡 하나면 된다.
 *   그래서 ★그때 빨간 줄이 나게★ 여기 고정한다. 이 파일이 Part 2 의 산출물이다.
 *
 * ── 여기서 고정하는 것
 * ```
 * 1 `Match` 를 ★만드는★ 코드가 아는 목록 그대로다 (새 것이 생기면 깨진다)
 * 2 그중 origin='3rd.supply' 를 만들 수 있는 것은 ★둘뿐★ 이고 ★둘 다 막혀 있다★
 * 3 동결 검사가 ★쓰기보다 먼저★ 온다 (순서가 뒤집히면 새 경기가 들어간다)
 * 4 미러 워크플로 둘에 ★schedule·push 트리거가 없다★
 * 5 그 둘에 ★문지기 잡★ 이 있고 아래 잡이 거기에 매여 있다
 * 6 남을 부르는 워크플로가 ★unfreeze 를 넘기지 않는다★
 * ```
 *
 * ⚠ ★과거 자료는 이 파일의 관심사가 아니다.★ 막는 것은 기준시각 이후뿐이다.
 */
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

/**
 * ★저장소 루트를 찾아 올라간다★ — `process.cwd()` 를 믿지 않는다.
 *
 * vitest 는 저장소 루트에서 돌고 CLI 는 `apps/worker` 에서 돈다.
 * ★어디서 부르든 같은 답이 나와야★ 이 시험이 자로 쓰인다 —
 *   실제로 `cwd/../..` 로 적었다가 `C:/Users/LG/.github` 를 뒤졌다 (2026-09-04).
 */
function repoRoot(): string {
  let dir = process.cwd()
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    const up = join(dir, '..')
    if (up === dir) break
    dir = up
  }
  throw new Error('저장소 루트를 못 찾았다 (pnpm-workspace.yaml 기준)')
}

const ROOT = repoRoot()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

/* ────────────────────────────────────────────── 1. Match 를 만드는 곳 ─── */

/**
 * ★`Match` 행을 만들 수 있는 파일★ — 시험·시드는 뺀다.
 *
 * 값 옆의 말은 ★그 길이 무엇을 만드는가★ 다. origin 이 답이다.
 */
const KNOWN_MATCH_WRITERS: Record<string, string> = {
  'packages/db/ops/supplyMirrorImport.ts': '3rd.supply ★동결 대상★',
  'apps/worker/src/jobs/supplyPush.ts': '3rd.supply 를 로컬→운영으로 옮긴다 ★동결 대상★',
  'apps/worker/src/jobs/iplProject.ts': 'nexon_barracks (우리 자체 수집)',
  'apps/worker/src/jobs/reconstruct.ts': 'nexon (넥슨 Open API · 세워 둔 것)',
  'apps/worker/src/jobs/project.ts': 'nexon (넥슨 Open API · 세워 둔 것)',
  'apps/worker/src/dev/iplProjectPush.ts': 'nexon_barracks (dev 도구)',
  'packages/db/seed/seed.ts': 'mock (개발 시드)',
}

function grepMatchWriters(): string[] {
  /*
   * ★`.match.` 을 통째로 본다★ — `match\.` 만 보면 안 된다.
   *
   * 처음에 `(match|Match)\.(create|…)` 로 적었더니 `nexonMatch.create(` 가 걸렸다
   * (2026-09-04 · `packages/db/ops/supplyMatches.ts`). 그건 ★스테이징 표★ 지
   * 운영 `Match` 가 아니다. ★자가 헐거우면 오탐이 쌓이고, 쌓이면 이 시험을 안 믿게 된다.★
   *
   * 실제 호출은 전부 `prisma.match.` · `db.match.` · `tx.match.` · `remote.match.` 꼴이라
   * ★앞의 점까지 묶으면★ 정확히 갈린다.
   *
   * ⚠ `git` 이 없으면 ★건너뛰지 말고 실패시킨다.★
   *   「도구가 없어서 확인 못 했다」를 「괜찮다」로 바꾸면 안 된다
   */
  const out = execFileSync(
    'git',
    ['grep', '-l', '-E', String.raw`\.match\.(create|createMany|upsert)\(`, '--', '*.ts'],
    { cwd: ROOT, encoding: 'utf8' },
  )
  return out
    .split(/\r?\n/)
    .map((s) => s.trim().replace(/\\/g, '/'))
    .filter(Boolean)
    .filter((p) => !p.includes('__tests__') && !p.includes('/tests/'))
}

describe('Match 를 만드는 코드가 아는 목록 그대로인가', () => {
  it('★새로운 Match 생성 경로가 생기면 여기가 빨개진다★', () => {
    const found = grepMatchWriters().sort()
    const known = Object.keys(KNOWN_MATCH_WRITERS).sort()
    /* 목록에 없는 것이 나오면 ★그것이 새 길이다★ — 동결이 그 길도 막는지 봐야 한다 */
    expect(found).toEqual(known)
  })
})

/* ─────────────────────────────────────── 2·3. 두 길이 막혀 있는가 ─── */

describe('3rd.supply 경기를 만드는 두 길', () => {
  it('★미러 적재★ — 동결 검사가 쓰기보다 ★먼저★ 온다', () => {
    const src = read('packages/db/ops/supplyMirrorImport.ts')
    const guard = src.indexOf('blocksNewMirrorMatch(match.startAt)')
    const create = src.indexOf('db.match.create(')
    const backfill = src.indexOf('await backfillSourceValues(')
    expect(guard).toBeGreaterThan(0)
    expect(create).toBeGreaterThan(0)
    /* ★순서가 이 시험의 전부다★ — 뒤집히면 새 경기가 들어간다 */
    expect(guard).toBeLessThan(create)
    /* 이미 있는 신규 경기(261건)를 미러가 ★고치지도 못한다★ */
    expect(guard).toBeLessThan(backfill)
  })

  it('★대량 전송★ — 기준시각 이전만 고른다', () => {
    const src = read('apps/worker/src/jobs/supplyPush.ts')
    expect(src).toContain('MIRROR_FREEZE_FROM')
    expect(src).toMatch(/startAt:\s*\{\s*lt:\s*MIRROR_FREEZE_FROM\s*\}/)
  })

  it('나머지 길은 3rd.supply 를 안 만든다', () => {
    for (const file of ['apps/worker/src/jobs/reconstruct.ts', 'apps/worker/src/jobs/project.ts']) {
      expect(read(file)).not.toMatch(/origin:\s*['"]3rd\.supply['"]/)
    }
    expect(read('apps/worker/src/dev/iplProjectPush.ts')).toContain("const ORIGIN = 'nexon_barracks'")
  })
})

/* ──────────────────────────────────────────── 4·5·6. 워크플로 ─── */

const WORKFLOWS = join(ROOT, '.github', 'workflows')
const workflowFiles = readdirSync(WORKFLOWS).filter((f) => f.endsWith('.yml'))
const wf = (name: string) => readFileSync(join(WORKFLOWS, name), 'utf8')

/** 미러 명령을 실제로 부르는 워크플로 */
const MIRROR_WORKFLOWS = ['supply-incremental.yml', 'supply-rollup-full.yml']

describe('미러 워크플로', () => {
  it('★미러 명령을 부르는 워크플로가 그 둘뿐이다★', () => {
    const callers = workflowFiles.filter((f) => /worker\s+supply-(mirror|import)|supply-mirror|supply-import/.test(wf(f)))
    expect(callers.sort()).toEqual([...MIRROR_WORKFLOWS].sort())
  })

  for (const name of MIRROR_WORKFLOWS) {
    it(`${name} — ★schedule·push 트리거가 없다★`, () => {
      const text = wf(name)
      /* 주석(`# schedule:`)은 살아 있어도 된다 — 되살릴 때 쓴다. ★살아 있는 줄★ 만 본다 */
      const live = text
        .split(/\r?\n/)
        .filter((l) => !l.trim().startsWith('#'))
        .join('\n')
      expect(live).not.toMatch(/^\s{0,4}schedule:/m)
      expect(live).not.toMatch(/^\s{0,4}push:/m)
      expect(live).toMatch(/^\s{0,4}workflow_dispatch:/m)
    })

    it(`${name} — ★문지기 잡이 있고 기본이 「안 돈다」다★`, () => {
      const text = wf(name)
      expect(text).toMatch(/^\s{2}gate:/m)
      /* 기본값이 'no' 여야 한다. 'yes' 면 문이 열린 채다 */
      expect(text).toMatch(/unfreeze:[\s\S]{0,220}?default:\s*'no'/)
      expect(text).toContain("needs.gate.outputs.go == 'true'")
    })
  }

  it('★남을 부르는 워크플로가 unfreeze 를 넘기지 않는다★', () => {
    for (const f of workflowFiles) {
      const text = wf(f)
      for (const m of text.matchAll(/workflows\/(supply-incremental|supply-rollup-full)\.yml\/dispatches[\s\S]{0,200}?-d\s+"([^"]+)"/g)) {
        expect(m[2], `${f} 가 ${m[1]} 을 부르며 넘기는 값`).not.toContain('unfreeze')
      }
    }
  })
})
