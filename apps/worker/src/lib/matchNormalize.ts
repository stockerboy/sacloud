/**
 * ★★병영수첩 원문 한 줄 → 경기 하나★★ (2026-09-05 · Part 3 ①단계).
 *
 * ── 이 파일이 하는 일 / 안 하는 일
 * ```
 * 한다     원문의 칸을 ★우리 말로 옮긴다★ — 경기키 · 시각 · 맵 · 양쪽 클랜명 · 라운드 승수
 * 안한다   ★리그를 정하지 않는다★ (그건 `leagueVerdict.ts`)
 * 안한다   ★맵으로 거르지 않는다★ (아래 참조)
 * 안한다   DB 를 안 본다 — ★순수 함수라 네트워크·DB 없이 전량 시험된다★
 * ```
 *
 * ── ★맵으로 거르지 않는다★ — 옛 구조가 여기서 무너졌다
 *   옛 투영(`lib/iplProject.ts`)은 `IPL_LEAGUE_MAP_NAME = '제3보급창고'` 를 박아 두고
 *   그 밖의 맵을 전부 버렸다. IPL 은 그 맵만 쓰니 맞는 규칙이었지만,
 *   ★그 코드로 열산을 돌리면 열산의 다른 맵이 통째로 사라진다.★
 *   사장님: «특정 맵을 공통 필터로 박지 마라»
 *
 *   ★그래서 맵은 「값」으로만 들고 나간다.★ 무엇을 인정할지는 ★리그가 정한다★ —
 *   그 판정은 `LeagueMap` 표(리그마다 다른 맵 목록)를 보는 투영 단계의 몫이다.
 *
 * ── ★시각은 경기키에서 읽는다★
 *   `match_time_date` 는 `0001-01-01T00:00:00` 같은 값이 섞여 있어 못 쓴다 (실측).
 *   `match_key` 앞 12자리가 `YYMMDDHHMMSS` 이고 ★KST★ 다.
 *
 * ── ★없는 것을 지어내지 않는다★
 *   읽을 수 없으면 사유 코드와 함께 `ok:false` 를 돌려준다. 0 이나 빈 문자열로 채우지 않는다.
 */

/** 원문 한 줄에서 우리가 보는 칸만. 나머지 30여 개는 안 본다 */
export interface RawBarracksMatch {
  match_key?: unknown
  map_name?: unknown
  plimit?: unknown
  red_clan_name?: unknown
  blue_clan_name?: unknown
  red_win_cnt?: unknown
  blue_win_cnt?: unknown
  match_type?: unknown
  is_clan?: unknown
}

export type NormalizeFailure =
  /** `match_key` 가 없거나 18자리 숫자가 아니다 */
  | 'bad_key'
  /** 경기키 앞 12자리에서 시각을 못 읽었다 */
  | 'bad_time'
  /** 클랜 이름이 한쪽이라도 비었다 — 클랜전이 아닐 수 있다 */
  | 'no_clan_name'
  /** 라운드 승수가 없거나 숫자가 아니다 */
  | 'bad_score'
  /** 라운드 승수가 같다 — 무승부를 승리로 바꾸지 않는다 */
  | 'draw'
  /** 양 팀 클랜명이 같다 */
  | 'same_clan'

export interface NormalizedMatch {
  /** 넥슨 18자리 경기 번호. ★이것이 실제 경기의 전역 키다★ */
  matchKey: string
  /** 경기 시각 (UTC). 경기키 앞 12자리(KST)에서 읽는다 */
  startAt: Date
  /** 원본이 말한 맵 이름. ★여기서 거르지 않는다★ */
  mapName: string | null
  /** 한 팀 인원 (원본 `plimit`). 모르면 `null` */
  playerLimit: number | null
  redClanName: string
  blueClanName: string
  redWins: number
  blueWins: number
  winnerSide: 'red' | 'blue'
}

export type NormalizeResult =
  | { ok: true; match: NormalizedMatch }
  | { ok: false; code: NormalizeFailure; reason: string }

const fail = (code: NormalizeFailure, reason: string): NormalizeResult => ({ ok: false, code, reason })

