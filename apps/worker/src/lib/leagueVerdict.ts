/**
 * ★★한 경기를 IPL / SPL / 열산 중 정확히 하나로★★ (2026-09-05 · Part 3 ②단계).
 *
 * > 사장님: «한 경기의 league 판정은 ★양쪽 클랜의 확정된 활성 리그★ 를 기준으로 한다»
 * > «서로 다른 리그의 클랜끼리 나온 경기는 현재 세 리그 기록에 넣지 않는다»
 * > «애매하거나 판정 불가능한 경기는 ★임의 분류하지 말고★ unclassified 로 남긴다»
 *
 * ── ★순수 함수다★
 *   DB 도 네트워크도 안 본다. 「이름 → 리그」 표를 ★받아서★ 판정만 한다.
 *   그래서 규칙 전량을 시험할 수 있고, 시험이 곧 규칙 문서가 된다.
 *
 * ── ★판정표★
 * ```
 * 양쪽 다 IPL   → IPL
 * 양쪽 다 SPL   → SPL
 * 양쪽 다 열산   → 열산
 * 서로 다른 리그 → ★unclassified★ (cross_league)
 * 한쪽이라도 모름 → ★unclassified★ (unknown_clan)
 * ```
 *
 * ── ★왜 「모르면 버린다」가 아니라 「모른다고 적는다」인가★
 *   버리면 ★몇 건을 버렸는지 아무도 모른다.★ 이 저장소는 그 함정에 여러 번 빠졌다 —
 *   미러가 다른 리그 줄을 조용히 건너뛰던 것 · 자물쇠가 실패를 성공으로 넘기던 것.
 *   ★사유와 경기키를 남기면 「왜 안 들어왔나」에 답할 수 있다.★
 *
 * ── ⚠ ★대룰(daerule)은 여기 없다★
 *   사장님이 «대룰리그는 없애 생각하지마» 라고 ★두 번★ 말씀하셨다 (O-042).
 *   대룰 클랜은 이 표에 넣지 않는다 — 넣으면 그 자체로 수집 대상이 된다.
 */

/** 운영 대상 세 리그. ★이 셋뿐이다★ */
export const LIVE_LEAGUE_SLUGS = ['nolink', 'supply', 'sanply'] as const
export type LiveLeagueSlug = (typeof LIVE_LEAGUE_SLUGS)[number]

/** 화면에 쓰는 이름 — 로그가 사람에게 읽혀야 한다 */
export const LEAGUE_LABEL: Record<LiveLeagueSlug, string> = {
  nolink: 'IPL',
  supply: 'SPL',
  sanply: '10mountain',
}

export type UnclassifiedReason =
  /** 양쪽이 서로 다른 리그다 — 세 리그 어디에도 안 넣는다 */
  | 'cross_league'
  /** 한쪽이라도 어느 리그인지 모른다 */
  | 'unknown_clan'

export type LeagueVerdict =
  | { ok: true; league: LiveLeagueSlug; redClanId: string; blueClanId: string }
  | {
      ok: false
      reason: UnclassifiedReason
      /** 사람이 읽는 사유 — 숫자만 세면 나중에 원인을 모른다 */
      detail: string
      /** 알아낸 것만이라도 남긴다. 모르면 `null` */
      redLeague: LiveLeagueSlug | null
      blueLeague: LiveLeagueSlug | null
    }

/** 클랜 하나가 어느 리그의 누구인가. ★활성 등록 하나뿐이어야 한다★ */
export interface ClanLeague {
  clanId: string
  league: LiveLeagueSlug
}

/**
 * 이름 → 클랜 표.
 *
 * ⚠ ★클랜은 이름을 바꾼다.★ 원문의 `red_clan_name` 은 ★그때의 이름★ 이라
 *   지금 이름 하나로만 찾으면 개명 전 경기를 통째로 놓친다
 *   (실측 2026-08-31: `melody` 1,901건 · `pIacebo` 607건이 그렇게 빠졌다).
 *   그래서 표는 ★옛 이름까지 담아서★ 넘겨받는다 — 만드는 일은 부르는 쪽의 몫이다.
 *
 * ⚠ ★한 이름이 두 클랜을 가리키면 그 이름은 표에서 뺀다.★
 *   실측(2026-09-05): `daytona` · `hingˇ` · `recent.wct-` 가 ★같은 이름 다른 클랜★ 이다.
 *   골라 넣으면 그게 곧 조용한 오분류다 — ★모른다고 하는 편이 옳다.★
 */
export type ClanIndex = ReadonlyMap<string, ClanLeague>

/**
 * 이름 → 클랜 표를 만든다. ★모호한 이름은 빼고, 뺀 이름을 돌려준다.★
 *
 * @param entries 이름 하나당 한 줄. 같은 이름이 여러 줄이면 모호한 것이다
 */
export function buildClanIndex(
  entries: ReadonlyArray<{ name: string; clanId: string; league: LiveLeagueSlug }>,
): { index: ClanIndex; ambiguous: string[] } {
  const seen = new Map<string, ClanLeague | null>()
  const ambiguous = new Set<string>()

  for (const e of entries) {
    const key = e.name
    const prev = seen.get(key)
    if (prev === undefined) {
      seen.set(key, { clanId: e.clanId, league: e.league })
      continue
    }
    if (prev === null) continue
    /* ★같은 클랜을 두 번 넣은 것은 모호한 것이 아니다★ */
    if (prev.clanId === e.clanId && prev.league === e.league) continue
    seen.set(key, null)
    ambiguous.add(key)
  }

  const index = new Map<string, ClanLeague>()
  for (const [name, v] of seen) if (v !== null) index.set(name, v)
  return { index, ambiguous: [...ambiguous].sort() }
}

/**
 * 양쪽 클랜 이름으로 리그를 정한다.
 *
 * ★임의로 고르지 않는다.★ 갈리면 `unclassified` 다.
 */
export function decideLeague(
  redClanName: string,
  blueClanName: string,
  index: ClanIndex,
): LeagueVerdict {
  const red = index.get(redClanName) ?? null
  const blue = index.get(blueClanName) ?? null

  if (red === null || blue === null) {
    const missing = [
      red === null ? `red=${redClanName}` : null,
      blue === null ? `blue=${blueClanName}` : null,
    ]
      .filter(Boolean)
      .join(' · ')
    return {
      ok: false,
      reason: 'unknown_clan',
      detail: `어느 리그 클랜인지 모른다 (${missing})`,
      redLeague: red?.league ?? null,
      blueLeague: blue?.league ?? null,
    }
  }

  if (red.league !== blue.league) {
    return {
      ok: false,
      reason: 'cross_league',
      detail:
        `서로 다른 리그다 — ${redClanName}(${LEAGUE_LABEL[red.league]})` +
        ` vs ${blueClanName}(${LEAGUE_LABEL[blue.league]})`,
      redLeague: red.league,
      blueLeague: blue.league,
    }
  }

  return { ok: true, league: red.league, redClanId: red.clanId, blueClanId: blue.clanId }
}
