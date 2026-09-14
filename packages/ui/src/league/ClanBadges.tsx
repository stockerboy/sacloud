'use client'

/**
 * ★클랜 뱃지★ — 육각 여섯 축 중 그 리그 5위 안에 든 축을 승률 옆에 단다.
 *
 * 2026-09-14 사장님: «6각이 5위 안에 드는 클랜은 클랜목록에서 승률옆에 뱃지를 달아주자»
 *                    «축마다 5위 안이면 전부 준다»
 *
 * ── 왜 승률 「왼쪽」 인가
 *   승률 칸은 폰에서 60px 다 (`COL_STAT`). 오른쪽에 칩을 붙일 자리가 없다.
 *   그래서 이름 칸 끝 — ★승률 바로 왼쪽★ 에 붙인다. 눈으로는 승률 옆이다.
 *
 * ── ⚠ ★이름을 잡아먹지 않게 두 번 줄였다★ (폰 390px 실측)
 *   처음엔 긴 이름(«소수싸움»)을 세 개까지 적었더니 ★«sometimes» 가 «som···» 으로★
 *   잘렸다. 클랜 이름이 안 읽히면 목록이 아니다. 그래서 —
 *     ① 칩 글자를 ★두세 자로 줄였다★ (`SHORT`) — 육각형 안 이름은 그대로다
 *     ② 폰은 ★두 개★ · PC 는 세 개까지 적고 나머지는 `+n` 으로 접는다
 *   몇 개를 받았는지는 `title` 로 언제나 전부 읽힌다.
 *
 * ── 판정은 여기서 안 한다
 *   5위 컷도 ASTRA 보정도 `packages/contract/src/clanBadge.ts` 가 이미 끝냈다.
 *   이 부품은 받은 이름을 그리기만 한다.
 */
import { CLAN_HEX_V2_AXIS_LABELS, type ClanHexV2AxisKey } from '@sacloud/contract'

/** 폰 / PC 에서 나란히 적는 최대 개수 */
const MAX_PHONE = 2
const MAX_PC = 3

/**
 * ★칩에만 쓰는 짧은 이름★ — 육각형·카드의 이름(`CLAN_HEX_V2_AXIS_LABELS`)은 안 건드린다.
 * 여기 없는 축은 긴 이름을 그대로 쓴다 (축이 늘어도 안 깨진다).
 */
const SHORT: Partial<Record<ClanHexV2AxisKey, string>> = {
  sniperDuel: '스나',
  outnumbered: '소수',
  save: '세이브',
  tempo: '템포',
  firstBlood: '선짤',
  trade: '교환',
}

/** 금색 한 가지만 쓴다 — 축마다 색을 다르게 하면 줄이 알록달록해진다 */
const TONE = {
  color: '#ffd98a',
  background: 'rgba(255,217,138,.10)',
  border: '1px solid rgba(255,217,138,.42)',
} as const

const CHIP = 'rounded px-1 py-[2px] text-[10px] font-bold leading-none'
const MORE = 'text-[10px] font-bold leading-none'

export function ClanBadges({ badges }: { badges?: readonly string[] }) {
  if (badges === undefined || badges.length === 0) return null

  const keys = badges as readonly ClanHexV2AxisKey[]
  const shortOf = (k: ClanHexV2AxisKey) => SHORT[k] ?? CLAN_HEX_V2_AXIS_LABELS[k] ?? k
  const longOf = (k: ClanHexV2AxisKey) => CLAN_HEX_V2_AXIS_LABELS[k] ?? k

  const restPhone = keys.length - MAX_PHONE
  const restPc = keys.length - MAX_PC

  return (
    <span
      className="ml-2 flex shrink-0 items-center gap-[3px]"
      title={`리그 5위 안 — ${keys.map(longOf).join(' · ')}`}
    >
      {keys.slice(0, MAX_PC).map((key, i) => (
        <span
          key={key}
          /* 세 번째 칩은 ★PC 에서만★ 보인다 — 폰에서는 이름 자리를 뺏는다 */
          className={i < MAX_PHONE ? CHIP : `${CHIP} max-md:hidden`}
          style={TONE}
        >
          {shortOf(key)}
        </span>
      ))}
      {/* 접힌 개수는 폰·PC 가 다르다. 두 벌을 그리고 화면 크기가 하나만 고른다 */}
      {restPhone > 0 ? (
        <span className={`${MORE} md:hidden`} style={{ color: TONE.color }}>
          +{restPhone}
        </span>
      ) : null}
      {restPc > 0 ? (
        <span className={`${MORE} max-md:hidden`} style={{ color: TONE.color }}>
          +{restPc}
        </span>
      ) : null}
    </span>
  )
}
