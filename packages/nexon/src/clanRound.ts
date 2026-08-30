/**
 * 클랜 지표 — **배틀로그로만 잴 수 있는 것들** (`docs/SITE_SPEC_V2.md` 5-5절).
 *
 * 순수 함수만 있다. DB 도 네트워크도 모른다. `roundState.ts` · `roundSide.ts` 의 형제 모듈이다.
 *
 * ── 무엇을 재나 (사양 원문)
 *
 *     블루방어율   "평균적으로 블루 5라운드중 1.7라운드를 허용"
 *     어택성공률   "평균적으로 레드 5라운드중 2.6라운드를 따고 폭탄설치 1.4번 성공"
 *     조직력       "레드 라운드 시작 후 레드팀 선수들이 평균 30초가 넘는 시간 동안
 *                   아무도 죽지 않은 횟수"
 *     폭발력       "레드선수들이 2초 이하 간격으로 3명 이상 제거한 횟수"
 *     게임템포     "레드일 때 라운드가 빨리 끝날수록 템포 높음"
 *     소수싸움     "839회중 432회 승리 n%"
 *
 *   앞의 다섯은 전부 **진영(레드=공격 / 블루=수비)** 을 알아야 시작된다. 그런데 `Match` 의
 *   red/blue 클랜은 경기 단위 값이라 라운드별 진영이 아니다 — 그래서 폭탄 이벤트로
 *   되짚는다 (`roundSide.ts` · D-184).
 *
 *   **소수싸움만 진영을 안 본다.** 숫자가 밀리는 것은 공격이든 수비든 똑같이 일어난다.
 *   그래서 `switchRound` 가 `null` 인 경기에서도 셀 수 있고, 표본이 나머지 다섯보다
 *   훨씬 두껍다 (`outnumberedRounds` 주석 참조).
 *
 * ── 모르는 라운드는 **분모에도 넣지 않는다** (D-106)
 *   진영을 모르는 라운드가 실제로 많다. 폭탄이 한 번도 안 터진 경기는 진영을 통째로
 *   모르고, 교대 지점을 좁히지 못한 구간도 비어 있다. 그런 라운드를 "아마 수비였겠지"
 *   로 채우면 다섯 지표가 전부 조용히 거짓이 된다.
 *
 *   그래서 이 모듈은 **분자와 분모를 따로 돌려준다.** 비율은 부르는 쪽이 만든다
 *   (`per5()`). 분모가 0 이면 비율은 `null` 이고, 화면에서는 `측정중` 이다.
 *   **0% 가 아니다.**
 *
 * ── 진영을 아는 라운드가 **골라진 표본**일 수 있다 (실측으로 확인했다)
 *   폭탄 근거가 설치 한쪽뿐이면 교대 지점을 못 찾고, 그러면 진영을 아는 라운드가
 *   **폭탄이 터진 라운드 그 자체**뿐이다. 그 라운드들은 당연히 설치 성공률 100% 이고
 *   승률도 높다 — 재려는 것이 표본을 고르는 셈이라 값이 통째로 부풀어 오른다.
 *
 *   실측(2026-08-30 · 클랜 배틀로그 2,459경기 · 클랜-경기 2,770건):
 *   ```
 *                        전체        교대를 본 경기만
 *   폭탄설치 (5라운드중)   4.0번   →   실제 값은 이쪽에서 봐야 한다
 *   ```
 *   그래서 `switchRound` 를 함께 돌려준다. **`null` 인 경기는 쓰지 마라.**
 *
 * ── 시각은 전부 **근사**다
 *   `event_time` 은 경기 전체 누적이고(D-174), 넥슨은 **라운드 시작 시각을 주지 않는다.**
 *   그래서 라운드 시작을 그 라운드의 **첫 이벤트 시각**으로 삼는다.
 *   실제 시작(스폰·구매 시간)은 그보다 앞이므로 우리가 재는 구간은 항상 **실제보다 짧다**.
 *   조직력(30초 넘게 안 죽었나)은 그만큼 **적게** 세는 쪽으로 틀린다 — D-106 이 허용하는
 *   방향이다. 반대로 부풀지는 않는다.
 */
