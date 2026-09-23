/**
 * ★스코어 → 경기 승률 빈도표★ — 「라운드 스코어가 a:b 일 때 결국 경기를 이긴 비율」 (2026-09-23 사장님 · 시안 2).
 *
 * 값은 ★우리 배틀로그 전체를 세어★ 나온 것이다 (`apps/worker/src/dev/scoreOddsBuild.ts`). 지어낸 수가 아니다.
 *
 * ── 어떻게 읽나
 *   키 `내승:상대승` → { n, w }  (w = 그 스코어를 지난 경기를 결국 내가 이겼다)
 *   `FIRST` 는 전반에서 그 스코어였을 때 · `SECOND` 는 후반. `ALL` 은 합.
 *   같은 4:3 이라도 후반이면 남은 라운드가 적어 값이 다르다 — 그래서 전후반을 나눈다.
 *
 * ── 표본이 모자란 칸은 ★[추정]★ 이다 (`n < MIN_SAMPLE`)
 *   그때는 「남은 라운드를 반반으로 나눠 가진다」 는 어림(스코어 차 로지스틱)으로 메우고 `estimated: true` 를 돌려준다.
 *
 * ── 라운드 안의 값은 이렇게 합친다 (`matchOddsInRound`)
 *   P(경기 승) = P(승 | 이 라운드를 딴 뒤 스코어) × P(이 라운드를 딴다) + P(승 | 진 뒤 스코어) × (1 − P(딴다))
 *   P(딴다) 는 `roundOdds` 의 인원 빈도표다. 두 빈도표를 곱해 잇는 것뿐 — 새 공식을 지어내지 않는다.
 *
 * ⚠ 이 파일의 숫자는 스크립트가 찍은 JSON 을 그대로 옮긴 것이다. 손으로 고치지 않는다.
 */
import type { OddsCell } from './roundOdds'

export const SCORE_ODDS_MIN_SAMPLE = 30

/* ★아직 안 센 상태★ — VPS 에서 세는 중. 비어 있으면 전부 [추정] 이다 */
export const SCORE_ODDS_BUILT: string | null = null
export const SCORE_ODDS_ALL: Readonly<Record<string, OddsCell>> = {}
export const SCORE_ODDS_FIRST: Readonly<Record<string, OddsCell>> = {}
export const SCORE_ODDS_SECOND: Readonly<Record<string, OddsCell>> = {}

export interface ScoreOdds {
  /** 0~1 · 「앞 팀」 이 경기를 이길 확률 */
  p: number
  estimated: boolean
  n: number
}

/** 어림 — 스코어 차만 본다. 표본이 없을 때만 쓴다 */
function guess(mine: number, foe: number): number {
  const z = 0.55 * (mine - foe)
  return 1 / (1 + Math.exp(-z))
}

/** 내 `mine`승 · 상대 `foe`승 인 상태 → 내가 경기를 이길 확률 */
export function scoreOdds(mine: number, foe: number, half: 'first' | 'second' | null = null): ScoreOdds {
  const table = half === 'first' ? SCORE_ODDS_FIRST : half === 'second' ? SCORE_ODDS_SECOND : SCORE_ODDS_ALL
  const cell = table[`${mine}:${foe}`] ?? SCORE_ODDS_ALL[`${mine}:${foe}`]
  if (cell && cell.n >= SCORE_ODDS_MIN_SAMPLE) return { p: cell.w / cell.n, estimated: false, n: cell.n }
  return { p: guess(mine, foe), estimated: true, n: cell?.n ?? 0 }
}

/**
 * 라운드 도중 — 스코어 `mine:foe` 이고 이 라운드를 딸 확률이 `pRound` 일 때 내가 경기를 이길 확률.
 * 두 갈래(딴다/진다)의 경기 승률을 그 확률로 섞는다.
 */
export function matchOddsInRound(mine: number, foe: number, pRound: number, half: 'first' | 'second' | null = null): ScoreOdds {
  const win = scoreOdds(mine + 1, foe, half)
  const lose = scoreOdds(mine, foe + 1, half)
  return { p: win.p * pRound + lose.p * (1 - pRound), estimated: win.estimated || lose.estimated, n: Math.min(win.n, lose.n) }
}
