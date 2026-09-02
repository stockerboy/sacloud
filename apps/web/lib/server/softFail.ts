/**
 * **없어도 되는 조각이 깨졌을 때** — 화면은 살리고 **로그는 남긴다** (O-028 · 2026-09-03).
 *
 * ══ 왜 필요한가 — 육각형이 하루 종일 죽어 있었는데 아무도 몰랐다 ══
 *
 * `records.ts` 는 프로필의 곁가지 조회를 `.catch(() => null)` 로 감싼다.
 * 뜻은 옳다 — **육각형 하나 때문에 기록실이 통째로 안 열리면 안 된다.**
 *
 * 그런데 2026-09-02 에 이런 일이 났다.
 * ```
 * 아침   playerTraits.ts 가 새 칸(burstRounds)을 읽게 바뀌었다. 마이그레이션도 커밋했다
 * 그런데 ★그 마이그레이션이 운영에 안 올라갔다★
 * 결과   질의가 던짐 → catch 가 삼킴 → 전투력 육각형·플레이스타일이
 *        SPL·IPL·10mountain **세 리그 전부에서 조용히 사라졌다**
 * 발견   로컬과 대조해서 겨우 찾았다. 오류 로그가 **한 줄도 없었다**
 * ```
 *
 * 저장소를 세어 보니 그런 `catch` 가 **20곳이고 로그를 남기는 곳은 0곳**이었다.
 *
 * ══ 그래서 무엇을 바꾸나 — **막지 말고 남긴다** ══
 *
 * ```
 * 그대로 둔다   화면을 안 죽인다. 실패하면 여전히 fallback 을 돌려준다
 * 더한다        서버 로그에 한 줄 남긴다. 그래야 「조용히」가 아니게 된다
 * ```
 * 예외를 위로 던지게 바꾸지 않는다. 그건 이 함수의 일이 아니다.
 *
 * ⚠ **「값이 원래 없는 것」과 헷갈리면 안 된다.** 「측정중」·「알수없음」·「기록 없음」은
 *   이 프로젝트가 일부러 만든 정직한 표기다. 이 함수는 **던진 예외**만 다룬다 —
 *   정상적으로 `null` 을 돌려준 조회는 여기 오지 않는다.
 *
 * ══ 쓰는 법 ══
 *
 * ```ts
 * playerTraits(leagueId, playerId).catch(() => null)
 * →
 * softFail('player-traits', null, { leagueId, playerId })(playerTraits(leagueId, playerId))
 * ```
 */

/** 로그 한 줄에 붙일 실마리. **개인정보를 넣지 마라** — 식별자와 리그 정도만 */
type Clues = Record<string, string | number | null | undefined>

/**
 * 실패하면 `fallback` 을 돌려주되 **로그를 남긴다.**
 *
 * @param label   무엇이 깨졌는지 (`player-traits` · `clan-hexagon` 처럼 짧게)
 * @param fallback 실패했을 때 돌려줄 값. 지금 `catch(() => X)` 의 그 `X` 를 그대로 넣는다
 * @param clues   어느 줄에서 났는지 찾을 실마리
 */
export function softFail<F>(label: string, fallback: F, clues: Clues = {}) {
  /* 되돌림값(`F`)과 조회 결과(`T`)를 **따로** 받는다. 같은 글자로 묶으면
     `softFail('…', null, …)(playerTraits(…))` 에서 `T` 가 `null` 로 굳어
     「Promise<Traits|null> 을 Promise<null> 에 못 넣는다」로 깨진다 */
  return async <T>(work: Promise<T>): Promise<T | F> => {
    try {
      return await work
    } catch (error) {
      const where = Object.entries(clues)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${k}=${String(v)}`)
        .join(' ')
      /* 관례는 `[이름] 무엇` + 오류 객체다 (`titleVerification.ts` · `rateLimit.ts` 와 같은 모양) */
      console.error(`[soft-fail] ${label}${where ? ' ' + where : ''}`, error)
      return fallback
    }
  }
}
