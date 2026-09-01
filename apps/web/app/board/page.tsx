import { redirect } from 'next/navigation'
import { DEFAULT_BOARD_SLUG } from '@sacloud/ui'

/**
 * 게시판 홈 — `/board` 로 들어오면 기본 게시판으로 보낸다.
 *
 * ── ⚠ **2026-09-02 — 랜딩(리다이렉트)을 되살렸다** (게시판을 다시 열었다 · D-260)
 *   ```
 *   2026-09-01   `return null` — 게시판을 닫아 둬서 `layout.tsx` 의 「준비중」이 떴다
 *   2026-09-02   `redirect('/board/free')` — 닫기 전의 동작 그대로
 *   ```
 *   `redirect()` 는 레이아웃보다 먼저 터진다. 닫혀 있는 동안 이것을 남겨 두면 안내가
 *   뜨기 전에 튕겨 나가서 지워 뒀던 것이고, 지금은 열렸으니 다시 있어야 한다.
 *
 * **첫 탭인 Hot게시판을 랜딩 자리로 쓰지 않는다.** Hot 은 다른 게시판의 글을 모아 보여 주는
 * 집계 화면이라 글을 쓸 곳이 아니다 — 게시판에 처음 들어온 사람이 먼저 볼 곳은 자유게시판이다.
 */
export default function BoardIndex() {
  redirect(`/board/${DEFAULT_BOARD_SLUG}`)
}
