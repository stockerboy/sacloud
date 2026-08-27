/**
 * 클랜마크를 **실제 마크로 그릴지 fallback 으로 그릴지** 정하는 순수 함수 (D-146).
 *
 * ── 왜 컴포넌트에서 떼어 놨나
 *   여기가 틀리면 화면에 잘못된 소속이 나간다. 실제로 운영에서 그렇게 나갔다 —
 *   리그에 등록되지 않은 선수 닉네임 옆에 마크가 **아예 붙지 않았다.**
 *   호출부마다 `클랜이 있으면 마크를 그린다`를 각자 판단하고 있었고,
 *   클랜을 모르는 선수는 그 조건에서 조용히 빠졌다.
 *   분기를 순수 함수로 떼어 테스트로 고정한다 (`officialCopy` · `weaponCopy` 와 같은 이유).
 *
 * ── 규칙은 하나다
 *   **SACLOUD 공식 1/2부 등록 클랜만 실제 마크를 쓴다.** 그 외는 전부 fallback 이다.
 *   외부 클랜 · 미등록 클랜 · 무소속 · 소속을 모르는 경우가 전부 여기 들어간다.
 *
 * ── 마크 URL 이 있어도 등록 클랜이 아니면 쓰지 않는다
 *   외부 클랜의 emblem 을 우리 화면에 그리면 그 클랜이 SACLOUD 에 등록된 것처럼 보인다.
 *   서버(`toClanSummary` · `matchTimeClanOf`)가 이미 마크를 지워서 내려보내지만,
 *   지우지 않은 경로가 하나라도 생기면 그대로 노출된다. 화면에서 한 번 더 막는다.
 *
 * ── 모르면 fallback 이다
 *   `is_official_clan` 이 없는(= 판정 근거가 없는) 값은 **공식이 아닌 쪽으로** 떨어뜨린다.
 *   틀렸을 때 fallback 이 붙는 것은 중립적인 손해지만, 반대로 틀리면
 *   등록되지 않은 클랜을 등록된 것처럼 보여 준다.
 */

/** 클랜마크: 배경/전면 2레이어 이미지 URL. 계약상 둘 다 null 가능하다 */
export interface ClanMarkSource {
  bg: string | null
  front: string | null
}

/**
 * 판정 입력.
 *
 * `ClanSummary` · `MatchTimeClan` 둘 다 이 모양을 만족한다 — 호출부가 클랜 객체를
 * 그대로 넘기면 된다. 필드를 따로 뽑아 넘기다가 `is_official_clan` 을 빠뜨리는 것을 막는다.
 *
 * 클랜 자체가 `null`(무소속) / `undefined`(아직 모름)인 경우도 그대로 받는다 —
 * 호출부에서 `clan ? <ClanMark/> : null` 로 감싸면 마크가 통째로 사라지기 때문이다.
 */
export interface ClanMarkInput {
  mark?: ClanMarkSource | null
  is_official_clan?: boolean | null
}

export type ClanMarkView =
  | { kind: 'official'; bg: string | null; front: string | null }
  | { kind: 'fallback' }

/** 안전한 쪽. 판단이 어려우면 항상 이쪽으로 떨어진다 */
const FALLBACK: ClanMarkView = { kind: 'fallback' }

export function clanMarkView(clan: ClanMarkInput | null | undefined): ClanMarkView {
  // 무소속 · 소속을 모르는 선수. 아무것도 그리지 않는 것이 아니라 fallback 을 그린다
  if (!clan) return FALLBACK

  /* `=== true` 로 본다. `undefined`(계약을 거치지 않은 raw 값)·`null` 을 공식으로 보지 않기 위해서다.
     계약에서는 `.default(false)` 라 파싱을 거치면 항상 boolean 이지만,
     파싱하지 않은 값이 들어오는 경로가 실제로 있었다 */
  if (clan.is_official_clan !== true) return FALLBACK

  const mark = clan.mark
  // 등록 클랜인데 마크를 설정하지 않았다. 깨진 이미지보다 fallback 이 낫다
  if (!mark || (!mark.bg && !mark.front)) return FALLBACK

  return { kind: 'official', bg: mark.bg, front: mark.front }
}

/**
 * 마크 URL 만 알고 등록 여부는 모르는 예전 호출부용 (`mark` prop).
 *
 * **서버가 비등록 클랜의 마크를 이미 지워서 내려보낸다**는 전제에서만 옳다.
 * 그 전제가 깨지면 외부 클랜 마크가 그대로 나가므로, 새 호출부는 `clan` 을 넘긴다.
 */
export function clanMarkViewFromMarkOnly(mark: ClanMarkSource | null | undefined): ClanMarkView {
  if (!mark || (!mark.bg && !mark.front)) return FALLBACK
  return { kind: 'official', bg: mark.bg, front: mark.front }
}
