/**
 * ★★「임대 상실」과 「임대 미획득」은 다른 일이다★★ (2026-09-05 · 사장님 지시).
 *
 * > «실제 임대 상실 → lease_lost → 「임대 상실 — 이 판을 끝낸다」»
 * > «lease-owner 값이 없거나 임대를 잡지 못한 상태로 호출됨
 * >  → lease_not_acquired → 「임대 미획득 — 수집을 시작하지 않는다」»
 *
 * ── ★왜 갈라야 하나★
 *   2026-09-05 01:03 에 `--lease-owner` 가 빈 채로 불렸다.
 *   막기는 맞게 막았는데 셸이 ★«남이 이미 수집 중이다»★ 라고 찍었다.
 *   ★아무도 안 돌고 있었다.★ 그 시각 수집 프로세스는 0개였다.
 *
 *   ```
 *   ★상실★    쥐고 있던 것을 빼앗겼다 → ★남이 지금 돌고 있다★ (아는 사실)
 *   ★미획득★  애초에 못 잡았다        → ★남이 도는지는 모른다★ (모르는 것)
 *   ```
 *   ★아는 것과 모르는 것을 같은 말로 찍으면, 로그가 사람을 속인다.★
 *   이 저장소가 이번 주에만 두 번째로 잡은 같은 모양의 잘못이다
 *   (앞의 것: 「상실 ≠ DB 연결 실패」 · O-055-1).
 *
 * ── ★막는 동작은 안 바꿨다★
 *   어느 쪽이든 수집은 ★시작하지 않는다.★ 종료코드와 말만 갈랐다.
 *
 * ── 어떻게 재나
 *   ★진짜 CLI 를 돌린다.★ 종료코드는 실제로 프로세스가 내는 값이라
 *   함수만 불러서는 확인이 안 된다. DB 가 없어도 이 갈래는 ★DB 를 건드리기 전에★
 *   갈리므로 빨리 끝난다 — ★그 순서 자체가 이 시험이 지키는 것이다.★
 */
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

function repoRoot(): string {
  let dir = process.cwd()
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    const up = join(dir, '..')
    if (up === dir) break
    dir = up
  }
  throw new Error('저장소 루트를 못 찾았다')
}
const ROOT = repoRoot()

/** ★DB 를 절대 못 만나게 한다★ — 이 갈래가 DB 앞에서 갈리는지도 같이 확인된다 */
const DEAD_DB = 'postgresql://x:x@127.0.0.1:59998/none?connect_timeout=2'

function runCli(args: string[]): { code: number; out: string } {
  const r = spawnSync(
    'node',
    [join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs'), join(ROOT, 'apps', 'worker', 'src', 'cli.ts'), ...args],
    {
      cwd: join(ROOT, 'apps', 'worker'),
      encoding: 'utf8',
      timeout: 90_000,
      env: { ...process.env, DATABASE_URL: DEAD_DB, SACLOUD_DB_SESSION_POOLER: '' },
    },
  )
  return { code: r.status ?? -1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

const tsxExists = existsSync(join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs'))

describe.skipIf(!tsxExists)('임대 미획득 (lease_not_acquired)', () => {
  it('★--lease-owner 가 아예 없으면 코드 10★ 이고 「임대 미획득」이라고 찍는다', () => {
    const r = runCli(['barracks-collect', '--league', 'nolink', '--limit', '1', '--dry-run'])
    expect(r.code).toBe(10)
    expect(r.out).toContain('임대 미획득 — 수집을 시작하지 않는다')
    /* ★상실이라고 말하면 안 된다★ — 남이 도는지 우리는 모른다 */
    expect(r.out).not.toContain('임대 상실')
    expect(r.out).not.toContain('남이 이미 수집 중')
  }, 120_000)

  it('★--lease-owner 에 값이 안 붙어도 코드 10★ (2026-09-05 01:03 에 난 바로 그 모양)', () => {
    /* `--lease-owner` 다음이 또 깃발이면 값이 없는 것이다 — 빈 주인으로 돌면 안 된다 */
    const r = runCli(['barracks-collect', '--lease-owner', '--league', 'nolink', '--limit', '1', '--dry-run'])
    expect(r.code).toBe(10)
    expect(r.out).toContain('임대 미획득')
  }, 120_000)

  it('★--no-lease 를 의도해서 붙이면 문을 지난다★ (사람이 한 번 돌리는 길은 막지 않는다)', () => {
    const r = runCli(['barracks-collect', '--league', 'nolink', '--limit', '1', '--clans', '0', '--no-lease', '--dry-run'])
    /* ★문을 지났다는 것만 잰다★ — 그 뒤는 DB 가 죽어 있어서 어차피 못 간다.
       「끝까지 돈다」를 여기서 재려 했더니 ★DB 가 없어 실패하는 것을 잡아냈다★ —
       그건 이 시험이 물어야 할 질문이 아니다 (2026-09-05) */
    expect(r.code).not.toBe(10)
    expect(r.out).toContain('자물쇠 없이 돈다')
    expect(r.out).not.toContain('임대 미획득')
  }, 120_000)
})

describe('셸이 두 코드를 다른 말로 찍는다', () => {
  const shells = ['scripts/autocollect.sh', 'scripts/collect-3leagues.sh']

  for (const path of shells) {
    it(`${path} — 9 와 10 을 갈라서 다룬다`, () => {
      const text = readFileSync(join(ROOT, path), 'utf8')
      expect(text).toMatch(/"\$code" = "9"/)
      expect(text).toMatch(/"\$code" = "10"/)
      expect(text).toContain('임대 상실 — 이 판을 끝낸다')
      expect(text).toContain('임대 미획득 — 수집을 시작하지 않는다')
      /* ★옛 문구가 남아 있으면 안 된다★ — 그게 거짓말하던 줄이다 */
      expect(text).not.toContain('임대를 잃었다 — 물러난다')
    })
  }
})
