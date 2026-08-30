/**
 * `티어별 게임빈도 + 천적` — 개인 기록 화면의 카드 (`docs/SITE_SPEC_V2.md` 4절).
 *
 * 사양 원문:
 *
 * ```
 * vs1티어 381판 승률:52.3% vuvuzela의 천적
 *   (천적조건:특정티어 클랜 상대로 50판이상 했는데 그 클랜 상대로 승률 70이상-천적)
 * vs2티어 209판 승률:60%   hardcores의 천적
 * vs3티어 6판 승률-10판이상 해야 알려줌
 * vs4티어 0판 승률-
 * ```
 *
 * **원본(3rd.supply)에 없는 화면이다.** 사용자가 요구한 새 기능이라
 * "원본과 동일함이 검증되지 않음" 이 이 파일 전체에 붙는다 (`CLAUDE.md` 3장 7번).
 *
 * ── 티어는 **경기 당시** 상대 클랜의 division 이다
 *   `MatchPlayerStat.opponentDivisionAtMatch` 를 쓴다. 지금의 division 을 쓰면
 *   상대가 승격·강등하는 순간 **이미 끝난 과거 경기의 티어가 통째로 바뀐다**
 *   (`CLAUDE.md` 3-B 4번이 래더 계산에 대해 말하는 것과 같은 이유다).
 *
 * ── 판수 0인 티어도 **줄은 남긴다**
 *   사양 원문이 `vs4티어 0판` 을 적었다. "그 티어와 한 번도 안 붙었다" 는 것도 정보다.
 *   줄을 지우면 그 사실이 화면에서 사라진다.
 *
 * ── 모르는 승률은 `null` 이다. **0 으로 채우지 않는다** (D-106)
 *   6판 2승 4패의 승률을 `33%` 라고 적으면 재 본 값처럼 읽힌다. 사양이
 *   "10판이상 해야 알려줌" 이라고 한 것은 **그 미만은 말하지 않는다**는 뜻이다.
 *   `winRate()` 는 `0승 0패` 에도 `0` 을 돌려주므로 여기서는 쓸 수 없다.
 */
import { winRate } from './derive'

/* -------------------------------------------------------------------------- */
/* 상수 — 사양 원문에서 온 값이다. 화면·서버·픽스처가 이 하나만 본다               */
/* -------------------------------------------------------------------------- */

/**
 * 승률을 보여 주는 **최소 판수**.
 *
 * > 원문: `vs3티어 6판 승률-10판이상 해야 알려줌`
 *
 * 미만이면 `win_rate` 는 `null` 이고 화면이 `—` 를 적는다. `0%` 가 아니다 (D-106).
 */
export const TIER_WIN_RATE_MIN_GAMES = 10

/**
 * 천적으로 부르는 **최소 판수** (그 티어의 **특정 클랜** 한 곳을 상대로).
 *
 * > 원문: `천적조건:특정티어 클랜 상대로 50판이상 했는데 그 클랜 상대로 승률 70이상-천적`
 *
 * 티어 전체 판수가 아니라 **클랜 단위**다. 1티어를 381판 했어도 그 안에서
 * 한 클랜을 50판 넘게 만나지 않았으면 천적은 없다.
 */
export const NEMESIS_MIN_GAMES = 50

/** 천적으로 부르는 **최소 승률 %**. 원문 `승률 70이상` — 경계값 70.0 은 포함이다 */
export const NEMESIS_MIN_WIN_RATE = 70

/**
 * 한 티어에 적는 천적의 **최대 개수**.
 *
 * > `[미확인]` 원문은 티어마다 천적을 하나씩만 적었고 개수 상한을 말하지 않았다.
 * 조건(50판·70%)을 넘는 클랜이 여럿일 수 있어 우리가 2개로 정했다 — 한 줄에
 * 클랜명이 셋 넘게 붙으면 판수·승률이 밀려 읽히지 않는다. 승률이 높은 쪽이 남는다.
 */
export const NEMESIS_MAX = 2

/* -------------------------------------------------------------------------- */
/* 입력 — 서버(Prisma)와 픽스처(mock)가 같은 모양으로 세어서 넘긴다                */
/* -------------------------------------------------------------------------- */

/** 한 티어 안에서 **상대 클랜 한 곳**과의 전적 */
export interface TierClanTally {
  /** 같은 클랜을 하나로 묶는 키 (서버는 `LeagueClan.id`) */
  key: string
  /** 화면 표기용 클랜명 */
  name: string
  /** 클랜 기록실로 가는 slug */
  slug: string
  games: number
  win: number
  lose: number
}

/** 한 티어의 합계 + 그 티어에서 만난 클랜들 */
export interface TierTally {
  /** 경기 당시 상대 클랜의 division */
  tier: number
  games: number
  win: number
  lose: number
  clans: readonly TierClanTally[]
}

