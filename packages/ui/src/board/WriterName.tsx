'use client'

import Link from 'next/link'
import type { BoardWriter } from '@sacloud/contract'
import { ClanMark } from '../common/ClanMark'
import { affiliationName } from './boardCopy'

/**
 * 게시글·댓글 작성자 표시 — 반익명 (SITE_SPEC_V2 2절 · 에브리타임 방식).
 *
 * ```
 * 익명일 때    (마크) veritas -익명1     ← 이름은 서버가 매긴 표시 이름
 * 공개일 때    (마크) veritas -훈이      ← 닉네임을 누르면 개인 기록으로
 * 무소속       익명1                     ← 마크도 이름도 없으면 앞 두 칸이 통째로 빠진다
 * ```
 *
 * ⚠ ★2026-09-13 — 앞에 클랜마크를 그린다★ (사장님).
 *
 * > «계정연동 하고 댓글 달면 자기가 계정연동한 아이디의 소속 클랜마크와 클랜명이
 * >  (마크) 클랜면 -익명1 이런식으로 뜬다»
 *
 *   옛 판은 «veritas 소속 익명1» 이라는 ★글자만★ 이었다. 이제 그림이 앞에 선다 —
 *   사이트의 다른 모든 자리와 같은 규칙이다(클랜명 앞에는 항상 마크).
 *   글자 갈래(`affiliationLabel`)는 `boardCopy.ts` 에 그대로 남겨 두었다.
 *
 * ── 왜 익명인데 마크가 나가나
 *   에브리타임에서 익명 글에도 학교 이름이 붙는 것과 같다. 계약이 그렇게 정해 두었다
 *   (`BoardWriter.clan` 주석). 클랜은 수십 명이라 소속만으로는 사람이 특정되지 않는다.
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
  const clan = showAffiliation ? (writer.clan ?? null) : null
  const clanName = affiliationName(clan?.name)
  /*
   * ★소속이 있으면 이름 앞에 붙임표★ — «veritas -익명1».
   *   무소속이면 붙임표도 없다. «-익명1» 만 덩그러니 남으면 잘린 글자처럼 보인다.
   */
  const namePrefix = clanName ? '-' : ''

  /*
   * `적진` — 색을 하나만 쓰므로 공개/익명은 **색이 아니라 밝기**로 가른다.
   * 공개 작성자(누를 수 있는 이름)가 밝고, 익명은 한 단계 죽인다.
   * 진홍은 여기에 쓰지 않는다 — 목록이 전부 빨개진다.
   */
  const tone = writer.anonymous ? 'text-meta' : 'text-text-strong'

  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      {clanName ? (
        <>
          {/* 마크는 `xxs`(16px) — 한 줄 높이를 넘기지 않는다 */}
          <ClanMark clan={clan} size="xxs" alt="" />
          <span className="shrink-0 text-xs text-faint" title={clanName}>
            {clanName}
          </span>
        </>
      ) : null}
      {!writer.anonymous && writer.player ? (
        /* 색은 안쪽 `span` 이 가진다 — `a { color: inherit }` 가 유틸리티를 누른다.
           가리켰을 때 진홍이 켜지는 것은 전역 `a:hover` 가 아니라 이 `group-hover` 다 */
        <Link href={`/player/${writer.player.id}`} className="group min-w-0 truncate">
          <span className={`${tone} transition-colors duration-100 group-hover:text-accent`}>
            {namePrefix}
            {writer.nickname}
          </span>
        </Link>
      ) : (
        <span className={`${tone} truncate`}>
          {namePrefix}
          {writer.nickname}
        </span>
      )}
    </span>
  )
}
