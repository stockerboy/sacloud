import Link from 'next/link'

/**
 * 404 화면 — `적진`.
 *
 * 3rd.supply 재현을 그만뒀다 (2026-08-30). 예전 일러스트는 밝은 회색(`#d4d4d4`)이 박혀
 * 있어 검정 바닥에서 흰 덩어리로 떴다. `404` 를 이 시안의 큰 제목 글꼴로 직접 쓰고,
 * 색은 토큰(`--color-line` · `--color-accent`)에서 가져온다.
 *
 * **빨강은 점 하나에만** 쓴다 — 숫자 전체를 진홍으로 칠하면 시안이 무너진다.
 *
 * ── ⚠ ★2026-09-15 밤 — 돌아갈 길을 놓았다★ (무한 QA)
 *   여기까지 온 사람에게 ★누를 것이 하나도 없었다.★ «페이지를 찾을 수 없습니다» 만
 *   적혀 있고 링크가 0개라 뒤로가기 말고는 길이 없는 ★막다른 길★ 이었다.
 *   상단바가 있긴 하지만 그건 모든 화면에 늘 있는 것이고, 본문이 «여기서 끝» 이라고
 *   말하면 사람은 본문에서 길을 찾는다.
 *
 *   ★리그 이름은 여기에 적지 않는다★ — 리그는 늘었다 줄었다 하고(`leagueScreen` 표가
 *   정한다) 여기에 박아 두면 그 표와 어긋난다. 어느 리그에도 매이지 않는 두 곳만 둔다.
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
        {/*
          주소가 바뀌었거나 지워진 화면일 수 있다 — 무엇을 잘못했는지 모르는 사람에게
          «어디로 갈 수 있는지» 를 알려 준다. 말은 짧게, 길은 둘만.
        */}
        <p className="mt-2 text-xs text-faint">주소가 바뀌었거나 없어진 화면입니다.</p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link href="/" className="btn-line">
            첫 화면
          </Link>
          <Link href="/board" className="btn-line">
            게시판
          </Link>
        </div>
      </div>
    </div>
  )
}
