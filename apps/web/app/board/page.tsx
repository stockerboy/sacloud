import { redirect } from 'next/navigation'
import { DEFAULT_BOARD_SLUG } from '@sacloud/ui'

/**
 * 게시판 홈.
 *
 * 2026-08-27 실측: 원본 `/board` 는 **자유게시판**(`/board/free`)으로 랜딩한다.
 * 우리는 첫 탭인 인기게시판으로 보내고 있었다 (UI_PARITY_AUDIT 9-4).
 */
export default function BoardIndex() {
  redirect(`/board/${DEFAULT_BOARD_SLUG}`)
}
