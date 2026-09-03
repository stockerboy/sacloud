/**
 * **한 클랜은 한 리그에만 있는다 — 나머지에서는 감춘다** (O-044 · 2026-09-03 사장님 회의).
 *
 * ══ 사장님이 정하신 것 ══
 *
 * > «등록도 겹치면 안된다 못박아라. **열산클랜이 SPL에 합류하면 그 열산클랜은
 * >  더 이상 열산클랜이 아니고 그 반대도 마찬가지이다**»
 * > «Castle vs Mirage 는 열산클랜이 더 이상 아니다. **둘이 대결한 기록은 반드시 spl에만 존재한다**»
 * > «Castle vs 너구리마을 — 캐슬의 spl기록에 절대로 너구리마을이 뜨면 안된다.
 * >  **하지만 너구리마을의 기록에서는 남겨라. 그리고 이 기록은 열산 킬뎃과 승률에
 * >  당연히 포함되어 계산된다**»
 *
 * ★43곳을 사장님이 직접 분류하셨다.★ 29곳은 SPL, 14곳은 10mountain(열산)으로 남는다.
 *
 * ══ ★「감춘다」지 「없앤다」가 아니다★ ══
 *
 * ```
 * 한다      그 리그의 목록·랭킹에서 ★안 보이게★ 한다
 * ★안 한다★ 경기를 지우지 않는다 · 집계에서 빼지 않는다 · 등록행을 지우지 않는다
 * ```
 * ⚠ ★**집계에서 빼면 사장님 말씀과 반대가 된다.**★ 너구리마을의 열산 킬뎃·승률에는
 *   그 경기가 **그대로 들어가야 한다.** 감추는 것은 ★보는 자리★ 이지 ★세는 자리★ 가 아니다.
 *
 * ══ ★이름이 아니라 slug 로 짝짓는다★ ══
 *
 * `＃chasepIay`(대문자 I) 와 `＃chaseplay`(소문자 l) 처럼 **눈으로 구별이 안 되는 이름**이 있다.
 * 이름으로 짝지으면 반드시 섞인다. ★아래 표는 slug 다.★
 * (2026-09-03 에 이름 43개가 DB 와 정확히 맞는 것을 확인하고 slug 를 뽑았다)
 */

/** 그 리그에서 감출 클랜의 `Clan.slug` 목록 */
export interface HiddenInLeague {
  /** `League.slug` — 이 리그에서 감춘다 */
  league: string
  /** 감출 `Clan.slug` 들 */
  clanSlugs: readonly string[]
}

/**
 * ★SPL 로 남은 29곳 → 열산에서 감춘다★ · ★열산으로 남은 14곳 → SPL 에서 감춘다★
 *
 * ⚠ 되살리려면 그 slug 를 이 표에서 빼면 된다. ★데이터는 그대로 있다.★
 */
export const CLAN_HIDDEN_IN_LEAGUE: readonly HiddenInLeague[] = [
  {
    /* 사장님이 SPL 로 정하신 29곳 — 열산에서 안 보이게 한다 */
    league: 'sanply',
    clanSlugs: [
      '42jowoon',
      'AimEnvy',
      'Akillclass',
      'DOKKIMAMA',
      'DirTyGhost',
      'Ensemble',
      'Gurisi',
      'HardBotrio',
      'adfafasf',
      'ajwjdjwuwuei5',
      'aksrrzi',
      'bikiniline',
      'ddorr',
      'dsdsd2d2ds',
      'e2stro2017',
      'footmania2',
      'luminouszzang',
      'namechoo',
      're4z',
      'rebirthpro',
      'roma',
      'sachamundara',
      'sorentolove',
      'suddenalexia',
      'susucom',
      'togs4033',
      'tqtqtq1234',
      'warsong',
      'weew1557',
    ],
  },
  {
    /* 사장님이 10mountain 으로 정하신 14곳 — SPL 에서 안 보이게 한다 */
    league: 'supply',
    clanSlugs: [
      '0000000000000',
      'YONSEIHEAD',
      'artilugiaa',
      'devilsclanz',
      'ehdrndusgkq',
      'inpum',
      'lpcrew',
      'resun',
      'rinopin',
      'sdsdsz',
      'sky123pz',
      'skytak',
      'system1',
      'zxcvddr2',
    ],
  },
]

/** 그 클랜이 그 리그에서 감춰져 있는가 */
export function isClanHiddenInLeague(clanSlug: string, leagueSlug: string): boolean {
  const row = CLAN_HIDDEN_IN_LEAGUE.find((r) => r.league === leagueSlug)
  return row ? row.clanSlugs.includes(clanSlug) : false
}

/** 그 리그에서 감춰진 클랜 slug 들 (질의 필터에 그대로 넣는다) */
export function hiddenClanSlugsIn(leagueSlug: string): readonly string[] {
  return CLAN_HIDDEN_IN_LEAGUE.find((r) => r.league === leagueSlug)?.clanSlugs ?? []
}
