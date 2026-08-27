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

import { FallbackClanMark } from './FallbackClanMark'
import {
  clanMarkView,
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

export function ClanMark({ clan, mark, size = 'md', className, alt = '' }: ClanMarkProps) {
  /* 등록 클랜 여부를 아는 호출부는 `clan` 으로 판정한다.
     `clan` 을 아예 넘기지 않은(= 아직 고치지 않은) 호출부만 마크 URL 로 판정한다.
     `clan={null}`(무소속)은 "안 넘긴 것"이 아니라 **모름/없음** 이므로 fallback 이다. */
  const view = clan === undefined ? clanMarkViewFromMarkOnly(mark) : clanMarkView(clan)

  const box = `${SIZE[size]} shrink-0 ${className ?? ''}`

  /* 공식 등록 클랜이 아니면 **공통 fallback 마크**를 그린다 (D-146).
     외부 클랜의 emblem 을 우리 화면에서 공식 소속처럼 보여 주지 않기 위해서다.
     마크를 설정하지 않은 등록 클랜도 같은 마크를 쓴다 (깨진 이미지보다 낫다). */
  if (view.kind === 'fallback') {
    return <FallbackClanMark className={box} alt={alt} />
  }

  return (
    <span className={box}>
      <span className="relative block h-full w-full">
        <Layer src={view.bg} alt="" />
        <Layer src={view.front} alt={alt} />
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
