'use client'

import Link from 'next/link'
import type { BoardWriter } from '@sacloud/contract'
import { affiliationLabel } from './boardCopy'

/**
 * 게시글·댓글 작성자 표시 — 반익명 (SITE_SPEC_V2 2절 · 에브리타임 방식).
 *
 * ```
 * 익명일 때    veritas 소속 · 글쓴이      ← 이름은 서버가 매긴 표시 이름
 * 공개일 때    veritas 소속 · 훈이        ← 닉네임을 누르면 개인 기록으로
 * ```
 *
 * **여기서 익명을 판단하지 않는다.** `writer.anonymous` 가 true 면 응답에 실제
 * 닉네임·user id·player id 가 애초에 들어 있지 않다 (서버가 지운다).
 * 그러니 이 컴포넌트는 있는 것만 그린다 — 화면 코드가 실수해도 신원이 새지 않는다.
 *
 * 닉네임 링크 대상은 `/player/{id}` (개인 기록). 연동된 선수가 없으면 링크하지 않는다.
 */
export function WriterName({
  writer,
  /** 소속을 함께 보일지. 목록처럼 칸이 좁은 곳은 끌 수 있다 */
  showAffiliation = true,
}: {
  writer: BoardWriter
  showAffiliation?: boolean
}) {
  const affiliation = showAffiliation ? affiliationLabel(writer.clan?.name) : null
  /*
   * `적진` — 색을 하나만 쓰므로 공개/익명은 **색이 아니라 밝기**로 가른다.
   * 공개 작성자(누를 수 있는 이름)가 밝고, 익명은 한 단계 죽인다.
   * 진홍은 여기에 쓰지 않는다 — 목록이 전부 빨개진다.
   */
  const tone = writer.anonymous ? 'text-meta' : 'text-text-strong'

  return (
    <span className="inline-flex min-w-0 items-baseline gap-1">
      {affiliation ? (
        <span className="shrink-0 text-xs text-faint" title={affiliation}>
          {affiliation}
        </span>
      ) : null}
      {!writer.anonymous && writer.player ? (
        /* 색은 안쪽 `span` 이 가진다 — `a { color: inherit }` 가 유틸리티를 누른다.
           가리켰을 때 진홍이 켜지는 것은 전역 `a:hover` 가 아니라 이 `group-hover` 다 */
        <Link href={`/player/${writer.player.id}`} className="group min-w-0 truncate">
          <span className={`${tone} transition-colors duration-100 group-hover:text-accent`}>
            {writer.nickname}
          </span>
        </Link>
      ) : (
        <span className={`${tone} truncate`}>{writer.nickname}</span>
      )}
    </span>
  )
}
