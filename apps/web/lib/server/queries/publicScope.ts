/**
 * 공개 데이터 범위 — 개발용 시드를 사용자 화면에서 제외한다 (D-116).
 *
 * ── 왜 필요한가
 *   로컬·검수 DB에는 결정적 픽스처(리그 4 · 클랜 60 · 선수 920 · 게시글 400)가 함께 들어 있다.
 *   조회 계층에 걸러내는 코드가 없으면 그 가짜 데이터가 **그대로 공개 화면에 나간다.**
 *   실제로 리그 목록 · 1부/2부/통합/개인 랭킹 · 검색 · 기록실 · 게시판 · 인기글이
 *   전부 시드로 채워져 있었다.
 *
 * ── 판별자
 *   `origin` 컬럼 하나다. `Match.origin`이 이미 하던 일을 League · Clan · Player · Board로
 *   넓혔다. 시드는 `mock`, 그 외는 `sacloud` / `nexon` / `3rd.supply`.
 *   경기 수를 세거나 slug를 하드코딩해 추측하지 않는다.
 *
 * ── 왜 스위치가 있는가
 *   `pnpm compare`(Mock ↔ 실제 API 값 대조)는 **실제 API가 시드를 그대로 돌려주는 것**이
 *   전제다. 그 도구를 죽이지 않으려고 `SACLOUD_PUBLIC_SCOPE=all` 로 열 수 있게 뒀다.
 *   기본값은 **감춘다**(`real`)이다 — 설정을 빠뜨렸을 때 안전한 쪽으로 실패해야 한다.
 *
 * ── 여기서 정하는 것은 "응답에 넣는가" 하나다.
 *   DB의 시드 행을 지우지 않는다. 저장·계산은 그대로 두고 공개 범위만 좁힌다.
 *   (누적 킬뎃 비공개는 다른 축이다 — `visibility.ts` D-107)
 */

/** 설정을 읽는 최소 형태. 테스트가 작은 객체를 그대로 넘길 수 있게 좁게 잡는다 */
export type EnvLike = Record<string, string | undefined>

/** 개발용 시드 행의 `origin` 값 */
export const SEED_ORIGIN = 'mock'

export type PublicScope = 'real' | 'all'

/**
 * 현재 공개 범위.
 *
 * `all`은 **명시적으로 켤 때만** 된다. 오타·미설정은 전부 `real`로 떨어진다.
 */
export function publicScope(env: EnvLike = process.env): PublicScope {
  return env.SACLOUD_PUBLIC_SCOPE === 'all' ? 'all' : 'real'
}

/** 시드를 감추는가 */
export function hidesSeedData(env?: EnvLike): boolean {
  return publicScope(env) === 'real'
}

/**
 * Prisma `where` 조각. 감추지 않는 모드에서는 **빈 객체**라 질의가 그대로 남는다.
 *
 * ```ts
 * prisma.league.findMany({ where: { ...publicOriginWhere() } })
 * ```
 */
export function publicOriginWhere(env?: EnvLike): { origin?: { not: string } } {
  return hidesSeedData(env) ? { origin: { not: SEED_ORIGIN } } : {}
}

/**
 * 이 행을 공개 화면에 내보내도 되는가 (단건 조회용).
 *
 * 목록은 `publicOriginWhere()`로 거르고, 단건은 이걸로 판정해 **없는 것처럼** 404를 낸다.
 * "있지만 숨김"이 아니라 "없음"이어야 한다 — 시드가 존재한다는 사실 자체를 흘리지 않는다.
 */
export function isPublicRow(
  row: { origin: string } | null | undefined,
  env?: EnvLike,
): boolean {
  if (!row) return false
  return hidesSeedData(env) ? row.origin !== SEED_ORIGIN : true
}
