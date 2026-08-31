/**
 * IPL 원문 → `Match` **투영 판정** (순수 함수).
 *
 * ── 왜 이제야 만드나
 *   `iplMatchImport` 는 원문 보존까지만 한다 — 헤더에 *"Match 로 투영하지 않는다"* 고
 *   적혀 있다. 그래서 IPL 원문 147,546 경기가 다 쌓여 있는데 화면의 IPL 경기는 **0건**이고
 *   클랜랭킹도 비어 있었다. 그 마지막 한 칸을 여기서 잇는다.
 *
 * ── 원문이 주는 것 / 안 주는 것
 *   ```
 *   준다     match_key · red_clan_name · blue_clan_name · red_win_cnt · blue_win_cnt
 *            map_name · plimit
 *   안 준다  **참가자.** 칸 44개에 선수 관련 칸이 하나도 없다 (D-219 실측)
 *   ```
 *   그래서 이 투영은 **경기·승패·승률·랭킹까지**만 만든다. 라인업은 배틀로그가 와야 채워진다.
 *   `MatchPlayerStat` 을 지어내지 않는다.
 *
 * ── 경기 시각
 *   `match_key` 앞 12자리가 `YYMMDDHHMMSS` 이고 **KST** 다 (`formatMatchStamp` 과 같은 규칙).
 *   `payload.match_time_date` 는 `0001-01-01T00:00:00` 같은 값이 섞여 있어 쓰지 않는다.
 */

/** 우리가 받은 리그 경기는 이 맵 하나다 */
export const IPL_LEAGUE_MAP_NAME = '제3보급창고'

/**
 * `match_key` 앞 12자리(KST)를 UTC `Date` 로 바꾼다.
 *
 * 형식이 어긋나면 **null 이다.** 억지로 만들지 않는다 — 시각이 틀리면 시즌 창 판정이 틀린다.
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

  // KST(+09:00) 를 UTC 로 옮긴다
  const utcMs = Date.UTC(2000 + yy, mm - 1, dd, hh, mi, ss) - 9 * 3_600_000
  const at = new Date(utcMs)

  // 존재하지 않는 날짜(2월 31일 등)를 걸러낸다
  const back = new Date(utcMs + 9 * 3_600_000)
  if (back.getUTCMonth() !== mm - 1 || back.getUTCDate() !== dd) return null

  return at
}

export type WinnerSide = 'red' | 'blue'

/**
 * 라운드 승수로 승자를 정한다.
 *
 * 같으면 **null 이다.** 무승부를 승리로 바꾸지 않는다 — 원문에 무승부가 있으면
 * 그것은 우리가 모르는 상황이므로 투영하지 않고 세어서 보고한다.
 */
export function winnerSideOf(redWin: number, blueWin: number): WinnerSide | null {
  if (!Number.isFinite(redWin) || !Number.isFinite(blueWin)) return null
  if (redWin === blueWin) return null
  return redWin > blueWin ? 'red' : 'blue'
}

/** 투영을 건너뛰는 이유 — 세어서 보고한다. 조용히 버리지 않는다 */
export type SkipReason =
  /** 우리 리그 맵이 아니다 */
  | 'other_map'
  /** `match_key` 에서 시각을 못 읽었다 */
  | 'bad_time'
  /** 시즌 창보다 앞이다 */
  | 'before_season'
  /** 클랜명을 IPL 등록 클랜으로 잇지 못했다 */
  | 'unknown_clan'
  /** 한쪽이 IPL 클랜이 아니다 — IPL 기록이 아니다 (D-210) */
  | 'not_ipl_pair'
  /** 라운드 승수가 같다 */
  | 'draw'
  /** 승수 칸이 없거나 숫자가 아니다 */
  | 'bad_score'

export interface ProjectPlanInput {
  matchKey: string
  mapName: string | null
  redClanName: string | null
  blueClanName: string | null
  redWinCount: unknown
  blueWinCount: unknown
  /** 클랜명 → 등록 클랜. 못 찾거나 모호하면 null */
  resolveClan: (name: string) => { leagueClanId: string; division: number } | null
  /** 시즌 창 시작. 이보다 앞선 경기는 투영하지 않는다 */
  seasonFrom: Date
}

export interface ProjectPlan {
  matchKey: string
  startAt: Date
  winnerSide: WinnerSide
  red: { leagueClanId: string; division: number }
  blue: { leagueClanId: string; division: number }
}

const asCount = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && /^\d+$/.test(v.trim())) return Number(v.trim())
  return null
}

/**
 * 원문 한 줄을 투영 계획으로 바꾼다. 못 하면 **왜 못 하는지**를 돌려준다.
 *
 * 순서가 곧 우선순위다 — 맵이 다르면 나머지는 볼 필요가 없다.
 */
export function planProjection(
  input: ProjectPlanInput,
): { ok: true; plan: ProjectPlan } | { ok: false; reason: SkipReason } {
  if (input.mapName !== IPL_LEAGUE_MAP_NAME) return { ok: false, reason: 'other_map' }

  const startAt = matchKeyToDate(input.matchKey)
  if (!startAt) return { ok: false, reason: 'bad_time' }
  if (startAt.getTime() < input.seasonFrom.getTime()) return { ok: false, reason: 'before_season' }

  const redName = input.redClanName?.trim()
  const blueName = input.blueClanName?.trim()
  if (!redName || !blueName) return { ok: false, reason: 'unknown_clan' }

  const red = input.resolveClan(redName)
  const blue = input.resolveClan(blueName)
  if (!red && !blue) return { ok: false, reason: 'unknown_clan' }
  /* 한쪽만 IPL 이면 **IPL 경기가 아니다.** 이쪽에 넣으면 IPL 기록이 오염된다 (D-210 의 거울) */
  if (!red || !blue) return { ok: false, reason: 'not_ipl_pair' }

  const redWin = asCount(input.redWinCount)
  const blueWin = asCount(input.blueWinCount)
  if (redWin === null || blueWin === null) return { ok: false, reason: 'bad_score' }

  const winnerSide = winnerSideOf(redWin, blueWin)
  if (!winnerSide) return { ok: false, reason: 'draw' }

  return { ok: true, plan: { matchKey: input.matchKey, startAt, winnerSide, red, blue } }
}
