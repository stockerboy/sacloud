/**
 * **수집이 실제로 무엇을 넣고 있나** — 신선도 임계값 한 곳 (2026-09-03 · D-225 에서 옮겨 옴).
 *
 * ══ 왜 계약으로 옮겼나 ══
 *
 * 이 숫자들은 원래 `apps/worker/src/jobs/syncFreshness.ts` 에만 있었다.
 * 그런데 **`/api/health` 의 「수집기」 칸이 전혀 다른 것을 보고 있었다** —
 * 넥슨 파이프라인(`ImportJob` · `NexonMatch`)이다.
 *
 * ```
 * 지금 도는 것    3rd.supply 미러  (supply-mirror · supply-import)
 * health 가 본 것 넥슨            (할당량 때문에 2026-08-24 부터 세워 뒀다)
 * ```
 * 그래서 health 는 **240시간째 노랑에 고정**이었고, 이미 노랑이라
 * ★진짜 빨간 줄이 열흘 동안 그 뒤에 가려져 있었다★ (`sanply` 적재 실패).
 * **자를 잘못 댄 것이 고장보다 나빴다** — 있는 알람이 없는 알람보다 나빴다.
 *
 * 웹과 워커가 **같은 자**를 써야 이런 일이 다시 안 난다. 둘 다 계약을 보므로 여기 둔다.
 * ⚠ 워커 쪽은 이 값을 **다시 내보낸다**(re-export). 옛 이름으로 부르던 자리를 안 깬다.
 *
 * ══ 임계값은 ★실측★ 이다. 추측하지 않았다 ══
 *
 * 운영 최근 8일 경기 간격 (2026-09-01 실측):
 * ```
 * 리그      구간수  중앙   p90     최대     12h초과
 * supply     450   0.1h  0.5h    18.0h      3
 * sanply     964   0.1h  0.3h     7.1h      0
 * daerule     11   0.3h 21.6h   116.3h      2
 * ```
 * `sanply` 는 8일 동안 7.1시간을 넘겨 쉰 적이 **한 번도 없다** — 가장 예민한 감지기다.
 * `supply` 는 18시간 공백이 정상 범위 안이다. `daerule` 은 8일에 12경기라
 * 신선도로 판정할 수 있는 리그가 아니다.
 *
 * ⚠ **하나로 묶으면 오경보가 난다.** 그러면 알람이 무뎌지고, 그건 D-224 에서 이미 겪었다.
 */

/** 리그별 기본 임계값(시간). 위 실측 표에서 최대 공백에 여유를 얹은 값이다 */
export const SYNC_FRESHNESS_DEFAULT_MAX_AGE_HOURS: Record<string, number> = {
  /* 최대 공백 7.1h → 12h 면 오경보 0, 실패는 확실히 잡는다 */
  sanply: 12,
  /* 최대 공백 18.0h → 24h. 더 조이면 새벽마다 운다 */
  supply: 24,
  /* 8일에 12경기 · 최대 공백 4.8일. 신선도로 판정하지 않는다 (사실상 끔) */
  daerule: 168,
}

/** 표에 없는 리그의 기본값. 모르는 리그를 조용히 통과시키지 않되 무는 값은 아니다 */
export const SYNC_FRESHNESS_FALLBACK_MAX_AGE_HOURS = 48

/**
 * **판정하지 않고 보여 주기만 하는 리그.**
 *
 * ```
 * nolink   IPL — 병영수첩에서 ★사람 손으로★ 들어온다. 자동 수집이 없다
 * daerule  대룰리그 — ★수집을 멈췄다★ (2026-09-03 · 사장님 지시 · O-042)
 * ```
 * 낡았다고 알람을 울리면 **매번 운다** — 그건 알람을 무디게 만든다.
 * 표시는 하되 판정에 넣지 않는다.
 *
 * ⚠ `daerule` 의 임계값(168시간)은 **지우지 않았다.** 지우면 기본값 48시간으로 떨어져
 *   **더 자주 운다.** 값은 두고 **판정에서만 뺀다** — 그게 O-042 확인 칸 2번이 보는 것이다.
 */
export const SYNC_FRESHNESS_REPORT_ONLY: ReadonlySet<string> = new Set(['nolink', 'daerule'])

/**
 * **자동 수집이 도는 리그** — `/api/health` 의 「수집기」 칸이 이것으로 판정한다.
 *
 * `supply-incremental.yml` · `supply-rollup-full.yml` 의 `LEAGUES` 와 같아야 한다.
 *
 * ── ★2026-09-03 · `daerule` 을 뺐다★ (O-042 · 사장님 지시)
 *   > «대룰리그는 없애 생각하지마 이거 못박아놔 저번에도 말해줬었는데 까먹네 자꾸»
 *   > (「화면만인가 수집도인가」를 여쭙자) → «수집하지마라»
 *
 *   ★**사장님이 두 번째로 말씀하신 것이다.** 한 번 듣고 흘렸다는 뜻이다.★
 *   화면에서는 이미 빠져 있었는데(`PREPARING_LEAGUE_SLUGS`) **수집만 계속 돌고 있었다.**
 *
 *   ⚠ **경기 29,714건(2024-05-24~)은 지우지 않는다.** 멈추는 것이지 없애는 것이 아니다
 *     (`CLAUDE.md` 1-4). 옛 값을 여기 남겨 둔다 — 되살릴 때 한 줄이면 된다:
 *     `['supply', 'daerule', 'sanply']`
 */
export const COLLECTED_LEAGUE_SLUGS: readonly string[] = ['supply', 'sanply']

/** 그 리그의 임계값. 표에 없으면 기본값 */
export function freshnessMaxAgeHours(slug: string): number {
  return SYNC_FRESHNESS_DEFAULT_MAX_AGE_HOURS[slug] ?? SYNC_FRESHNESS_FALLBACK_MAX_AGE_HOURS
}
