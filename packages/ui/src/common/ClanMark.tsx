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
 */

import { FallbackClanMark } from './FallbackClanMark'

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
  /** 계약상 두 레이어 모두 null 가능하다 (마크를 설정하지 않은 클랜) */
  mark: ClanMarkSource
  size?: ClanMarkSize
  className?: string
  alt?: string
}

export interface ClanMarkSource {
  bg: string | null
  front: string | null
}

export function ClanMark({ mark, size = 'md', className, alt = '' }: ClanMarkProps) {
  /* 마크가 비어 있으면 **공통 fallback 마크**를 그린다 (D-146).
     서버가 공식 1/2부 등록 클랜이 아닌 클랜의 마크를 비워서 내려보낸다 —
     외부 클랜의 emblem 을 우리 화면에서 공식 소속처럼 보여 주지 않기 위해서다.
     마크를 설정하지 않은 등록 클랜도 같은 마크를 쓴다 (깨진 이미지보다 낫다). */
  if (!mark.bg && !mark.front) {
    return <FallbackClanMark className={`${SIZE[size]} shrink-0 ${className ?? ''}`} alt={alt} />
  }
  return (
    <span className={`${SIZE[size]} shrink-0 ${className ?? ''}`}>
      <span className="relative block h-full w-full">
        <Layer src={mark.bg} alt="" />
        <Layer src={mark.front} alt={alt} />
      </span>
    </span>
  )
}

/**
 * 한 겹.
 *
 * Mock 단계의 마크 URL은 존재하지 않는 자리표시자 호스트(`static.sacloud.local`)라 로드에 실패한다.
 * 브라우저 기본 깨진 이미지 아이콘이 뜨면 원본과 비교할 때 방해가 되므로, 실패하면 조용히 감춘다.
 * 실제 URL이 들어오는 Phase 7 이후에는 그대로 표시된다.
 */
function Layer({ src, alt }: { src: string | null; alt: string }) {
  if (!src) return null
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="absolute left-0 top-0 h-full w-full"
      src={src}
      alt={alt}
      onError={(event) => {
        event.currentTarget.style.visibility = 'hidden'
      }}
    />
  )
}