import {
  roundStatesOf,
  secondsOf,
  isRestorable,
  rosterOf,
  type RoundDeath,
  type RoundStateEvent,
} from './roundState'
import { bombEvidenceOf, roundSidesOf, type RoundSideEvent, type RoundSide } from './roundSide'

/** 이 모듈이 보는 칸 — 라운드 복원과 진영 판정에 쓰는 것을 합친 것이다 */
export interface ClanRoundEvent extends RoundStateEvent, RoundSideEvent {}

/**
 * 조직력 기준 — **넘어야** 센다. 정확히 30초는 세지 않는다 (사양 원문 "30초가 넘는").
 */
export const ORGANIZED_SECONDS = 30

/** 폭발력 — 연속 제거 사이 간격이 **이하**여야 이어진다 (사양 원문 "2초 이하 간격") */
export const BURST_GAP_SECONDS = 2

/** 폭발력 — 이어진 제거가 이만큼 **이상**이어야 한 번으로 센다 (사양 원문 "3명 이상") */
export const BURST_MIN_KILLS = 3

const num = (value: unknown): number | null => {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  if (text === '') return null
  const n = Number(text)
  return Number.isInteger(n) && n >= 1 ? n : null
}

/** 한 라운드에서 관측된 시각의 처음과 끝 */
interface RoundClock {
  /** 그 라운드 첫 이벤트 시각 — **라운드 시작의 근사값이다** */
  first: number
  /** 그 라운드 마지막 이벤트 시각 */
  last: number
}

/**
 * 라운드마다 처음·마지막 이벤트 시각.
 *
 * 죽음만 보지 않는다 — 폭탄 줄도 그 라운드에 사람이 움직인 증거다.
 * 시각을 못 읽는 줄은 버린다. **0 으로 만들지 않는다** (`secondsOf` 참조).
 */
export function roundClocksOf(events: readonly ClanRoundEvent[]): Map<number, RoundClock> {
  const out = new Map<number, RoundClock>()
  for (const event of events) {
    const round = num(event.round)
    const at = secondsOf(event.event_time)
    if (round === null || at === null) continue
    const seen = out.get(round)
    if (seen === undefined) out.set(round, { first: at, last: at })
    else {
      if (at < seen.first) seen.first = at
      if (at > seen.last) seen.last = at
    }
  }
  return out
}

/**
 * 이어진 제거를 **한 번**으로 세어 폭발력을 만든다.
 *
 * `00:41 → 00:42 → 00:44` 는 간격이 1초·2초라 셋이 이어진다 — **한 번**이다 (사양 원문 예시).
 * 다섯이 이어져도 한 번이다. "3명 이상 제거한 횟수" 이지 "3명 조합의 수" 가 아니다.
 *
 * 시각은 오름차순으로 들어와야 한다. 같은 초에 둘이 죽으면 간격 0 이라 이어진다.
 */
export function burstCountOf(times: readonly number[]): number {
  if (times.length < BURST_MIN_KILLS) return 0
  let bursts = 0
  let chain = 1
  for (let i = 1; i < times.length; i += 1) {
    const gap = (times[i] as number) - (times[i - 1] as number)
    if (gap <= BURST_GAP_SECONDS) {
      chain += 1
      continue
    }
    if (chain >= BURST_MIN_KILLS) bursts += 1
    chain = 1
  }
  if (chain >= BURST_MIN_KILLS) bursts += 1
  return bursts
}

