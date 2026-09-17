/**
 * ★구역별 어택/방어 · 자리(포지션)★ — 사장님이 정하신 규칙의 단일 출처 (2026-09-17).
 *
 * 이 파일은 **순수 함수**다. `data/barracks/*.json` 을 직접 읽지 않는다 —
 * 부르는 쪽이 파일을 읽어 `buildSideZones()` 에 넘긴다 (`clanHexV2.ts` 와 같은 약속).
 *
 * ── 어디서 왔나
 *   사장님이 아티팩트로 구역을 직접 칠하셨고(`floor-zones.json` · `style-zones.json`),
 *   규칙은 2026-09-17 하루 동안 여러 번 고쳐졌다. 고쳐진 자취를 아래 주석에 남긴다 —
 *   ★지우지 않는다★ (`CLAUDE.md` 1-4). 옛 규칙으로 되돌릴 일이 생기면 여기만 보면 된다.
 *
 * ── 지금 규칙 (넷 중 셋은 같은 셈이다)
 *   ```
 *   그 구역 교전 = 잡은 자리나 죽은 자리 중 ★하나라도★ 그 구역인 킬
 *   뚫림        = 그 교전들에서 ★수비가 공격보다 많이 죽음★
 *   막음        = 비기거나 수비가 덜 죽음          ← 비김은 ★막음★ 이다
 *   판정 없음    = 그 구역 교전이 0건인 라운드      ← ★분모에서 뺀다★
 *   ```
 *   숏만 다르다 — 아래 `judgeShort()` 주석을 보라.
 */

import { inZone, type ZoneCells } from './duel'

/* -------------------------------------------------------------------------- */
/* 구역 묶음                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * ★A★ — 일곱 구역.
 *
 * ⚠ 하루에 두 번 줄었다. 옛 판을 아래 둘로 남긴다.
 *   ```
 *   아홉  숏·ㄴ자·중길·설대앞·쓰리깡·머리·녹뒤·컨뒤·A설대   (A_ZONE_LABELS_V1)
 *   여덟  숏을 뺌                                        (A_ZONE_LABELS_V2)
 *   일곱  컨뒤를 뺌                                      ← 지금
 *   ```
 *   - 숏: «숏(아까 잘못말함 숏구역에서 잡거나 잡힌건 제외)» — 사장님
 *   - 컨뒤: «컨뒤 빼자» — 사장님. 컨뒤는 ★스나싸움 구역(A롱)에도 들어 있어★
 *     컨뒤에서 스나가 스나를 잡으면 한 사건이 두 축을 동시에 올렸다.
 *     실측 25,783판 — A 와 스나싸움이 같은 팀을 가리키는 비율:
 *     여덟 67% · 머리 빼면 66% · 녹뒤 빼면 65% · ★컨뒤 빼면 59%★.
 *     컨뒤 23칸이 A 안에서 가장 큰 스나 자리라서다 (머리 9칸 · 녹뒤 6칸).
 */
export const A_ZONE_LABELS = ['NIEUN', 'JUNGGIL', 'SEOLDAEAP', 'THREEKKANG', 'MERI', 'NOKDWI', 'SEOLDAE'] as const
/** ⚠ 옛 판 — 숏을 넣은 아홉 (2026-09-17 낮까지) */
export const A_ZONE_LABELS_V1 = ['SHORT', 'NIEUN', 'JUNGGIL', 'SEOLDAEAP', 'THREEKKANG', 'MERI', 'NOKDWI', 'CONDWI', 'SEOLDAE'] as const
/** ⚠ 옛 판 — 컨뒤를 넣은 여덟 (2026-09-17 저녁까지) */
export const A_ZONE_LABELS_V2 = ['NIEUN', 'JUNGGIL', 'SEOLDAEAP', 'THREEKKANG', 'MERI', 'NOKDWI', 'CONDWI', 'SEOLDAE'] as const

/** ★B★ — 사장님: «내가 말하는건 비롱,벙커,바닥,일문이야» */
export const B_ZONE_LABELS = ['BIRONG', 'BUNKER', 'BADAK', 'ILMUN'] as const

/** ★2층★ */
export const F2_ZONE_LABELS = ['ICHUNG'] as const

/**
 * ★숏★ — 자리 판정에 쓰는 구역이다 (어택 판정은 아래 `SHORT_KILL_ZONE_LABELS`).
 * 사장님: «홀정면넣어». 숏 8칸만으로는 너무 좁아 라운드의 65%가 판정 불가였다.
 */
export const SHORT_ZONE_LABELS = ['SHORT', 'HOLJEONG'] as const

