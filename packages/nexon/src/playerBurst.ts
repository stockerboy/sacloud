/**
 * **연속킬** — 선수 육각형 5번 축의 재료 (D-260).
 *
 * ```
 * 연속킬 = 2초 이내 연쇄가 한 번이라도 있었던 라운드 수  /  킬을 낸 라운드 수
 * ```
 *
 * 읽는 법은 **"내가 킬을 낸 라운드 중 몇 %에서 몰아쳤나"** 다.
 *
 * ── ⚠ **정정 (2026-09-02) — 분모가 바뀌었다. 사용자가 고른 값이다**
 *
 *   이 파일의 첫 판은 분모가 **총 킬**이었고 (`chained / kills`), 그 근거도 아래에
 *   적혀 있었다. **근거 자체는 합리적이다. 그런데 사용자가 다른 것을 골랐다.**
 *
 *   후보 셋을 숫자와 함께 보였고 사용자가 답한 것은 **(c)** 다:
 *   ```
 *   (a) 전체 킬 중 몇 %가 연속킬이었나        ← 첫 판이 쓰던 것
 *   (b) 라운드당 연속킬 횟수
 *   (c) 연속킬을 한 번이라도 낸 라운드 비율    ← ★사용자 확정★
 *   ```
 *   `memory/hexagon-axis-formulas.md` 에도 (c) 로 박혀 있다.
 *   **우리가 대신 정하지 않는다** (`CLAUDE.md` 3장 7번).
 *
 *   ⚠ 그리고 첫 판의 저장값으로는 **(c) 를 만들 수 없었다.** `multiKillRounds` 는
 *   *시간과 무관하게* 2킬 이상인 라운드라 다른 지표다 — 두 값의 순위상관이 **0.419** 로
 *   실측됐다. 대신 쓸 수 없어서 `burstRounds` 칸을 새로 만든다.
 *
 *   **(a) 는 지우지 않았다** — `chained` · `kills` 를 그대로 세고 저장한다.
 *   되돌아갈 때 재집계가 필요 없어야 한다 (`CLAUDE.md` 10-4).
 *
 *   <아래는 첫 판의 서술이다. 지우지 않는다>
 *   > 분모(총 킬)와 창(2초)은 우리가 고른 값이고 **원본과 동일함이 검증되지 않았다.**
 *   >
 *   > ── 왜 분모가 **총 킬**인가
 *   >   `킬을 낸 라운드 수` 로 하면 라운드당 1킬만 내는 선수가 **항상 0** 이 되고,
 *   >   `뛴 라운드 수` 로 하면 킬을 많이 낸 사람이 유리해진다. 총 킬이 가장 곧게 읽힌다.
 *
 *   ⚠ 그 「항상 0」 걱정은 **(c) 에서도 그대로 성립한다** — 라운드당 1킬만 내는 선수는
 *   연쇄가 생길 수 없어 0 이 된다. 그것이 (c) 의 성질이고, 사용자가 알고 고른 것으로 본다.
 *   다만 **0 은 「겪었는데 한 번도 못 했다」라는 실제 관측**이라 `null` 로 바꾸지 않는다 (D-106).
 *
 * ── 분모가 `killRounds` 인가 `뛴 라운드` 인가 — **`[미확인]`**
 *   사용자는 「연속킬을 한 번이라도 낸 라운드 비율」이라고만 했다. 분모가
 *   **킬을 낸 라운드**인지 **뛴 라운드 전부**인지는 말하지 않았다.
 *   (c) 의 자연스러운 읽기인 **`burstRounds / killRounds`** 를 기본으로 하고,
 *   `killRounds` 를 그대로 저장해 두어 나중에 바꿀 수 있게 한다.
 *   ⚠ 「뛴 라운드」로 가려면 그 값이 이 함수에 없다 — 부르는 쪽이 갖고 있다.
 *
 * ── 후자(「라운드당 2명」)도 **함께 센다**
 *   사용자가 *"전자와 후자를 구분할 수 있으면 진짜 ㄱㅊ은 정보긴함"* 이라고 했다.
 *   `multiKillRounds` / `killRounds` 가 그 값이다. 지금 화면은 쓰지 않지만,
 *   담아 두면 **재빌드 없이** 정의를 바꿀 수 있다 — `clanHexV2.ts` 의 `TradeTally` 가
 *   창 넷을 다 저장하는 것과 같은 이유다.
 *
 * ── 왜 `killsOf()` 를 쓰지 않는가
 *   `duel.ts` 의 `KillRecord` 는 **시각을 버린다** — 구역·무기 판정에는 시각이 필요
 *   없었다. 여기서는 시각이 곧 판정 기준이라, `openingKillsOf()` 와 같은 방식으로
 *   시각을 살린 채 다시 센다 (`roundState.ts` 의 같은 주석 참조).
 *
 * ── 사슬은 **같은 라운드 안에서만** 이어진다
 *   `event_time` 은 경기 전체 누적이다 (D-174). 라운드를 안 보면 라운드가 끝나고
 *   다음 라운드 첫 킬이 2초 안에 들어와 **연속킬로 둔갑한다.**
 *
 * ── 같은 죽음이 두 줄로 온다
 *   양 클랜의 응답을 합치면 한 죽음이 두 번 실린다. `event_time` 이 1초 어긋나 오는 일도
 *   실제로 있어서 `event_time` 만으로는 못 지운다. `openingKillsOf()` 와 같은 규칙을 쓴다 —
 *   **한 라운드에서 한 사람은 한 번만 죽는다.** 가장 이른 줄만 남긴다.
 */
