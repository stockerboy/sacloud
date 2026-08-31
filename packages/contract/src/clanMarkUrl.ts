/**
 * `static.3rd.supply` 클랜마크 주소를 **넥슨 원본 주소로 되돌린다**.
 *
 * ── 무엇을 발견했나 (2026-09-01 실측)
 *   원본 사이트의 마크 주소는 새로 만든 이름이 아니라 **넥슨 경로를 base64url 로 감싼 것**이다.
 *
 *   ```
 *   https://static.3rd.supply/marks/NTEvMF8xMl8wODM.png
 *                                   └──────┬──────┘
 *                                    풀면 "51/0_12_083"
 *   https://img.sa.nexon.com/sa/clan/mark/51/0_12_083.png
 *   ```
 *
 *   두 주소가 같은 그림을 준다. `curl` 로 대조했다 — 둘 다 `200 image/png` 이고
 *   **바이트 수가 같다**(6,292). 넥슨 쪽이 2.3배 빠르다(0.20s vs 0.46s).
 *   로컬 DB 의 3rd.supply 마크 주소 **1,724칸 중 1,718칸(99.65%)** 이 이 규칙으로 풀린다.
 *
 * ── 왜 되돌리나
 *   지금은 원본 사이트가 죽으면 우리 화면의 클랜마크가 **전부** 사라진다.
 *   `static.3rd.supply` 는 넥슨 CDN 을 base64 이름으로 미러링한 중간 껍데기일 뿐이고,
 *   진짜 원본은 처음부터 넥슨이었다.
 *
 *   이미지를 **복사하지 않는다** — 지금과 똑같이 **주소만** 보관한다.
 *   그래서 `CLAUDE.md` 3장 4번(원본 자산·클랜마크 복사 금지)에 걸리지 않는다.
 *   `apps/worker/src/dev/iplMarkFill.ts` 가 이미 클랜 30곳에 넥슨 주소를 넣었고
 *   `apps/web/next.config.ts` 의 `CLAN_MARK_HOSTS` 도 넥슨 호스트를 이미 열어 두었다.
 *   이 함수는 **새 방침이 아니라 나머지 862곳을 같은 방침으로 맞추는 것**이다.
 *
 * ── 매퍼가 여섯 곳으로 흩어져 있다
 *   `mappers.ts` · `queries/clans.ts` · `boards.ts` · `ladders.ts` · `leagues.ts` ·
 *   `rankings.ts` · `matches.ts` · `api/admin/eggs/route.ts` 가 각자 마크를 내보낸다.
 *   한 곳만 고치면 새는 경로가 남는다. **변환 규칙은 이 함수 하나가 단일 진실이다.**
 *
 * ── 함수가 둘이다. 쓸 때와 내보낼 때의 규칙이 다르기 때문이다
 *
 *   ```
 *   supplyMarkUrlToNexon()   DB 에 **쓸 때**.  모르는 것은 전부 null
 *   restoreClanMarkUrl()     화면에 **낼 때**. 원본 사이트 주소가 아니면 그대로 통과
 *   ```
 *
 *   쓸 때는 **반쯤 바뀐 주소가 저장되는 것이 가장 나쁘다** — 무엇이 변환됐고 무엇이 안 됐는지
 *   나중에 가릴 수 없게 된다. 그래서 확실하지 않으면 `null` 이다.
 *
 *   낼 때 같은 규칙을 쓰면 **반대로 해롭다.** 언젠가 다른 곳에 올린 마크가 화면에서 조용히
 *   사라진다. 그래서 원본 사이트 주소만 손대고 나머지는 그대로 둔다.
 *
 *   어느 쪽이든 `null` 은 화면에서 `FallbackClanMark`(구름)로 떨어진다.
 */

/** 원본 사이트의 마크 주소 앞부분 */
const SUPPLY_MARK_PREFIX = 'https://static.3rd.supply/marks/'

/** 넥슨 클랜마크 CDN 앞부분. `apps/worker/src/dev/iplMarkFill.ts` 의 `PREFIX` 와 같은 값이다 */
const NEXON_MARK_PREFIX = 'https://img.sa.nexon.com/sa/clan/mark/'

/**
 * 풀린 경로가 넥슨 마크 경로 모양인가.
 *
 * **디렉터리 번호를 하드코딩하지 않는다.** 로컬 DB 862곳은 전부 `51` 이지만 서버군 번호로
 * 보이고, 새 번호가 나오면 조용히 `null` 이 되어 마크가 사라진다. 모양만 본다 —
 * `<숫자>/<0 또는 1>_<숫자>_<숫자>`.
 *
 * 앞자리 `0`/`1` 은 배경/전경 레이어 구분이다 (`0_12_083` 배경 · `1_23_187` 전경).
 */