/**
 * **클랜 단위 소수싸움** — 이 라운드에서 우리 팀이 숫자에 밀린 적이 있었나.
 *
 * `roundStateOf` 가 준 **죽은 순서**로 생존자 수를 되짚는다. 양 팀 다섯에서 시작해
 * 죽을 때마다 하나씩 줄이고, **우리 생존자 < 상대 생존자** 가 되는 순간이 한 번이라도
 * 있었으면 `true` 다.
 *
 * > `[미확인]` 사양 원문은 `소수싸움:839회중 432회 승리 n%` 한 줄뿐이고 **무엇을 분모로
 * > 삼았는지 적혀 있지 않다.** 위 정의(숫자가 밀린 순간이 있었던 라운드)는 우리가 정한
 * > 것이고 **원본과 동일함이 검증되지 않았다** (`CLAUDE.md` 3장 7번). 실측에서 우리
 * > 정의의 승률은 28.6% 로, 원문 예시의 51.5% 보다 낮다 — 분모에 진 라운드가 거의
 * > 전부 들어오기 때문이다(질 때는 결국 전멸한다). 원문의 분모가 확인되면 이 함수와
 * > `clanRoundBuilderVersion` 을 함께 고친다.
 *
 * ── 왜 선수 단위(`roundTallyOf`)를 클랜별로 더하면 안 되나
 *   (a) 한 라운드에 우리 편이 둘 남으면 두 선수가 각각 그 라운드를 세어 **두 번** 세어진다
 *   (b) 선수를 **현재 소속** 클랜으로 조인해야 하는데, 그건 "경기 당시 소속" 원칙
 *       (`CLAUDE.md` 3-B 4번)에 어긋난다
 *   그래서 라운드 판정을 클랜 기준으로 새로 한다. 정의도 다르다 — 선수 축은
 *   `본인 포함 둘이 남았고 상대는 둘 이상` 이고, 이쪽은 **숫자가 밀린 모든 라운드**다.
 *
 * ── 판정할 수 없으면 `null` 이다. **`false` 로 밀지 않는다** (D-106)
 *   `false` 는 "겪었는데 안 밀렸다" 라는 실제 관측이고, 지금은 "셀 수 없다" 이다.
 *   `null` 이 되는 경우는 둘이다.
 *
 *     · 우리·상대가 아닌 **제3의 팀** 번호가 섞였다 (응답이 어긋났다)
 *     · 팀 인원보다 많이 죽었다 (같은 사람이 두 번 죽은 응답)
 *     · 같은 초에 양쪽이 죽어 **순서에 따라 답이 갈린다**
 *
 *   마지막이 핵심이다. `event_time` 은 `MM:SS` 라 초 단위이고, 우리 한 명과 상대 한 명이
 *   같은 초에 죽으면 누가 먼저인지 모른다. 우리가 먼저면 그 찰나에 숫자가 밀린 것이고,
 *   상대가 먼저면 안 밀린 것이다. 모르는 것을 어느 쪽으로도 밀지 않고 라운드를 버린다
 *   (`roundTallyOf` 가 같은 자리에서 같은 판단을 한다).
 *
 *   같은 초 묶음의 **끝**에서 이미 밀렸으면 순서와 무관하게 밀린 것이므로 그때는
 *   `true` 다. 애매한 것은 "끝에서는 안 밀렸는데 우리가 먼저 죽는 순서라면 밀렸을"
 *   경우뿐이다.
 *
 * `deaths` 는 시각 오름차순이어야 한다 — `roundStatesOf` 가 그렇게 준다.
 */
export function outnumberedRound(input: {
  deaths: readonly RoundDeath[]
  /** 우리 `team_no` */
  ourTeam: string
  /** 상대 `team_no` */
  foeTeam: string
  teamSize: number
}): boolean | null {
  let ours = input.teamSize
  let foes = input.teamSize

  let i = 0
  while (i < input.deaths.length) {
    const at = (input.deaths[i] as RoundDeath).at
    /* 같은 초에 죽은 사람들을 한 묶음으로 본다 — 그 안의 순서는 모른다 */
    let mine = 0
    let theirs = 0
    while (i < input.deaths.length && (input.deaths[i] as RoundDeath).at === at) {
      const team = (input.deaths[i] as RoundDeath).team
      if (team === input.ourTeam) mine += 1
      else if (team === input.foeTeam) theirs += 1
      else return null
      i += 1
    }
    /* 인원보다 많이 죽었다 = 응답이 어긋났다 */
    if (mine > ours || theirs > foes) return null

    /* 우리가 먼저 다 죽는 순서를 가정한 최악값. 양쪽이 같은 초에 죽었을 때만 뜻이 있다 */
    const ambiguous = mine > 0 && theirs > 0 && ours - mine < foes

    ours -= mine
    foes -= theirs

    /* 묶음 끝에서 밀렸으면 **순서와 무관하게** 밀린 것이다 */
    if (ours < foes) return true
    if (ambiguous) return null
  }
  return false
}

