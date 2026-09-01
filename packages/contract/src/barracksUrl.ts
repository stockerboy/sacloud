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
 * ── 선수 주소 형식이 **관측됐다** (2026-09-01 · D-254)
 *   D-162 당시에는 `[미확인]` 이었는데, 저장소 안에 실물이 남아 있었다.
 *
 *   ```
 *   https://barracks.sa.nexon.com/D9EBC75CCBD60C12SA/match
 *                                 └──── str_usn ────┘ └ 화면 이름
 *   ```
 *
 *   근거 셋 (전부 저장소 안에 있다):
 *     · `docs/session-ledger/04c10ca2.md` — 사용자가 포지션 정답 라벨로 **23개**를 그대로 붙여 줬다
 *     · `docs/DECISIONS.md` D-221 — 그 주소의 계정이 `str_usn D9EBC75CCBD60C12SA
 *       = user_nexon_sn 470379822` 임을 실측했다
 *     · `data/barracks/position-labels.json` — "barracksId 는 주소 조각(16진+SA)"
 *
 *   그래서 이제 `str_usn` 을 **닉네임이 아니라 계정 키**로 알아본다.
 *   나머지(경로가 다른 주소)는 예전처럼 조각을 전부 뽑아 순서대로 시도한다 —
 *   한 형식만 받지 않는다는 D-162 의 태도는 그대로다.
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
  /* `/{str_usn}/match` 의 뒤 조각. **관측된 화면 이름**이다 (D-254) */
  'match',
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

/**
 * 병영수첩 계정 번호(`str_usn`)처럼 생겼는가 — **16진 16자리 + `SA`** (D-254).
 *
 * 실물 24개를 세어 전부 이 모양이었다 (`data/barracks/position-labels.json`).
 * `SA` 는 서든어택을 가리키는 꼬리표로 보이나 **그 뜻은 [미확인]** 이다 — 모양만 쓴다.
 */
const USN_SHAPE = /^[0-9a-f]{16}SA$/i

export type BarracksRef =
  /** 넥슨 Open API 계정 번호. **닉네임이 아니라 이 값이 사람의 키다** */
  | { kind: 'ouid'; value: string }
  /** 병영수첩 계정 번호(`str_usn`). 병영수첩 세계에서의 확정 키다 (D-221) */
  | { kind: 'usn'; value: string }
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
    refs.push(classify(value))
  }

  /* 확정 키부터 시도한다. 닉네임은 바뀌고 겹치므로 **맨 뒤**다 */
  return [
    ...refs.filter((r) => r.kind === 'ouid'),
    ...refs.filter((r) => r.kind === 'usn'),
    ...refs.filter((r) => r.kind === 'nickname'),
  ]
}

/**
 * 조각 하나가 무엇으로 보이는가.
 *
 * 계정 번호는 **대문자로 맞춘다** — 관측된 실물이 전부 대문자이고(24개),
 * 저장된 값과 모양이 같아야 조회가 색인을 탄다. 닉네임은 손대지 않는다.
 */
function classify(value: string): BarracksRef {
  if (OUID_SHAPE.test(value)) return { kind: 'ouid', value }
  if (USN_SHAPE.test(value)) return { kind: 'usn', value: value.toUpperCase() }
  return { kind: 'nickname', value }
}

/**
 * 주소가 아니라 **계정 번호만** 붙여 넣었을 때 (`D9EBC75CCBD60C12SA`).
 *
 * 주소를 통째로 복사하지 않고 조각만 복사해 오는 사람이 있다.
 * 모양이 맞지 않으면 `null` 이고, 그때는 평소대로 닉네임으로 찾는다.
 *
 * **닉네임 조회보다 먼저 쓰지 마라.** 16진 16자리 + `SA` 인 닉네임이 있을 가능성은
 * 거의 없지만 0 은 아니고, 그런 사람이 있다면 그 사람이 먼저다.
 */
export function barracksUsnOf(input: string): string | null {
  const value = input.trim()
  return USN_SHAPE.test(value) ? value.toUpperCase() : null
}

/**
 * 병영수첩 **클랜** 주소에서 slug 를 뽑는다.
 *
 * `barracks.sa.nexon.com/clan/{slug}` · `.../clan/{slug}/clanMatch` 둘 다 관측됐다
 * (`docs/IPL_SPEC.md` · `data/clan/`). 우리 `Clan.slug` 가 곧 이 값이다(스키마 주석).
 *
 * 원래 `apps/web/lib/server/queries/leagueAdmin.ts` 안에 있던 규칙을 여기로 옮겼다 —
 * 리그 관리 화면과 통합검색이 **같은 규칙**을 써야 한쪽만 되는 일이 없다 (D-254).
 */
export function clanSlugFromBarracksUrl(input: string): string | null {
  const match = /barracks\.sa\.nexon\.com\/clan\/([^/?#]+)/i.exec(input.trim())
  const slug = match?.[1]
  if (!slug) return null
  try {
    return decodeURIComponent(slug)
  } catch {
    return slug
  }
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
