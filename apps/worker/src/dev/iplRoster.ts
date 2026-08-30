/**
 * IPL 등록 클랜 39곳 명단 — `docs/IPL_SPEC.md` 2장의 표를 코드로 옮긴 것.
 *
 * ── 티어는 사용자가 정한다 (IPL_SPEC 4-2). 우리가 바꾸지 않는다
 *   2026-08-30 사용자 지시: **1티어는 비운다.** 원래 1티어였던 4곳은 2티어로 합류시킨다.
 *   그래서 아래 표의 `tier` 는 `IPL_SPEC.md` 2장 표와 1티어 자리만 다르다.
 *
 * ── 이름은 **병영수첩 실제 클랜명**이다
 *   동형문자(대문자 `I`, 키릴 `Р`, 그리스 `Β`)가 섞여 있다. 눈으로 같아 보여도 다른 글자다.
 *   **고치지 마라.** 고치면 병영수첩에서 못 찾는다.
 *
 * ── `barracks` 는 병영수첩 URL slug 다 (`https://barracks.sa.nexon.com/clan/<slug>`)
 *   병영수첩 API 의 `clan_id` 가 곧 이 값이다 (IPL_SPEC 7장).
 */

export interface IplClan {
  /** 사용자가 처음 적어 준 표기 — 대조용으로 남긴다 */
  given: string
  /** 병영수첩 실제 클랜명 (동형문자 포함) */
  name: string
  /** 병영수첩 URL slug = API 의 `clan_id` */
  barracks: string
  /** 1~6. 1티어는 비운다 (2026-08-30 사용자 지시) */
  tier: number
}

export const IPL_ROSTER: readonly IplClan[] = [
  /* --- 원래 1티어였던 4곳. 사용자 지시로 2티어에 합류했다 --- */
  { given: 'amarilys', name: 'amaryllis', barracks: 'fdd8', tier: 2 },
  { given: 'igloo', name: 'igloo', barracks: 'luverduck12', tier: 2 },
  { given: "hing'", name: 'hingˇ', barracks: 'adgeodud20', tier: 2 },
  { given: 'evermore', name: 'evermore', barracks: '4473', tier: 2 },

  /* --- 2티어 --- */
  { given: 'deluxe', name: 'deluxe', barracks: '042222741', tier: 2 },
  { given: 'sometimes', name: 'sometimes', barracks: 'minjihun', tier: 2 },
  { given: 'veritas', name: '〃veritas', barracks: '01025606089', tier: 2 },
  { given: 'hardcores', name: 'hardcores', barracks: 'ckdals2457', tier: 2 },
  { given: 'vuvuzela', name: 'vuvuzela', barracks: 'uava01', tier: 2 },
  { given: 'grave', name: 'grave', barracks: 'saffggaaz', tier: 2 },

  /* --- 3티어 --- */
  { given: 'Quassar', name: 'QuasaR-', barracks: 'pigforever', tier: 3 },
  { given: 'Atraxia', name: 'Atraxia', barracks: 'eee07', tier: 3 },
  { given: 'nightbloom', name: 'pIacebo', barracks: 'ytsys', tier: 3 },
  { given: 'pleniue', name: 'pleniIune', barracks: 'JJUN', tier: 3 },
  { given: 'celestial', name: 'ceIestial', barracks: 'IrenecIan', tier: 3 },
  { given: 'methodcrew', name: 'methodcrew', barracks: 'ssdko', tier: 3 },
  { given: 'luvme', name: 'luvme', barracks: 'hanbi0302', tier: 3 },

  /* --- 4티어 --- */
  { given: 'dominator', name: 'dominator:', barracks: 'Reverse3', tier: 4 },
  { given: 'promise', name: 'Рromise', barracks: 'Ssnake', tier: 4 },
  { given: 'imperium', name: 'imperium:', barracks: 'OhMyLoVe', tier: 4 },
  { given: 'izmir', name: 'izmir-', barracks: 'dregonlif', tier: 4 },
  { given: 'crucialrz', name: 'crucialrz', barracks: 'backspace00', tier: 4 },
  { given: 'Asterisk', name: 'Asterisk', barracks: 'clanhanul', tier: 4 },
  { given: 'adererror', name: 'adererror', barracks: 'valentina2', tier: 4 },
  { given: '레트로폭탄', name: '레트로폭탄', barracks: 'wdasdw', tier: 4 },

  /* --- 5티어 --- */
  { given: 'whitelie', name: 'whitelie:', barracks: 'tispfgid', tier: 5 },
  { given: 'supernova', name: 'supernova^', barracks: 'dbghr', tier: 5 },
  { given: 'overstep', name: 'overstep', barracks: 'rokasa12', tier: 5 },
  { given: 'publicity', name: 'publicity', barracks: 'adelioz', tier: 5 },
  { given: 'needbackup', name: 'NeedΒackup', barracks: 'yoonsh1971', tier: 5 },
  { given: 'romantico', name: 'romantico', barracks: 'zzim1', tier: 5 },
  { given: 'reBellion', name: 'reBelIion', barracks: 'JosenFam', tier: 5 },
  { given: 'major', name: 'Major-', barracks: 'jjangkangsu', tier: 5 },

  /* --- 6티어 --- */
  { given: 'everwhite', name: 'everwhite', barracks: 'kelly123', tier: 6 },
  { given: 'Flexible', name: 'FlexibIe', barracks: 'lee2', tier: 6 },
  { given: '베이직', name: '베이직', barracks: 'WebClanGood', tier: 6 },
  { given: 'souffler', name: 'souffler', barracks: 'ircroger', tier: 6 },
  { given: 'Lyrical', name: 'Lyrical:', barracks: 'DooLii', tier: 6 },
  { given: "Raze'", name: "Raze'", barracks: 'tjdwlsqhrdl', tier: 6 },
]
