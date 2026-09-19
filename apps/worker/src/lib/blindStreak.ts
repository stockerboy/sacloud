import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { REPO_ROOT } from './env.js'

/**
 * ★health 를 «몇 바퀴 연속» 못 쟀나를 파일에 남긴다★ (2026-09-20)
 *
 * ── 왜 필요한가
 *
 *   `loadGuard` 의 `retreatStreak` 은 ★프로세스 안에서만★ 센다. 그런데 수집은
 *   ★cron 이 10분마다 새 프로세스★ 로 띄운다. 그래서 그 값은 매 바퀴 0 으로 돌아가고,
 *   한 판에서 최대 2 까지만 오른다.
 *
 *   그 바람에 「세 번 연속 못 쟀으면 한 번은 돌아 본다」 는 우회로가
 *   ★단 한 번도 안 열렸다.★ 실측 — 수집이 ★19시간째 원문 0건★ 이었고
 *   로그에 「한 번은 돌아 본다」 가 ★0회★ 찍혔다 (2026-09-20 검수에서 잡았다).
 *
 * ── 어떻게 세나
 *
 *   작은 파일 하나에 «연속 못 잰 횟수» 와 «마지막 시각» 만 적는다.
 *   ⚠ ★한 번이라도 재면 0 으로 되돌린다★ — 「연속」 이라는 말을 지킨다.
 *   ⚠ ★한참 지났으면(기본 2시간) 잊는다★ — 어제 못 잰 것을 오늘 세면 안 된다.
 *
 * ⚠ 파일을 못 읽거나 못 쓰면 ★조용히 0 으로 본다.★ 이 셈 때문에 수집이 멈추면
 *   본말이 뒤집힌다 (`CLAUDE.md` — 보정이 본 작업을 막으면 안 된다).
 */

const FILE = path.join(REPO_ROOT, '.cache', 'blind-streak.json')

/** 이 시간이 지나면 잊는다 — 어제 못 잰 것을 오늘 세지 않는다 */
const FORGET_MS = 2 * 60 * 60 * 1000

interface Saved {
  streak: number
  at: number
}

function read(): Saved {
  try {
    if (!existsSync(FILE)) return { streak: 0, at: 0 }
    const raw = JSON.parse(readFileSync(FILE, 'utf-8')) as Partial<Saved>
    const streak = typeof raw.streak === 'number' && Number.isFinite(raw.streak) ? raw.streak : 0
    const at = typeof raw.at === 'number' && Number.isFinite(raw.at) ? raw.at : 0
    if (at > 0 && Date.now() - at > FORGET_MS) return { streak: 0, at: 0 }
    return { streak, at }
  } catch {
    /* 못 읽으면 «없던 것» 이다 — 이 셈 때문에 수집이 멈추면 안 된다 */
    return { streak: 0, at: 0 }
  }
}

function write(next: Saved): void {
  try {
    mkdirSync(path.dirname(FILE), { recursive: true })
    writeFileSync(FILE, JSON.stringify(next), 'utf-8')
  } catch {
    /* 못 써도 그냥 간다 */
  }
}

/** 지금까지 몇 바퀴 연속 못 쟀나 */
export function blindStreak(): number {
  return read().streak
}

/** 이번 바퀴도 못 쟀다 — 하나 올리고 그 값을 돌려준다 */
export function noteBlind(): number {
  const next = { streak: read().streak + 1, at: Date.now() }
  write(next)
  return next.streak
}

/** 쟀다 — ★0 으로 되돌린다★ */
export function clearBlind(): void {
  write({ streak: 0, at: Date.now() })
}
