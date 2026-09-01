/**
 * **DB 에 있는 클랜마크 URL 이 실제로 화면에 그려질 수 있는가**를 본다 (2026-08-31 결함).
 *
 * ── 무슨 일이 있었나
 *   IPL 클랜랭킹에서 마크가 여러 개 안 보였다. 그런데
 *     · DB 에는 URL 이 멀쩡히 있었고
 *     · 그 URL 을 직접 열면 200 · image/png 였고
 *     · `clan-mark-audit` 은 `마크없음 0` 이라고 답했다
 *   원인은 **우리 CSP** 였다. `img-src` 가 `static.3rd.supply` 만 열어 둬서
 *   `img.sa.nexon.com` 에서 오는 마크를 브라우저가 통째로 막고 있었다.
 *   감사 도구가 "URL 이 있는가" 만 보고 "그려지는가" 를 안 봐서 **끝난 줄 알고 넘어갔다.**
 *
 * ── 그래서 이 테스트가 지키는 것
 *   운영 DB 가 실제로 쓰는 마크 호스트가 CSP 에 **전부** 들어 있는가.
 *   호스트가 하나 늘면 여기서 빨개진다.
 */
import { describe, expect, it } from 'vitest'
import { CLAN_MARK_HOSTS } from '../next.config'

/**
 * 우리가 실제로 관측한 마크 URL 꼴 (2026-08-31 · 운영 API 실측).
 *
 * 두 호스트는 **같은 이미지의 미러**다 — `static.3rd.supply` 는 넥슨 경로를 base64 로
 * 감싼 것뿐이고(`NTEvMF8xMl8xNjE` = `51/0_12_161`) 바이트 수까지 같다.
 */
const OBSERVED_MARK_URLS = [
  'https://img.sa.nexon.com/sa/clan/mark/51/0_12_164.png',
  'https://img.sa.nexon.com/sa/clan/mark/51/0_12_161.png',
  'https://img.sa.nexon.com/sa/clan/mark/51/0_13_015.png',
] as const

/**
 * ⚠ **정정 (2026-09-01)** — 위 목록에서 `static.3rd.supply` 두 줄을 **뺐다.**
 *
 * 위 주석의 «두 호스트는 같은 이미지의 미러다» 는 서술은 **그때는 맞았다.** 지금은 한 곳이다.
 * 서술을 지우지 않고 여기에 정정을 단다 (`CLAUDE.md` 10-4).
 *
 *   운영에 `clan-mark-restore --confirm` 을 돌렸다 — 402곳 · 804칸 치환, **남은 0곳**.
 *   새 적재도 넥슨 주소로 들어오고(`supplyMarkUrlToNexon`), 읽기 때 한 번 더 거른다
 *   (`mappers.ts` 의 `restoreClanMark`). `clan-mark-audit` 은 세 리그 모두 **CSP차단 0**.
 *
 * 아래는 «옛 데이터가 이렇게 생겼었다» 의 기록이다. **허용 목록에 있으면 안 된다.**
 */
const RETIRED_MARK_URLS = [
  'https://static.3rd.supply/marks/NTEvMF8xMl8xNjE.png',
  'https://static.3rd.supply/marks/NTEvMF8xMl8wMTY.png',
] as const

function originOf(url: string): string {
  return new URL(url).origin
}

describe('클랜마크 CSP — DB 의 URL 이 화면에 그려질 수 있는가', () => {
  it('관측된 마크 URL 의 호스트가 전부 허용 목록에 있다', () => {
    for (const url of OBSERVED_MARK_URLS) {
      expect(CLAN_MARK_HOSTS as readonly string[]).toContain(originOf(url))
    }
  })

  it('넥슨 공식 CDN 이 열려 있다 — 이게 빠져서 IPL 마크가 안 보였다', () => {
    expect(CLAN_MARK_HOSTS as readonly string[]).toContain('https://img.sa.nexon.com')
  })

  /**
   * ⚠ **뒤집힌 시험 (2026-09-01)** — 원래는 «3rd.supply 미러도 열려 있다» 였다.
   *
   * 지금은 반대를 지킨다: **원본 사이트 자산에 링크를 걸지 않는다** (`CLAUDE.md` 3장 4번).
   * 열어 두면 «안 쓰는데 열려 있는 문» 이고, 그 문이 있으면 실수로 다시 들어온다.
   * 되돌리려면 위 `RETIRED_MARK_URLS` 주석의 근거 셋이 **다시 거짓이 되었는지** 부터 봐라.
   */
  it('원본 사이트(3rd.supply)는 **막혀 있다** — 되돌린 뒤 문을 닫았다', () => {
    expect(CLAN_MARK_HOSTS as readonly string[]).not.toContain('https://static.3rd.supply')
    for (const url of RETIRED_MARK_URLS) {
      expect(CLAN_MARK_HOSTS as readonly string[]).not.toContain(originOf(url))
    }
  })

  it('호스트는 스킴까지 적는다 — CSP 에서 `origin` 형태여야 한다', () => {
    for (const host of CLAN_MARK_HOSTS) {
      expect(host).toMatch(/^https:\/\//)
      expect(host).not.toMatch(/\/$/)
      expect(() => new URL(host)).not.toThrow()
    }
  })
})
