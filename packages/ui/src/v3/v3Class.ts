/**
 * ★★v3 껍데기에 붙일 클래스 묶음★★ (2026-09-09)
 *
 * 리그 → 강조색 클래스는 ★v2 가 이미 정해 뒀다★ (`leagueAccentClass`).
 * 같은 클래스 이름(`sac-spl` / `sac-ipl` / `sac-sanply`)을 그대로 쓴다 —
 * `tokens.css` 에서 `.sac-v3.sac-ipl` 로 받는다. ★색을 두 곳에 적지 않는다.★
 */
import { leagueAccentClass } from '../v2/leagueAccent'

/** `sac-v3` 는 언제나 붙고, 리그색은 알 때만 붙는다 */
export function v3Class(leagueSlug?: string | null, extra?: string): string {
  return ['sac-v3', leagueAccentClass(leagueSlug), extra].filter(Boolean).join(' ')
}