function isNexonMarkPath(path: string): boolean {
  const [dir, file, ...rest] = path.split('/')
  if (rest.length > 0) return false
  if (!dir || !file) return false
  if (!/^[0-9]+$/.test(dir)) return false
  return /^[01]_[0-9]+_[0-9]+$/.test(file)
}

/**
 * base64url 을 문자열로. 풀 수 없으면 `null`.
 *
 * `atob` 을 쓴다 — 브라우저와 Node 양쪽에 있고, 이 패키지는 서버·화면 모두가 부른다.
 * `Buffer` 를 쓰면 화면 번들에서 깨진다. 마크 경로는 ASCII 라 `atob` 의 latin1 해석으로 충분하다.
 */
function decodeBase64Url(token: string): string | null {
  // 주소에 들어갈 수 있는 문자만 받는다. 다른 문자가 있으면 base64url 이 아니다
  if (!/^[A-Za-z0-9_-]+$/.test(token)) return null
  try {
    return atob(token.replace(/-/g, '+').replace(/_/g, '/'))
  } catch {
    return null
  }
}

/**
 * `static.3rd.supply` 마크 주소 → 넥슨 마크 주소.
 *
 * @returns 넥슨 주소. **변환할 수 없으면 `null`**
 *
 * - 이미 넥슨 주소면 그대로 돌려준다 (두 번 변환해도 같은 값 — 멱등)
 * - `static.3rd.supply/marks/default.png` 는 **주소가 아니라 「마크 없음」**이므로 `null` 이다.
 *   원본 사이트의 대체이미지를 우리 화면에 띄우면 그것이야말로 자산을 그대로 쓰는 것이고,
 *   `null` 로 두면 우리가 직접 그린 `FallbackClanMark` 가 나온다
 * - 그 밖에 풀리지 않는 것도 전부 `null`
 */
export function supplyMarkUrlToNexon(url: string | null | undefined): string | null {
  if (!url) return null

  // 이미 넥슨 주소다. 멱등하게 그대로 둔다
  if (url.startsWith(NEXON_MARK_PREFIX)) return url

  if (!url.startsWith(SUPPLY_MARK_PREFIX) || !url.endsWith('.png')) return null

  const token = url.slice(SUPPLY_MARK_PREFIX.length, -'.png'.length)

  // 원본 사이트가 마크 없는 클랜에 물려 둔 자체 대체이미지. 주소로 옮기지 않는다
  if (token === 'default') return null

  const path = decodeBase64Url(token)
  if (path === null || !isNexonMarkPath(path)) return null

  return `${NEXON_MARK_PREFIX}${path}.png`
}

/**
 * **화면으로 내보낼 때** 쓰는 쪽. 위 함수와 한 곳만 다르다 —
 * **원본 사이트 주소가 아니면 손대지 않고 그대로 돌려준다.**
 *
 * ── 왜 갈랐나
 *   `supplyMarkUrlToNexon` 은 **DB 에 쓸 때** 쓰는 함수라 모르는 것을 전부 `null` 로 만든다.
 *   반쯤 바뀐 주소가 저장되는 것이 가장 나쁘기 때문이다.
 *
 *   내보낼 때는 그 규칙이 **반대로 해롭다.** 모르는 호스트를 `null` 로 만들면, 언젠가
 *   다른 곳에 올린 마크가 **화면에서 조용히 사라진다.** 못 그리는 것보다 그리는 편이 낫고,
 *   틀렸을 때 손해도 작다 — 이미 저장돼 있던 주소를 그대로 쓰는 것뿐이다.
 *
 * ── 그래도 `null` 이 되는 것
 *   원본 사이트 주소이면서 풀리지 않는 것(`default.png` 포함)은 `null` 이다.
 *   그 주소들은 원본 사이트가 죽으면 어차피 못 그린다. 미리 구름으로 떨어뜨리는 것이 맞다.
 */
export function restoreClanMarkUrl(url: string | null | undefined): string | null {
  if (!url) return null
  // 원본 사이트 주소가 아니면 우리가 판단할 일이 아니다. 그대로 둔다
  if (!url.startsWith(SUPPLY_MARK_PREFIX)) return url
  return supplyMarkUrlToNexon(url)
}

/**
 * 배경·전경 두 칸을 한 번에 — 화면용(`restoreClanMarkUrl`).
 *
 * 화면 계약(`ClanSummary.mark`)이 두 칸을 함께 다루므로 매퍼가 부르기 편하도록 둔다.
 * 한 칸만 변환에 실패해도 **나머지 한 칸은 살린다** — 두 레이어 중 하나만 있는 클랜이
 * 실제로 있고(`clanMarkPolicy` 가 그 경우를 허용한다), 한쪽 실패로 둘 다 버릴 이유가 없다.
 */
export function restoreClanMark(mark: {
  bg: string | null
  front: string | null
}): { bg: string | null; front: string | null } {
  return {
    bg: restoreClanMarkUrl(mark.bg),
    front: restoreClanMarkUrl(mark.front),
  }
}
