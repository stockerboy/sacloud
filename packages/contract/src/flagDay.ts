/**
 * ★깃발 하루★ — 17시에 시작해 다음날 03시에 마감한다 (2026-09-15 사장님).
 *
 * > «새벽3시에 마감치고 다음날 오후 5시에 초기화
 * >  17시부터 03시까지의 1,2,3등을 라이브로 보여주고 3시에 마감치는거야.»
 *
 * ── 하루가 이렇게 생겼다
 *   ```
 *   17:00          산기슭에서 출발. 점수·순위 ★전부 0 으로 초기화★
 *   17:00 ~ 03:00  ★라이브★ — 1·2·3등이 실시간으로 자리를 바꾼다 (10시간)
 *   03:00          ★마감.★ 그 순간 1등이 정상에 깃발을 꽂는다
 *   03:00 ~ 17:00  ★잠김.★ 어제 결과가 그대로 서 있다. 새 경기는 안 센다 (14시간)
 *   ```
 *
 * ⚠ ★화면의 「오늘」과 다르다.★ 화면 여기저기의 「오늘」은 ★자정 경계★ 다
 *   (`dailyPodium` 의 오늘의 셋 · 경기 목록의 날짜). 이 파일은 ★깃발만★ 쓴다.
 *   두 경계를 한 화면에서 섞지 않는다 — 섞으면 «오늘의 선수» 와 «깃발 1등» 이
 *   다른 날을 보면서 같은 날인 척하게 된다.
 *
 * ── 시간대
 *   서버는 UTC 로 돈다. 리그는 한국 사람들이 한국 시각으로 뛴다.
 *   그래서 ★모든 판단을 KST 로★ 한 뒤 UTC `Date` 로 돌려준다.
 *   (`form.ts` 의 달 키가 같은 이유로 KST 로 자른다)
 *
 * 순수 함수라 DB 없이 시험한다 (`__tests__/flagDay.test.ts`).
 */

/** KST 는 UTC+9. 서머타임이 없어 상수 하나면 된다 */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000

/** 하루가 열리는 시각 (KST 시). 사장님: «다음날 오후 5시에 초기화» */
export const FLAG_DAY_OPEN_HOUR = 17

/** 하루가 닫히는 시각 (KST 시). 사장님: «새벽3시에 마감» */
export const FLAG_DAY_CLOSE_HOUR = 3

/** 경쟁이 열려 있는 시간 (시간 단위) — 17시부터 다음날 3시까지면 10시간 */
export const FLAG_DAY_LIVE_HOURS = 24 - FLAG_DAY_OPEN_HOUR + FLAG_DAY_CLOSE_HOUR

/**
 * ★깃발 하루 한 칸★
 *
 * `key` 는 ★마감일★ 로 적는다 (`2026-09-15` = 9/14 17:00 ~ 9/15 03:00).
 * «9월 15일 깃발» 이라고 부를 때의 그 날짜다 — 꽂힌 날이 곧 이름이다.
 */
export interface FlagDay {
  /** `YYYY-MM-DD` (KST · ★마감한 날★) */
  key: string
  /** 17:00 KST — 조회 조건에 그대로 쓰는 UTC 시각 */
  opensAt: Date
  /** 03:00 KST — 조회 조건에 그대로 쓰는 UTC 시각 (이 시각은 ★포함하지 않는다★) */
  closesAt: Date
}

const pad2 = (value: number): string => String(value).padStart(2, '0')

/** KST 로 옮긴 `Date` — 안에서만 쓴다. `getUTC*` 로 읽으면 KST 값이 나온다 */
function toKst(at: Date): Date {
  return new Date(at.getTime() + KST_OFFSET_MS)
}

/** KST 의 연·월·일·시 → UTC `Date` */
function fromKst(year: number, month: number, day: number, hour: number): Date {
  return new Date(Date.UTC(year, month, day, hour) - KST_OFFSET_MS)
}