/**
 * 경기키 앞 12자리(`YYMMDDHHMMSS` · KST)를 UTC `Date` 로 바꾼다.
 *
 * ⚠ 형식이 어긋나면 ★null 이다.★ 억지로 만들지 않는다 — 시각이 틀리면 시즌 창 판정이 틀린다.
 *
 * ★`lib/iplProject.ts` 의 같은 함수와 규칙이 같다.★ 그쪽은 지우지 않고 그대로 뒀다
 * (`CLAUDE.md` 1-4). 둘이 갈라지지 않게 검사가 묶어 둔다.
 */
export function matchKeyToDate(matchKey: string): Date | null {
  if (matchKey.length < 12) return null
  const stamp = matchKey.slice(0, 12)
  if (!/^\d{12}$/.test(stamp)) return null

  const yy = Number(stamp.slice(0, 2))
  const mm = Number(stamp.slice(2, 4))
  const dd = Number(stamp.slice(4, 6))
  const hh = Number(stamp.slice(6, 8))
  const mi = Number(stamp.slice(8, 10))
  const ss = Number(stamp.slice(10, 12))
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31 || hh > 23 || mi > 59 || ss > 59) return null

  const utcMs = Date.UTC(2000 + yy, mm - 1, dd, hh, mi, ss) - 9 * 3_600_000
  const at = new Date(utcMs)

  /* 존재하지 않는 날짜(2월 31일 등)를 걸러낸다 */
  const back = new Date(utcMs + 9 * 3_600_000)
  if (back.getUTCMonth() !== mm - 1 || back.getUTCDate() !== dd) return null
  return at
}

/** 숫자로 읽을 수 있으면 숫자, 아니면 `null`. ★0 으로 채우지 않는다★ */
function asCount(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && /^\d+$/.test(v.trim())) return Number(v.trim())
  return null
}

/** 비어 있지 않은 글자만. 앞뒤 공백은 다듬는다 */
function asName(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t === '' ? null : t
}

/**
 * 원문 한 줄을 경기 하나로 옮긴다.
 *
 * ★리그도 맵도 여기서 정하지 않는다.★ 읽을 수 있는 것만 읽는다.
 */
export function normalizeBarracksMatch(raw: RawBarracksMatch): NormalizeResult {
  const key = typeof raw.match_key === 'string' ? raw.match_key.trim() : String(raw.match_key ?? '')
  if (!/^\d{18}$/.test(key)) {
    return fail('bad_key', `경기키가 18자리 숫자가 아니다: ${key || '(없음)'}`)
  }

  const startAt = matchKeyToDate(key)
  if (startAt === null) return fail('bad_time', `경기키에서 시각을 못 읽었다: ${key.slice(0, 12)}`)

  const red = asName(raw.red_clan_name)
  const blue = asName(raw.blue_clan_name)
  if (!red || !blue) {
    return fail('no_clan_name', `클랜 이름이 비었다 (red=${red ?? '없음'} · blue=${blue ?? '없음'})`)
  }
  if (red === blue) return fail('same_clan', `양 팀 클랜명이 같다: ${red}`)

  const redWins = asCount(raw.red_win_cnt)
  const blueWins = asCount(raw.blue_win_cnt)
  if (redWins === null || blueWins === null) {
    return fail('bad_score', `라운드 승수를 못 읽었다 (red=${String(raw.red_win_cnt)} · blue=${String(raw.blue_win_cnt)})`)
  }
  if (redWins === blueWins) {
    /* ★무승부를 승리로 바꾸지 않는다.★ 원본에 무승부가 있으면 그건 우리가 모르는 상황이다 */
    return fail('draw', `라운드 승수가 같다 (${redWins}:${blueWins})`)
  }

  return {
    ok: true,
    match: {
      matchKey: key,
      startAt,
      mapName: asName(raw.map_name),
      playerLimit: asCount(raw.plimit),
      redClanName: red,
      blueClanName: blue,
      redWins,
      blueWins,
      winnerSide: redWins > blueWins ? 'red' : 'blue',
    },
  }
}
