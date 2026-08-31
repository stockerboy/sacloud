/**
 * **옛 경로다.** 명단의 정본은 `packages/db/ops/iplRoster.ts` 로 옮겼다 (2026-08-31 · D-210 후속).
 *
 * 가드(`iplSanplyGuard.ts`)가 명단을 IPL 소속의 근거로 쓰게 되면서 `packages/db` 안에
 * 있어야 했다 — `packages/db` 는 `apps/worker` 를 import 할 수 없다.
 *
 * 이 파일을 **지우지 않는다.** 여기서 import 하던 곳(`iplRegister.ts` 등)이 그대로 돌아간다
 * (`CLAUDE.md` 10-4 — 방식을 바꾸면 이전 방식 버전도 남긴다).
 * 새 코드는 `@sacloud/db/ops` 에서 바로 가져와라.
 */
export type { IplClan } from '@sacloud/db/ops'
export { IPL_ROSTER, IPL_ROSTER_NAMES, IPL_ROSTER_BARRACKS, foldClanName } from '@sacloud/db/ops'