/**
 * ★숏어택 성공으로 인정하는 구역★ — 사장님 원문 그대로 (2026-09-17).
 *
 * > 머리, 쓰리깡, 녹뒤, ㄴ자, 중길 에서 적을 잡음 > 숏어택성공
 *
 * 같은 날 사장님이 «홀정면에서 스나를 잡음»·«홀정면에서 숏을 잡음» 도 주셨는데
 * ★안 쓴다★ — 실측에서 스나싸움과 65% 겹치고 앞선팀승률도 57.9% 로 낮았다.
 * 이 다섯 구역만 쓰면 64.2% · 겹침 57% 로 모든 칸에서 낫다.
 * 옛 둘은 `SHORT_KILL_ZONE_LABELS_HOLJEONG` 에 남긴다 — 되살리려면 합치면 된다.
 */
export const SHORT_KILL_ZONE_LABELS = ['MERI', 'THREEKKANG', 'NOKDWI', 'NIEUN', 'JUNGGIL'] as const
/** ⚠ 안 쓰는 판 — 홀정면에서 상대 스나/숏을 잡는 것도 숏어택으로 세던 것 */
export const SHORT_KILL_ZONE_LABELS_HOLJEONG = ['HOLJEONG'] as const

/** 축 넷 */
export const SIDE_AXIS_KEYS = ['a', 'b', 'f2', 'short'] as const
export type SideAxisKey = (typeof SIDE_AXIS_KEYS)[number]

export const SIDE_AXIS_LABEL: Record<SideAxisKey, { attack: string; defence: string }> = {
  a: { attack: 'A어택', defence: 'A방어' },
  b: { attack: 'B어택', defence: 'B방어' },
  f2: { attack: '2층어택', defence: '2층방어' },
  short: { attack: '숏어택', defence: '숏방어' },
}

/* -------------------------------------------------------------------------- */
/* 구역 파일 두 벌 합치기                                                        */
/* -------------------------------------------------------------------------- */

/**
 * `floor-zones.json` 은 ★한 칸이 여러 구역★ 일 수 있어 값이 배열이다
 * (숏·쓰리깡·설대앞은 넓은 구역 위에 겹쳐 그은 좁은 자리다).
 * `style-zones.json` 은 한 칸에 하나뿐이다. 둘을 합쳐 칸 → 이름들로 만든다.
 */
export interface AnyZoneFile {
  cell: number
  zone: Record<string, string | string[]>
}

/** 칸 → 그 칸이 속한 구역 이름들 */
export type ZoneIndex = { cell: number; at: (x: number | null, y: number | null) => readonly string[] }

export function buildZoneIndex(files: readonly AnyZoneFile[]): ZoneIndex | null {
  const usable = files.filter((f) => f && f.zone && Object.keys(f.zone).length > 0)
  const head = usable[0]
  if (!head) return null
  const cell = head.cell
  const map = new Map<string, string[]>()
  for (const file of usable) {
    /* 칸 크기가 다르면 합칠 수 없다 — 지어내지 말고 그 파일을 버린다 */
    if (file.cell !== cell) continue
    for (const [key, value] of Object.entries(file.zone)) {
      const names = Array.isArray(value) ? value : [value]
      const got = map.get(key) ?? []
      for (const n of names) if (!got.includes(n)) got.push(n)
      map.set(key, got)
    }
  }
  const empty: readonly string[] = []
  return {
    cell,
    at: (x, y) => {
      /* (0,0) 은 ★좌표 없음★ 이다 — 맵 구석이 아니라 결측이다 */
      if (x == null || y == null || (x === 0 && y === 0)) return empty
      return map.get(`${Math.floor(x / cell)},${Math.floor(y / cell)}`) ?? empty
    },
  }
}

/** 이름 몇 개를 골라 `ZoneCells` 로 (배열 값을 다루는 `zoneCellsOfLabels`) */
export function zoneCellsOfAnyLabels(files: readonly AnyZoneFile[], labels: readonly string[]): ZoneCells | null {
  const usable = files.filter((f) => f && f.zone)
  const head = usable[0]
  if (!head) return null
  const cell = head.cell
  const wanted = new Set(labels)
  const cells = new Set<string>()
  for (const file of usable) {
    if (file.cell !== cell) continue
    for (const [key, value] of Object.entries(file.zone)) {
      const names = Array.isArray(value) ? value : [value]
      if (names.some((n) => wanted.has(n))) cells.add(key)
    }
  }
  return cells.size > 0 ? { cell, cells: [...cells] } : null
}

/* -------------------------------------------------------------------------- */
/* 라운드 판정                                                                  */
/* -------------------------------------------------------------------------- */