import { BURST_GAP_SECONDS } from './clanRound'
import { secondsOf, type RoundStateEvent } from './roundState'

/**
 * 예비 창 — **지금 화면은 쓰지 않는다.**
 *
 * 2초가 너무 좁거나 넓다고 판명되면 이 값으로 갈아탄다. 함께 저장해 두는 이유는
 * 그때 **집계를 다시 돌리지 않기 위해서**다 (`clanHexV2.ts` `TradeTally` 와 같은 뜻).
 */
export const BURST_GAP_SECONDS_WIDE = 5

/** 한 라운드에서 몇 킬부터 「여러 명 잡은 라운드」로 세는가 — 후자 정의의 기준 */
export const BURST_MULTI_KILL_MIN = 2

const str = (value: unknown): string | null => {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  return text === '' ? null : text
}

const roundOf = (value: unknown): number | null => {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  if (text === '') return null
  const n = Number(text)
  return Number.isInteger(n) && n >= 1 ? n : null
}

/**
 * 한 선수의 연속킬 재료.
 *
 * **지금 축이 쓰는 것은 `burstRounds / killRounds` 다** (사용자 확정 (c) · 2026-09-02).
 * 나머지 칸은 다른 해석으로 갈아탈 때 **재집계 없이** 쓰려고 함께 담는다.
 */
export interface BurstTally {
  /** 그 선수가 킬을 낸 라운드 수 — **지금 분모다** */
  killRounds: number
  /**
   * **지금 분자** — 그 라운드에 `BURST_GAP_SECONDS`(2초) 이하 연쇄가
   * **한 번이라도** 있었던 라운드 수.
   *
   * ⚠ 한 라운드에 연쇄가 여러 번 있어도 **1 만 오른다.** 「라운드 비율」이기 때문이다.
   *   연쇄 횟수를 세는 것은 `chained` 쪽이다.
   *
   * ⚠ `ClanRoundProfile.burstRounds` 와 **이름은 같지만 다른 값이다.**
   *   그쪽은 클랜 단위 「몰아치기 라운드」이고 이쪽은 **선수 한 명**의 것이다.
   */
  burstRounds: number
  /** 창을 5초로 넓혔을 때의 같은 값. **지금은 안 쓴다** — 창을 바꿔도 재집계가 없게 */
  burstRoundsWide: number

