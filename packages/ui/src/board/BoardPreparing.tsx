/**
 * **게시판 준비중** 안내 (2026-09-01 사용자 지시).
 *
 * 게시판 화면 전체(`/board/**`)를 대신한다. 글 목록도 글쓰기도 한 줄 그리지 않고,
 * 빈 화면도 남기지 않는다.
 *
 * ── 리그의 `LeaguePreparing`(D-178)과 **같은 모양**이다
 *   같은 «준비중» 인데 화면마다 다르게 생기면 두 번 만든 것처럼 보인다.
 *   그쪽 파일을 고쳐서 같이 쓰지 않은 이유는 **문구가 다르고**(리그/게시판),
 *   지금 `packages/ui/src/league/**` 를 다른 작업이 물고 있기 때문이다.
 *
 * 새 색·새 토큰을 만들지 않았다 — `적진` 팔레트와 `pc-container` 를 그대로 쓴다.
 * 강조색(진홍)은 한 점도 쓰지 않는다. 준비중은 강조할 일이 아니다.
 */

import { BOARD_PREPARING_HEADLINE, BOARD_PREPARING_MESSAGE } from './boardPreparingText'

export function BoardPreparing() {
  return (
    <div className="pc-container px-4 py-16">
      <div className="rounded-[var(--radius)] border border-line px-6 py-16 text-center">
        <p className="font-display text-3xl tracking-wide text-text-strong">
          {BOARD_PREPARING_HEADLINE}
        </p>
        <p className="mt-4 text-sm leading-relaxed text-meta">{BOARD_PREPARING_MESSAGE}</p>
      </div>
    </div>
  )
}
