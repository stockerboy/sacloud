'use client'

/**
 * 가챠 캡슐 하나.
 *
 * 사용자 지시 (2026-09-01 원문):
 * > "알때기 말고 가챠샵 컨셉으로 가자 그 가챠상자 안에 원모양 캡슐처럼 클랜마크가 담겨있고
 * >  약간 그 불투명한 공모양 그걸로. 포장하고(클랜마크 살짝 보여야함 불투명하게) 그리고
 * >  케이스위에 클랜이름 써놓고 보이게 해줘"
 *
 * ── 「알」을 대체하지 않는다. **나란히 둔다** (`CLAUDE.md` 10-4)
 *   `packages/ui/src/egg/` 의 `Egg` · `EggGallery` 는 **그대로 살아 있다.**
 *   가챠는 같은 뜻(가려 두고 궁금하게 만든다)을 다른 연출로 옮긴 **새 버전**이다.
 *   옛 버전을 지우고 갈아 끼우지 않는다.
 *
 * ── 세 가지 모습
 * ```
 * sealed   닫힌 캡슐. 마크가 불투명한 유리 너머로 **흐릿하게** 비친다
 * opening  뚜껑이 젖혀지는 중 — 짧은 CSS 애니메이션 하나 (라이브러리 없음)
 * opened   뚜껑이 열려 있고 마크가 **또렷하게** 보인다
 * ```
 *
 * ── 「흐릿하게」를 **`filter: blur()` 로 만들지 않는다** (2026-09-01 정정)
 *   처음 지시는 «CSS 로 흐리게(blur)» 였으나, 더미에 캡슐이 105개 깔린다.
 *   `filter` 는 **칸마다 합성 레이어**를 만든다 — 105개면 저사양 기기에서 눈에 띄게 버벅인다.
 *   그래서 합성만 쓰는 세 가지로 대신한다.
 * ```
 * ① 마크의 opacity 를 0.42 로 낮춘다                     (paint 단계, 레이어 안 만든다)
 * ② 위에 반투명 유리막을 한 겹 덮는다 (흰색 투명도 gradient)
 * ③ 마크를 1.32배로 키워 원 밖으로 넘치게 하고 잘라낸다   → 형태가 뭉개진다
 * ```
 *   `filter: blur()` 는 **`frosted` 를 켠 캡슐 하나에만** 허용한다 (아래 prop 설명 참조).
 *
 * ── 색은 D-204 토큰뿐이다
 *   캡슐 몸통은 `--color-card` · `--color-card-2` · `--color-page` 와 흰색 투명도로만
 *   만든다. 진홍(`--color-accent`)은 넓은 면에 칠하지 않는다 — 테두리 한 겹뿐이다.
 *
 * ── 이미지를 가공하지 않는다
 *   원본 마크 파일은 건드리지 않는다. 흐리게 보이는 것은 전부 CSS 다.
 *
 * ── 마크가 없는 클랜이 있어도 캡슐이 비지 않는다
 *   `mark` 가 `null` 이면 `ClanMark` 가 **공통 fallback 마크**(빨간 구름 윤곽선,
 *   `FallbackClanMark`)를 그린다 (D-146). 그래서 여기서 첫 글자를 따로 그리지 않는다 —
 *   대체 표시는 사이트 전체가 하나여야 한다.
 */

import type { CSSProperties } from 'react'

import { ClanMark, type ClanMarkSource } from '../common/ClanMark'

/** 캡슐의 세 가지 모습 */
export type CapsuleState = 'sealed' | 'opening' | 'opened'

export type CapsuleSize = 'sm' | 'md' | 'lg'

/**
 * 캡슐 지름.
 *
 * `md` 가 기본이고 더미(`CapsulePile`)도 이것을 쓴다 — 이보다 작으면 케이스에 붙은
 * 클랜 이름이 읽히지 않는다. **이름이 안 읽히면 자기 클랜을 못 찾는다.**
 * 모바일(390px)에서는 한 단 줄여 한 줄에 다섯 개가 들어가게 한다.
 */
const SIZE: Record<CapsuleSize, string> = {
  sm: 'w-[56px] h-[56px]',
  md: 'w-[84px] h-[84px] max-md:w-[68px] max-md:h-[68px]',
  lg: 'w-[132px] h-[132px] max-md:w-[112px] max-md:h-[112px]',
}

/** 케이스에 붙은 띠(라벨)의 글자 크기. 캡슐 지름을 따라간다 */
const LABEL: Record<CapsuleSize, string> = {
  sm: 'text-[8px]',
  md: 'text-[10px] max-md:text-[9px]',
  lg: 'text-[13px]',
}

