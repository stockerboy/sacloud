import BoardLayoutLegacy from './BoardLayoutLegacy'

/**
 * 게시판 — **다시 열었다** (2026-09-02 사용자 지시 · D-260).
 *
 * ```
 * "Hot게시판 / 자유게시판open / 관리자가 쓴글은 자유게시판 상단고정 및 Hot게시판 자동등록"
 * ```
 *
 * ── 무엇이 바뀌었나
 *   ```
 *   2026-09-01   `BoardPreparing` 만 그렸다 — `children` 을 아예 렌더하지 않았다
 *   2026-09-02   `BoardLayoutLegacy`(닫기 전의 그 레이아웃)를 그대로 되살렸다
 *   ```
 *   닫을 때 옛 레이아웃을 지우지 않고 `BoardLayoutLegacy.tsx` 로 옮겨 둔 덕에
 *   되돌리는 데 파일 하나면 됐다 (`CLAUDE.md` 10-4).
 *
 * ── `BoardPreparing` 은 지우지 않았다
 *   `packages/ui/src/board/BoardPreparing.tsx` 와 `boardPreparingText.ts` 는 그대로 있고
 *   export 도 살아 있다. 다시 닫아야 하면 이 파일의 본문을 `<BoardPreparing />` 으로
 *   바꾸면 된다 — 그것이 닫기 전의 상태다.
 *
 * 여기서 껍데기만 정한다. 좌측 카테고리 내비·`GET /infos` 조회·모바일 배치는
 * `BoardLayoutLegacy` 안에 있다.
 */
export default function BoardLayout({ children }: { children: React.ReactNode }) {
  return <BoardLayoutLegacy>{children}</BoardLayoutLegacy>
}
