/**
 * IPL **클랜 번호 잇기 판정** (순수 함수) — 호출 0회로 푼다.
 *
 * ── 왜 새 길이 필요한가 (순환이 있다)
 *   배틀로그를 부르려면 `경기키 + 클랜번호` 가 있어야 하고, 받은 응답의 `team_no` 를
 *   진영으로 바꾸려면 **클랜번호 ↔ 우리 클랜** 표가 있어야 한다.
 *   그 표를 만드는 `jobs/clanNumber.ts` 는 **`MatchPlayerStat` 으로 짝을 맞춘다** —
 *   그런데 IPL 의 `MatchPlayerStat` 은 0건이다. 자기가 만들려는 것을 자기가 요구한다.
 *
 * ── 끊는 법 — 매치목록 원문이 이미 답을 갖고 있다
 *   `BarracksClanMatchRaw` 한 줄은 **「어느 클랜의 목록을 조회했는가」(`subject`, 병영수첩 slug)**
 *   와 그 응답의 **`payload.clan_no`** 를 같이 갖고 있다. `clan_no` 는 *조회 주체*의
 *   번호이므로 (`dev/battlelogWorklist.ts` 주석) 이 둘은 그 자리에서 짝이다.
 *
 *   로컬 실측 (2026-09-01):
 *   ```
 *   distinct subject      39곳
 *   distinct clan_no      39개
 *   한 subject 가 두 clan_no 를 갖는 경우   0건
 *   ```
 *   **1:1 이다.** 요청을 한 건도 보내지 않고 39곳이 풀린다.
 *
 * ── 확신이 없으면 잇지 않는다 (D-106)
 *   한 주체가 번호를 여럿 갖거나, 한 번호가 주체를 여럿 가리키면 **둘 다 버린다.**
 *   다수결로 밀어 넣지 않는다.
 *
 * ── 옛 길은 지우지 않았다 (`CLAUDE.md` 10-4)
 *   `jobs/clanNumber.ts`(참가 선수로 맞추는 방식)는 그대로 살아 있다.
 *   그쪽은 `MatchPlayerStat` 이 있는 리그(공식리그)에서 여전히 옳다.
 */

/** 매치목록 원문에서 뽑은 짝 — `(조회 주체, 그 응답의 클랜번호)` */
export interface SubjectClanNoRow {
  /** 병영수첩 클랜 slug (`clan_id`) */
  subject: string
  /** 그 응답의 `payload.clan_no` */
  clanNo: string
}

/** 잇지 못한 이유. **세어서 보고한다** */
export type ClanNumberSkipReason =
  /** 한 주체가 클랜번호를 여럿 갖는다 */
  | 'multiple_clan_no'
  /** 한 클랜번호를 주체 여럿이 쓴다 */
  | 'shared_clan_no'
  /** 그 주체를 우리 클랜으로 잇지 못했다 (등록되지 않은 클랜) */
  | 'unresolved_subject'

export interface ClanNumberLink {
  subject: string
  clanNo: string
  clanId: string
}

export interface ClanNumberDecision {
  links: ClanNumberLink[]
  /** 주체별 탈락 사유 */
  skipped: Array<{ subject: string; clanNo: string | null; reason: ClanNumberSkipReason }>
  counts: Record<ClanNumberSkipReason, number>
}

const emptyCounts = (): Record<ClanNumberSkipReason, number> => ({
  multiple_clan_no: 0,
  shared_clan_no: 0,
  unresolved_subject: 0,
})

/**
 * 짝 목록 → 이을 것과 못 이을 것.
 *
 * `resolveSubject` 는 병영수첩 slug 를 우리 `Clan.id` 로 바꾼다. 모르면 null 이다.
 * 결과는 **주체 이름순**으로 고정한다 — 같은 입력이면 같은 순서가 나와야 한다(멱등).
 */
export function decideIplClanNumbers(
  rows: readonly SubjectClanNoRow[],
  resolveSubject: (subject: string) => string | null,
): ClanNumberDecision {
  /* 주체 → 본 클랜번호들 */
  const bySubject = new Map<string, Set<string>>()
  /* 클랜번호 → 그것을 쓴 주체들 */
  const bySubjectOfNo = new Map<string, Set<string>>()

  for (const row of rows) {
    const subject = row.subject.trim()
    const clanNo = row.clanNo.trim()
    if (subject === '' || clanNo === '') continue
    if (!bySubject.has(subject)) bySubject.set(subject, new Set())
    bySubject.get(subject)?.add(clanNo)
    if (!bySubjectOfNo.has(clanNo)) bySubjectOfNo.set(clanNo, new Set())
    bySubjectOfNo.get(clanNo)?.add(subject)
  }

  const decision: ClanNumberDecision = { links: [], skipped: [], counts: emptyCounts() }
  const drop = (subject: string, clanNo: string | null, reason: ClanNumberSkipReason) => {
    decision.skipped.push({ subject, clanNo, reason })
    decision.counts[reason] += 1
  }

  for (const subject of [...bySubject.keys()].sort()) {
    const clanNos = bySubject.get(subject) as Set<string>
    if (clanNos.size !== 1) {
      drop(subject, null, 'multiple_clan_no')
      continue
    }
    const clanNo = [...clanNos][0] as string
    if ((bySubjectOfNo.get(clanNo)?.size ?? 0) !== 1) {
      drop(subject, clanNo, 'shared_clan_no')
      continue
    }
    const clanId = resolveSubject(subject)
    if (clanId === null) {
      drop(subject, clanNo, 'unresolved_subject')
      continue
    }
    decision.links.push({ subject, clanNo, clanId })
  }

  return decision
}
