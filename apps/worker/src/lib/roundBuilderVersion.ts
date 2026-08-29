/**
 * 라운드 복원 집계 규칙 버전 (D-194).
 *
 * **여기 한 곳에만 있다.** 잡(`jobs/roundBuild.ts`)이 이 값으로 저장하고
 * 화면(`apps/web/lib/server/queries/playerTraits.ts`)이 이 값으로 읽는다.
 * 두 곳에 각각 적어 두면 규칙을 올릴 때 한쪽만 바뀌어 조용히 갈라진다.
 *
 * 상수 하나 때문에 잡 모듈을 통째로 끌어오지 않으려고 파일을 따로 뒀다 —
 * `season0Window.ts` 를 화면이 읽는 것과 같은 방식이다 (D-175).
 *
 * 규칙이 바뀌면 이 값을 올린다. 옛 줄은 지우지 않고 남는다.
 */
export const ROUND_BUILDER_VERSION = 'round-v1'
