/**
 * 확인 문구가 정확히 일치하는지.
 *
 * 컴포넌트(`ConfirmTypeToProceed.tsx`)가 아니라 여기 두는 이유
 * - 이 규칙은 **되돌릴 수 없는 작업의 마지막 방어선**이라 브라우저 없이도 검증돼야 한다.
 *   백그라운드 탭에서는 Chrome이 렌더링을 throttle해서 UI로 확인하는 것이 불안정하다
 *   (`docs/DECISIONS.md` D-019).
 * - 저장소의 기존 방식과 같다 (`leagueCreate.ts`, `signupRules.ts`).
 *
 * **공백을 다듬지 않는다.** 문구를 정확히 그대로 쳐야 한다.
 */
export function isConfirmPhraseMatched(value: string, phrase: string): boolean {
  return value === phrase
}
