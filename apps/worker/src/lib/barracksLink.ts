/**
 * 병영수첩 계정 ↔ Open API `ouid` 를 **잇는 판정 로직** (순수 함수).
 *
 * ── 왜 이 표가 필요한가
 *   두 세계의 식별자가 다르다 (D-221 실측).
 *   ```
 *   병영수첩  user_nexon_sn 470379822 · str_usn D9EBC75CCBD60C12SA
 *   Open API  ouid 8dd2c1c3c28cc40cee2bc52396f9ffc4
 *   ```
 *   이 표가 없으면
 *     · 배틀로그로 본 선수를 `user/basic` 으로 감시할 수 없고 (닉·클랜 변경 감지 불가)
 *     · D-219 의 「당시 클랜원」 판정에 쓸 소속 근거를 붙일 수 없다.
 *
 * ── 어떻게 잇나 — **닉네임이 유일한 다리다. 그래서 위험하다**
 *   `/id` 는 *지금 그 닉을 쓰는 사람*을 준다. 옛 닉으로 부르면 **엉뚱한 사람**이 붙는다
 *   (D-221: 계정 553768214 의 두 닉이 서로 다른 ouid 로 조회됐다).
 *   그래서 조회만으로 잇지 않는다. **되돌려 확인**한다.
 *
 *   ```
 *   ① 배틀로그에서 그 계정의 **가장 최근 닉** 을 꺼낸다
 *   ② /id 로 ouid 를 받는다
 *   ③ user/basic(ouid) 의 user_name 이 ①과 **같은지 본다**   ← 이게 되돌려 확인이다
 *   ④ 같으면 잇고, 다르면 잇지 않는다
 *   ```
 *
 * ── 무엇을 포기하는가 (정직하게)
 *   위장닉을 쓰는 계정은 `/id` 가 모르므로 (D-221) **영영 못 잇는다.**
 *   지어내서 잇지 않는다. 못 이은 것은 못 이은 채로 남긴다.
 */

/** 3글자 영문 = 위장닉(한글자닉네임 아이템). 사용자 제보 · D-221 에서 13.3%만 조회됐다 */
export function looksLikeDisguise(nick: string): boolean {
  return /^[A-Za-z]{3}$/.test(nick.trim())
}

/** 닉 비교는 앞뒤 공백만 무시한다. **대소문자는 구분한다** — 동형문자 함정이 있다 */
function sameNick(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a == null || b == null) return false
  return a.trim() === b.trim()
}

export type LinkVerdict =
  /** 되돌려 확인까지 통과했다. 이어도 된다 */
  | { ok: true; reason: 'verified' }
  /** 위장닉으로 보인다. 호출을 아낀다 */
  | { ok: false; reason: 'disguise' }
  /** `/id` 가 모른다 (400). 닉이 이미 바뀌었거나 위장닉이다 */
  | { ok: false; reason: 'not_found' }
  /** ouid 는 나왔는데 되돌려 확인이 어긋났다 — **다른 사람이다** */
  | { ok: false; reason: 'mismatch'; apiUserName: string | null }

/**
 * 이어도 되는지 판정한다.
 *
 * @param battlelogNick 배틀로그에서 본 **가장 최근** 닉
 * @param ouid          `/id` 결과. 못 찾았으면 null
 * @param apiUserName   `user/basic(ouid).user_name`. 조회를 안 했으면 undefined
 */
export function judgeLink(input: {
  battlelogNick: string
  ouid: string | null
  apiUserName?: string | null
}): LinkVerdict {
  if (looksLikeDisguise(input.battlelogNick)) return { ok: false, reason: 'disguise' }
  if (!input.ouid) return { ok: false, reason: 'not_found' }
  if (sameNick(input.apiUserName, input.battlelogNick)) return { ok: true, reason: 'verified' }
  return { ok: false, reason: 'mismatch', apiUserName: input.apiUserName ?? null }
}

/**
 * 조회 순서를 정한다 — **최근에 본 닉부터**.
 *
 * 오래된 닉일수록 그 사이에 바뀌었을 확률이 높고, 바뀐 닉은 남이 물려받았을 수 있다.
 * 최근 것부터 하면 맞을 확률이 높고, 틀려도 `mismatch` 로 걸러진다.
 *
 * `matchKey` 앞 12자리가 경기 시각이라 문자열 비교가 곧 시간순이다.
 */
export function orderByRecency<T extends { lastSeenKey: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => (a.lastSeenKey < b.lastSeenKey ? 1 : a.lastSeenKey > b.lastSeenKey ? -1 : 0))
}

/** 호출 예산을 나눈다 — 대상 하나에 `/id` 1회 + `user/basic` 1회 = 최대 2회 */
export function estimateCalls(targetCount: number): number {
  return targetCount * 2
}
