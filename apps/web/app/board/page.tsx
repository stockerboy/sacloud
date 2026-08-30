import { redirect } from 'next/navigation'
import { DEFAULT_BOARD_SLUG } from '@sacloud/ui'

/**
 * 게시판 홈.
 *
 * `/board` 는 **자유게시판**(`/board/free`)으로 랜딩한다.
 * 첫 탭인 Hot게시판은 집계 화면이라 랜딩 자리로 쓰지 않는다.
 */
export default function BoardIndex() {
  redirect(`/board/${DEFAULT_BOARD_SLUG}`)
}
