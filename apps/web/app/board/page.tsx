/**
 * 게시판 홈.
 *
 * ── ⚠ **2026-09-01 — 랜딩(리다이렉트)을 멈췄다** (사용자 지시로 게시판을 준비중으로 닫음)
 *   ```
 *   옛 동작   `/board` → `redirect('/board/free')` → 자유게시판 목록
 *   지금      `/board` 에서 멈춘다 → `layout.tsx` 가 「게시판 준비중」을 그린다
 *   ```
 *   `redirect()` 는 레이아웃보다 먼저 터진다. 그래서 이것을 남겨 두면 준비중 안내가
 *   뜨기 전에 `/board/free` 로 튕겨 나간다 — 결과는 같은 준비중 화면이지만 주소가
 *   한 번 바뀐다. 닫아 둔 문 앞에서 주소를 갈아 끼울 이유가 없다.
 *
 *   **`DEFAULT_BOARD_SLUG` 는 그대로 있다.** 게시판을 다시 열 때 아래 두 줄을
 *   되살리면 된다 (`CLAUDE.md` 10-4).
 *   ```ts
 *   import { redirect } from 'next/navigation'
 *   import { DEFAULT_BOARD_SLUG } from '@sacloud/ui'
 *   export default function BoardIndex() { redirect(`/board/${DEFAULT_BOARD_SLUG}`) }
 *   ```
 *   첫 탭인 Hot게시판은 집계 화면이라 랜딩 자리로 쓰지 않는다 — 그때도 그대로다.
 *
 * 그리는 일은 `layout.tsx` 가 한다. 여기서 안내를 한 번 더 그리면 두 벌이 겹친다.
 */
export default function BoardIndex() {
  return null
}
