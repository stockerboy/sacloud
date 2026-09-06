/**
 * ★★리그 → 강조색 클래스★★ (2026-09-07 · Part 10 ③ · 사장님 승인)
 *
 * 시안은 파일마다 밑줄 색에 `C.blue`(IPL) / `C.red`(SPL)를 ★손으로 적어★ 뒀다.
 * 우리는 리그가 셋이고 화면이 하나라 그렇게 못 한다 —
 * ★바깥에 클래스 한 개를 붙이면 `--v2-accent` 가 통째로 바뀐다.★
 *
 * ```
 *   supply  SPL         빨강   .sac-spl
 *   nolink  IPL         파랑   .sac-ipl
 *   sanply  10mountain  초록   .sac-sanply
 * ```
 *
 * ⚠ ★리그 slug 는 라우트다. 바꾸지 않는다★ (`CLAUDE.md` 4장 · D-246).
 *   화면 이름(SPL/IPL/10mountain)과 slug 는 다른 것이다.
 * ⚠ 표에 없는 리그(`daerule` 등)는 ★색을 지어내지 않는다.★ 빈 문자열을 주면
 *   `.sac-v2` 의 기본값(파랑)이 그대로 쓰인다.
 */

/** slug 하나에 클래스 하나. 여기 없는 리그는 기본색을 쓴다 */
const ACCENT_CLASS: Readonly<Record<string, string>> = {
  supply: 'sac-spl',
  nolink: 'sac-ipl',
  sanply: 'sac-sanply',
}

/** 그 리그의 강조색 클래스. 모르는 리그면 `''` */
export function leagueAccentClass(leagueSlug: string | null | undefined): string {
  if (!leagueSlug) return ''
  return ACCENT_CLASS[leagueSlug] ?? ''
}

/**
 * v2 껍데기에 붙일 클래스 묶음.
 * `sac-v2` 는 ★언제나★ 붙고, 리그색은 알 때만 붙는다.
 */
export function v2Class(leagueSlug?: string | null, extra?: string): string {
  return ['sac-v2', leagueAccentClass(leagueSlug), extra].filter(Boolean).join(' ')
}
