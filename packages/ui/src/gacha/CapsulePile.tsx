'use client'

/**
 * 쌓여 있는 가챠 캡슐 더미.
 *
 * 사용자 지시 (2026-09-01 원문):
 * > "총 몇개지 그럼 아무튼 다 때려넣고 **모든 가챠가 쌓여있는것처럼 연출해**"
 *
 * ── 격자로 줄 세우지 않는다
 *   표처럼 반듯하게 놓으면 「목록」이 되고, 살짝 겹치고 어긋나야 「더미」가 된다.
 *   그래서 칸마다 `translate` + `rotate` 를 조금씩 준다.
 *
 * ── 어긋남은 **결정적**이다
 *   `Math.random()` 을 쓰지 않는다. 다시 그릴 때마다 더미가 흔들리면 자기 클랜을 찾던
 *   눈이 매번 처음부터 시작해야 한다. `key` 문자열 해시로 뽑는다 — 같은 클랜은 항상 같은 자리.
 *
 * ── 성능 (105개가 들어간다)
 * ```
 * 캡슐당 노드     sealed 7~8 · opened 8~9  (`Capsule.tsx` 참조)
 * 합성 레이어     0 — filter · backdrop-filter · will-change 를 쓰지 않는다
 * 애니메이션      없다. 도는 것은 진열대(`GachaShelf`) 하나뿐이다
 * 어긋남          transform 만. 레이아웃을 흔들지 않는다
 * ```
 *   `filter: blur()` 를 캡슐마다 주면 105개의 합성 레이어가 생긴다. **쓰지 않는다**
 *   (2026-09-01 정정 · `Capsule.tsx` 머리말).
 *
 * ── 모바일(390px)에서 가로 스크롤이 생기면 안 된다
 *   `flex-wrap` 으로 접고, 어긋남(±5px)만큼 컨테이너에 안쪽 여백을 둬서 `transform` 이
 *   밖으로 삐져나가지 않게 한다.
 */

import { Capsule, type CapsuleSize } from './Capsule'
import type { ClanMarkSource } from '../common/ClanMark'

export interface CapsulePileItem {
  key: string
  name: string
  mark?: ClanMarkSource | null
  /** 이미 열린 캡슐인가 */
  opened: boolean
}

export interface CapsulePileProps {
  items: readonly CapsulePileItem[]
  onPick?: (key: string) => void
  /** 뽑힌 것 하나를 도드라지게 한다 */
  highlightKey?: string | null
  size?: CapsuleSize
  /**
   * 가벼운 판.
   *
   * 유리막 한 겹을 빼고 겹침·어긋남을 줄인다. 저사양 기기에서 더미가 버벅이면 켠다.
   * **기본 판을 지우지 않고 둘 다 남긴다** (`CLAUDE.md` 10-4).
   */
  dense?: boolean
  className?: string
}

/**
 * 문자열 → 32비트 정수 (FNV-1a).
 *
 * 어긋남을 뽑는 데만 쓴다. 보안·해시테이블 용도가 아니다.
 * **결정적**이라는 것 하나가 요구사항이다 — 같은 `key` 는 항상 같은 값을 낸다.
 */
export function capsuleJitterHash(key: string): number {
  let hash = 2166136261
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export interface CapsuleJitter {
  /** 가로 어긋남 (px) */
  dx: number
  /** 세로 어긋남 (px) */
  dy: number
  /** 기울기 (deg) */
  rotate: number
}

/**
 * 한 칸의 어긋남.
 *
 * 폭은 일부러 좁게 잡았다 (±5px · ±7deg). 크게 흔들면 클랜 이름 띠가 기울어 읽기 힘들고,
 * `transform` 이 컨테이너 밖으로 나가 가로 스크롤이 생긴다.
 */
export function capsuleJitter(key: string, tight = false): CapsuleJitter {
  const hash = capsuleJitterHash(key)
  const scale = tight ? 0.4 : 1
  return {
    dx: Math.round(((hash % 11) - 5) * scale),
    dy: Math.round((((hash >>> 8) % 9) - 4) * scale),
    rotate: Math.round((((hash >>> 16) % 15) - 7) * scale),
  }
}

export function CapsulePile({
  items,
  onPick,
  highlightKey = null,
  size = 'md',
  dense = false,
  className = '',
}: CapsulePileProps) {
  if (items.length === 0) return null

  /* 겹침. 음수 여백으로 서로 물리게 한다 — `position: absolute` 를 쓰지 않는 이유는
     105개의 좌표를 우리가 계산하면 창 폭이 바뀔 때마다 다시 계산해야 하기 때문이다.
     `flex-wrap` 에 맡기면 브라우저가 알아서 접는다 */
  /* 세로 겹침은 **10px 을 넘기지 않는다.** 이름 띠의 아래 모서리가 캡슐 바닥에서
     약 17px(md 기준) 위에 있어서, 그보다 깊게 물리면 아랫줄이 윗줄의 이름을 덮는다.
     이름을 못 읽으면 자기 클랜을 못 찾는다 — 더미로 보이는 것보다 그게 중요하다 */
  const overlap = dense ? '-mr-[2px] -mb-[2px]' : '-mr-[12px] -mb-[10px]'

  return (
    <div className={`px-3 py-4 ${className}`}>
      <div className="flex flex-wrap items-center justify-center">
        {items.map((item) => {
          const { dx, dy, rotate } = capsuleJitter(item.key, dense)
          const picked = highlightKey !== null && item.key === highlightKey
          return (
            <Capsule
              key={item.key}
              name={item.name}
              mark={item.mark ?? null}
              state={item.opened ? 'opened' : 'sealed'}
              size={size}
              flat={dense}
              onClick={onPick ? () => onPick(item.key) : undefined}
              /* 뽑힌 하나만 위로 올리고 진홍 테두리를 준다.
                 진홍은 **테두리 한 겹**뿐이다 — 면을 칠하지 않는다 (D-204) */
              className={
                `${overlap} ${picked ? 'z-10 border-accent capsule-picked' : ''}`
              }
              style={{
                transform: `translate(${dx}px, ${dy}px) rotate(${rotate}deg)${
                  picked ? ' scale(1.14)' : ''
                }`,
              }}
            />
          )
        })}
      </div>
    </div>
  )
}
