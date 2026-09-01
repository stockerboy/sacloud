'use client'

/**
 * 알 모음집 (사양 5-1).
 *
 * 메인의 플레이어 검색 **바로 밑**에 리그별로 한 벌씩 놓는다. SPL 이 먼저, 그 아래 IPL.
 *
 * ```
 *         ○ ○ ○ ○ ○ ○ ○        ← 윗칸
 *       ○ ○ ○ ○ ○ ○ ○ ○ ○      ← 가운뎃칸 (위·아래보다 조금 더 길다)
 *         ○ ○ ○ ○ ○ ○ ○        ← 아랫칸
 * ```
 *
 * ── 알 밑에는 반드시 **클랜명**을 쓴다
 *   유저가 자기 클랜을 찾아야 깨러 온다. 이름이 없으면 찾을 수가 없다 (사양 5-1).
 *
 * ── 클랜을 하나도 빼지 않는다
 *   세 칸에 전부 담는다. 수가 많으면 칸 안에서 줄바꿈되지만, 위·아래 칸이 가운데보다
 *   좁으므로 `<>` 실루엣은 남는다.
 */

import Link from 'next/link'
import { ClanMark, type ClanMarkInput } from '../common/ClanMark'
import { EmptyState } from '../common/EmptyState'
import { ErrorState } from '../common/ErrorState'
import { Egg } from './Egg'
import { eggRows, type EggState } from './eggState'

export interface EggGalleryItem {
  key: string
  /** 알 밑에 쓰는 이름 (클랜명) */
  name: string
  href: string
  /** 알이 덮을 클랜마크 */
  clan: ClanMarkInput | null
  state: EggState
}

export interface EggGalleryProps {
  /** 리그 이름 — `SPL` · `IPL` */
  title: string
  /** 제목 옆 한 줄 */
  note?: string
  items?: readonly EggGalleryItem[]
  loading?: boolean
  error?: boolean
  onRetry?: () => void
  emptyMessage?: string
}

/**
 * 위·아래 칸의 폭. 가운뎃칸(100%)보다 좁아서 `<>` 모양이 된다.
 *
 * 클랜이 많으면 한 칸이 여러 줄로 접힌다. 그래도 **위·아래가 가운데보다 좁으므로**
 * `<>` 실루엣은 남는다 — 사양의 그림은 7/9/7 이지만 실제 리그는 클랜이 수십이다.
 */
const SIDE_ROW = 'mx-auto w-[72%] max-md:w-[84%]'

/** 알 한 칸의 폭. 이름이 들어갈 만큼만 넓게 잡는다 */
const CELL = 'w-[64px]'

export function EggGallery({
  title,
  note,
  items,
  loading,
  error,
  onRetry,
  emptyMessage = '등록된 클랜이 없습니다.',
}: EggGalleryProps) {
  const [top, middle, bottom] = eggRows(items ?? [])
  const broken = (items ?? []).filter((item) => item.state === 'broken').length

  return (
    <section>
      <div className="flex items-end justify-between border-b border-b-line-soft pb-3">
        <div className="flex items-baseline gap-3">
          <h2 className="font-display text-[20px] leading-none text-text-strong">{title}</h2>
          {note ? <span className="text-[12px] text-meta">{note}</span> : null}
        </div>
        {items && items.length > 0 ? (
          <span className="font-num text-[12px] tabular-nums text-meta">
            {/* 몇 개가 깨졌는지 — 진홍은 이 숫자 하나에만 쓴다 */}
            <span className={broken > 0 ? 'text-accent' : 'text-faint'}>{broken}</span>
            <span className="text-faint"> / {items.length} 깨짐</span>
          </span>
        ) : null}
      </div>

      <div className="mt-6">
        {error ? (
          <ErrorState message="클랜을 불러오지 못했습니다." onRetry={onRetry} />
        ) : loading ? (
          <GallerySkeleton />
        ) : !items || items.length === 0 ? (
          <EmptyState message={emptyMessage} />
        ) : (
          /* 칸 사이는 넉넉히 띄운다 — 세 칸이 세 칸으로 읽혀야 `<>` 가 보인다 */
          <div className="flex flex-col gap-7">
            <EggRow items={top} className={SIDE_ROW} />
            <EggRow items={middle} />
            <EggRow items={bottom} className={SIDE_ROW} />
          </div>
        )}
      </div>
    </section>
  )
}

function EggRow({ items, className = '' }: { items: EggGalleryItem[]; className?: string }) {
  if (items.length === 0) return null
  return (
    <div className={`flex flex-wrap items-start justify-center gap-x-3 gap-y-4 ${className}`}>
      {items.map((item) => (
        <EggCell key={item.key} item={item} />
      ))}
    </div>
  )
}

function EggCell({ item }: { item: EggGalleryItem }) {
  return (
    <Link href={item.href} className={`group flex ${CELL} flex-col items-center gap-1.5`}>
      <Egg state={item.state} size="md" label={item.name}>
        <ClanMark clan={item.clan} size="lg" alt={item.name} />
      </Egg>
      {/*
        색은 안쪽 `<span>` 에 준다 — `a { color: inherit }` 가 레이어 밖이라
        `<a>` 에 직접 준 색 유틸리티를 눌러 버린다 (`CLAUDE.md` 9장).
      */}
      <span
        className={`w-full truncate text-center text-[11px] leading-tight transition-colors ${
          item.state === 'broken' ? 'text-text-strong' : 'text-meta'
        } group-hover:text-accent`}
        title={item.name}
      >
        {item.name}
      </span>
    </Link>
  )
}

function GallerySkeleton() {
  const row = (count: number, className = '') => (
    <div className={`flex flex-wrap items-start justify-center gap-x-3 gap-y-4 ${className}`}>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className={`flex ${CELL} flex-col items-center gap-1.5`}>
          <div
            aria-hidden
            className="egg-shell h-[60px] w-[60px] animate-pulse"
            style={{ borderRadius: '50% 50% 50% 50% / 62% 62% 38% 38%' }}
          />
          <div aria-hidden className="h-[10px] w-12 animate-pulse bg-line-soft" />
        </div>
      ))}
    </div>
  )
  return (
    <div className="flex flex-col gap-7">
      {row(7, SIDE_ROW)}
      {row(9)}
      {row(7, SIDE_ROW)}
    </div>
  )
}