  /* ── 아래 넷은 **옛 해석 (a)·(b) 의 재료다. 지우지 않는다** (`CLAUDE.md` 10-4) ── */
  /** (a) 의 분모 — 시각과 라운드를 아는 그 선수의 킬 수 */
  kills: number
  /** (a) 의 분자 — 직전 킬과의 간격이 `BURST_GAP_SECONDS`(2초) **이하**인 킬 수 */
  chained: number
  /** (a) 를 5초 창으로 봤을 때의 분자 */
  chainedWide: number
  /**
   * 한 라운드에서 `BURST_MULTI_KILL_MIN`(2)킬 이상을 낸 라운드 수.
   *
   * ⚠ **`burstRounds` 의 대용이 아니다.** 이쪽은 **시간을 안 본다** — 라운드 처음과 끝에
   *   하나씩 잡아도 오른다. 두 값의 순위상관이 **0.419** 로 실측됐다. 섞어 쓰지 마라.
   */
  multiKillRounds: number
}

const zero = (): BurstTally => ({
  killRounds: 0,
  burstRounds: 0,
  burstRoundsWide: 0,
  kills: 0,
  chained: 0,
  chainedWide: 0,
  multiKillRounds: 0,
})

/**
 * 이벤트에서 **선수별** 연속킬 재료를 뽑는다.
 *
 * 라운드나 시각을 읽을 수 없는 줄은 **버린다** — 분모에도 넣지 않는다.
 * 사슬을 판정할 수 없는 킬을 분모에만 남기면 그 선수의 비율이 이유 없이 낮아진다 (D-106).
 *
 * 간격은 **이하**로 센다. `BURST_GAP_SECONDS` 주석의 사양 원문("2초 이하 간격")과 같다.
 * `event_time` 이 `MM:SS` 라 **1초 해상도**이므로 같은 초에 둘을 잡으면 간격 0 이라 이어진다.
 */
export function burstTalliesOf(events: readonly RoundStateEvent[]): Map<string, BurstTally> {
  /** round → victim → { at, killer } — 한 라운드에서 한 사람은 한 번만 죽는다 */
  const byRound = new Map<number, Map<string, { at: number; killer: string }>>()

  for (const event of events) {
    const round = roundOf(event.round)
    const at = secondsOf(event.event_time)
    if (round === null || at === null) continue

    /* 죽인 쪽이 주체인가 상대인가. 둘 다이거나 둘 다 아니면 읽을 수 없는 줄이다 */
    const subjectKilled = str(event.event_type) === 'kill'
    const targetKilled = str(event.target_event_type) === 'kill'
    if (subjectKilled === targetKilled) continue

    const killer = subjectKilled ? str(event.str_usn) : str(event.target_str_usn)
    const victim = subjectKilled ? str(event.target_str_usn) : str(event.str_usn)
    if (killer === null || victim === null) continue

    let perRound = byRound.get(round)
    if (perRound === undefined) {
      perRound = new Map()
      byRound.set(round, perRound)
    }
    const before = perRound.get(victim)
    if (before === undefined || at < before.at) perRound.set(victim, { at, killer })
  }

  const out = new Map<string, BurstTally>()

  for (const perRound of byRound.values()) {
    /* 이 라운드에서 killer 별 킬 시각 */
    const timesByKiller = new Map<string, number[]>()
    for (const { at, killer } of perRound.values()) {
      const times = timesByKiller.get(killer)
      if (times === undefined) timesByKiller.set(killer, [at])
      else times.push(at)
    }

    for (const [killer, times] of timesByKiller) {
      times.sort((a, b) => a - b)

      const tally = out.get(killer) ?? zero()
      tally.kills += times.length
      tally.killRounds += 1
      if (times.length >= BURST_MULTI_KILL_MIN) tally.multiKillRounds += 1

      /* 이 라운드에 연쇄가 **하나라도** 있었나 — 몇 번인지는 안 센다 (사용자 확정 (c)) */
      let chainedHere = false
      let chainedWideHere = false

      for (let i = 1; i < times.length; i += 1) {
        const gap = (times[i] as number) - (times[i - 1] as number)
        if (gap <= BURST_GAP_SECONDS) {
          tally.chained += 1
          chainedHere = true
        }
        if (gap <= BURST_GAP_SECONDS_WIDE) {
          tally.chainedWide += 1
          chainedWideHere = true
        }
      }

      /* **라운드당 1 만 오른다.** 한 라운드에 세 명을 연달아 잡아도 1 이다 */
      if (chainedHere) tally.burstRounds += 1
      if (chainedWideHere) tally.burstRoundsWide += 1

      out.set(killer, tally)
    }
  }

  return out
}
