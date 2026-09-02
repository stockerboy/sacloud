/**
 * 리그 안 게시판의 껍데기 `/league/{slug}/board/**` (2026-09-02 사장님 지시 #14-2).
 *
 * > "게시판은 SPL메뉴 안에 있는거다 따로 있는것이 아니다 IPL도 마찬가지"
 *
 * 위에는 리그 레이아웃(상단바 · 히어로 띠)이 그대로 있고, 여기서는 본문 폭만 잡는다.
 * 전역 게시판(`/board/**`)의 **좌측 카테고리 목록은 없다** — 이 리그의 게시판 하나뿐이다.
 * 목록·글·글쓰기·수정·삭제·댓글은 전역 게시판과 **같은 화면 컴포넌트**(`components/board/*Screen`)를
 * `basePath = /league/{slug}/board` 로 부른다. 데이터·API 는 하나도 안 바뀐다.
 */
export default function LeagueBoardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="pc-container mt-10 pb-20 max-md:mt-6">
      <div className="mx-auto max-w-[var(--layout-max)]">{children}</div>
    </div>
  )
}
