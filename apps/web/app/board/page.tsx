import { redirect } from 'next/navigation'

/** 원본과 동일하게 게시판 홈은 첫 카테고리(인기)로 보낸다. */
export default function BoardIndex() {
  redirect('/board/hot')
}