/**
 * 그 시각이 속한 ★깃발 하루★.
 *
 * ── 어느 칸에 들어가나
 *   ```
 *   9/14 16:59  →  9/14 마감 칸 (9/13 17:00 ~ 9/14 03:00)   ← 이미 닫힌 칸. 잠김 구간이다
 *   9/14 17:00  →  9/15 마감 칸 (9/14 17:00 ~ 9/15 03:00)   ← 방금 열렸다
 *   9/15 02:59  →  9/15 마감 칸                              ← 아직 열려 있다
 *   9/15 03:00  →  9/15 마감 칸                              ← 방금 닫혔다
 *   ```
 *   ★03:00 부터 17:00 까지는 방금 닫힌 칸을 계속 보여 준다.★ 새 칸을 미리 열지 않는다 —
 *   열어 두면 «아직 아무도 안 뛴 텅 빈 산» 이 14시간 동안 서 있게 된다.
 */
export function flagDayOf(at: Date): FlagDay {
  const kst = toKst(at)
  const y = kst.getUTCFullYear()
  const m = kst.getUTCMonth()
  const d = kst.getUTCDate()
  const hour = kst.getUTCHours()

  /* 17시를 넘겼으면 ★내일 마감★ 칸이 방금 열린 것이다 */
  const closeShift = hour >= FLAG_DAY_OPEN_HOUR ? 1 : 0
  const closeKst = new Date(Date.UTC(y, m, d + closeShift, FLAG_DAY_CLOSE_HOUR))

  const cy = closeKst.getUTCFullYear()
  const cm = closeKst.getUTCMonth()
  const cd = closeKst.getUTCDate()
  return {
    key: `${cy}-${pad2(cm + 1)}-${pad2(cd)}`,
    opensAt: fromKst(cy, cm, cd - 1, FLAG_DAY_OPEN_HOUR),
    closesAt: fromKst(cy, cm, cd, FLAG_DAY_CLOSE_HOUR),
  }
}

/**
 * 지금 ★경쟁이 열려 있나★ (17:00 ~ 03:00 사이인가).
 *
 * 열려 있으면 화면이 «라이브» 로, 닫혀 있으면 «마감» 으로 말한다.
 * 닫힌 동안에도 ★같은 칸★ 을 보여 준다 — `flagDayOf` 가 그렇게 돌려준다.
 */
export function flagDayIsLive(at: Date): boolean {
  return at.getTime() < flagDayOf(at).closesAt.getTime()
}

/**
 * 그 칸이 ★몇 % 지났나★ (0~1). 산에서 지금 어디쯤 올라와 있는지 그릴 때 쓴다.
 * 닫힌 뒤에는 1 이다 — 정상이다.
 */
export function flagDayProgress(at: Date): number {
  const day = flagDayOf(at)
  const span = day.closesAt.getTime() - day.opensAt.getTime()
  const gone = at.getTime() - day.opensAt.getTime()
  if (gone <= 0) return 0
  if (gone >= span) return 1
  return gone / span
}

/** `YYYY-MM-DD` (마감일) → 그 칸. 저장된 깃발을 되읽을 때 쓴다 */
export function flagDayFromKey(key: string): FlagDay | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (m === null) return null
  const y = Number(m[1])
  const mo = Number(m[2]) - 1
  const d = Number(m[3])
  /* 달력에 없는 날(2월 30일 같은 것)은 지어내지 않는다 */
  const probe = new Date(Date.UTC(y, mo, d))
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo || probe.getUTCDate() !== d) {
    return null
  }
  return {
    key,
    opensAt: fromKst(y, mo, d - 1, FLAG_DAY_OPEN_HOUR),
    closesAt: fromKst(y, mo, d, FLAG_DAY_CLOSE_HOUR),
  }
}

/** 화면에 적는 말 — «9/15 마감» */
export function flagDayLabel(day: FlagDay): string {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(day.key)
  if (m === null) return day.key
  return `${Number(m[1])}/${Number(m[2])} 마감`
}
