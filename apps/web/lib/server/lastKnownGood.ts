/**
 * **마지막으로 성공한 응답을 기억해 두었다가, DB 가 안 될 때 그것을 대신 내준다.**
 *
 * ── 왜 필요한가
 *   사이트와 수집 잡이 **DB 한 대를 같이 쓴다** (D-240). 수집이 DB 를 물고 있는 동안
 *   사이트 요청은 접속 통로를 못 얻고 `pool_timeout` 을 다 쓴 뒤 **500** 이 된다.
 *
 *   ```
 *   16:16  /api/home/top             200 → 500 (38.7초)
 *   16:28  /api/eggs/broken          200 → 500 (20.4초)
 *   16:30  /api/home/top             200 → 500 (20.3초)   2026-09-01 운영 실측
 *   ```
 *
 *   통로를 늘리는 길은 막혔다 — 늘렸더니 Supabase 풀러가 먼저 무너졌다 (D-239).
 *   수집을 밤으로 미루는 길도 막혔다 — **신선도 15분**이 요구사항이다 (D-249).
 *   남은 길은 하나다: **사이트가 DB 를 덜 필요로 하게 만든다.**
 *
 * ── 무엇을 하나
 *   공개 읽기 응답이 성공하면 그 **본문을 함수 인스턴스의 메모리에** 적어 둔다.
 *   다음 요청이 실패하면 적어 둔 본문을 대신 내준다. 500 대신 **조금 낡은 200** 이 나간다.
 *
 * ── 왜 이것이 옳은가 — 「낡은 값 vs 죽은 값」
 *   전적 사이트에서 몇 분 낡은 랭킹은 **거의 해가 없다.** 반면 500 은 화면을 통째로
 *   비우고, 사용자에게는 «사이트가 고장났다» 로 읽힌다. 같은 판단을 알 목록에서 이미
 *   한 번 했다 (`app/api/eggs/broken/route.ts` 의 「⚠ 정정」).
 *
 * ── ⚠ 한계 — **이것은 보험이지 해결이 아니다**
 *   1. 메모리는 **함수 인스턴스마다 따로**다. 갓 깨어난 인스턴스에는 적어 둔 것이 없고,
 *      그때는 그대로 500 이 난다. 따뜻한 인스턴스가 대부분의 요청을 받으므로
 *      **대부분** 막지만 **전부** 막지는 못한다
 *   2. 낡을 수 있는 상한을 `maxStaleSeconds` 로 못 박는다. 그보다 오래되면
 *      **내주지 않고 원래대로 실패시킨다** — 몇 시간 전 값을 지금 값인 척 내보내는 것은
 *      「데이터를 지어내지 않는다」(CLAUDE.md 3장 7번)에 어긋난다
 *   3. **성공(2xx)만 기억한다.** 404 를 기억하면 새로 생긴 클랜이 계속 없는 것이 된다
 *   4. **쓰기 · 로그인 · 관리자 응답에는 쓰지 않는다.** 남의 값이 섞여 나간다
 *
 *   진짜 해결은 **사이트와 수집이 DB 를 나눠 쓰지 않는 것**이고, 그건 요금제 결정이다
 *   (D-240 의 남은 숙제).
 */

type Kept = { body: string; at: number }

/**
 * 함수 인스턴스 안에서만 사는 기억. 키는 호출부가 정한다.
 *
 * 인스턴스가 식으면 통째로 사라지므로 따로 비우지 않는다. 다만 목록형 경로는
 * 커서마다 키가 갈라져 무한히 늘 수 있어 상한을 둔다.
 */
const kept = new Map<string, Kept>()

/** 기억 칸 수 상한. 넘으면 가장 오래 전에 넣은 것부터 버린다 (Map 은 삽입 순서를 지킨다) */
const MAX_ENTRIES = 200

function remember(key: string, body: string) {
  if (kept.size >= MAX_ENTRIES && !kept.has(key)) {
    const oldest = kept.keys().next().value
    if (oldest !== undefined) kept.delete(oldest)
  }
  kept.set(key, { body, at: Date.now() })
}

/** 기억해 둔 본문. 없거나 `maxStaleSeconds` 보다 낡았으면 `null` */
function recall(key: string, maxStaleSeconds: number): { body: string; ageSeconds: number } | null {
  const found = kept.get(key)
  if (!found) return null
  const ageSeconds = (Date.now() - found.at) / 1000
  if (ageSeconds > maxStaleSeconds) return null
  return { body: found.body, ageSeconds }
}

export const lastKnownGood = { remember, recall }