export interface CapsuleProps {
  /** 클랜 이름. **캡슐 아래가 아니라 케이스에 붙은 띠 위**에 쓴다 */
  name: string
  /**
   * 캡슐 안에 담기는 클랜마크.
   *
   * `ClanMark` 의 `mark` prop 과 **같은 계약**이다 — 부르는 쪽이 이미
   * 「등록 클랜만 실제 마크」(D-146) 를 거른 값을 넘긴다는 전제다.
   * `null` 이면 공통 fallback 마크가 그려진다. 빈 캡슐은 나오지 않는다.
   */
  mark?: ClanMarkSource | null
  state: CapsuleState
  size?: CapsuleSize
  onClick?: () => void
  /**
   * 유리를 **진짜로 흐리게** 칠한다 (`filter: blur`).
   *
   * ⚠ **한 화면에 하나만 써라.** `filter` 는 합성 레이어를 만든다.
   * 뽑혀서 크게 나온 캡슐 한 개(`size="lg"` · 뽑기 결과) 전용이다.
   * 더미(`CapsulePile`)에서는 **절대 켜지 않는다.**
   */
  frosted?: boolean
  /**
   * 가벼운 판. 유리막 한 겹을 빼서 노드와 페인트를 줄인다.
   *
   * 옛 판(유리막 있는 기본형)을 지우지 않고 **둘 다 남긴다** (`CLAUDE.md` 10-4 ·
   * `TraitHexagon` 의 `variant` 와 같은 방식). `CapsulePile` 의 `dense` 가 이것을 켠다.
   */
  flat?: boolean
  className?: string
  /**
   * 더미(`CapsulePile`)가 어긋남을 주는 자리.
   * **레이아웃을 흔들지 않는 `transform` 만** 넣는다 — 노드를 하나 더 감싸지 않으려고 열어 뒀다.
   */
  style?: CSSProperties
}

export function Capsule({
  name,
  mark = null,
  state,
  size = 'md',
  onClick,
  frosted = false,
  flat = false,
  className = '',
  style,
}: CapsuleProps) {
  /* 누를 수 있으면 버튼으로 낸다. 누를 수 없는 캡슐까지 버튼으로 만들면
     탭 순서에 105개가 끼어들어 키보드로 화면을 지나갈 수가 없다 */
  const Root = onClick ? 'button' : 'div'

  /* 마크가 어떻게 비치는가.
     Tailwind 의 opacity/scale 유틸리티를 쓰지 않는다 — `capsule-reveal` 애니메이션이
     같은 속성을 건드려 서로 잡아먹는다. 한 곳(styles.css)에 모아 둔다 */
  const veil =
    state === 'sealed'
      ? `capsule-veiled${frosted ? ' capsule-veiled-frosted' : ''}`
      : state === 'opening'
        ? 'capsule-reveal'
        : ''

  return (
    <Root
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      title={name}
      aria-label={onClick ? `${name} 캡슐` : undefined}
      style={style}
      className={
        `${flat ? 'capsule-body-flat' : 'capsule-body'} relative inline-flex shrink-0 ` +
        `items-center justify-center rounded-full border border-line align-top ` +
        `${SIZE[size]} ${className}`
      }
    >
      {/*
        캡슐 안에 든 클랜마크.

        `inset-[8%]` 으로 원 안쪽에 자리를 잡는다 — `translate` 로 가운데를 맞추지 않는다.
        여는 애니메이션이 이 요소의 `transform` 을 쓰기 때문에, 위치 잡기에 `transform` 을
        써 버리면 서로 덮어쓴다.
        `overflow-hidden` + 안쪽을 1.32배로 키우는 것이 **blur 를 대신하는 장치**다.
      */}
      <span
        aria-hidden
        className={
          'absolute inset-[8%] flex items-center justify-center overflow-hidden rounded-full ' +
          `[&>*]:h-full [&>*]:w-full ${veil}`
        }
      >
        <ClanMark mark={mark} size="lg" alt="" />
      </span>

      {/* 유리. 위쪽 절반은 살짝 밝고 아래쪽은 어둡다 — 평면이 아니라 공으로 읽히게 한다.
          `flat` 이면 이 겹을 통째로 뺀다 (몸통 배경이 대신 흉내 낸다) */}
      {flat ? null : (
        <span aria-hidden className="capsule-glass pointer-events-none absolute inset-0 rounded-full" />
      )}

      {/*
        케이스에 붙은 띠. **여기에 클랜 이름을 쓴다.**

        치수는 눈으로 고른 것이 아니라 **원 안에 들어가야 해서** 정해진다.
        지름을 1로 두면 아래 모서리가 놓이는 높이 `b` 에서 원의 반폭은
        `sqrt(0.25 - (0.5 - b)^2)` 다. `b = 0.20` 이면 0.400 이고, 띠의 반폭은
        좌우를 12% 씩 물려 0.380 이다 — 0.400 안에 들어간다.
        (처음에 `bottom-15% · inset-x-7%` 로 뒀더니 반폭 0.430 > 0.357 이라
         띠의 두 모서리가 원 밖으로 삐져나왔다. 2026-09-01 렌더 검수에서 잡았다)
      */}
      <span
        className={
          'pointer-events-none absolute inset-x-[12%] bottom-[20%] truncate border-y border-line ' +
          `bg-card-2 px-[3px] text-center leading-[1.6] text-text ${LABEL[size]}`
        }
      >
        {name}
      </span>

      {/* 뚜껑. 닫혀 있을 때는 그리지 않는다 — 더미에 105개가 깔리므로 노드 하나가 아깝다 */}
      {state === 'sealed' ? null : (
        <span
          aria-hidden
          className={`capsule-lid ${state === 'opening' ? 'capsule-lid-opening' : 'capsule-lid-open'}`}
        />
      )}
    </Root>
  )
}
