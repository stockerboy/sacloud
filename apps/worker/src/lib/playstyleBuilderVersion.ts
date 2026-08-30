/**
 * 플레이스타일 바 집계 규칙 버전 (`docs/PLAYER_TRAITS_SPEC.md` 8절 · D-211).
 *
 * **여기 한 곳에만 있다.** 잡(`jobs/playstyleBuild.ts`)이 이 값으로 저장하고
 * 화면(`apps/web/lib/server/queries/playerTraits.ts`)이 이 값으로 읽는다.
 * 두 곳에 각각 적어 두면 규칙을 올릴 때 한쪽만 바뀌어 조용히 갈라진다.
 *
 * 상수 하나 때문에 잡 모듈을 통째로 끌어오지 않으려고 파일을 따로 뒀다 —
 * `roundBuilderVersion.ts`(D-194) · `clanRoundBuilderVersion.ts` 와 같은 방식이다.
 *
 * 규칙이 바뀌면 이 값을 올린다. **옛 줄은 지우지 않고 남는다** —
 * 기준이 다른 집계가 한 칸에 섞이면 안 된다 (사용자 상시 지시).
 *
 * ── 이력
 *   `playstyle-v1`  첫 판. 진영별(D-208 의 90.6% 커버리지) 오프닝 관여 · 첫 교전 지연 ·
 *                   자리 흩어짐을 센다. 사양 8절의 구역 이름 정의는 좌표가 확정된 적이
 *                   없어 쓰지 못했고, 뜻이 같다고 본 대체 재료를 쓴다 (`playstyle.ts` 머리말)
 */
export const PLAYSTYLE_BUILDER_VERSION = 'playstyle-v1'
