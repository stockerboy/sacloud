/**
 * ★배지 그림★ — 사장님이 주신 육각 그림 일곱 장을 그대로 쓴다 (2026-09-17).
 *
 * > «뱃지는 이제 이 일곱개로 확정한다»
 * > «뱃지 클릭하면 해당선수 그 뱃지 가진사람중 몇등이고 누구누구가 이 뱃지 가지고있는지»
 *
 * ── 옛 판을 지우지 않았다 (`CLAUDE.md` 1-4)
 *   손으로 그리던 SVG 배지는 `TraitEmblem.tsx` 에 그대로 있다. 등급별 금테·은테도 거기 있다.
 *   사장님이 그림을 주셨으니 ★그림이 이긴다★ (`user-brings-art-i-build` — CSS 로 사진 흉내 금지).
 *
 * ── 이름도 그림도 계약에서 온다
 *   여기서 문자열이나 파일 이름을 만들지 않는다. 2026-09-16 에 배지 이름이 축을 안 따라와
 *   ★없는 축을 말하는★ 일이 두 번 있었다. 그래서 `BADGES` 한 곳만 본다.
 */
'use client'

import Link from 'next/link'
import {
  TRAIT_TIER_LABEL,
  badgeArtPath,
  badgeArtSmallPath,
  badgeOfAxis,
  type BadgeDef,
  type TraitAxisKey,
  type TraitTierKey,
} from '@sacloud/contract'

import { leagueBadgePath } from '../common/paths'

/**
 * 등급 빛 — 최상위권은 금, 상위권은 은. 판정은 `traitTierOf` 가 한다.
 *
 * ⚠ ★`ring` 을 쓰면 안 된다★ (2026-09-17 에 화면으로 잡음). 배지는 ★육각★ 인데
 *   `ring` 은 네모로 돈다 — 그림 둘레에 빈 네모가 그려져 배지가 상자에 든 것처럼 보였다.
 *   `drop-shadow` 는 ★투명도를 따라가서★ 육각 모양 그대로 빛난다.
 */
const RING: Record<'best' | 'high', string> = {
  best: '[filter:drop-shadow(0_0_3px_rgba(232,193,90,.95))_drop-shadow(0_0_6px_rgba(232,193,90,.5))]',
  high: '[filter:drop-shadow(0_0_2px_rgba(195,201,214,.75))]',
}

export interface BadgeArtProps {
  badge: BadgeDef
  /** 등급 테. 안 주면 테 없이 그림만 */
  tier?: TraitTierKey | null
  /** 높이(px). 기본 26 — 랭킹 한 줄에 들어가는 크기 */
  size?: number
  /** 누르면 배지 페이지로. 리그를 주면 링크가 되고 안 주면 그림만 */
  leagueSlug?: string | null
  /** 이름을 밑에 적을까 */
  showLabel?: boolean
  className?: string
}

export function BadgeArt({
  badge,
  tier = null,
  size = 26,
  leagueSlug = null,
  showLabel = false,
  className,
}: BadgeArtProps) {
  const ring = tier === 'best' || tier === 'high' ? RING[tier] : ''
  const title = tier ? `${badge.label} · ${TRAIT_TIER_LABEL[tier]}` : badge.label
  const art = (
    <img
      src={size <= 64 ? badgeArtSmallPath(badge) : badgeArtPath(badge)}
      alt={title}
      title={title}
      width={size}
      height={size}
      /*
       * ⚠ ★`loading="lazy"` 를 쓰지 않는다★ (2026-09-17 에 화면으로 잡음).
       *   랭킹 표에서 배지가 ★빈 네모★ 로만 떴다 — 테두리만 보이고 그림이 안 왔다.
       *   작은 그림은 2KB 라 미루는 값어치가 없다.
       */
      /* 육각이라 모서리를 둥글리지 않는다 — 그림 자체가 테두리를 갖고 있다 */
      className={`block h-auto w-auto select-none ${ring}`}
      style={{ height: size, width: size }}
    />
  )
  const body = showLabel ? (
    <span className="flex flex-col items-center gap-[3px]">
      {art}
      <span className="w-full truncate text-center text-[9.5px] leading-none text-faint">{badge.label}</span>
    </span>
  ) : (
    art
  )

  if (leagueSlug === null) return <span className={className}>{body}</span>
  return (
    <Link
      href={leagueBadgePath(leagueSlug, badge.key)}
      className={`inline-flex transition-opacity hover:opacity-80 ${className ?? ''}`}
      aria-label={`${badge.label} 가진 선수 보기`}
    >
      {body}
    </Link>
  )
}

/**
 * 축 + 무기로 배지를 찾아 그린다 — 랭킹 표가 쓰는 입구.
 * ★못 찾으면 안 그린다★ (빈칸도 안 만든다). 스나에게 샷터가 없는 식이다.
 */
export function AxisBadge({
  axis,
  weapon,
  tier,
  size = 26,
  leagueSlug = null,
  showLabel = false,
  className,
}: {
  axis: TraitAxisKey
  weapon: 0 | 1
  tier?: TraitTierKey | null
  size?: number
  leagueSlug?: string | null
  showLabel?: boolean
  className?: string
}) {
  const badge = badgeOfAxis(axis, weapon)
  if (badge === null) return null
  return (
    <BadgeArt
      badge={badge}
      tier={tier ?? null}
      size={size}
      leagueSlug={leagueSlug}
      showLabel={showLabel}
      className={className}
    />
  )
}