/** 한 킬 — 판정에 필요한 것만 */
export interface SideKill {
  /** 잡은 사람의 자리 */
  killAt: { x: number | null; y: number | null }
  /** 죽은 사람의 자리 */
  deathAt: { x: number | null; y: number | null }
  /** 죽은 사람이 ★수비 팀★ 인가 */
  victimIsDefence: boolean
  /** 잡은 사람이 ★수비 팀★ 인가 (죽은 쪽과 늘 반대인 것은 아니다 — 팀킬·결측) */
  killerIsDefence: boolean
}

export interface SideVerdict {
  /** 그 구역에서 일어난 교전 수 */
  engagements: number
  /** 그중 수비가 죽은 수 */
  defenceDeaths: number
  /** 그중 공격이 죽은 수 */
  attackDeaths: number
  /** ★뚫렸나★ — 교전이 있고 수비가 더 많이 죽었을 때만 참 */
  breached: boolean
  /** 판정할 수 있는 라운드인가 (교전 0건이면 거짓 → 분모에서 뺀다) */
  judged: boolean
}

const NO_VERDICT: SideVerdict = { engagements: 0, defenceDeaths: 0, attackDeaths: 0, breached: false, judged: false }

/**
 * ★교전 차★ — A·B·2층이 쓰는 셈.
 *
 * ⚠ 이 규칙은 사장님이 한 라운드를 손으로 뜯어 보시고 고치신 것이다 (2026-09-17):
 * > «3라운드는 교환이야. 에이를 3명이나 왔는데 3명까진 막았지만 마지막에 우리스나가
 * >  로둥이한테 죽고 그걸 saylove가 마무리한거잖아. 이건 진짜 에이 잘막은거야.
 * >  이거 졌으면 걍 세이브를 못한거지»
 *
 * 옛 셈은 «3번째 킬 이내에 그 구역에서 한 번이라도 잡히면 뚫림» 이었다. 그러면 위 라운드가
 * «뚫림» 이 된다. ★막고도 라운드를 지면 그건 세이브 실패지 A 실패가 아니다.★
 * 실측에서도 앞선팀승률이 54.9% → 72.3% 로 뛰었다.
 */
export function judgeExchange(kills: readonly SideKill[], zone: ZoneCells | null): SideVerdict {
  if (zone === null) return NO_VERDICT
  let engagements = 0
  let defenceDeaths = 0
  let attackDeaths = 0
  for (const k of kills) {
    if (!inZone(zone, pointOf(k.killAt)) && !inZone(zone, pointOf(k.deathAt))) continue
    engagements += 1
    if (k.victimIsDefence) defenceDeaths += 1
    else attackDeaths += 1
  }
  return {
    engagements,
    defenceDeaths,
    attackDeaths,
    breached: engagements > 0 && defenceDeaths > attackDeaths,
    judged: engagements > 0,
  }
}

/**
 * ★숏★ — 여기만 셈이 다르다. 사장님 원문이 «잡음» 이라서다:
 * > 머리, 쓰리깡, 녹뒤, ㄴ자, 중길 에서 적을 잡음 > 숏어택성공
 *
 * 교전 차가 아니라 ★공격이 그 자리에서 적을 지웠나★ 다. 그래서:
 *   - 분모는 라운드 전부다 (교전 0건이라고 빼지 않는다 — «못 잡았다» 도 정보다)
 *   - 실측: 두 팀이 나란히 100%인 경기가 ★0%★ · 한 판 분모 6 · 앞선팀승률 64.2%
 */
export function judgeShort(kills: readonly SideKill[], zone: ZoneCells | null): SideVerdict {
  if (zone === null) return NO_VERDICT
  let attackKills = 0
  let defenceKills = 0
  for (const k of kills) {
    /* ★잡은 사람★ 이 그 자리에 있었나 — 죽은 자리는 안 본다 */
    if (!inZone(zone, pointOf(k.killAt))) continue
    if (k.killerIsDefence) defenceKills += 1
    else attackKills += 1
  }
  return {
    engagements: attackKills + defenceKills,
    defenceDeaths: attackKills,
    attackDeaths: defenceKills,
    breached: attackKills > 0,
    judged: true,
  }
}

const pointOf = (p: { x: number | null; y: number | null }): { x: number; y: number } | null =>
  p.x == null || p.y == null || (p.x === 0 && p.y === 0) ? null : { x: p.x, y: p.y }

/* -------------------------------------------------------------------------- */
/* 자리(포지션)                                                                 */
/* -------------------------------------------------------------------------- */

/* ⚠ `position.ts` 의 `PositionVerdict` 와 ★다른 것★ 이다 — 그쪽은 라인업 표기용 자리이고
   여기 것은 ★배틀로그 자취로 뽑는 시즌 자리★ 다. 이름이 겹쳐 `PlayerSeat*` 로 부른다. */
