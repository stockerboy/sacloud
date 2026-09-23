/**
 * ★라운드 승률 빈도표★ — 「살아 있는 인원이 a:b 일 때 그 라운드를 누가 땄나」 (2026-09-23 사장님).
 *
 * 값은 ★우리 배틀로그 전체를 세어★ 나온 것이다 (`apps/worker/src/dev/roundOddsBuild.ts`).
 * 지어낸 수가 아니다 — `n` 이 표본 수, `w` 가 그중 이긴 수다.
 *
 * ── 어떻게 읽나
 *   `SIDED`  키 `공격생존:수비생존` → 공격이 땄다
 *   `PLAIN`  키 `내생존:상대생존`   → 내가 땄다 (진영을 모르는 라운드용)
 *
 * ── 표본이 모자란 칸은 ★[추정]★ 이다
 *   `n < MIN_SAMPLE` 이면 `a/(a+b)` 공식으로 메우고 `estimated: true` 를 돌려준다.
 *   화면은 그 구간을 ★점선★ 으로 그린다 — 잰 것과 어림한 것을 같은 선으로 그리지 않는다 (D-106).
 *
 * ⚠ 이 파일의 숫자는 스크립트가 찍은 JSON 을 그대로 옮긴 것이다. 손으로 고치지 않는다.
 *   `BUILT` 가 언제 센 것인지 말한다.
 */

export interface OddsCell {
  n: number
  w: number
}

export const ROUND_ODDS_MIN_SAMPLE = 30

/* ★아직 안 센 상태★ — 스크립트를 운영 DB 에서 돌린 뒤 채운다. 비어 있으면 전부 [추정] 이다 */
export const ROUND_ODDS_BUILT: string | null = null
export const ROUND_ODDS_SIDED: Readonly<Record<string, OddsCell>> = {}
export const ROUND_ODDS_PLAIN: Readonly<Record<string, OddsCell>> = {}

export interface RoundOdds {
  /** 0~1 · 「앞 팀」 이 이 라운드를 딸 확률 */
  p: number
  /** 빈도표가 아니라 공식으로 메운 값이다 */
  estimated: boolean
  n: number
}

function fromTable(table: Readonly<Record<string, OddsCell>>, a: number, b: number): RoundOdds {
  if (a <= 0) return { p: 0, estimated: false, n: 0 }
  if (b <= 0) return { p: 1, estimated: false, n: 0 }
  const cell = table[`${a}:${b}`]
  if (cell && cell.n >= ROUND_ODDS_MIN_SAMPLE) return { p: cell.w / cell.n, estimated: false, n: cell.n }
  return { p: a / (a + b), estimated: true, n: cell?.n ?? 0 }
}

/** 공격 `att`명 · 수비 `def`명 → ★공격★ 이 딸 확률 */
export function roundOddsSided(att: number, def: number): RoundOdds {
  return fromTable(ROUND_ODDS_SIDED, att, def)
}

/** 진영을 모를 때 — 내 `a`명 · 상대 `b`명 → ★내★ 가 딸 확률 */
export function roundOddsPlain(a: number, b: number): RoundOdds {
  return fromTable(ROUND_ODDS_PLAIN, a, b)
}
