import { BoardPreparing } from '@sacloud/ui'

/**
 * 게시판 — **준비중으로 닫아 둔 문** (2026-09-01 사용자 지시).
 *
 * ```
 * "게시판 준비중으로 냅두고 마이페이지는 해야돼"
 * ```
 *
 * ── 왜 여기 한 곳인가
 *   `/board/**` 하위 경로(목록 · 글 상세 · 글쓰기 · 수정 · 삭제)가 **전부 이 레이아웃을
 *   지난다.** 그래서 여기서 `children` 을 그리지 않으면 어느 경로로도 글 목록이 나가지
 *   않고, **글쓰기·댓글·추천 폼도 화면에 뜨지 않는다.**
 *   페이지마다 조건을 뿌리면 새 경로가 생길 때 빠진다 —
 *   리그의 준비중 처리(D-178, `app/league/[leagueSlug]/layout.tsx`)와 같은 방식이다.
 *
 * ── 지우지 않았다 (`CLAUDE.md` 10-4)
 *   ```
 *   남는다  `/board/**` 라우트 파일 전부 (page.tsx 5개)
 *   남는다  `/api/boards/**` · `/api/comments/**` 라우트와 서버 질의
 *   남는다  `packages/ui` 의 게시판 컴포넌트와 export 전부
 *   남는다  옛 레이아웃 → `BoardLayoutLegacy.tsx`
 *   ```
 *   다시 열 때는 아래 본문을 `BoardLayoutLegacy` 의 것으로 되돌리면 된다.
 *
 * ── GNB 는 안 고쳤다
 *   `PRIMARY_NAV` 의 `게시판` 링크(`/board`)는 그대로 살아 있다. 눌리고, 눌리면
 *   **이 준비중 화면**이 뜬다. 링크를 없애면 "게시판이 사라졌다" 로 읽히는데
 *   없어진 것이 아니라 아직 안 연 것이다.
 *
 * ── `children` 을 안 그려도 되는가
 *   된다. 하위 페이지는 전부 `'use client'` 라 서버에서 데이터를 읽지 않고,
 *   렌더에 들어가지 않으면 그 안의 `useQuery` 도 돌지 않는다 — 요청이 안 나간다.
 */
export default function BoardLayout({ children }: { children: React.ReactNode }) {
  /* `children` 은 일부러 그리지 않는다. 위 주석 참조 — 지운 것이 아니라 닫은 것이다 */
  void children
  return <BoardPreparing />
}