export const POSITION_KEYS = ['biribe', 'f2', 'short', 'sniper', 'all'] as const
export type PositionKey = (typeof POSITION_KEYS)[number]

export const POSITION_LABEL: Record<PositionKey, string> = {
  biribe: '비리베',
  f2: '2층',
  short: '숏',
  sniper: '스나',
  all: '올포지션',
}

/** 자리를 붙이려면 이만큼은 뛰어야 한다 — 실측에서 여기서 곡선이 꺾인다 */
export const POSITION_MIN_GAMES = 30
/** 1위가 2위의 이 배수 미만이면 한 자리로 못 부른다 → `all`(올포지션) */
export const POSITION_MIN_RATIO = 1.3
/** 자기 킬의 이만큼이 스나면 스나다 */
export const POSITION_SNIPER_SHARE = 0.5

/**
 * ★자리 판정★ — 선수 한 명의 ★시즌 전체★ 자취로 한 번만 정한다.
 *
 * ⚠ ★경기마다 정하지 마라.★ 옛 방식(경기마다 팀 5명을 줄 세우기)은 최빈 자리 비율이
 *   중앙 69.8% 였다. 선수별로 모으면 앞 30경기↔시즌 전체가 91.7% 로 맞는다.
 *   사장님: «그사람 병영수첩 들어가서 배틀로그 다 따보면됨 한 30경기만 때봐도 포지 어딘지 알 수 있을걸»
 *
 * ⚠ ★스나 문턱을 낮추지 마라.★ 40%로 낮추면 김철영(스나킬 41%)이 스나가 되는데
 *   사장님이 «김철영 숏 맞아» 하셨다. 스나가 전체의 14% 뿐인 것은 겸업이 많아서다.
 */
export interface PlayerSeatTally {
  /** 뛴 경기 수 */
  games: number
  /** 자기 킬 수 · 그중 스나로 잡은 수 */
  kills: number
  sniperKills: number
  /** 자기 자리가 각 구역이었던 횟수 (킬이면 잡은 자리 · 데스면 죽은 자리) */
  bSpots: number
  f2Spots: number
  shortSpots: number
  /** 자리를 안 쓴 것까지 포함한 전체 — 비중의 분모 */
  spots: number
}

export interface PlayerSeatVerdict {
  key: PositionKey | null
  /** 왜 못 붙였나 — `games` 이면 경기 부족, `null` 이면 붙었다 */
  pending: 'games' | 'spots' | null
  /** 1위 비중 / 2위 비중. 2위가 0이면 `null` */
  ratio: number | null
  shares: { b: number; f2: number; short: number; sniper: number }
}

export function positionOf(t: PlayerSeatTally): PlayerSeatVerdict {
  const share = (n: number) => (t.spots > 0 ? n / t.spots : 0)
  const shares = {
    b: share(t.bSpots),
    f2: share(t.f2Spots),
    short: share(t.shortSpots),
    sniper: t.kills > 0 ? t.sniperKills / t.kills : 0,
  }
  if (t.games < POSITION_MIN_GAMES) return { key: null, pending: 'games', ratio: null, shares }
  if (t.spots === 0) return { key: null, pending: 'spots', ratio: null, shares }

  /* 스나가 먼저다 — 스나는 어느 구역에 앉든 스나다 */
  if (shares.sniper >= POSITION_SNIPER_SHARE) return { key: 'sniper', pending: null, ratio: null, shares }

  const ranked = ([['biribe', shares.b], ['f2', shares.f2], ['short', shares.short]] as const)
    .map(([k, v]) => ({ k, v }))
    .sort((x, y) => y.v - x.v)
  /* 셋은 늘 있다 — 그래도 타입을 좁혀 둔다 */
  const first = ranked[0]
  const second = ranked[1]
  if (!first || !second) return { key: null, pending: 'spots', ratio: null, shares }
  const ratio = second.v > 0 ? first.v / second.v : null
  /* 1위와 2위가 붙어 있으면 ★이름을 붙이지 않는다★ — 틀린 이름보다 없는 편이 낫다 */
  if (ratio !== null && ratio < POSITION_MIN_RATIO) return { key: 'all', pending: null, ratio, shares }
  return { key: first.k as PositionKey, pending: null, ratio, shares }
}

/** 그 자리가 개인 육각에서 쓰는 축 — `null` 이면 구역을 안 나눈 합계를 쓴다 */
export function sideAxisOfPosition(key: PositionKey | null): SideAxisKey | null {
  if (key === 'biribe') return 'b'
  if (key === 'f2') return 'f2'
  if (key === 'short') return 'short'
  /* 스나는 사장님 사양대로 A·B 를 쓴다 — 자리로 갈리지 않는다 */
  return null
}
