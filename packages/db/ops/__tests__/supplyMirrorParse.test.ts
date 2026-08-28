/**
 * 3rd.supply 미러링 판독 회귀 (D-153).
 *
 * 수집 파일 자체는 저장소에 없다(gitignore). 그래서 여기서는 **실측 응답 모양을 옮겨 적은
 * 작은 픽스처**로 규칙을 고정한다. 규칙이 바뀌면 이 테스트가 먼저 깨져야 한다.
 */
import { describe, expect, it } from 'vitest'
import {
  buildClanDirectory,
  parsePlayTimeSeconds,
  parseSupplyDateTime,
  parseSupplyMirrorFile,
  resolveSeenSide,
  summarizeParsedSupply,
  type SupplyMatchDetailRowRaw,
  type SupplyMirrorFileLike,
} from '../supplyMirrorParse'

const RED_CLAN = {
  id: 69,
  name: 'iramors+',
  slug: 'iramorszz',
  mark_bg: 'https://static.example.invalid/bg.png',
  mark_front: 'https://static.example.invalid/front.png',
}
const BLUE_CLAN = {
  id: 109,
  name: '엘리게이터',
  slug: 'alligatorteam',
  mark_bg: null,
  mark_front: null,
}

function player(id: number, name: string, clan: typeof RED_CLAN | typeof BLUE_CLAN | null) {
  return { id, name, clan }
}

function detailRow(
  id: number,
  name: string,
  clan: typeof RED_CLAN | typeof BLUE_CLAN | null,
  win: boolean,
  extra: Partial<SupplyMatchDetailRowRaw> = {},
): SupplyMatchDetailRowRaw {
  return {
    player: player(id, name, clan),
    kill: 4,
    death: 10,
    assist: 6,
    headshot: 0,
    damage: 820,
    win,
    dropout: false,
    weapon: 0,
    rating: 2910,
    rating_update: 6,
    placement: false,
    ...extra,
  }
}

/** `_seenFrom` = iramorszz(레드) 가 이긴 5:5 한 판 */
function fixture(overrides: Partial<SupplyMirrorFileLike> = {}): SupplyMirrorFileLike {
  return {
    leagueSlug: 'daerule',
    leagueId: 2,
    capturedAt: '2026-08-27',
    clans: {
      iramorszz: { leagueClanId: 70, clanId: 69, name: 'iramors+', division: 1 },
      alligatorteam: { leagueClanId: 2658, clanId: 109, name: '엘리게이터', division: 2 },
    },
    matches: {
      '260725213928124003': {
        id: '260725213928124003',
        map: '프로방스',
        mvp_player_id: 1929712752,
        player_count: 10,
        start_at: '2026-07-25 21:39:28',
        end_at: '2026-07-25 21:55:00',
        play_time: '15분 32초',
        rating_update: 9,
        win: true,
        blue_team: false,
        placement: false,
        opponent: {
          id: 2658,
          rating: 1754,
          division: 2,
          placement: false,
          clan: BLUE_CLAN,
        },
        _seenFrom: 'iramorszz',
      },
    },
    details: {
      '260725213928124003': {
        red: [
          detailRow(822639230, 'zarkley', RED_CLAN, true),
          detailRow(1208089995, 'SC1..안현수', RED_CLAN, true),
          detailRow(1342349096, 'Dream', RED_CLAN, true),
          detailRow(1845821032, 'march', RED_CLAN, true, { weapon: 1 }),
          detailRow(1929712752, 'slyzz', RED_CLAN, true, { weapon: 1 }),
        ],
        blue: [
          detailRow(467189, '빈유좋아', BLUE_CLAN, false),
          detailRow(553768214, '막걸리5', BLUE_CLAN, false),
          detailRow(990857225, '무소속용병', null, false),
          detailRow(990857226, '탈주자', BLUE_CLAN, false, { dropout: true }),
          detailRow(990857227, '알수없음', BLUE_CLAN, false, {
            kill: null,
            death: null,
            assist: null,
            headshot: null,
            damage: null,
            weapon: null,
          }),
        ],
      },
    },
    ...overrides,
  }
}

