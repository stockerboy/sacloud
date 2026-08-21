/**
 * 새니타이즈 정책만 모아 내보내는 서버용 진입점.
 *
 * 왜 따로 두는가
 *   Phase 7부터 **저장 시점에 서버가** 새니타이즈한다. 클라이언트 검증만 믿으면
 *   API를 직접 호출해 스크립트를 심을 수 있다.
 *   그런데 서버(Route Handler)에서 `@sacloud/ui` 루트를 import하면 React 컴포넌트가
 *   통째로 딸려온다. 정책 함수만 가져올 수 있게 별도 진입점을 둔다.
 *
 * 렌더 시점의 새니타이즈는 그대로 유지한다. 저장 전에 걸렀더라도,
 * 이전에 저장된 글이나 마이그레이션으로 들어온 글이 있을 수 있다.
 */
export { sanitizePostContent } from './board/sanitize'
export { sanitizeLeagueDescription } from './league/sanitize'
