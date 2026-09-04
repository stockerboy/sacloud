/**
 * **검사용 「창 안 시각」** — 한 곳에서만 만든다 (2026-09-04).
 *
 * ══ ★왜 생겼나★ ══
 *
 * 여러 검사가 각자 `SEASON0_FROM + 30일` 을 창 안이라고 썼다.
 * ★2026-09-04 에 창이 「7/1~열림」에서 「9/3 07:00 ~ 10/1」로 바뀌자★
 * ★그 30일이 창 밖으로 나가서 검사 33개가 한꺼번에 깨졌다.★
 *
 * ★창 길이를 모르는 채 「+30일」을 쓰면 창이 바뀔 때마다 조용히 깨진다.★
 * ★창의 가운데를 쓰면 창이 어떻게 바뀌어도 안쪽이다.★
 *
 * ⚠ ★검사를 통과시키려고 창 값을 되돌리지 마라.★ 창은 사장님이 정한다.
 *   ★검사가 창을 따라가야 한다. 반대가 아니다.★
 */
import { SEASON0_FROM, SEASON0_TO } from '../lib/server/queries/season0Scope'

const DAY = 24 * 60 * 60 * 1000

/**
 * ★창 안 시각★ — 창이 닫혀 있으면 가운데, 열려 있으면 시작 +30일.
 *
 * 가운데를 쓰는 이유는 ★가장자리에 붙으면 경계 조건에 걸리기 쉽기★ 때문이다.
 */
export const IN_WINDOW = new Date(
  SEASON0_TO === null
    ? SEASON0_FROM.getTime() + 30 * DAY
    : (SEASON0_FROM.getTime() + SEASON0_TO.getTime()) / 2,
)

/** ★창 밖 (앞)★ — 시작보다 30일 앞. 「지난 기록」에 해당한다 */
export const BEFORE_WINDOW = new Date(SEASON0_FROM.getTime() - 30 * DAY)

/** ★창 밖 (뒤)★ — 끝보다 뒤. 창이 열려 있으면 `null` (그런 시각이 없다) */
export const AFTER_WINDOW: Date | null =
  SEASON0_TO === null ? null : new Date(SEASON0_TO.getTime() + DAY)