describe('플레이 시간 판독', () => {
  it('"19분 46초" 는 1186초다', () => {
    expect(parsePlayTimeSeconds('19분 46초')).toBe(1186)
  })

  it('"58초" 는 58초다', () => {
    expect(parsePlayTimeSeconds('58초')).toBe(58)
  })

  it('시간 단위도 읽는다', () => {
    expect(parsePlayTimeSeconds('1시간 2분 3초')).toBe(3723)
  })

  it('없으면 null 이다 — 0 으로 만들지 않는다', () => {
    expect(parsePlayTimeSeconds(null)).toBeNull()
    expect(parsePlayTimeSeconds(undefined)).toBeNull()
    expect(parsePlayTimeSeconds('')).toBeNull()
    expect(parsePlayTimeSeconds('알수없음')).toBeNull()
  })

  it('원본이 음수를 주면 그대로 읽되, 경기 값으로는 쓰지 않는다', () => {
    /* 원본 end_at 이 분 단위로 잘려 있어 실제로 나오는 값이다 */
    expect(parsePlayTimeSeconds('-14초')).toBe(-14)

    const file = fixture()
    file.matches['260725213928124003']!.play_time = '-14초'
    const [match] = parseSupplyMirrorFile(file).matches
    expect(match?.playTimeParsed).toBe(-14)
    expect(match?.playTime).toBeNull()
    expect(match?.playTimeNegative).toBe(true)
  })
})

describe('시각 판독', () => {
  it('원본 표기는 KST 다 — UTC 로 바꾼다', () => {
    expect(parseSupplyDateTime('2026-07-25 21:39:28')?.toISOString()).toBe(
      '2026-07-25T12:39:28.000Z',
    )
  })

  it('모양이 다르면 추측하지 않는다', () => {
    expect(parseSupplyDateTime('2026/07/25')).toBeNull()
    expect(parseSupplyDateTime(null)).toBeNull()
  })
})

