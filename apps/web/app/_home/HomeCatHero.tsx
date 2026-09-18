import Link from 'next/link'
import { MainLogo } from '@sacloud/ui'

/**
 * ★★구름 홈 대문★★ (2026-09-18 사장님)
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
      <Link href="/" aria-label="SA CLOUD 홈" className="block">
        <MainLogo className="h-[150px] w-auto max-md:h-[84px]" />
      </Link>

      {/* ── 고양이 무대 ───────────────────────────────────────────────── */}
      {/*
        ⚠ ★`aria-hidden` 이다★ — 읽는 기계에게는 아무 뜻도 없는 그림이다.
          `alt=""` 만으로는 부족하다 (무대 자체가 읽히면 빈 칸이 하나 늘어난다).
      */}
      {/*
        ⚠ ★무대를 화면 끝까지 넓힌다★ (2026-09-19 검수).
          720px 로 묶어 뒀더니 ★무대 왼쪽 경계가 화면 한가운데★ 라,
          고양이가 «허공에서 세로로 잘린 채» 튀어나왔다 (실측: 몸의 35px 만 보임).
          무대만 넓히고 ★구름과 고양이는 여전히 가운데★ 다 — 보이는 자리는 안 바뀐다.
        ⚠ `w-screen` 은 쓰지 않는다 — 세로 스크롤바 폭만큼 넘쳐 가로 스크롤이 생긴다.
      */}
      <div
        className="cat-stage mt-[10px] max-md:mt-[6px]"
        style={{ width: '100vw', maxWidth: '100%' }}
        aria-hidden
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/cat.webp" alt="" width={396} height={220} className="cat-stage__cat" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/cloud.webp" alt="" width={396} height={260} className="cat-stage__cloud" />
      </div>
    </div>
  )
}
