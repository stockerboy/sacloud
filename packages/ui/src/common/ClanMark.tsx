'use client'

/**
 * 클랜마크.
 *
 * 원본 실측 구조
 * ```
 * <sp-common-clan-mark class="w-8 h-8 mr-2">
 *   <div class="relative w-full h-full">
 *     <img class="absolute top-0 left-0 w-full h-full" src="{배경}">
 *     <img class="absolute top-0 left-0 w-full h-full" src="{전경}">
 * ```
 * 배경·전경 2장을 같은 자리에 겹쳐 그린다. 기본 크기는 2rem(28px).
 *
 * 공식/fallback 판정은 이 파일에서 하지 않는다 — `clanMarkPolicy.ts` 의 순수 함수가 한다.
 */

import { useCallback, useState } from 'react'

import { FallbackClanMark } from './FallbackClanMark'
import {
  clanMarkView,
  clanMarkViewAfterLoad,
  clanMarkViewFromMarkOnly,
  type ClanMarkInput,
  type ClanMarkSource,
} from './clanMarkPolicy'

export type { ClanMarkInput, ClanMarkSource }

export type ClanMarkSize = 'xxs' | 'xs' | 'sm' | 'md' | 'lg' | 'max'

const SIZE: Record<ClanMarkSize, string> = {
  /** 매치 카드 라인업 (원본 w-4) */
  xxs: 'w-4 h-4',
  /** 매치 카드 클랜 (원본 w-6) */
  xs: 'w-6 h-6',
  /** 소속 표시 등 (원본 w-7) */
  sm: 'w-7 h-7',
  /** 목록·표 기본 (원본 w-8) */
  md: 'w-8 h-8',
  lg: 'w-12 h-12',
  /** 프로필 헤더 (원본 .mark-max = 51px 고정) */
  max: 'w-mark-max h-mark-max',
}

export interface ClanMarkProps {
  /**
   * 클랜 객체를 통째로 넘긴다. **새 호출부는 이쪽을 쓴다.**
   *
   * `ClanSummary` · `MatchTimeClan` 을 그대로 넣으면 된다.
   * 무소속이면 `null` 을 그대로 넘긴다 — 호출부에서 `clan ? <ClanMark/> : null` 로 감싸면
   * 마크가 통째로 사라진다. 운영에서 그렇게 나갔다 (미등록 선수 옆에 마크 없음).
   */
  clan?: ClanMarkInput | null
  /**
   * 마크만 넘기는 예전 경로.
   * 서버가 비등록 클랜의 마크를 이미 지워서 내려보낸다는 전제에서만 옳다.
   * `clan` 을 함께 넘기면 `clan` 이 이긴다.
   */
  mark?: ClanMarkSource | null
  size?: ClanMarkSize
  className?: string
  alt?: string
}

/** `useState` 초기값을 매 렌더 새로 만들지 않는다 */
const EMPTY_SET: ReadonlySet<string> = new Set()

export function ClanMark({ clan, mark, size = 'md', className, alt = '' }: ClanMarkProps) {
  /* 등록 클랜 여부를 아는 호출부는 `clan` 으로 판정한다.
     `clan` 을 아예 넘기지 않은(= 아직 고치지 않은) 호출부만 마크 URL 로 판정한다.
     `clan={null}`(무소속)은 "안 넘긴 것"이 아니라 **모름/없음** 이므로 fallback 이다. */
  const base = clan === undefined ? clanMarkViewFromMarkOnly(mark) : clanMarkView(clan)

  /* 로드에 실패한 **주소**를 기억한다 (레이어 위치가 아니라 주소로 기억하는 이유:
     목록에서 같은 컴포넌트가 다른 클랜으로 재사용될 때, 주소가 바뀌면 실패 기록이
     자동으로 무효가 된다. 위치로 기억하면 초기화 effect 가 따로 필요하고 그걸 빠뜨리면
     멀쩡한 클랜이 남의 실패를 물려받는다) */
  const [brokenSrc, setBrokenSrc] = useState<ReadonlySet<string>>(EMPTY_SET)
  const markBroken = useCallback((src: string) => {
    setBrokenSrc((prev) => (prev.has(src) ? prev : new Set(prev).add(src)))
  }, [])

  /* 주소는 있는데 그림이 안 온 겹은 없는 것으로 친다.
     전부 안 왔으면 빈 사각형이 아니라 구름이 나온다 */
  const view = clanMarkViewAfterLoad(base, {
    bg: base.kind === 'official' && base.bg !== null && brokenSrc.has(base.bg),
    front: base.kind === 'official' && base.front !== null && brokenSrc.has(base.front),
  })

  const box = `${SIZE[size]} shrink-0 ${className ?? ''}`

  /* 공식 등록 클랜이 아니면 **공통 fallback 마크**를 그린다 (D-146).
     외부 클랜의 emblem 을 우리 화면에서 공식 소속처럼 보여 주지 않기 위해서다.
     마크를 설정하지 않은 등록 클랜도 같은 마크를 쓴다 (깨진 이미지보다 낫다).
     마크 주소가 죽어서 한 겹도 못 그린 경우도 여기로 온다 (2026-09-01). */
  if (view.kind === 'fallback') {
    return <FallbackClanMark className={box} alt={alt} />
  }

  return (
    <span className={box}>
      <span className="relative block h-full w-full">
        <Layer src={view.bg} alt="" onBroken={markBroken} />
        <Layer src={view.front} alt={alt} onBroken={markBroken} />
      </span>
    </span>
  )
}

/**
 * 한 겹.
 *
 * ── 로드에 실패하면 **알린다**. 감추지 않는다 (2026-09-01)
 *   예전에는 `visibility: hidden` 으로 조용히 감췄다. 이유가 있었다 — Mock 단계의 마크
 *   주소는 존재하지 않는 자리표시자 호스트(`static.sacloud.local`)라 반드시 실패했고,
 *   브라우저 기본 깨진 이미지 아이콘이 원본과 나란히 비교할 때 방해가 됐다.
 *
 *   **그 전제가 끝났다.** 원본 비교 절차 자체가 종료됐고(D-204), 실제 주소가 들어온다.
 *   감추기만 하면 마크 서버가 죽었을 때 **구름조차 없는 빈 사각형**이 남는다.
 *   지금 마크의 대부분이 `static.3rd.supply` 를 물고 있어 실제로 일어날 수 있는 일이다.
 *
 *   그래서 실패를 부모에게 올리고, 부모가 `clanMarkViewAfterLoad` 로 다시 판정한다.
 *   판정을 여기서 하지 않는 이유는 `clanMarkPolicy.ts` 의 주석과 같다 — 분기를 순수 함수
 *   하나에 모아 시험으로 고정한다.
 */
function Layer({
  src,
  alt,
  onBroken,
}: {
  src: string | null
  alt: string
  onBroken: (src: string) => void
}) {
  if (!src) return null
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="absolute left-0 top-0 h-full w-full"
      src={src}
      alt={alt}
      onError={() => onBroken(src)}
    />
  )
}
