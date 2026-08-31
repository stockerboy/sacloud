/**
 * IPL 등록 클랜 명단 — `docs/IPL_SPEC.md` 2장의 표를 코드로 옮긴 것. **정본이다.**
 *
 * ── 2026-08-31: `apps/worker/src/dev/iplRoster.ts` 에서 여기로 옮겼다 (D-210 후속)
 *   가드(`iplSanplyGuard.ts`)가 "지금 nolink 에 등록행이 있는가" 대신 **이 명단**을
 *   IPL 소속의 근거로 쓰기 때문이다. `packages/db` 는 `apps/worker` 를 import 할 수 없다.
 *   옛 경로는 **지우지 않았다** — 그대로 두고 여기서 다시 내보낸다 (`CLAUDE.md` 10-4).
 *
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
  /* 2026-08-31 사용자 추가. 병영수첩 검색 결과가 하나뿐이고 활발하다
     (최근 20경기 중 16건이 제3보급창고) */
  { given: 'idylic', name: 'idylic', barracks: 'EVOA', tier: 2 },

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
  /* 2026-08-31 사용자 추가 (병영수첩 주소를 직접 줬다 — /clan/terry9532).
     이름이 정확히 `Envy` 인 것은 그 하나이고 최근 20경기 중 18건이 제3보급창고다.
     비슷한 이름이 12곳 더 있다 — `<Envy>` · `Envy`lady` · `Envy.` · `Envy·` 등 */
  { given: 'Envy', name: 'Envy', barracks: 'terry9532', tier: 4 },

  /* --- 5티어 --- */
  { given: 'whitelie', name: 'whitelie:', barracks: 'tispfgid', tier: 5 },
  { given: 'supernova', name: 'supernova^', barracks: 'dbghr', tier: 5 },
  { given: 'overstep', name: 'overstep', barracks: 'rokasa12', tier: 5 },
  { given: 'publicity', name: 'publicity', barracks: 'adelioz', tier: 5 },
  { given: 'needbackup', name: 'NeedΒackup', barracks: 'yoonsh1971', tier: 5 },
  { given: 'romantico', name: 'romantico', barracks: 'zzim1', tier: 5 },
  { given: 'reBellion', name: 'reBelIion', barracks: 'JosenFam', tier: 5 },
  { given: 'major', name: 'Major-', barracks: 'jjangkangsu', tier: 5 },
  /* 2026-08-31 사용자 추가.
     ⚠ 우리 DB 에 `recent.wct-` 라는 이름이 **두 곳**이다. 근거로 골랐다:
       friendliness1  6,298경기 · 어제까지 뛰고 있음 · 최근 20건 중 13건이 제3보급창고  ← 이쪽
       recent15         117경기 · 병영수첩에 매치가 **아예 없다** (죽은 동명이인)
     비슷한 이름의 다른 클랜도 있다 — `recentwct-`(skytak, 점 없음) ·
     `recent.wct`(luminouszzang, 뒤 대시 없음). 넷은 서로 다른 클랜이다 */
  { given: 'recent.wct-', name: 'recent.wct-', barracks: 'friendliness1', tier: 5 },
  /* 2026-08-31 사용자 추가 (병영수첩 주소를 직접 줬다 — /clan/wweqeqtd123).
     이름은 매치 목록 20건에 20번 다 나온 쪽으로 확정했다. 최근 20경기 중 17건이 제3보급창고 */
  { given: 'vAN`kA', name: 'vAN`kA', barracks: 'wweqeqtd123', tier: 5 },

  /* --- 6티어 --- */
  { given: 'everwhite', name: 'everwhite', barracks: 'kelly123', tier: 6 },
  { given: 'Flexible', name: 'FlexibIe', barracks: 'lee2', tier: 6 },
  { given: '베이직', name: '베이직', barracks: 'WebClanGood', tier: 6 },
  { given: 'souffler', name: 'souffler', barracks: 'ircroger', tier: 6 },
  { given: 'Lyrical', name: 'Lyrical:', barracks: 'DooLii', tier: 6 },
  { given: "Raze'", name: "Raze'", barracks: 'tjdwlsqhrdl', tier: 6 },
]

/**
 * 눈으로 같아 보이는 글자를 접어 비교한다. **비교 전용이고 저장하지 않는다.**
 *
 * `iplRegister.ts` 가 쓰던 `fold()` 를 그대로 옮겨 온 것이다 — 등록과 가드가
 * **같은 규칙으로** 클랜을 알아봐야 둘이 어긋나지 않는다.
 */
export function foldClanName(value: string): string {
  return value
    .replace(/Р/g, 'P')
    .replace(/Β/g, 'B')
    .replace(/[^0-9A-Za-z가-힣]/g, '')
    .toLowerCase()
}

/** 명단에 적힌 모든 표기(현재 이름 + 사용자가 처음 준 옛 표기). 중복 없이 */
export const IPL_ROSTER_NAMES: readonly string[] = [
  ...new Set(IPL_ROSTER.flatMap((entry) => [entry.name, entry.given])),
]

/** 명단의 병영수첩 slug 전부 */
export const IPL_ROSTER_BARRACKS: readonly string[] = IPL_ROSTER.map((entry) => entry.barracks)

/* ── 명단이 바뀌면 청소가 필요해진다 — **코드가 기억한다** (D-210 후속) ────────
 *
 * 명단에 클랜이 하나 들어오면, 그 클랜의 **과거 열산 경기가 소급해서 「IPL끼리」가 된다.**
 * 2026-08-31 에 실제로 그렇게 63건이 생겼다 — 08-30 에 청소했는데 08-31 에 명단이
 * 자랐고, **아무도 청소를 다시 돌리지 않았다.**
 *
 * 사람이 기억하는 것에 맡기지 않는다. 명단의 지문을 찍어 두고, 마지막 청소 때의
 * 지문과 다르면 대조(`ipl-sanply-check`)가 **잡을 실패시킨다.**
 */

/**
 * 명단의 **소속 지문**. `barracks`(= 병영수첩 slug) 만 본다.
 *
 * 티어는 넣지 않는다 — 티어가 바뀌어도 **누가 IPL 인지는 그대로**라서 청소가 필요 없다.
 * 지문이 달라지는 것은 클랜이 **들어오거나 빠질 때**뿐이다.
 */
export function iplRosterFingerprint(roster: readonly IplClan[] = IPL_ROSTER): string {
  const barracks = [...roster.map((entry) => entry.barracks)].sort()
  /* 해시가 아니라 **읽을 수 있는 값**으로 둔다. 어긋났을 때 무엇이 늘었는지
     사람이 눈으로 바로 비교할 수 있어야 한다 (3-A 6번 — 조용히 넘어가지 않는다) */
  return `${barracks.length}:${barracks.join(',')}`
}

/** 두 지문의 차이 — 무엇이 늘고 무엇이 빠졌나 */
export function diffIplRosterFingerprint(
  before: string,
  after: string,
): { added: string[]; removed: string[] } {
  const partsOf = (value: string): Set<string> =>
    new Set((value.split(':')[1] ?? '').split(',').filter(Boolean))
  const a = partsOf(before)
  const b = partsOf(after)
  return {
    added: [...b].filter((slug) => !a.has(slug)).sort(),
    removed: [...a].filter((slug) => !b.has(slug)).sort(),
  }
}