/** 한 경기에서 그 클랜의 지표 재료 */
export interface ClanRoundTally {
  /** 이벤트로 확인된 라운드 수 (진영을 몰라도 센다) */
  rounds: number
  /** 그중 진영을 **아는** 라운드 수. `rounds` 와의 차이가 못 잰 몫이다 */
  sidedRounds: number
  /** 진영 근거가 서로 어긋난 경기인가 — 그러면 진영을 하나도 확정하지 않는다 */
  sideConflict: boolean
  /**
   * 진영이 바뀐 첫 라운드. **`null` 이면 교대를 못 봤다.**
   *
   * ⚠ **이 값이 `null` 인 경기는 지표에 쓰면 안 된다.** 교대를 못 보면 진영을 아는
   * 라운드가 **폭탄이 터진 라운드 그 자체**뿐이라, 표본이 근거와 같아진다.
   *
   *   · 설치 근거만 있으면 → 아는 라운드가 전부 "우리가 심은 공격 라운드" 다
   *   · 폭탄을 심으면 대개 이긴다 → 어택성공률이 통째로 부풀어 오른다
   *   · 설치율은 아예 **정의상 100%** 에 가까워진다
   *
   * 실측(2026-08-30 · 클랜-경기 2,770건)에서 이 편향이 그대로 나왔다 —
   * 전체로 재면 설치가 5라운드중 4.0번(79%)이었다. 사양의 실제 값은 1.4번이다.
   * 교대를 본 경기만 골라 재야 한다.
   */
  switchRound: number | null

  /* 1 블루방어율 — 수비 라운드 중 내준 비율 */
  /** 진영=수비이고 **승패까지 아는** 라운드 (분모) */
  defenseRounds: number
  /** 그중 내준 라운드 (분자) */
  defenseConceded: number

  /* 2 어택성공률 — 공격 라운드 중 딴 비율 + 라운드당 폭탄 설치 */
  /** 진영=공격이고 **승패까지 아는** 라운드 (분모) */
  attackRounds: number
  /** 그중 딴 라운드 (분자) */
  attackWon: number
  /** 진영=공격인 라운드 전체 — 설치·조직력·폭발력·템포의 분모 재료다 */
  attackSideRounds: number
  /** 그중 우리 팀이 폭탄을 **심은** 라운드 수 (분자) */
  plantRounds: number

  /* 3 조직력 — 공격 라운드 시작 후 30초 넘게 아무도 안 죽음 */
  /** 잴 수 있었던 공격 라운드 (분모). **5대5가 확인된 경기에서만 잰다** */
  organizedRounds: number
  /** 그중 30초를 넘긴 라운드 (분자) */
  organizedHeld: number
  /**
   * 공격 라운드마다 **버틴 시간** (초) — `organizedHeld` 를 만든 원재료다.
   *
   * 라운드 시작(근사)부터 우리 팀 첫 죽음까지, 아무도 안 죽었으면 관측 구간 전체다.
   * 기준(30초)을 나중에 바꿀 때 **다시 수집하지 않아도 되게** 값을 그대로 남긴다.
   *
   * ⚠ 라운드 첫 이벤트가 이미 우리 쪽 죽음이면 `0` 이 된다. 그 라운드의 실제
   * "안 죽고 버틴 시간" 은 첫 이벤트 이전이라 **원리적으로 못 잰다** — 넥슨이
   * 라운드 시작 시각을 주지 않는다. 그래서 이 축은 **적게** 세는 쪽으로 틀린다.
   */
  holdSeconds: number[]

