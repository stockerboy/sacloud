/**
 * **화면에서 뺀 카드가 정말 꺼져 있나** (2026-09-04 · 사장님 지시).
 *
 * > ★«육각형 다 빼 이제 질린다 채워지지도 않는거 선 걍 하나로 해 킬데스만 보이게»★
 *
 * ══ ★왜 검사로 두나★ ══
 *
 * ★브라우저로 확인하려 했는데 붙지 않았다★ (`javascript_tool` 이 네 번 중 한 번만 붙는다).
 * ★그러면 「됐습니다」로 넘길 게 아니라 다른 방법으로 못박아야 한다.★
 *
 * 이 검사는 ★화면 파일의 스위치를 직접 읽는다.★ 렌더링을 흉내 내지 않는다 —
 * ★흉내 낸 것이 통과해도 진짜 화면은 다를 수 있다.★ ★스위치는 거짓말을 못 한다.★
 *
 * ⚠ ★이 검사가 깨지면 「누군가 다시 켰다」는 뜻이다.★ 켠 사람이 이유를 여기 적으면 된다.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8')

const PLAYER = read('app/league/[leagueSlug]/player/[playerId]/LeaguePlayerRecordScreen.tsx')
const CLAN = read('app/league/[leagueSlug]/clan/[clanSlug]/LeagueClanRecordScreen.tsx')

describe('화면에서 뺀 카드 (2026-09-04)', () => {
  it('★선수 전투력 육각형이 꺼져 있다★', () => {
    expect(PLAYER).toContain('const SHOW_TRAIT_HEXAGON: boolean = false')
  })

  it('★플레이스타일 막대가 꺼져 있다★', () => {
    expect(PLAYER).toContain('const SHOW_PLAYSTYLE: boolean = false')
  })

  it('★클랜 육각형이 꺼져 있다★', () => {
    expect(CLAN).toContain('const SHOW_CLAN_HEXAGON: boolean = false')
  })

  it('★스위치가 실제로 그리는 자리에 걸려 있다★ — 선언만 해 놓고 안 쓰면 소용없다', () => {
    expect(PLAYER).toContain('!SHOW_TRAIT_HEXAGON || data.traits === null')
    expect(PLAYER).toContain('!SHOW_PLAYSTYLE || data.playstyle === null')
    expect(CLAN).toContain('SHOW_CLAN_HEXAGON && (data.hexagon_v2 || data.hexagon)')
  })

  /*
   * ★코드는 지우지 않는다★ (`CLAUDE.md` 1-4). 화면에서만 뺀 것이다 —
   * ★되살리려면 스위치 하나만 바꾸면 된다★ 는 상태가 유지돼야 한다.
   */
  it('★그리는 코드는 그대로 남아 있다★ — 지운 게 아니라 껐다', () => {
    expect(PLAYER).toContain('<TraitHexagon')
    expect(PLAYER).toContain('<PlaystyleBars')
    expect(CLAN).toContain('<ClanHexagonV2')
    expect(CLAN).toContain('<ClanHexagon ')
  })

  /*
   * ⚠ ★클랜 육각형이 TOP3 를 품고 있었다.★ 같이 끄면 ★TOP3 까지 사라진다★ —
   *   TOP3 는 따로 주신 것(지시 #27)이라 ★살려 둬야 한다.★
   */
  it('★클랜 TOP3 는 육각형을 꺼도 남는다★', () => {
    /* 육각형 안(aside) 과 밖, 두 곳에 있어야 한다 */
    expect(CLAN.split('<ClanTop3').length - 1).toBeGreaterThanOrEqual(2)
  })

  it('★왜 껐는지가 파일에 적혀 있다★ — 다음 세션이 「왜 껐지?」 하고 되살리지 않게', () => {
    expect(PLAYER).toContain('육각형 다 빼')
    expect(PLAYER).toContain('채워지지도 않는거')
    expect(CLAN).toContain('육각형 다 빼')
  })
})
