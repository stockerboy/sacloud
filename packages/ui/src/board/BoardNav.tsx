'use client'

import Link from 'next/link'
import type { Category } from '@sacloud/contract'

/**
 * 게시판 좌측 카테고리 내비.
 *
 * 원본 실측 구조 (2026-08-20)
 * ```
 * <div class="flex flex-col flex-shrink-0 w-60 text-gray-200">        15rem(210px)
 *   <div class="flex flex-col w-full justify-center z-10">
 *     <div class="px-5 py-4 bg-coolGray-900 text-center">커뮤니티 게시판</div>
 *     <div class="flex flex-col justify-center divide-y divide-coolGray-500">
 *       <a class="mx-1 px-7 py-2 bg-coolGray-700 hover:bg-coolGray-600">인기</a>
 *       … 자유 / 3부 / 에보 / 랭크전 / 대룰 / 방송
 * ```
 * 선택된 카테고리는 `board-active` — 배경 #1F2937 / 글자 #FB923C.
 * 항목 높이 35~36px, 헤더 49px.
 *
 * 카테고리 목록은 `GET /infos` 의 `categories[]` 를 그대로 쓴다.
 * `notice`(공지)는 별도 카테고리 화면이 아니라 각 목록 상단에 고정되므로 내비에 넣지 않는다.
 */
export function BoardNav({
  categories,
  current,
}: {
  categories: readonly Category[]
  current: string
}) {
  const items = categories.filter((category) => !category.notice)

  return (
    <div className="flex w-60 flex-shrink-0 flex-col text-nav-fg">
      <div className="z-10 flex w-full flex-col justify-center">
        <div className="bg-board-nav px-5 py-4 text-center">커뮤니티 게시판</div>
        <div className="flex flex-col justify-center">
          {items.map((category) => (
            <Link
              key={category.slug}
              href={`/board/${category.slug}`}
              className={`mx-1 px-7 py-2 ${
                category.slug === current
                  ? 'bg-board-active text-board-active-fg'
                  : 'bg-board-nav-item hover:bg-tab-active'
              }`}
            >
              {category.name}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
