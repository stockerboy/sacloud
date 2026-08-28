/**
 * 넥슨 **병영수첩 주소**에서 선수 식별자를 뽑는다 (D-162).
 *
 * ── 왜 필요한가
 *   사용자가 검색창에 병영수첩 주소를 **그대로 붙여 넣으면** 그 선수의 기록으로
 *   가야 한다. 지금은 주소 전체가 닉네임으로 취급돼 아무것도 안 나온다.
 *
 *   클랜 쪽에는 이미 같은 기능이 있다 —
 *   `leagueAdmin.ts` 의 `clanSlugFromBarracksUrl()` 이
 *   `barracks.sa.nexon.com/clan/{slug}` 에서 slug 를 뽑는다. 선수용이 없었을 뿐이다.
 *
 * ── 경로 형식은 **[미확인]** 이다
 *   클랜 주소(`/clan/{slug}/clanMatch`)는 관측됐지만, 선수 주소의 정확한 경로는
 *   관측하지 못했다. 그래서 **한 가지 형식을 정해 놓고 그것만 받지 않는다.**
 *   주소에서 식별자가 될 만한 조각을 전부 뽑아 순서대로 시도한다.
 *   형식이 확인되면 `KNOWN_PLAYER_SEGMENTS` 만 좁히면 된다.
 *
 *   지어내지 않는다는 원칙(CLAUDE.md 3장 7번)을 이렇게 지킨다 —
 *   "이 형식일 것이다" 라고 단정하는 대신, 뽑아 보고 **DB 에 있으면** 그것으로 본다.
 */

/** 병영수첩(및 서든어택 공식) 호스트인가 */
const BARRACKS_HOST = /(^|\.)(barracks\.)?sa\.nexon\.com$/i
const NEXON_HOST = /(^|\.)nexon\.com$/i

/**
 * 식별자가 **아닌** 경로 조각.
 *
 * 화면 이름·언어 코드 같은 것들이다. 여기 없는 조각만 후보로 본다.
 * 목록이 모자라면 후보가 늘 뿐이고, 어차피 DB 대조에서 걸러진다.
 */
const KNOWN_PLAYER_SEGMENTS = new Set([
  'barracks',
  'clan',
  'clanmatch',
  'record',
  'records',
  'profile',
  'user',
  'users',
  'player',
  'players',
  'main',
  'home',
  'index',
  'ko',
  'kr',
  'en',
])

/** 넥슨 계정 번호(ouid)처럼 생겼는가 — 긴 16진 문자열이다 */
const OUID_SHAPE = /^[0-9a-f]{24,}$/i

export type BarracksRef =
  /** 넥슨 계정 번호. **닉네임이 아니라 이 값이 사람의 키다** */
  | { kind: 'ouid'; value: string }
  /** 닉네임. 동명이인이 있을 수 있어 확정 키가 아니다 */
  | { kind: 'nickname'; value: string }

/**
 * 입력이 병영수첩 주소인가.
 *
 * 주소가 아니면 `false` 다 — 그때는 평소대로 닉네임 검색을 한다.
 */
export function isBarracksUrl(input: string): boolean {
  const url = parseUrl(input)
  if (!url) return false
  return BARRACKS_HOST.test(url.hostname) || NEXON_HOST.test(url.hostname)
}

/**
 * 주소에서 선수 후보를 **순서대로** 뽑는다.
 *
 * ouid 처럼 생긴 것을 먼저 준다 — 그게 확정 키이기 때문이다.
 * 주소가 아니거나 후보가 없으면 빈 배열이다.
 */
export function playerRefsFromBarracksUrl(input: string): BarracksRef[] {
  const url = parseUrl(input)
  if (!url) return []
  if (!BARRACKS_HOST.test(url.hostname) && !NEXON_HOST.test(url.hostname)) return []

  const tokens: string[] = []

  /* 1) 질의 문자열 — `?ouid=` `?nickname=` 같은 이름이 붙어 있으면 가장 믿을 만하다 */
  for (const [key, value] of url.searchParams) {
    const name = key.toLowerCase()
    if (name.includes('ouid') || name.includes('nick') || name.includes('name') || name.includes('id')) {
      tokens.push(value)
    }
  }

  /* 2) 경로 조각 — 화면 이름이 아닌 것만 */
  for (const raw of url.pathname.split('/')) {
    const segment = safeDecode(raw)
    if (segment === '') continue
    if (KNOWN_PLAYER_SEGMENTS.has(segment.toLowerCase())) continue
    tokens.push(segment)
  }

  /* 3) 해시 — `#/record/닉네임` 처럼 쓰는 화면이 있다 */
  for (const raw of url.hash.replace(/^#/, '').split('/')) {
    const segment = safeDecode(raw)
    if (segment === '') continue
    if (KNOWN_PLAYER_SEGMENTS.has(segment.toLowerCase())) continue
    tokens.push(segment)
  }

  const seen = new Set<string>()
  const refs: BarracksRef[] = []
  for (const token of tokens) {
    const value = token.trim()
    if (value === '' || seen.has(value)) continue
    seen.add(value)
    refs.push(OUID_SHAPE.test(value) ? { kind: 'ouid', value } : { kind: 'nickname', value })
  }

  /* ouid 가 확정 키다. 닉네임보다 먼저 시도한다 */
  return [...refs.filter((r) => r.kind === 'ouid'), ...refs.filter((r) => r.kind === 'nickname')]
}

function parseUrl(input: string): URL | null {
  const trimmed = input.trim()
  if (trimmed === '') return null
  /* 사람들은 `barracks.sa.nexon.com/...` 처럼 스킴 없이 붙여 넣기도 한다 */
  const candidate = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    return new URL(candidate)
  } catch {
    return null
  }
}

/** 잘못 인코딩된 조각 때문에 전체가 실패하지 않게 한다 */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