  /* 4 폭발력 — 2초 이하 간격 3연속 제거 */
  /** 잴 수 있었던 공격 라운드 (분모) */
  burstRounds: number
  /** 그 안에서 일어난 연속 제거 횟수 (분자). 라운드당 두 번일 수도 있다 */
  bursts: number

  /* 5 게임템포 — 라운드가 빨리 끝날수록 높다 */
  /**
   * 공격 라운드의 **관측 구간** (마지막 이벤트 − 첫 이벤트), 초.
   *
   * 실제 라운드 길이의 **하한**이다. 이벤트가 하나뿐인 라운드는 `0` 이 된다 —
   * 그런 라운드도 버리지 않고 담는다. 버리면 빨리 끝난 라운드만 빠져
   * 중앙값이 통째로 위로 밀린다.
   */
  roundSpans: number[]
  /**
   * 공격 라운드의 **다음 라운드까지 간격** (다음 라운드 첫 이벤트 − 이 라운드 첫 이벤트), 초.
   *
   * 실제 라운드 길이의 **상한**이다 — 라운드 사이 대기시간이 함께 들어간다.
   * 대신 이벤트가 하나뿐인 라운드도 0 이 되지 않아, `roundSpans` 의 약점을 메운다.
   * 라운드 번호가 연속인 경우에만 담는다. 마지막 라운드는 담기지 않는다.
   *
   * 어느 쪽을 쓸지는 **화면이 정한다** — 둘 다 돌려주는 이유다.
   */
  roundGaps: number[]

  /* 6 소수싸움 — 숫자가 밀린 라운드를 얼마나 이겨 냈나 (사양 원문 `839회중 432회 승리`) */
  /**
   * 우리 생존자가 상대보다 적어진 순간이 있었고 **승패까지 아는** 라운드 (분모).
   *
   * ⚠ **진영을 보지 않는다.** 위의 다섯 축은 진영을 아는 라운드만 세지만 이 축은
   * 모든 라운드를 센다 — 숫자가 밀리는 것은 공격이든 수비든 똑같이 일어난다.
   * 그래서 `switchRound` 가 `null` 인 경기에서도 세어지고, **표본이 다섯 축보다
   * 훨씬 두껍다.** 화면에서 `수비 109라운드` 옆에 `소수싸움 839회` 가 나란히 서도
   * 어긋난 것이 아니다.
   *
   * 대신 **5대5가 확인된 경기에서만** 잰다. 이벤트가 한 명분이라도 빠지면 그 사람이
   * 계속 살아 있는 것이 되어, 밀린 라운드를 **안 밀린 것으로** 만든다. 조직력과 같은
   * 이유로 `isRestorable` 을 건다.
   */
  outnumberedRounds: number
  /** 그중 이긴 라운드 (분자) */
  outnumberedWon: number
}

const EMPTY: ClanRoundTally = {
  rounds: 0,
  sidedRounds: 0,
  sideConflict: false,
  switchRound: null,
  defenseRounds: 0,
  defenseConceded: 0,
  attackRounds: 0,
  attackWon: 0,
  attackSideRounds: 0,
  plantRounds: 0,
  organizedRounds: 0,
  organizedHeld: 0,
  holdSeconds: [],
  burstRounds: 0,
  bursts: 0,
  roundSpans: [],
  roundGaps: [],
  outnumberedRounds: 0,
  outnumberedWon: 0,
}

