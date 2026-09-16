import { HOME_CODE_BLOCKS, type CodeTone } from './homeCodeSnippets'

/**
 * ★★홈 히어로 「코드 배경」★★ (2026-09-17 · 사장님 시안)
 *
 * > «검색창도 너무 이쁘고 안에 있는 코드들만 우리 사이트랑 관련있는 글자들»
 *
 * ── ★읽으라고 있는 게 아니다★
 *   분위기다. 그래서 세 가지를 지킨다 —
 *   ```
 *   aria-hidden           읽는 기계는 이 글자를 만나지 않는다
 *   pointer-events:none   손가락이 여기 걸리지 않는다 (검색창 위에 얹혀 있다)
 *   opacity 0.10~0.18     지시서 값. 이보다 진하면 검색창 글자와 싸운다
 *   ```
 *
 * ── ★폰에서는 덩어리를 줄인다★
 *   `mobile: false` 인 덩어리는 폰에서 아예 ★그리지 않는다★ (`hidden md:block`).
 *   숨기는 게 아니라 DOM 에는 남으므로 — 아니, `hidden` 은 DOM 에 남는다.
 *   그래도 글자 수가 늘어나는 것은 그리기 비용이라 폰에서 7덩어리 → 3덩어리다.
 *
 * ── 글자는 어디서 오나
 *   `homeCodeSnippets.ts` 다. ★거기서 전부 import 로 읽어 온다★ — 지어낸 경로가 없다.
 *
 * ── 서버 컴포넌트다
 *   홈은 `force-static` 이라 이 글자들은 빌드 때 한 번 굳는다. 상태도 무작위도 없다.
 */

/** 결 → 색. ★여기 한 곳에서만 색을 정한다★ */
const TONE: Readonly<Record<CodeTone, string>> = {
  cmt: '#6b7ba0',
  key: '#5b8dff',
  fn: '#8fa4c8',
  str: '#3fb27f',
  num: '#38bdf8',
  dim: '#5c6580',
}

export function HomeCodeBackdrop() {
  return (
    <div
      aria-hidden
      /*
       * ★히어로 칸에만 깐다★ — 높이를 여기서 잡는다. `%` 자리(`block.at.top`)는
       * 이 높이 기준이라 이 값을 바꾸면 덩어리들이 같이 따라 움직인다.
       * `.home-night::before` 가 `clamp()` 로 높이를 잡던 것과 같은 방식이다.
       *
       * `z-index:-1` — 부모(`.home-code`)가 `isolation:isolate` 라 층이 여기서 닫힌다.
       * 배경보다는 위, 본문 글자보다는 아래에 놓인다.
       */
      className="pointer-events-none absolute inset-x-0 top-0 h-[clamp(300px,34vw,440px)] select-none overflow-hidden"
      style={{ contain: 'paint', zIndex: -1 }}
    >
      {/* 코드가 놓이는 바닥 — 시안의 짙은 남색. 아래로 가면서 페이지 색으로 녹는다 */}
      <div className="home-code-ground absolute inset-0" />

      {HOME_CODE_BLOCKS.map((block, blockIndex) => (
        <pre
          key={blockIndex}
          className={`absolute m-0 whitespace-pre font-[var(--font-num)] text-[9.5px] leading-[1.55] opacity-[0.18] max-md:text-[7.5px] max-md:opacity-[0.15] ${
            block.mobile ? '' : 'max-md:hidden'
          }`}
          style={{
            top: block.at.top,
            ...(block.at.left === undefined ? {} : { left: block.at.left }),
            ...(block.at.right === undefined ? {} : { right: block.at.right }),
          }}
        >
          {block.lines.map((line, lineIndex) => (
            <div key={lineIndex}>
              {line.map((span, spanIndex) => (
                <span key={spanIndex} style={{ color: TONE[span.c] }}>
                  {span.t}
                </span>
              ))}
            </div>
          ))}
        </pre>
      ))}
    </div>
  )
}
