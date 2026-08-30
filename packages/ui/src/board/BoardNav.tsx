'use client'

import Link from 'next/link'
import type { Category } from '@sacloud/contract'
import { boardDisplayName } from './boardCopy'

/**
 * 게시판 좌측 카테고리 내비.
 *
 * `적진` 팔레트 — 검정 바탕 · 선을 거의 쓰지 않고 여백과 글자 밝기로 나눈다.
 * 활성 항목만 진홍(`--color-accent`)이고, 왼쪽에 2px 세로 막대를 세워
 * 색을 못 보는 경우에도 어느 게시판인지 알 수 있게 한다.
 *
 * 표시 이름은 `boardDisplayName` 을 거친다 — 사용자 지시로 `인기` 는 화면에서 `Hot` 이다.
 * **slug(`hot`) · 링크(`/board/hot`) 는 그대로다.** 여기서 바뀌는 것은 글자뿐이다.
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
    /*
     * 모바일은 세로 사이드가 아니라 **가로 줄**이다 — 카테고리는 하나도 빼지 않고
     * 넘치면 이 줄 안에서만 가로로 밀린다(본문은 밀리지 않는다).
     */
    <nav
      aria-label="커뮤니티 게시판"
      className="flex w-52 flex-shrink-0 flex-col text-text max-md:w-full"
    >
      <div className="px-1 pb-3 text-xs tracking-[0.2em] text-faint max-md:pb-2">커뮤니티</div>

      <div className="flex flex-col max-md:flex-row max-md:gap-1 max-md:overflow-x-auto">
        {items.map((category) => {
          const active = category.slug === current
          return (
            <Link
              key={category.slug}
              href={`/board/${category.slug}`}
              aria-current={active ? 'page' : undefined}
              className={`group flex items-center border-l-2 py-2 pl-3 pr-4 text-[0.95rem] max-md:whitespace-nowrap max-md:border-b-2 max-md:border-l-0 max-md:pb-2 max-md:pl-0 max-md:pr-0 ${
                active
                  ? 'border-l-accent max-md:border-b-accent'
                  : 'border-l-transparent max-md:border-b-transparent'
              }`}
            >
              {/*
                글자색은 **안쪽 `span`** 이 가진다. `styles.css` 의 `a { color: inherit }` 가
                레이어 밖에 있어서 `<a>` 에 직접 준 `text-*` 유틸리티를 눌러 버리기 때문이다.
              */}
              <span
                className={`transition-colors duration-100 ${
                  active ? 'font-semibold text-accent' : 'text-meta group-hover:text-text-strong'
                }`}
              >
                {boardDisplayName(category.slug, category.name)}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
