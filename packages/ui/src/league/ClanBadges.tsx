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
 * ── 몇 개까지 보이나
 *   한 클랜이 여섯 축을 다 받을 수 있다. 줄이 터지지 않게 `MAX` 개까지만 적고
 *   나머지는 `+n` 으로 접는다. 마우스를 올리면 전부 읽힌다.
 *
 * ── 판정은 여기서 안 한다
 *   5위 컷도 ASTRA 보정도 `packages/contract/src/clanBadge.ts` 가 이미 끝냈다.
 *   이 부품은 받은 이름을 그리기만 한다.
 */
import { CLAN_HEX_V2_AXIS_LABELS, type ClanHexV2AxisKey } from '@sacloud/contract'

/** 한 줄에 나란히 적는 최대 개수 */
const MAX = 3

/** 금색 한 가지만 쓴다 — 축마다 색을 다르게 하면 줄이 알록달록해진다 */
const TONE = {
  color: '#ffd98a',
  background: 'rgba(255,217,138,.10)',
  border: '1px solid rgba(255,217,138,.42)',
} as const

export function ClanBadges({ badges }: { badges?: readonly string[] }) {
  if (badges === undefined || badges.length === 0) return null
  const names = badges.map((k) => CLAN_HEX_V2_AXIS_LABELS[k as ClanHexV2AxisKey] ?? k)
  const shown = names.slice(0, MAX)
  const rest = names.length - shown.length
  return (
    <span
      className="ml-2 flex shrink-0 items-center gap-[3px]"
      title={`리그 5위 안 — ${names.join(' · ')}`}
    >
      {shown.map((name) => (
        <span
          key={name}
          className="rounded px-1 py-[2px] text-[10px] font-bold leading-none"
          style={TONE}
        >
          {name}
        </span>
      ))}
      {rest > 0 ? (
        <span className="text-[10px] font-bold leading-none" style={{ color: TONE.color }}>
          +{rest}
        </span>
      ) : null}
    </span>
  )
}
