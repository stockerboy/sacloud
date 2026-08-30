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
 *
 * ── 이력
 *   `clan-round-v1`  블루방어율 · 어택성공률 · 조직력 · 폭발력 · 게임템포 · 클린시트
 *   `clan-round-v2`  **소수싸움**(`outnumberedRounds` · `outnumberedWon`)이 늘었다.
 *                    v1 줄에는 그 칸이 `0` 으로 채워져 있는데, 그 0 은 "안 밀렸다" 가
 *                    아니라 "안 셌다" 이다. 버전을 올려 v1 줄을 읽지 않게 한다 (D-106)
 */
export const CLAN_ROUND_BUILDER_VERSION = 'clan-round-v2'