/* -------------------------------------------------------------------------- */
/* 출력                                                                        */
/* -------------------------------------------------------------------------- */

export interface TierNemesis {
  name: string
  slug: string
  games: number
  win: number
  lose: number
  /** 그 클랜 상대 승률 %. 천적은 항상 `NEMESIS_MIN_GAMES` 판 이상이라 `null` 이 없다 */
  winRate: number
}

export interface TierBreakdownRow {
  tier: number
  games: number
  win: number
  lose: number
  /** `TIER_WIN_RATE_MIN_GAMES` 판 미만이면 `null` — 화면이 `—` 를 적는다 */
  winRate: number | null
  /** 조건을 넘은 클랜만. 없으면 **빈 배열**이다 */
  nemeses: TierNemesis[]
}

/* -------------------------------------------------------------------------- */
/* 판정                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * 판수가 모자라면 승률을 **내지 않는다**.
 *
 * `derive.ts` 의 `winRate()` 를 그대로 쓰지 않는 이유는 그것이 `0승 0패` 에도
 * `0` 을 돌려주기 때문이다. 여기서 필요한 것은 "못 잰다"(`null`)는 답이다.
 */
export function tierWinRateOrNull(games: number, win: number, lose: number): number | null {
  if (games < TIER_WIN_RATE_MIN_GAMES) return null
  /* 무승부가 없는 종목이라 `games === win + lose` 지만, 분모는 **판정된 판**으로
     명시해 둔다. 언젠가 무효 경기가 들어와도 승률의 뜻이 흔들리지 않는다 */
  if (win + lose === 0) return null
  return winRate(win, lose)
}

/**
 * 천적을 고른다 — **50판 이상 · 승률 70% 이상**, 승률 높은 순으로 최대 2개.
 *
 * 비교는 **화면에 적히는 값**(소수 1자리로 반올림한 승률)으로 한다.
 * 내부 정밀도로 판정하면 `69.96%` 를 `70%` 라 적어 놓고 천적이 아니라고 하는,
 * 화면의 두 숫자로는 설명되지 않는 결과가 나온다 (`todayPerformance.ts` 가
 * 같은 이유로 표시값끼리 뺀다).
 */
function nemesesOf(clans: readonly TierClanTally[]): TierNemesis[] {
  return clans
    .filter((clan) => clan.games >= NEMESIS_MIN_GAMES && clan.win + clan.lose > 0)
    .map((clan) => ({
      name: clan.name,
      slug: clan.slug,
      games: clan.games,
      win: clan.win,
      lose: clan.lose,
      winRate: winRate(clan.win, clan.lose),
    }))
    .filter((clan) => clan.winRate >= NEMESIS_MIN_WIN_RATE)
    /* 승률 → 판수 → 이름 순. 마지막 이름 비교는 **동점일 때 순서를 고정**하려는 것이다.
       고정하지 않으면 같은 데이터로 새로고침할 때마다 천적이 바뀌어 보인다 */
    .sort((a, b) => b.winRate - a.winRate || b.games - a.games || a.name.localeCompare(b.name))
    .slice(0, NEMESIS_MAX)
}

/**
 * 티어 줄을 만든다. 항상 **`divisionCount` 개**다.
 *
 * ── 왜 `divisionCount` 로 자르나
 *   리그가 2부리그까지면 화면에도 2줄만 있어야 한다. 사양이 "리그의 부리그 수만큼"
 *   이라고 정한 축이다.
 *
 *   > `[미확인]` 그래서 **리그가 축소된 뒤에 남은 옛 티어 경기는 어느 줄에도 안 들어간다.**
 *   > (예: 3부리그가 있던 시절의 경기가 남았는데 지금은 2부리그까지인 경우)
 *   > 원본에 해당 사례의 표기가 없어 확인하지 못했다. 지금은 **줄을 만들지 않는** 쪽을
 *   > 골랐다 — 없는 부리그 이름을 화면에 새로 만들어 내지 않기 위해서다.
 */
export function buildTierBreakdown(
  divisionCount: number,
  tallies: readonly TierTally[],
): TierBreakdownRow[] {
  const byTier = new Map(tallies.map((tally) => [tally.tier, tally]))
  const rows: TierBreakdownRow[] = []
  for (let tier = 1; tier <= divisionCount; tier += 1) {
    const tally = byTier.get(tier)
    if (!tally) {
      /* 한 판도 안 붙은 티어. **줄은 남긴다** — 원문이 `vs4티어 0판` 을 적었다 */
      rows.push({ tier, games: 0, win: 0, lose: 0, winRate: null, nemeses: [] })
      continue
    }
    rows.push({
      tier,
      games: tally.games,
      win: tally.win,
      lose: tally.lose,
      winRate: tierWinRateOrNull(tally.games, tally.win, tally.lose),
      nemeses: nemesesOf(tally.clans),
    })
  }
  return rows
}
