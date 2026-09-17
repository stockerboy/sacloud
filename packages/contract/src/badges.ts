/**
 * ★배지 여덟★ — 사장님이 그림 일곱 장을 주시며 확정하셨다 (2026-09-17).
 *
 * > «뱃지는 이제 이 일곱개로 확정한다
 * >  왼쪽위부터 어태커 , 스나싸움마스터 , 디펜딩챔피언, 샷터 , 소수싸움 마스터, 크래커 , 세이브 머신»
 * > «스나는 뱃지를 두개 만들어 A 장악력 B 장악력»
 *
 * ★그림은 일곱 장인데 배지 이름은 여덟이다.★ 스나의 어택이 A·B 둘로 갈려서다 —
 * 둘 다 ★황소 그림★ 을 같이 쓴다. 여덟째 그림을 지어내지 않는다.
 *
 * ── 이 파일이 배지의 단일 출처다
 *   이름 · 그림 · 어느 축인지 · 어느 무기인지를 여기서만 정한다. 화면에서 문자열을 만들지 않는다.
 *   2026-09-16 에 배지 이름이 축을 안 따라와 ★없는 축을 말하는★ 일이 두 번 있었다.
 */

import type { TraitAxisKey } from './traits'

export const BADGE_KEYS = [
  'aHold',
  'bHold',
  'attacker',
  'snipeDuel',
  'defender',
  'shotter',
  'outnumber',
  'cracker',
  'save',
] as const
export type BadgeKey = (typeof BADGE_KEYS)[number]

/** 무기 — `1` 스나 · `0` 라플 (`CLAUDE.md` 5장) */
export type BadgeWeapon = 0 | 1

export interface BadgeDef {
  key: BadgeKey
  /** 화면에 적는 이름 */
  label: string
  /** 그림 파일 — `apps/web/public/badges/<art>.png`. ★사장님이 주신 그림이다★ */
  art: 'attacker' | 'snipeduel' | 'defender' | 'shotter' | 'outnumber' | 'cracker' | 'save'
  /** 이 배지를 받을 수 있는 무기 */
  weapons: readonly BadgeWeapon[]
  /**
   * 어느 축으로 줄을 세우나. 둘이면 ★두 축을 합쳐★ 센다
   * (스나의 A장악력은 A어택 하나, B장악력은 B어택 하나라 지금은 전부 한 축이다).
   */
  axes: readonly TraitAxisKey[]
  /** 배지 페이지에 적는 한 줄 */
  note: string
}

/**
 * ⚠ ★없는 배지를 지어내지 않는다.★
 *   스나에게 샷터·크래커가 없고, 라플에게 스나싸움마스터·A장악력·B장악력이 없다.
 *   그 무기가 ★재지 않는 축★ 이다. 화면에서도 빈칸을 만들지 않는다.
 */
export const BADGES: Record<BadgeKey, BadgeDef> = {
  aHold: {
    key: 'aHold',
    label: 'A장악력',
    art: 'attacker',
    weapons: [1],
    axes: ['chance'],
    note: '공격할 때 A쪽(ㄴ자·중길·설대앞·쓰리깡·머리·녹뒤·A설대)을 뚫은 비율',
  },
  bHold: {
    key: 'bHold',
    label: 'B장악력',
    art: 'attacker',
    weapons: [1],
    axes: ['gap'],
    note: '공격할 때 B쪽(비롱·벙커·바닥·일문)을 뚫은 비율',
  },
  attacker: {
    key: 'attacker',
    label: '어태커',
    art: 'attacker',
    weapons: [0],
    axes: ['chance'],
    note: '공격할 때 B·2층·숏을 뚫은 비율',
  },
  snipeDuel: {
    key: 'snipeDuel',
    label: '스나싸움마스터',
    art: 'snipeduel',
    weapons: [1],
    axes: ['duel'],
    note: '롱 안에서 상대 스나와 붙어 이긴 비율',
  },
  defender: {
    key: 'defender',
    label: '디펜딩챔피언',
    art: 'defender',
    weapons: [0, 1],
    /* 스나는 A방어(`safe`) · 라플은 방어율(`gap`) — 자리가 달라 둘 다 담는다 */
    axes: ['safe', 'gap'],
    note: '수비할 때 우리 진영을 지킨 비율',
  },
  shotter: {
    key: 'shotter',
    label: '샷터',
    art: 'shotter',
    weapons: [0],
    axes: ['duel'],
    note: '라플끼리 붙어 이긴 비율',
  },
  outnumber: {
    key: 'outnumber',
    label: '소수싸움마스터',
    art: 'outnumber',
    weapons: [0, 1],
    axes: ['outnumbered'],
    note: '수가 밀린 라운드를 이긴 비율',
  },
  cracker: {
    key: 'cracker',
    label: '크래커',
    art: 'cracker',
    weapons: [0],
    axes: ['safe'],
    note: '정해 둔 구역에서 25초 안에 그 라운드 첫 킬을 낸 횟수 (판당)',
  },
  save: {
    key: 'save',
    label: '세이브 머신',
    art: 'save',
    weapons: [0, 1],
    axes: ['save'],
    note: '혼자 남은 라운드를 이긴 횟수',
  },
}

/** 그 무기가 받을 수 있는 배지들 — 화면이 도는 목록 */
export function badgesOfWeapon(weapon: BadgeWeapon): BadgeDef[] {
  return BADGE_KEYS.map((k) => BADGES[k]).filter((b) => b.weapons.includes(weapon))
}

/**
 * 축 하나가 그 무기에서 어느 배지인가. 없으면 `null` 이다.
 *
 * ⚠ `defender` 는 무기마다 축이 다르다 (스나 `safe` · 라플 `gap`) — 그래서
 *   축만으로는 못 고르고 ★무기를 같이 봐야 한다★.
 */
export function badgeOfAxis(axis: TraitAxisKey, weapon: BadgeWeapon): BadgeDef | null {
  for (const key of BADGE_KEYS) {
    const b = BADGES[key]
    if (!b.weapons.includes(weapon)) continue
    if (!b.axes.includes(axis)) continue
    /* 스나의 `safe` 는 디펜딩챔피언, 라플의 `safe` 는 크래커다 — 먼저 맞는 것을 쓴다 */
    if (b.key === 'defender' && weapon === 0 && axis !== 'gap') continue
    if (b.key === 'defender' && weapon === 1 && axis !== 'safe') continue
    return b
  }
  return null
}

/** 그림 파일 경로 — 화면이 문자열을 만들지 않게 여기서 준다 */
export const badgeArtPath = (b: BadgeDef): string => `/badges/${b.art}.png`
