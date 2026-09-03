/**
 * **시즌 경계 — 진실은 여기 한 곳이다** (O-046 · 2026-09-03 사장님 회의).
 *
 * ══ 사장님이 정하신 것 ══
 *
 * > «1월첫째주 목요일부터 7월첫째주 까지가 Beta, 7월첫째주부터 현재까지가 시즌0 진행형,
 * >  **10월 첫째주 목요일에 시즌1 정식오픈**»
 * > (7/1 인지 7/2 인지 여쭙자) → «**2일이다 무조건 목요일이다**»
 * > (그래프가 9개월인지 6개월인지 여쭙자) → «**6개월이 맞다 미안하다**
 * >  그러면 **올해 3월 첫째주 목요일부터의 기록을 가져와라**» · «**Beta 3월시작이다**»
 *
 * ★**Beta 가 1월 → 3월로 바뀌었다.**★ 손그림 x축이 6개월이던 것을 짚어 여쭤서 잡혔다.
 *
 * ══ 왜 여기 한 곳에 두나 ══
 *
 * 「시즌0은 7/1 이후」가 ★주석 두 곳에만★ 적혀 있었다
 * (`season0Apply.ts:393` · `supplyRollup.ts:411`). ★실제 계산이 어디서 그 날짜를 정하는지
 * 못 찾았다★ `[미확인]`. 그래서 **찾아 고치는 대신 진실을 한 곳에 새로 박는다.**
 * 나중에 박혀 있는 계산이 나오면 **그것이 이 상수를 가리키게 고친다.**
 *
 * ⚠ 시각은 전부 **KST 자정**이다. 사장님이 «무조건 목요일» 이라고 하셨고 셋 다 목요일이다.
 */

/** 시즌 하나의 창 */
export interface SeasonWindow {
  /** `Season.number` — ★정식 시즌 앞은 음수★ 로 둔다 (`officialSeasonLabel` 이 그대로 맞는다) */
  number: number
  /** `Season.seasonType` — "legacy" | "beta" | "official" */
  seasonType: 'legacy' | 'beta' | 'official'
  /** 화면·로그에 쓰는 이름 */
  label: string
  /** 이 시각부터 (포함) */
  startedAt: Date
  /** 이 시각 전까지 (미포함). 진행 중이면 `null` */
  endedAt: Date | null
}

/**
 * ★번호를 왜 음수로 두나★
 *
 * `officialSeasonLabel(n)` 이 `시즌 ${n}` 을 만든다. 시즌0 을 `0`, 시즌1 을 `1` 로 두면
 * ★라벨 함수를 안 고쳐도 화면이 맞는다.★ 그 앞의 둘은 자연히 음수가 된다.
 * `@@unique([leagueId, number])` 라 번호가 서로 달라야 하는데 이 방식이 제일 덜 건드린다.
 */
export const SEASON_WINDOWS: readonly SeasonWindow[] = [
  {
    number: -2,
    seasonType: 'legacy',
    label: '이전 기록',
    /* 우리 기록의 맨 처음(2024-05-24)보다 앞이면 된다 */
    startedAt: new Date('2020-01-01T00:00:00+09:00'),
    endedAt: new Date('2026-03-05T00:00:00+09:00'),
  },
  {
    number: -1,
    seasonType: 'beta',
    label: 'Beta',
    startedAt: new Date('2026-03-05T00:00:00+09:00'),
    endedAt: new Date('2026-07-02T00:00:00+09:00'),
  },
  {
    number: 0,
    seasonType: 'official',
    label: '시즌 0',
    startedAt: new Date('2026-07-02T00:00:00+09:00'),
    endedAt: new Date('2026-10-01T00:00:00+09:00'),
  },
  {
    number: 1,
    seasonType: 'official',
    label: '시즌 1',
    startedAt: new Date('2026-10-01T00:00:00+09:00'),
    endedAt: null,
  },
]

/**
 * ★「작년건 버려라」를 어떻게 읽었나★ — 되돌릴 수 있게 적어 둔다.
 *
 * A 가 «2025-12 에 218건이 있는데 어떻게 할까요» 라고 여쭈었고 사장님이
 * «**작년건 버려라**» 라고 답하셨다.
 *
 * ⚠ ★그런데 그 「218건」이 틀린 숫자였다.★ 실제 2025-12 는 **13,993건**이고,
 *   「작년(2025 이하)」을 그대로 적용하면 **289,435건 = 전체의 75%** 다.
 *   ★사장님이 75%를 버리라고 하신 것으로 읽을 수 없다.★
 *
 * → 그래서 **「Beta 창을 뒤로 늘려 그것들까지 넣지는 마라」** 로 읽고,
 *   그 경기들은 **`legacy` 로 표시**한다. ★데이터를 지우지 않는다★ (`CLAUDE.md` 1-4).
 *   스키마 주석도 legacy 를 「이전된 과거 기록 · 재계산하지 않는다」로 정의한다.
 *
 * ⚠ 사장님이 「진짜 지우라는 뜻이었다」고 하시면 ★이 상수의 첫 항목만 빼면 된다.★
 */
export const LEGACY_MEANS_LABEL_NOT_DELETE = true

/** 그 시각이 어느 시즌 창에 드는가. 어디에도 안 들면 `null` */
export function seasonWindowAt(at: Date): SeasonWindow | null {
  for (const w of SEASON_WINDOWS) {
    if (at >= w.startedAt && (w.endedAt === null || at < w.endedAt)) return w
  }
  return null
}
