/**
 * 404 화면 — `적진`.
 *
 * 3rd.supply 재현을 그만뒀다 (2026-08-30). 예전 일러스트는 밝은 회색(`#d4d4d4`)이 박혀
 * 있어 검정 바닥에서 흰 덩어리로 떴다. `404` 를 이 시안의 큰 제목 글꼴로 직접 쓰고,
 * 색은 토큰(`--color-line` · `--color-accent`)에서 가져온다.
 *
 * **빨강은 점 하나에만** 쓴다 — 숫자 전체를 진홍으로 칠하면 시안이 무너진다.
 */
export function NotFoundView() {
  return (
    <div className="flex items-center justify-center px-4 py-32">
      <div className="text-center">
        <div className="display select-none text-[7rem] leading-none tracking-[0.06em] text-line">
          404
        </div>
        <div className="mx-auto mt-8 h-px w-16 bg-accent" />
        <p className="mt-8 text-sm text-meta">페이지를 찾을 수 없습니다.</p>
      </div>
    </div>
  )
}

