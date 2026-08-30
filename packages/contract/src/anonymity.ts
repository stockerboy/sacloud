/**
 * 반익명 표시 — 익명 번호 매기기 (SITE_SPEC_V2 2절 · 에브리타임 방식).
 *
 * 사양 원문
 * ```
 * 이름은 글쓴이 익명1 익명2 익명3
 * 익명체크 풀면 소속,닉네임 모두 공개됨
 * ```
 *
 * 이 모듈은 **순수 함수만** 담는다. DB 도 요청도 모른다.
 * 실제 사용자 식별자(`authorKey`)는 여기까지만 들어오고 **결과에는 나가지 않는다** —
 * 돌려주는 값은 `대상 id → 표시 이름` 뿐이다.
 *
 * 지켜야 하는 규칙 (깨지면 익명이 아니다)
 * 1. 번호는 **서버에서** 매긴다. 화면에 실제 user id / player id 를 내려보내지 않는다.
 * 2. 번호는 **그 글 안에서만** 유효하다. 다른 글의 `익명1` 과 같은 사람이면 안 된다.
 *    → 그래서 입력이 `AnonymityScope`(글 하나)다. 전역 번호표를 만들지 않는다.
 * 3. 같은 사람이 한 글에 여러 번 쓰면 **같은 번호**여야 한다.
 * 4. 글쓴이 본인은 번호 대신 `글쓴이` 다.
 *
 * **원본 3rd.supply 에는 없던 규칙이다** (원본은 `무명-123` 형태의 별칭을 쓴다).
 * 원본과 동일함이 검증된 사양이 아니라 SITE_SPEC_V2 로 새로 들어온 요구사항이다.
 */

import { DISCLOSE_TYPE } from './codes'

/** 글 작성자 본인의 표시 이름 */
export const POST_WRITER_LABEL = '글쓴이'

/** 익명 번호의 말머리 — `익명1` · `익명2` … */
export const ANONYMOUS_LABEL_PREFIX = '익명'

/**
 * 글 하나의 맥락이 없는 자리에서 쓰는 익명 표기 (목록·검색 결과 등).
 *
 * 번호는 **글 안에서만** 뜻이 있으므로 목록에서는 번호를 붙이지 않는다.
 * 목록에 `익명3` 이 뜨면 글마다 뜻이 다른 번호가 한 화면에 섞여 오해를 만든다.
 */
export const ANONYMOUS_LIST_LABEL = '익명'

/** `disclose_type` 이 익명인가 (0 = 공개, 그 외 = 익명) */
export function isAnonymousDisclose(discloseType: number): boolean {
  return discloseType !== DISCLOSE_TYPE.PUBLIC
}

/** 번호 하나의 표시 이름 */
export function anonymousLabel(order: number): string {
  return `${ANONYMOUS_LABEL_PREFIX}${order}`
}

export interface AnonymitySubject {
  /** 대상 식별자 (글 id · 댓글 id) */
  id: string
  /**
   * 같은 사람을 묶는 키. **화면에 나가면 안 되는 값이다** (보통 user id).
   *
   * `null` 이면 묶을 수단이 없는 작성자(비로그인 등)이며 **각자 다른 번호**를 받는다.
   * 서로 다른 사람을 한 번호로 합치는 것보다, 같은 사람이 번호 둘을 갖는 쪽이 안전하다.
   */
  authorKey: string | null
}

export interface AnonymityScope {
  /**
   * 글 작성자의 키. 이 키를 가진 대상은 번호 대신 `글쓴이` 가 된다.
   * 글 작성자를 특정할 수 없으면 `null` — 그러면 아무도 `글쓴이` 가 아니다.
   */
  postAuthorKey: string | null
  /**
   * 번호를 매길 대상들. **등장 순서대로** 넣는다 (댓글이면 작성 시각 오름차순).
   *
   * 익명으로 표시할 대상만 넣는다. 공개(닉네임 노출) 대상은 번호를 소비하지 않는다 —
   * 넣으면 익명 번호가 건너뛰어 보인다.
   */
  subjects: readonly AnonymitySubject[]
}

/**
 * 등장 순서로 익명 번호를 매긴다.
 *
 * @returns `대상 id → 표시 이름`. 입력의 `authorKey` 는 결과에 포함되지 않는다.
 */
export function assignAnonymousLabels(scope: AnonymityScope): Map<string, string> {
  const labels = new Map<string, string>()
  /** authorKey → 이미 준 표시 이름 (같은 사람은 같은 번호) */
  const assigned = new Map<string, string>()
  let next = 1

  for (const subject of scope.subjects) {
    // 같은 id 가 두 번 들어오면 처음 준 번호를 지킨다 (번호가 흔들리면 안 된다)
    if (labels.has(subject.id)) continue

    const key = subject.authorKey

    if (key !== null && scope.postAuthorKey !== null && key === scope.postAuthorKey) {
      labels.set(subject.id, POST_WRITER_LABEL)
      continue
    }

    if (key === null) {
      // 묶을 수 없는 작성자는 각자 새 번호
      labels.set(subject.id, anonymousLabel(next))
      next += 1
      continue
    }

    const already = assigned.get(key)
    if (already !== undefined) {
      labels.set(subject.id, already)
      continue
    }

    const label = anonymousLabel(next)
    next += 1
    assigned.set(key, label)
    labels.set(subject.id, label)
  }

  return labels
}
