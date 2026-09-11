/**
 * **「그 경기에서 뛴 팀」과 「선수의 등록 소속」을 가르는 단 하나의 기준.**
 *
 * ── 왜 이 파일이 생겼나 (2026-09-07 · 사장님 지시 「1순위 추가 오염 차단」)
 *   `MatchPlayerStat.matchTimeLeagueClanId` / `matchTimeClanSlug` 한 칸에
 *   **뜻이 두 개** 들어가 있었다.
 *
 *   ```
 *   supply-mirror        그 선수 본인의 클랜 태그        ← 용병이면 뛴 팀과 다르다
 *   barracks-battlelog   그 경기에서 뛴 팀 그 자체        ← 용병을 표현할 수 없다
 *   ```
 *
 *   실측(운영 DB · 2026-09-07): `barracks-battlelog` 행은 「경기 당시 소속」이
 *   「뛴 팀」과 **100.0%** 일치한다 (IPL 82,550 / SPL 1,830 / 10mountain 1,700 —
 *   단 한 건의 예외도 없다). 그 경로는 용병 여부를 **모른다**
 *   (`battlelogLineup.ts` 의 주석이 그렇게 적어 두었다).
 *
 *   그런데 「현재 소속」을 고르는 코드(`playerCurrentClan` · `supplyRollup`)가
 *   그 칸을 **가장 최근 경기 기준**으로 그대로 읽었다. 그래서 용병으로 한 판 뛴 것이
 *   그대로 가입으로 굳었다 — IPL 에서 명부 기준과 **71% 어긋난다**(320명 중 226명).
 *
 * ── 왜 `matchTimeClanConfidence` 가 아니라 `matchTimeClanSource` 인가
 *   confidence 로 판정하면 **이미 쌓인 104만 행을 backfill** 해야 한다. 그것은 DB 쓰기다.
 *   `matchTimeClanSource` 는 **모든 행에 이미 올바르게 박혀 있다**(운영 채움률 100%).
 *   그래서 코드만 고치면 과거 행까지 즉시 옳게 판정된다. **DB 를 한 줄도 쓰지 않는다.**
 *
 * ── 이 파일이 하지 않는 것
 *   - 행을 버리지 않는다. 판수·승패·킬데스·`sourceRating` 집계에는 **그대로 들어간다.**
 *     빠지는 것은 **`clanId` 를 고르는 근거**에서뿐이다
 *   - `clanSlug` 를 `null` 로 바꾸지 않는다. `null` 은 「무소속」이라는 **실제 정보**라
 *     근거에서 빼는 것과 뜻이 다르다 (D-160)
 *   - `participantRole` 을 손대지 않는다. 배틀로그는 용병 여부를 모르고,
 *     모르는 것을 지어내면 공식전 판정이 통째로 뒤집힌다 (`CLAUDE.md` 2장 1번)
 */

/**
 * **「그 경기에서 뛴 팀」만 적어 둔 출처.** 등록 소속의 근거로 쓰지 않는다.
 *
 * 값은 `MatchPlayerStat.matchTimeClanSource` 다.
 * 새 수집 경로가 늘면 **여기 한 줄만** 추가한다 — 파일마다 문자열을 박지 마라.
 */
export const TEAM_ONLY_CLAN_SOURCES = ['barracks-battlelog'] as const

/**
 * 신뢰하는 출처 — **참고용 목록이다. 판정은 위 차단 목록으로 한다.**
 *
 * `supply-mirror` 는 선수 본인 태그이고, `nexon-detail`(801행)·`supply-lineup`(152행) 도
 * 실측에서 **뛴 팀과 다른 행이 329건** 나온다 = 용병을 구분할 수 있는 출처다.
 * 그래서 셋 다 신뢰를 유지한다 (2026-09-07 · 사장님 확인).
 */
export const TRUSTED_CLAN_SOURCES = ['supply-mirror', 'nexon-detail', 'supply-lineup'] as const

/**
 * 이 출처의 「경기 당시 클랜」이 **뛴 팀일 뿐인가**.
 *
 * 모르는 출처(`null` 포함)는 **신뢰 쪽으로 둔다.** 여기서 막아야 할 것은
 * 「뛴 팀이라고 확인된 것」하나뿐이고, 모르는 것까지 막으면 멀쩡한 소속이 사라진다
 * (`CLAUDE.md` 2장 1번 — 모르는 것을 아는 척하지 않는다).
 */
export function isTeamOnlyClanSource(source: string | null | undefined): boolean {
  if (!source) return false
  return (TEAM_ONLY_CLAN_SOURCES as readonly string[]).includes(source)
}

/**
 * **옛 동작으로 되돌리는 스위치** (`CLAUDE.md` 1-4 — 이전 방식 버전을 남긴다).
 *
 * `SACLOUD_AFFILIATION_TRUST=off` 면 이 파일이 생기기 전과 **완전히 같게** 동작한다.
 * 재배포 없이 환경변수 하나로 되돌릴 수 있어야 한다는 요구(2026-09-07)에서 나왔다.
 */
export function affiliationTrustEnabled(): boolean {
  return process.env.SACLOUD_AFFILIATION_TRUST !== 'off'
}

/**
 * 이 행을 **소속 근거로 쓸 수 있는가**.
 *
 * 스위치가 꺼져 있으면 언제나 `true` — 옛 동작 그대로다.
 */
export function clanSourceTrusted(source: string | null | undefined): boolean {
  if (!affiliationTrustEnabled()) return true
  return !isTeamOnlyClanSource(source)
}
