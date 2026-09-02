'use client'

import Link from 'next/link'
import { LeagueLabel } from '@sacloud/ui'

/**
 * 홈 아래쪽 두 구역이 같이 쓰는 작은 조각들.
 *
 * 색·크기는 전부 토큰이다 (`packages/ui/src/styles.css`). 새 색을 만들지 않는다.
 * 진홍(`--color-accent`)은 **hover 에만** 닿는다 — 넓은 면에 칠하지 않는다 (D-204).
 */

/** 구역 제목 줄 — `리그별 개인랭킹` · `최근 경기` */
export function HomeSectionHead({
  id,
  title,
  note,
}: {
  id: string
  title: string
  /** 제목 옆의 조용한 한마디 (`상위 5명` 등) */
  note?: string
}) {
  return (
    <div className="mb-5 flex items-baseline border-b border-line pb-2.5">
      <h2 id={id} className="font-display text-2xl tracking-wide text-text-strong max-md:text-xl">
        {title}
      </h2>
      {note ? <span className="ml-3 text-xs text-faint">{note}</span> : null}
    </div>
  )
}

/**
 * 한 리그 칸의 머리 — 리그 이름이 곧 링크다.
 *
 * `a { color: inherit }` 때문에 색은 안쪽 `span` 에 준다 (`CLAUDE.md` 9장).
 */
export function HomeLeagueHead({
  name,
  href,
  action,
}: {
  name: string
  href: string
  /** 링크 오른쪽의 작은 안내 (`전체 랭킹 →`) */
  action: string
}) {
  return (
    <Link href={href} className="group flex items-baseline">
      <span className="text-lg font-bold tracking-wide text-text-strong transition-colors duration-100 group-hover:text-accent">
        <LeagueLabel name={name} />
      </span>
      <span className="ml-auto text-xs text-meta transition-colors duration-100 group-hover:text-accent">
        {action}
      </span>
    </Link>
  )
}

/**
 * 읽지 못했을 때 — «없음» 과 다르다.
 * 없다고 적으면 거짓말이다. 못 물어봤다고 적는다 (D-254 와 같은 구분).
 */
export function HomeLoadFailed() {
  return (
    <p className="py-6 text-center text-sm text-faint">
      불러오지 못했습니다. 잠시 뒤 다시 열어 주세요.
    </p>
  )
}

/** 정말로 비어 있을 때 */
export function HomeEmpty({ children }: { children: string }) {
  return <p className="py-6 text-center text-sm text-faint">{children}</p>
}