/**
 * 한 경기에서 **그 클랜**의 다섯 지표 재료를 센다.
 *
 * `teamNo` 는 클랜 응답의 `team_no` 다 — **진영이 아니다** (D-184). 진영은 폭탄으로 정한다.
 * `wonRound` 는 그 라운드를 **그 클랜이** 이겼는지 돌려주는 함수다. 모르면 `null` 을 주면
 * 되고, 그 라운드는 승패가 걸린 분모(`defenseRounds` · `attackRounds`)에서 빠진다.
 * 설치·조직력·폭발력·템포는 승패를 안 보므로 그대로 센다.
 *
 * 라운드를 하나도 못 읽으면 `null` 이다. **0 을 돌려주지 않는다** — 0회는 "겪었는데
 * 없었다" 이고 지금은 "셀 수 없다" 이다 (D-106).
 *
 * ── 조직력과 소수싸움만 `isRestorable` 을 건다
 *   이벤트가 한 명분이라도 빠지면 "아무도 안 죽었다" 가 **거짓으로 참이 된다** —
 *   없는 조직력이 만들어진다. 소수싸움도 같다: 빠진 사람이 계속 살아 있는 것이 되어
 *   밀린 라운드가 안 밀린 것으로 보인다. 그래서 양 팀 인원이 정확히 `teamSize` 명
 *   확인된 경기에서만 센다. 나머지 넷은 빠진 이벤트가 값을 **낮추는** 쪽으로만 틀리므로
 *   (딴 라운드가 줄고 · 연속 제거가 끊기고 · 구간이 짧아진다) 굳이 표본을 버리지 않는다.
 *
 * ── 소수싸움은 진영을 안 본다
 *   그래서 진영을 모르는 라운드에서도 세어진다. 아래 루프에서 **진영 검사보다 먼저**
 *   세는 이유다 (`outnumberedRounds` 주석).
 */
export function clanRoundTallyOf(input: {
  events: readonly ClanRoundEvent[]
  /** 그 클랜의 `team_no` */
  teamNo: string
  teamSize: number
  wonRound: (round: number) => boolean | null
}): ClanRoundTally | null {
  const clocks = roundClocksOf(input.events)
  if (clocks.size === 0) return null

  const roundNumbers = [...clocks.keys()].sort((a, b) => a - b)
  const totalRounds = roundNumbers[roundNumbers.length - 1] as number

  /* 승패를 함께 넘긴다 — 5승 규칙이 교대 지점을 좁힌다 (D-208). 방향은 여전히 폭탄이 정한다 */
  const sides = roundSidesOf(input.events, input.teamNo, totalRounds, input.wonRound)
  const sideOf = (round: number): RoundSide | undefined => sides.side.get(round)

  const states = roundStatesOf(input.events)
  const roster = rosterOf(input.events)
  const restorable = isRestorable(roster, input.teamSize)
  /* 소수싸움은 상대 팀 번호를 알아야 센다. 우리 팀이 명단에 없으면 아예 못 잰다 */
  const foeTeam = roster.teams.includes(input.teamNo)
    ? (roster.teams.find((team) => team !== input.teamNo) ?? null)
    : null

  /* 우리 팀이 폭탄을 심은 라운드. 같은 설치가 두 줄로(또는 양 클랜 응답으로) 올 수 있어
     **라운드 단위로 접는다** — 그러지 않으면 "라운드당 설치 수" 가 부풀어 오른다.
     한 라운드에 설치는 한 번뿐이므로 접어도 잃는 것이 없다 */
  const plantedRounds = new Set<number>()
  for (const row of bombEvidenceOf(input.events)) {
    if (row.team !== input.teamNo || row.action !== 'install') continue
    plantedRounds.add(row.round)
  }

  const tally: ClanRoundTally = { ...EMPTY, holdSeconds: [], roundSpans: [], roundGaps: [] }
  tally.rounds = clocks.size
  tally.sideConflict = sides.conflict
  tally.switchRound = sides.switchRound

  for (let i = 0; i < roundNumbers.length; i += 1) {
    const round = roundNumbers[i] as number
    const clock = clocks.get(round) as RoundClock
    const won = input.wonRound(round)
    const deaths = states.get(round)?.deaths ?? []

    /* ───────── 소수싸움 — **진영을 보지 않는다** ─────────
       공격이든 수비든 숫자는 똑같이 밀린다. 그래서 진영 검사 **위**에 둔다.
       승패를 모르면 분모에서도 뺀다 — 이긴 쪽으로도 진 쪽으로도 밀지 않는다 (D-106) */
    if (restorable && foeTeam !== null && won !== null) {
      const pushed = outnumberedRound({
        deaths,
        ourTeam: input.teamNo,
        foeTeam,
        teamSize: input.teamSize,
      })
      if (pushed === true) {
        tally.outnumberedRounds += 1
        if (won) tally.outnumberedWon += 1
      }
    }

    const side = sideOf(round)
    /* 진영을 모르는 라운드는 **분모에도 넣지 않는다** */
    if (side === undefined) continue
    tally.sidedRounds += 1

    if (side === 'defense') {
      if (won === null) continue
      tally.defenseRounds += 1
      if (!won) tally.defenseConceded += 1
      continue
    }

    /* ───────── 여기부터 공격(레드) 라운드다 ───────── */
    tally.attackSideRounds += 1
    if (plantedRounds.has(round)) tally.plantRounds += 1

    if (won !== null) {
      tally.attackRounds += 1
      if (won) tally.attackWon += 1
    }

    /* 조직력 — 라운드 시작(근사)부터 **우리 팀 첫 죽음**까지가 30초를 넘었나.
       아무도 안 죽었으면 라운드 끝까지 버틴 것이므로 관측 구간 전체를 쓴다 */
    if (restorable) {
      tally.organizedRounds += 1
      const firstOwnDeath = deaths.find((death) => death.team === input.teamNo)
      const heldUntil = firstOwnDeath === undefined ? clock.last : firstOwnDeath.at
      const held = heldUntil - clock.first
      tally.holdSeconds.push(held)
      if (held > ORGANIZED_SECONDS) tally.organizedHeld += 1
    }

    /* 폭발력 — 우리 팀이 제거한 시각들. 상대 팀의 죽음이 곧 우리 킬이다.
       `roundStatesOf` 가 이미 중복 줄을 접고 시각순으로 정렬해 두었다.
       (`killsOf` 를 쓰지 않는 이유: `KillRecord` 에 **시각이 없다**) */
    tally.burstRounds += 1
    const foeDeaths = deaths.filter((death) => death.team !== input.teamNo).map((death) => death.at)
    tally.bursts += burstCountOf(foeDeaths)

    /* 게임템포 */
    tally.roundSpans.push(clock.last - clock.first)
    const next = roundNumbers[i + 1]
    if (next === round + 1) {
      const nextClock = clocks.get(next) as RoundClock
      tally.roundGaps.push(nextClock.first - clock.first)
    }
  }

  return tally
}

