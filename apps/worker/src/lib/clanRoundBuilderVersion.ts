/**
 * 클랜 라운드 지표 집계 규칙 버전 (`docs/SITE_SPEC_V2.md` 5-5절).
 *
 * **여기 한 곳에만 있다.** 잡(`jobs/clanRoundBuild.ts`)이 이 값으로 저장하고
 * 화면(`apps/web/lib/server/queries/clanRoundMetrics.ts`)이 이 값으로 읽는다.
 * 두 곳에 각각 적어 두면 규칙을 올릴 때 한쪽만 바뀌어 조용히 갈라진다.
 *
 * 상수 하나 때문에 잡 모듈을 통째로 끌어오지 않으려고 파일을 따로 뒀다 —
 * `roundBuilderVersion.ts`(D-194) · `season0Window.ts`(D-175)와 같은 방식이다.
 *
 * 규칙이 바뀌면 이 값을 올린다. 옛 줄은 지우지 않고 남는다 —
 * 기준이 다른 집계가 한 칸에 섞이면 안 된다.
 */
export const CLAN_ROUND_BUILDER_VERSION = 'clan-round-v1'
