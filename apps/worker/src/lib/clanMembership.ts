/**
 * **경기 시각의 소속 클랜**을 소속 관측 이력에서 되짚는다 (D-219).
 *
 * ── 왜 이렇게 하나
 *   사용자가 못 박았다 — *"출전율 무관하게 그냥 당시에 클랜원이면 클랜원이다."*
 *   그러니 "많이 뛰었나" 가 아니라 **그 시각에 소속이었나**를 물어야 한다.
 *
 *   그런데 원문 어디에도 선수별 소속 칸이 없다 (D-219 실측). 그래서 우리가 직접 관측한다 —
 *   `user/basic` 을 주기적으로 물어 `clan_name` 이 바뀌는 순간을 `NexonIdentityObservation`
 *   에 쌓고(D-220), 그 이력으로 **구간**을 만들어 되짚는다.
 *
 * ── 모르면 모른다고 한다
 *   관측이 시작되기 **전**의 경기는 알 길이 없다. `unknown` 으로 두고 판정을 보류한다.
 *   여기서 추측하면 D-219 의 `열산의심` 이 근거 없는 딱지가 된다.
 */

/** 관측 한 줄 — 그 시각에 이 클랜이었다 */
export interface ClanObservation {
  clanName: string | null
  observedAt: Date
}

/** 관측을 이어 만든 구간. `to` 가 null 이면 **아직 열려 있다**(마지막 관측 이후) */
export interface ClanInterval {
  clanName: string | null
  from: Date
  to: Date | null
}

export type Certainty =
  /** 관측 구간 안에 들어간다. 믿을 만하다 */
  | 'observed'
  /** 마지막 관측 이후다. 그 뒤로 안 바뀌었다고 보는 것이라 약하다 */
  | 'after_last'
  /** 첫 관측 이전이다. **알 수 없다** */
  | 'unknown'

export interface ClanAtResult {
  clanName: string | null
  certainty: Certainty
}

/**
 * 관측을 시간순 구간으로 접는다.
 *
 * 같은 클랜이 이어지면 한 구간으로 합친다 — 폴링이 잦아 같은 값이 여러 번 들어와도
 * 구간이 잘게 쪼개지지 않게 한다.
 */
export function buildIntervals(observations: readonly ClanObservation[]): ClanInterval[] {
  const sorted = [...observations].sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime())
  const out: ClanInterval[] = []

  for (const o of sorted) {
    const last = out[out.length - 1]
    if (last && last.clanName === o.clanName) {
      // 같은 클랜이 이어진다 — 구간을 늘리기만 한다
      continue
    }
    if (last) last.to = o.observedAt
    out.push({ clanName: o.clanName, from: o.observedAt, to: null })
  }
  return out
}

/**
 * 그 시각의 소속을 되짚는다.
 *
 * @param intervals `buildIntervals` 의 결과 (시간순)
 * @param at        경기 시각
 */
export function clanAt(intervals: readonly ClanInterval[], at: Date): ClanAtResult {
  if (!intervals.length) return { clanName: null, certainty: 'unknown' }

  const first = intervals[0]!
  if (at.getTime() < first.from.getTime()) {
    // 관측을 시작하기 전이다. 지어내지 않는다
    return { clanName: null, certainty: 'unknown' }
  }

  for (const iv of intervals) {
    const startsBefore = iv.from.getTime() <= at.getTime()
    const endsAfter = iv.to === null || at.getTime() < iv.to.getTime()
    if (startsBefore && endsAfter) {
      return { clanName: iv.clanName, certainty: iv.to === null ? 'after_last' : 'observed' }
    }
  }
  return { clanName: null, certainty: 'unknown' }
}

/* ------------------------------------------------------------------ D-219 --- */

/** 사용자가 정한 문턱 — 자기 클랜원이 **2명 이상**이면 그 팀은 정상이다 */
export const SANPLY_MIN_OWN_MEMBERS = 2

export type SanplyVerdict =
  /** 한쪽이라도 자기 클랜원 2명 이상 */
  | { verdict: '정상'; redOwn: number; blueOwn: number }
  /** 양쪽 다 2명 미만 — 래더 0 으로 보류하고 `열산의심` 을 표시한다 */
  | { verdict: '열산의심'; redOwn: number; blueOwn: number }
  /** 근거가 모자라 판정하지 않는다 */
  | { verdict: '판정보류'; reason: string }

/** 참가자 한 명의 판정 재료 */
export interface Participant {
  /** 이 선수가 뛴 쪽 */
  side: 'red' | 'blue'
  /** 경기 시각의 소속 (되짚은 결과) */
  clanAt: ClanAtResult
}

/**
 * D-219 판정.
 *
 * **상태가 셋이다.** 둘로 하면 "모르는 것" 이 "의심" 으로 둔갑한다 —
 * 재료가 없는 경기가 전부 `열산의심` 이 되면 그것은 판정이 아니다.
 *
 * @param redClanName  red 쪽 클랜명
 * @param blueClanName blue 쪽 클랜명
 * @param participants 참가자들 (보통 10명)
 * @param minKnownPerSide 한쪽에서 소속을 아는 사람이 이만큼은 돼야 판정한다
 */
export function judgeSanplySuspect(input: {
  redClanName: string
  blueClanName: string
  participants: readonly Participant[]
  minKnownPerSide?: number
}): SanplyVerdict {
  const minKnown = input.minKnownPerSide ?? 4

  const red = input.participants.filter((p) => p.side === 'red')
  const blue = input.participants.filter((p) => p.side === 'blue')

  const known = (list: readonly Participant[]) =>
    list.filter((p) => p.clanAt.certainty !== 'unknown').length
  const own = (list: readonly Participant[], clan: string) =>
    list.filter((p) => p.clanAt.certainty !== 'unknown' && p.clanAt.clanName === clan).length

  const redKnown = known(red)
  const blueKnown = known(blue)

  if (redKnown < minKnown || blueKnown < minKnown) {
    return {
      verdict: '판정보류',
      reason:
        `소속을 아는 참가자가 모자라다 (red ${redKnown}/${red.length} · ` +
        `blue ${blueKnown}/${blue.length} · 필요 ${minKnown})`,
    }
  }

  const redOwn = own(red, input.redClanName)
  const blueOwn = own(blue, input.blueClanName)

  if (redOwn < SANPLY_MIN_OWN_MEMBERS && blueOwn < SANPLY_MIN_OWN_MEMBERS) {
    return { verdict: '열산의심', redOwn, blueOwn }
  }
  return { verdict: '정상', redOwn, blueOwn }
}