/* -------------------------------------------------------------------------- */
/* 비율 만들기 — 분모가 0 이면 `null` 이다                                        */
/* -------------------------------------------------------------------------- */

/**
 * 사양의 표기법 — **"5라운드중 1.7라운드"**.
 *
 * 분모가 0 이면 `null` 이다. **0 을 돌려주지 않는다** (D-106) — 0.0라운드는
 * "한 번도 안 내줬다" 라는 뜻이 되어 못 잰 클랜이 최고 성적으로 보인다.
 */
export function per5(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null
  return (numerator / denominator) * 5
}

/** 단순 비율. 분모가 0 이면 `null` 이다 */
export function rateOf(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null
  return numerator / denominator
}

export interface TempoSummary {
  /** 표본 수 */
  n: number
  /**
   * 중앙값 — **우리 안이다.** 한 라운드가 늘어져도 통째로 끌려가지 않는다.
   * 짝수 개면 가운데 둘의 평균이다
   */
  median: number
  /** 평균 — 비교용으로 같이 준다. 어느 쪽을 쓸지는 화면이 정한다 */
  mean: number
}

/**
 * 게임템포 — 라운드 길이의 **중앙값과 평균을 둘 다** 돌려준다.
 *
 * 여러 경기의 값을 합쳐 재려면 각 경기의 `roundSpans`(또는 `roundGaps`)를 **이어붙여서**
 * 여기에 넣어야 한다. **중앙값의 평균은 중앙값이 아니다.**
 *
 * 표본이 없으면 `null` 이다.
 */
export function tempoOf(seconds: readonly number[]): TempoSummary | null {
  if (seconds.length === 0) return null
  const sorted = [...seconds].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const median =
    sorted.length % 2 === 1
      ? (sorted[mid] as number)
      : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length
  return { n: sorted.length, median, mean }
}
