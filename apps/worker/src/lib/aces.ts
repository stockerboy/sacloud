/**
 * 사용자가 지목한 **1티어 선수 명단** — 한 곳에만 둔다.
 *
 * 2026-08-31 사용자 제공. 원문 그대로다:
 *   1티어 스나  Xek · cut(베리타스) · 감젤(부부젤라) · 유닠 · 호펭 ·
 *               [h].jerry · ㅇ7ㅇ · 멍청이젤
 *   1티어 라플  피존 · KKW · 토껭이 · 김장은 · 혜진젤 · starry ·
 *               Nostalgia❤️ · 견자히 · haybe
 *
 * ⚠ **17명이다.** 지시문에는 "19명" 으로 적혀 있으나 실제로 불린 이름은 스나 8 · 라플 9 뿐이다.
 *    빠진 두 명을 지어내지 않는다 (`CLAUDE.md` 3장 7번). 사용자가 두 명을 더 알려 주면
 *    이 배열에만 넣으면 된다 — 읽는 쪽은 전부 여기를 본다.
 *
 * 원래 `apps/worker/src/dev/aceLookup.ts` 안에 박혀 있던 것을 꺼냈다.
 * 배틀로그 작업목록(`battlelogWorklist.ts`)이 같은 명단을 써야 해서 두 벌이 되면 안 된다.
 */

export interface Ace {
  name: string
  weapon: '스나' | '라플'
  /** 괄호 안 클랜 힌트. 동명이인을 가릴 때만 쓴다 */
  clanHint?: string
}

export const ACES: readonly Ace[] = [
  { name: 'Xek', weapon: '스나' },
  { name: 'cut', weapon: '스나', clanHint: '베리타스' },
  { name: '감젤', weapon: '스나', clanHint: '부부젤라' },
  { name: '유닠', weapon: '스나' },
  { name: '호펭', weapon: '스나' },
  { name: '[h].jerry', weapon: '스나' },
  { name: 'ㅇ7ㅇ', weapon: '스나' },
  { name: '멍청이젤', weapon: '스나' },

  { name: '피존', weapon: '라플' },
  { name: 'KKW', weapon: '라플' },
  { name: '토껭이', weapon: '라플' },
  { name: '김장은', weapon: '라플' },
  { name: '혜진젤', weapon: '라플' },
  { name: 'starry', weapon: '라플' },
  { name: 'Nostalgia❤️', weapon: '라플' },
  { name: '견자히', weapon: '라플' },
  { name: 'haybe', weapon: '라플' },
]

/**
 * 기호·공백을 접고 소문자로. **비교 전용이고 저장하지 않는다.**
 *
 * 병영수첩·3rd.supply 닉네임은 동형문자(대문자 I · 키릴 Р · 그리스 Β)와 특수기호를
 * 즐겨 쓴다. 접지 않으면 `Xek` 과 `xek` 이 다른 사람이 된다 (실측: 개인랭킹 1위가 `xek`).
 */
export function foldNick(value: string): string {
  return value
    .replace(/Р/g, 'P')
    .replace(/Β/g, 'B')
    .replace(/Ι/g, 'I')
    .replace(/[^0-9A-Za-z가-힣ㄱ-ㅎㅏ-ㅣ]/g, '')
    .toLowerCase()
}
