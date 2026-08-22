/**
 * 화면 경로 회귀 테스트.
 *
 * 실제로 난 사고를 고정한다 — 참여중인 리그 카드가 기록실 경로에
 * `league_player_id`(리그 참가 레코드 ID)를 넣어서 클릭하면 **빈 페이지**가 됐다.
 *
 * 두 값 모두 "숫자 문자열"이라 타입으로는 걸리지 않는다.
 * 그래서 경로를 만드는 곳을 한 군데로 모으고 여기서 고정한다.
 */
import { describe, expect, it } from 'vitest'
import {
  leagueClanPath,
  leaguePlayerPath,
  leaguePlayerSeasonPath,
  playerPath,
} from '../common/paths.js'

const LEAGUE_SLUG = 'officialmain'
const PLAYER_ID = '500013135'
/** 같은 사람의 **리그 참가 레코드** ID. 경로에 들어가면 안 된다 */
const LEAGUE_PLAYER_ID = '6115'

describe('플레이어 경로', () => {
  it('기록실 경로에는 playerId가 들어간다', () => {
    expect(leaguePlayerPath(LEAGUE_SLUG, PLAYER_ID)).toBe(
      '/league/officialmain/player/500013135',
    )
  })

  it('league_player_id를 넣으면 다른 경로가 된다 — 이것이 빈 페이지 버그였다', () => {
    expect(leaguePlayerPath(LEAGUE_SLUG, LEAGUE_PLAYER_ID)).not.toBe(
      leaguePlayerPath(LEAGUE_SLUG, PLAYER_ID),
    )
  })

  it('기본정보 경로는 리그와 무관하다', () => {
    expect(playerPath(PLAYER_ID)).toBe('/player/500013135')
  })

  it('지난시즌은 기록실 경로 아래에 있다', () => {
    expect(leaguePlayerSeasonPath(LEAGUE_SLUG, PLAYER_ID)).toBe(
      `${leaguePlayerPath(LEAGUE_SLUG, PLAYER_ID)}/season`,
    )
  })

  it('클랜은 슬러그를 쓴다 (플레이어와 규칙이 다르다)', () => {
    expect(leagueClanPath(LEAGUE_SLUG, 'bluestream02')).toBe(
      '/league/officialmain/clan/bluestream02',
    )
  })

  it('리그 슬러그가 경로 앞에 온다 — 리그마다 기록실이 다르다', () => {
    expect(leaguePlayerPath('secondline', PLAYER_ID)).toBe(
      '/league/secondline/player/500013135',
    )
  })
})