describe('진영 ↔ 클랜 연결', () => {
  it('blue_team 과 참가자 win 이 같은 답을 주면 both 로 확정한다', () => {
    const [match] = parseSupplyMirrorFile(fixture()).matches
    expect(match?.seenSide).toBe('red')
    expect(match?.sideEvidence).toBe('both')
    expect(match?.redClan?.slug).toBe('iramorszz')
    expect(match?.blueClan?.slug).toBe('alligatorteam')
    expect(match?.winnerSide).toBe('red')
  })

  it('근거 하나만 있어도 잇되 무엇으로 이었는지 남긴다', () => {
    const file = fixture()
    file.matches['260725213928124003']!.blue_team = null
    const [match] = parseSupplyMirrorFile(file).matches
    expect(match?.sideEvidence).toBe('participant_win')
    expect(match?.redClan?.slug).toBe('iramorszz')
  })

  it('근거가 어긋나면 잇지 않는다 — null 로 두고 표시하지 않는다', () => {
    const file = fixture()
    // blue_team 은 "블루" 라고 하는데 참가자 승패는 "레드" 라고 한다
    file.matches['260725213928124003']!.blue_team = true
    const [match] = parseSupplyMirrorFile(file).matches
    expect(match?.seenSide).toBeNull()
    expect(match?.sideEvidence).toBeNull()
    expect(match?.redClan).toBeNull()
    expect(match?.blueClan).toBeNull()
    expect(match?.redDivision).toBeNull()
    expect(match?.warnings).toContain('side_evidence_conflict')
  })

  it('근거가 하나도 없으면 잇지 않는다', () => {
    const file = fixture()
    const row = file.matches['260725213928124003']!
    row.blue_team = null
    row.win = null
    const [match] = parseSupplyMirrorFile(file).matches
    expect(match?.seenSide).toBeNull()
    expect(match?.redClan).toBeNull()
    expect(match?.blueClan).toBeNull()
  })

  it('한 행만 있으면 상대 점수만 안다 — 없는 칸은 지어내지 않는다', () => {
    const [match] = parseSupplyMirrorFile(fixture()).matches
    // 목록 한 행은 상대(블루)의 rating 과 보는 쪽(레드)의 rating_update 만 준다
    expect(match?.blueSourceRating).toBe(1754)
    expect(match?.redSourceRating).toBeNull()
    expect(match?.redSourceRatingUpdate).toBe(9)
    expect(match?.blueSourceRatingUpdate).toBeNull()
  })

  it('그 클랜이 다른 경기에서 상대로 나왔으면 **양쪽 다** 채운다 (D-155 후속)', () => {
    /* 같은 두 클랜이 서로의 화면에서 한 번씩 보인다.
       두 번째 행이 iramorszz 의 점수(2100)를 알려 주므로 첫 경기의 레드 칸도 채워진다 */
    const file = fixture()
    const mirrored = {
      ...file.matches['260725213928124003']!,
      id: '260726213928124003',
      start_at: '2026-07-26 21:39:28',
      end_at: '2026-07-26 21:55:00',
      win: false,
      blue_team: true,
      rating_update: -11,
      opponent: {
        id: 70,
        rating: 2100,
        division: 1,
        placement: false,
        clan: RED_CLAN,
      },
      _seenFrom: 'alligatorteam',
    }
    file.matches['260726213928124003'] = mirrored
    file.details!['260726213928124003'] = file.details!['260725213928124003']!

    const parsed = parseSupplyMirrorFile(file)
    const [first] = parsed.matches
    expect(first?.sourceMatchId).toBe('260725213928124003')
    // 레드(iramorszz)는 두 번째 행에서 상대로 나오며 점수가 드러났다
    expect(first?.redSourceRating).toBe(2100)
    expect(first?.blueSourceRating).toBe(1754)
    // 증감은 여전히 보는 쪽 것만 있다 — 상대 증감은 원본 어디에도 없다
    expect(first?.redSourceRatingUpdate).toBe(9)
    expect(first?.blueSourceRatingUpdate).toBeNull()
  })

  it('부리그도 양쪽 다 채운다', () => {
    const [match] = parseSupplyMirrorFile(fixture()).matches
    expect(match?.redDivision).toBe(1) // 클랜 목록에서
    expect(match?.blueDivision).toBe(2) // 상대팀 항목에서
    expect(match?.redPlacement).toBe(false)
    expect(match?.bluePlacement).toBe(false)
  })

  it('수집 파일 클랜 목록에 점수가 있으면 그것으로 보는 쪽을 채운다 (D-157 연동)', () => {
    /* 수집기가 클랜랭킹의 `rating` 을 체크포인트에 저장하기 시작했다.
       그 값이 들어오는 순간 **상대로 한 번도 안 나온 클랜**도 점수를 얻는다 —
       지금 점수가 비어 있는 12개 클랜이 정확히 그 경우다 */
    const file = fixture()
    file.clans!['iramorszz']!.rating = 2345
    const [match] = parseSupplyMirrorFile(file).matches
    expect(match?.redSourceRating).toBe(2345)
    expect(match?.blueSourceRating).toBe(1754)
  })

  it('어디에도 점수가 없으면 null 이다 — 상대 점수를 자기 것으로 돌려쓰지 않는다', () => {
    const [match] = parseSupplyMirrorFile(fixture()).matches
    expect(match?.redSourceRating).toBeNull()
    expect(match?.blueSourceRating).not.toBe(match?.redSourceRating)
  })
})

