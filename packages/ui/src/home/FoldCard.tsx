import type { ReactNode } from 'react'

/**
 * **접히는 카드** — 제목과 한 줄 요약만 보이고, 누르면 펼쳐진다 (O-041 ② · 2026-09-03).
 *
 * ══ 왜 접나 ══
 *
 * 홈에 글이 **너무 길다.** 소개 14줄 + 서약서 5줄 + 사용법 5단계가 첫 화면부터
 * 세로로 다 깔린다. 폰에서는 검색창을 지나 **화면 네 번**을 내려야 끝난다.
 * 사장님 — *「어두운것만 해 일단」* · 배경 사진이 들어오면 글이 사진을 덮는다.
 *
 * ══ 왜 `<details>` 인가 (★`useState` 를 쓰지 않는다★) ══
 *
 * ```
 * useState   →  이 파일이 'use client' 가 되고, 홈이 붙기 전엔 안 열린다
 * <details>  →  ★자바스크립트 0줄★ · 브라우저가 직접 연다 · 홈은 ○ 그대로
 * ```
 * 홈은 `force-static` 이라 엣지가 통째로 받아 낸다(`HIT`). 여는 동작에 JS 가 끼면
 * **느린 폰에서 몇 초 동안 안 눌리는 카드**가 된다. 그건 우리가 겪은 사고다.
 * 검색이 안 되는 것처럼 보였던 그 일과 같은 모양이다.
 *
 * ⚠ 접혀 있어도 **글은 HTML 안에 그대로 있다.** 검색엔진도 읽고, `Ctrl+F` 도 찾는다.
 *   `display:none` 이 아니라 브라우저의 접기라서 그렇다. 글을 지우는 게 아니다.
 *
 * ══ 건드리면 안 되는 것 ══
 *
 * 안에 들어가는 글은 **사장님이 쓰신 14줄 + 서약서 5줄 + 사용법 5단계**다.
 * 이 껍데기는 글을 **감싸기만 한다** — 한 글자도 만지지 않는다 (`O-004`).
 */
export function FoldCard({
  title,
  summary,
  children,
  defaultOpen = false,
}: {
  /** 접혀 있을 때도 보이는 제목 */
  title: string
  /** 제목 밑 한 줄. **안에 뭐가 있는지 알 수 있어야 누른다** */
  summary: string
  children: ReactNode
  /** 처음부터 펼쳐 둘까. 홈에서는 둘 다 접는다 */
  defaultOpen?: boolean
}) {
  return (
    <details
      open={defaultOpen}
      className="group mx-auto w-full max-w-[720px] border-t border-line pt-8"
    >
      {/* `list-none` 과 `::-webkit-details-marker` — 브라우저 기본 삼각형을 지운다.
          우리 것(▽)을 오른쪽에 두는 편이 제목 왼쪽 줄이 안 밀려서 읽기 좋다 */}
      <summary className="flex cursor-pointer list-none items-baseline gap-3 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <span className="block text-[20px] font-normal leading-none text-[var(--color-text-strong,#f6eded)] font-[family-name:var(--font-display)]">
            {title}
          </span>
          <span className="mt-2 block text-[13px] leading-relaxed text-meta">{summary}</span>
        </span>
        {/* 펼쳐지면 뒤집힌다. 글자가 아니라 그림이라 읽는 기계에는 안 들린다 */}
        <span
          aria-hidden
          className="shrink-0 text-[12px] leading-none text-[var(--color-faint,#6b5555)] transition-transform group-open:rotate-180"
        >
          ▽
        </span>
      </summary>

      <div className="mt-6">{children}</div>
    </details>
  )
}
