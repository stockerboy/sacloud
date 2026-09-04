/**
 * ★★3rd.supply 신규 경기 동결★★ (2026-09-04 · Pre-Part 0 · 사장님 지시).
 *
 * ══ 무엇을 막는가 ══
 *
 * > «3rd.supply 신규 경기 수집을 안전하게 비활성화한다.
 * >  기존 과거 데이터와 기존 scraper 코드는 삭제하지 않는다.»
 *
 * ```
 * ★막는다★   기준시각 이후 경기의 `Match` 행 생성 (origin = '3rd.supply')
 * ★안 막는다★ 기준시각 ★이전★ 경기 — 과거 자료는 그대로 들어오고 그대로 남는다
 * ★안 막는다★ 이미 있는 행의 보정(`backfillSourceValues`) · 집계 · 명부
 * ★안 막는다★ 원문 JSONL 수집 — 파일은 계속 쌓여도 된다. `Match` 만 안 만든다
 * ★안 막는다★ 우리 자체 수집(`nexon_barracks`) — 그건 이 파일과 무관하다
 * ```
 *
 * ══ 왜 워크플로를 끄는 것만으로 부족한가 ══
 *
 * 워크플로 두 개를 껐다 (`supply-incremental.yml` · `supply-rollup-full.yml`).
 * 그런데 ★그것만으로는 「막았다」가 아니다★ —
 *
 * ```
 * ① 다른 워크플로가 dispatch 로 부른다  season0-apply.yml 마지막 스텝
 * ② 사람이 손으로 누를 수 있다          workflow_dispatch 는 남겨 뒀다
 * ③ 로컬에서 CLI 를 직접 돌릴 수 있다   pnpm ... supply-import --confirm
 * ```
 *
 * ★①②는 문지기 잡이 막고, ③은 아무것도 막지 못한다.★
 * 그래서 ★쓰기 직전★ 에 한 겹 더 둔다. 여기가 마지막 문이다.
 *
 * ══ 되살리는 법 ══
 *
 * `SACLOUD_MIRROR_UNFREEZE=yes` 를 준다. ★기본값이 아니다★ — 사람이 그 순간
 * 의도해서 넣어야 한다. `SACLOUD_ALLOW_REMOTE_WRITE` 와 같은 모양이다.
 *
 * ⚠ ★이 값을 셸 스크립트나 워크플로에 박지 마라.★ 박는 순간 동결이 사라진다.
 */

/**
 * ★★기준시각 — 2026-09-03 07:00 (KST) = 2026-09-02T22:00:00Z★★
 *
 * ⚠ ★이 값은 `apps/worker/src/lib/season0Window.ts` 의 `SEASON0_FROM` 과 같아야 한다.★
 *   패키지 경계 때문에 여기서 그 파일을 못 읽는다 (`packages/db` 는 `apps/**` 를 모른다).
 *   그래서 ★값을 복제하는 대신 어긋나면 깨지는 테스트★ 를 뒀다 —
 *   `apps/worker/src/__tests__/mirrorFreeze.test.ts`. 한쪽만 고치면 빨간 줄이 난다.
 */
export const MIRROR_FREEZE_FROM = new Date('2026-09-02T22:00:00.000Z')

/** 동결로 안 넣은 경기의 사유 코드. ★조용히 버리지 않고 센다★ */
export const MIRROR_FREEZE_SKIP_REASON = 'mirror_frozen_new_match'

/** 동결이 걸리는 origin. 우리 자체 수집은 여기 없다 */
export const MIRROR_FREEZE_ORIGIN = '3rd.supply'

/**
 * 동결이 풀려 있는가 — ★환경변수를 그 순간 읽는다.★
 *
 * 모듈을 불러올 때 한 번만 읽으면 테스트가 값을 바꿔도 안 먹는다.
 */
export function mirrorUnfrozen(env: NodeJS.ProcessEnv = process.env): boolean {
  return env['SACLOUD_MIRROR_UNFREEZE'] === 'yes'
}

/**
 * ★이 경기를 `Match` 로 만들면 안 되는가.★
 *
 * ── 판정
 * ```
 * startAt 이 없다        → ★막는다★  (모르는 것을 통과시키지 않는다)
 * startAt < 기준시각     → 통과       (과거 자료다)
 * startAt >= 기준시각    → ★막는다★  (신규 경기다)
 * 동결 해제됨            → 통과
 * ```
 *
 * ⚠ ★`startAt` 이 null 일 때 통과시키지 않는다.★ 시각을 모르는 경기는
 *   신규일 수도 있다. 「모른다」를 「과거다」로 바꾸면 그게 새는 구멍이 된다.
 *   실제로는 `validate()` 가 `start_at_unparsed` 로 이미 걸러 내므로
 *   여기까지 오지 않지만, ★이 함수 하나만 놓고 봐도 안전해야 한다.★
 */
export function blocksNewMirrorMatch(
  startAt: Date | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (mirrorUnfrozen(env)) return false
  if (!startAt) return true
  return startAt.getTime() >= MIRROR_FREEZE_FROM.getTime()
}

/** 사람이 읽는 한 줄 — 로그·보고에 그대로 쓴다 */
export function mirrorFreezeLabel(): string {
  const kst = new Date(MIRROR_FREEZE_FROM.getTime() + 9 * 60 * 60 * 1000)
    .toISOString()
    .replace('T', ' ')
    .slice(0, 16)
  return `3rd.supply 신규 경기 동결 — ${kst}(KST) 이후는 넣지 않는다`
}
