/**
 * ★★집계가 도는 리그 — 여기 한 곳이다★★ (2026-09-21 · 사장님 지시)
 *
 * > 「★근본적인 문제를 해결해★ 해결방법을 찾아
 * >  매번 내가 알려줄때마다 한명한명 고칠거야?」
 *
 * ── 무엇이 문제였나
 *
 *   「이 선수의 지금 클랜이 어디냐」 를 맞춰 주는 잡(`clanAffiliation`)이
 *   ★제 리그 목록을 스스로 갖고 있었다★ —
 *   ```
 *   const DEFAULT_LEAGUES = ['nolink', 'supply', 'sanply']
 *   ```
 *   2026-09-20 밤에 ★C1 을 만들었는데 이 줄이 안 따라왔다.★ 그래서
 *   C1 명부만 옛 클랜으로 남았다. 실측 —
 *   ```
 *   애망.  병영 grave · IPL grave · PL grave · 열산 grave · ★C1 hardcores★
 *   ```
 *   사장님이 화면에서 먼저 보셨다. ★한 명씩 고치면 끝이 없다.★
 *
 * ── 그래서
 *
 *   ① 집계 대상 리그를 ★여기 한 줄★ 로 모은다. 잡들이 여기서 읽는다.
 *   ② ★화면에 보이는 리그와 같은지 시험이 본다★
 *      (`aggregateLeagues.test.ts`). 새 리그를 화면에 올리면
 *      ★그 시험이 빨개져서★ 집계에도 넣게 된다.
 *
 *   ★리그를 더하는 사람이 잊을 수 없게 만드는 것★ 이 이 파일의 전부다.
 *
 * ⚠ `daerule` 은 없다 — 화면에서 접은 리그다 (`PREPARING_LEAGUE_SLUGS`).
 *   집계도 안 돈다. 두 곳이 같은 뜻으로 빠져 있다.
 */
/*
 * ⚠ ★2026-09-21 — C1 을 뺐다★ (사장님: 「c1리그 화면에서 없애버리고 전부 다 지워」).
 *   CPL 은 ★개막 전★ 이라 아직 집계할 기록이 없다 — 10/1 에 여기 넣는다.
 *   ★옛 목록은 아래 `_WITH_C1` 로 남겼다★ (`CLAUDE.md` 1-4).
 */
export const AGGREGATE_LEAGUE_SLUGS: readonly string[] = ['nolink', 'supply', 'sanply']

/** ⚠ C1 이 집계에 있던 판. 지우지 않는다 — 되돌릴 때 쓴다 */
export const AGGREGATE_LEAGUE_SLUGS_WITH_C1: readonly string[] = [
  'nolink',
  'supply',
  'sanply',
  'c1',
]

/** 그 리그에 집계가 도는가 */
export function aggregatesLeague(slug: string): boolean {
  return AGGREGATE_LEAGUE_SLUGS.includes(slug)
}
