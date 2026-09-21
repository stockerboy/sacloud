import Link from 'next/link'
import { MainLogo } from '@sacloud/ui'

/**
 * ★★구름 홈 대문★★ (2026-09-18 → ★2026-09-19 고양이를 걷어냄★)
 *
 * ⚠ ★고양이 애니메이션은 지웠다★ — 사장님: 「너무 별로야 애미메이트도 그렇고
 *   이상하게 짤렸어」. 같은 메시지로 ★고양이 없는 새 로고★ 를 주셨다.
 *   되살릴 일이 있으면 `git show bdbf4c45 -- apps/web/app/_home/HomeCatHero.tsx` 와
 *   `packages/ui/src/styles.css` 의 `@keyframes cat-stroll` 을 보면 된다.
 *   `cat.webp` · `cloud.webp` 는 ★지우지 않았다★ (`CLAUDE.md` 1-4).
 *
 * ── 옛 설명 (2026-09-18)
 *
 * > 「우리 사이트 대문 로고랑 다른 로고들 이걸로 다 바꿔줘
 * >  (메인홈배경도 깔끔하게 어두운 톤 배경에 이 로고만 올려줘
 * >   그리고 검색창을 다르게 다시 만들고 그 위를 저 구름 위에있는 고양이가
 * >   요염하게 걷다가 저 구름뒤로 쏙 숨어서 저렇게 보는걸로 해줘
 * >   (새로고침할때마다 애니메이트 나와야함)」
 *
 * ```
 *              SA ☁ CLOUD            ← 로고 하나만
 *
 *                  🐱                 ← 고양이가 걷다가
 *                 ☁☁☁                ← 구름 뒤로 쏙
 *        ╭──────────────────╮
 *        │  🔍 닉네임 검색   │        ← 구름 검색창
 *        ╰──────────────────╯
 * ```
 *
 * ── ★왜 컴포넌트를 나눴나★
 *   검색창은 상태를 가져서 클라이언트(`HomeSearch`)다. 로고와 고양이는 ★상태가 없다★ —
 *   서버에서 그려 보내면 폰으로 내려가는 자바스크립트가 그만큼 준다.
 *
 * ── ★애니메이션은 CSS 다★
 *   새로고침마다 저절로 다시 돈다 (`animation` 은 요소가 생길 때 시작한다).
 *   자바스크립트로 시키면 첫 그림에서 한 번 깜빡인다.
 *   규칙은 `packages/ui/src/styles.css` 의 `@keyframes cat-stroll` 에 있다.
 *
 * ⚠ ★고양이는 구름보다 뒤다★ (`z-index` 1 대 2). 뒤로 숨으려면 앞을 가려야 한다.
 */
export function HomeCatHero() {
  return (
    <div className="flex w-full flex-col items-center">
      {/* ── 로고 하나 ─────────────────────────────────────────────────── */}
      {/*
        ★로고에 빛을 준다★ — 사장님 새 로고가 네온처럼 빛난다. 그림에 구워 넣는 대신
        CSS 로 주면 ★배경색이 바뀌어도 따라온다★ 하고 파일도 안 무거워진다.
      */}
      <Link prefetch={false} href="/" aria-label="SA CLOUD 홈" className="home-mark block">
        <MainLogo className="h-[128px] w-auto max-md:h-[74px]" />
      </Link>
    </div>
  )
}