describe('참가자 판독', () => {
  it('red 5 / blue 5 를 그대로 유지한다', () => {
    const [match] = parseSupplyMirrorFile(fixture()).matches
    expect(match?.participants.filter((p) => p.side === 'red')).toHaveLength(5)
    expect(match?.participants.filter((p) => p.side === 'blue')).toHaveLength(5)
  })

  it('K/D 가 null 이면 null 그대로다 — 0 으로 채우지 않는다', () => {
    const [match] = parseSupplyMirrorFile(fixture()).matches
    const unknown = match?.participants.find((p) => p.name === '알수없음')
    expect(unknown?.kill).toBeNull()
    expect(unknown?.death).toBeNull()
    expect(unknown?.assist).toBeNull()
    expect(unknown?.headshot).toBeNull()
    expect(unknown?.damage).toBeNull()
    expect(unknown?.weapon).toBeNull()
    // 0 이 실제 값인 사람은 0 그대로다
    expect(match?.participants.find((p) => p.name === 'zarkley')?.headshot).toBe(0)
  })

  it('경기 당시 래더는 source 칸에만 담는다', () => {
    const [match] = parseSupplyMirrorFile(fixture()).matches
    const row = match?.participants.find((p) => p.name === 'zarkley')
    expect(row?.sourceRating).toBe(2910)
    expect(row?.sourceRatingDelta).toBe(6)
  })

  it('MVP 지목이 있으면 나머지는 false, 지목이 없으면 전부 null 이다', () => {
    const [withMvp] = parseSupplyMirrorFile(fixture()).matches
    expect(withMvp?.participants.find((p) => p.name === 'slyzz')?.mvp).toBe(true)
    expect(withMvp?.participants.find((p) => p.name === 'zarkley')?.mvp).toBe(false)

    const file = fixture()
    file.matches['260725213928124003']!.mvp_player_id = null
    const [withoutMvp] = parseSupplyMirrorFile(file).matches
    expect(withoutMvp?.participants.every((p) => p.mvp === null)).toBe(true)
  })

  it('무소속 참가자의 클랜은 null 이다', () => {
    const [match] = parseSupplyMirrorFile(fixture()).matches
    expect(match?.participants.find((p) => p.name === '무소속용병')?.clan).toBeNull()
    expect(match?.participants.find((p) => p.name === '탈주자')?.dropout).toBe(true)
  })

  it('선수 id 가 없는 줄은 만들지 않는다', () => {
    const file = fixture()
    file.details!['260725213928124003']!.red![0]!.player = { id: null, name: '이름만' }
    const [match] = parseSupplyMirrorFile(file).matches
    expect(match?.participants.filter((p) => p.side === 'red')).toHaveLength(4)
    expect(match?.warnings).toContain('participant_without_player_id')
  })
})

describe('파일 단위 판독', () => {
  it('상세가 없는 경기는 사유와 함께 남긴다 — 조용히 버리지 않는다', () => {
    const file = fixture()
    file.matches['260726000000124001'] = {
      ...file.matches['260725213928124003']!,
      id: '260726000000124001',
    }
    const parsed = parseSupplyMirrorFile(file)
    expect(parsed.matches).toHaveLength(1)
    expect(parsed.unparsed).toEqual([
      { sourceMatchId: '260726000000124001', reason: 'detail_missing' },
    ])
  })

  it('클랜 사전은 여러 곳을 합친다 (마크는 참가자·상대팀 · division 은 클랜 목록)', () => {
    const directory = buildClanDirectory(fixture())
    expect(directory.get('iramorszz')).toMatchObject({
      sourceClanId: '69',
      markBgUrl: 'https://static.example.invalid/bg.png',
      division: 1,
      sourceLeagueClanId: '70',
    })
    expect(directory.get('alligatorteam')?.division).toBe(2)
  })

  it('요약은 완비 여부를 숫자로 준다', () => {
    const summary = summarizeParsedSupply(parseSupplyMirrorFile(fixture()))
    expect(summary).toMatchObject({
      matches: 1,
      participants: 10,
      sideLinked: 1,
      sideUnlinked: 0,
      tenParticipants: 1,
      // 한 명의 K/D/A·딜량·헤드샷·무기가 비어 있다
      kdaComplete: 0,
      weaponComplete: 0,
      sourceRatingComplete: 1,
    })
  })
})

describe('resolveSeenSide', () => {
  it('참가자 승패가 갈리면 그 근거는 쓰지 않는다', () => {
    const detail = {
      red: [detailRow(1, 'a', RED_CLAN, true), detailRow(2, 'b', RED_CLAN, false)],
      blue: [detailRow(3, 'c', BLUE_CLAN, false)],
    }
    const resolved = resolveSeenSide({ id: 'x', win: true, blue_team: null }, detail)
    expect(resolved.seenSide).toBeNull()
    expect(resolved.conflict).toBe(false)
  })
})
