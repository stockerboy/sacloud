import type { Metadata } from 'next'
import { Bebas_Neue, Chakra_Petch, Cinzel, Noto_Sans_KR } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { Providers } from './providers'
import { EggBoot } from './_egg/EggBoot'
import { AppShell } from '@/components/AppShell'
import { DevRoleSwitch } from '@/components/DevRoleSwitch'
import './globals.css'

/**
 * 전역 셸.
 *
 * ── 2026-08-30: 3rd.supply 재현을 그만두고 자체 디자인(`적진`)으로 간다
 *   원본 흉내를 내지 않는다. 이동 경로와 버튼이 하는 일은 그대로 두고 **겉만** 바꾼다.
 *
 * ── 웹폰트
 *   세 벌을 CSS 변수로 내보낸다. 이름은 `packages/ui/src/styles.css` 의 토큰과
 *   **정확히 같아야 한다** — 화면 코드는 `var(--font-display)` 처럼 이 이름만 본다.
 *
 *   | 변수              | 서체            | 쓰는 곳          |
 *   |-------------------|-----------------|------------------|
 *   | `--font-display`  | Black Han Sans  | 큰 제목 · 브랜드 |
 *   | `--font-body`     | Noto Sans KR    | 본문 · 표        |
 *   | `--font-num`      | JetBrains Mono  | 숫자             |
 *   | `--font-cinzel`   | Cinzel          | 신전 히어로 전용 |
 *
 *   `Black Han Sans` 는 **큰 제목에만** 쓴다. 라벨까지 이 서체로 쓰면 화면이 소리친다.
 *   `subsets` 는 next/font 가 아는 값만 받는다 — 세 서체 모두 `latin` 하나뿐이라
 *   한글은 구글이 내려주는 유니코드 범위 분할본으로 따라온다.
 *
 * ── `Cinzel` 은 왜 넷째로 들어왔나 (2026-09-01)
 *   메인이 그리스·로마 신전 톤으로 바뀌면서 대리석 조각상 위에 로고가 올라간다.
 *   거기 `Black Han Sans`(굵은 한글 고딕)를 쓰면 신전이 아니라 광고 배너로 읽힌다.
 *   `Cinzel` 은 **로마 비문 대문자**를 본뜬 서체라 `SA CLOUD` 와 약자 풀이에 맞는다.
 *
 *   이름이 `--font-temple` 이 아닌 이유 — 그 토큰은 `packages/ui/src/styles.css` 에
 *   있고 **두 서체를 겹친 스택**이다. `Cinzel` 에는 한글이 없어서
 *   `현재 1등` 은 스택 뒤쪽의 한글 세리프(시스템 명조)가 받는다.
 *
 *   **한글 세리프 웹폰트(`Noto Serif KR`)는 일부러 안 실었다.** 히어로에서 한글은
 *   `현재 1등` 넉 자뿐인데, 한글 웹폰트 한 벌은 유니코드 범위 분할본이 수십 개 딸려 온다.
 *   그만큼의 값을 낼 자리가 아니다 — 시스템 명조(Windows 바탕 · macOS 명조)로 충분하다.
 */
/**
 * ⚠ 2026-09-02 — **제목 전용 글꼴과 숫자 고정폭을 뺐다** (사용자 지시 · D-264)
 *
 *   *"폰트 글자색 체계 전부 서플라이 따라감"*
 *
 *   원본 3rd.supply 에는 제목 전용 글꼴도, 숫자 전용 글꼴도 **없다** (D-009 실측).
 *   둘 다 시스템 산세리프로 찍혔다. 그래서 여기서 싣지 않는다.
 *
 * ── ★여기 있던 것이 진짜 버그였다★
 *   `styles.css` 의 `--font-num` 은 이미 2026-09-01 에 원본 스택으로 되돌려져 있었는데,
 *   이 파일이 `JetBrains_Mono` 를 **같은 변수 이름에 덮어쓰고** 있었다.
 *   `<html>` 에 걸린 변수가 `@theme` 값을 이기므로, 문서에는 「되돌렸다」고 적혀 있고
 *   화면에서는 계속 고정폭 숫자가 나오고 있었다. 이제 토큰 값이 실제로 먹는다.
 *
 * ── 되돌리려면
 *   ```ts
 *   const fontDisplay = Black_Han_Sans({ weight: '400', subsets: ['latin'],
 *     display: 'swap', variable: '--font-display' })
 *   const fontNum = JetBrains_Mono({ weight: ['400','700'], subsets: ['latin'],
 *     display: 'swap', variable: '--font-num' })
 *   ```
 *   그리고 아래 `<html className>` 에 `.variable` 두 개를 다시 끼운다.
 *   `styles.css` 의 `--font-num-mono` 에 옛 고정폭 스택이 그대로 남아 있다.
 */

const fontBody = Noto_Sans_KR({
  weight: ['300', '400', '500', '700'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-body',
})

/**
 * 신전 히어로 전용 라틴 세리프. 로고와 「현재 1등」 블록에만 쓴다.
 * `700` 은 약자(`CLOUD`)를 나머지보다 굵게 뽑기 위해 같이 받는다.
 */
const fontCinzel = Cinzel({
  weight: ['400', '700'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-cinzel',
})

/**
 * ★티어 이름 전용 서체★ (2026-09-10 · 사장님 «폰트가 일단 너무 구리고»).
 *
 * ── 왜 새로 들였나
 *   `vs ASTRA` · `vs CHALLENGER1` 은 ★라틴 대문자★ 다. 본문 글꼴(Noto Sans KR)로 찍으면
 *   ★한글 본문과 똑같이 생겨서★ 구간 이름으로 안 읽힌다. 게다가 `CHALLENGER1` 은 길어서
 *   폰 가로폭을 거의 다 먹는다 (실측 사진).
 *
 *   `Bebas Neue` 는 ★스코어보드 글꼴★ 이다 — 대문자만 있고, 좁고, 키가 크다.
 *   ★길이 문제와 톤 문제를 한 번에 푼다.★
 *
 * ── ⚠ 한글도 없고 소문자도 없다
 *   그래서 ★티어 이름 한 곳에만 쓴다.★ 본문에 쓰면 한글이 통째로 대체 글꼴로 떨어진다.
 *   스택 뒤에 한글 글꼴을 받쳐 둔다 (`styles.css` 의 `--font-tier`) — 모르는 티어가
 *   `4티어` 로 떨어져도 글자가 깨지지 않는다.
 */
/* ★v3 숫자·영문 글꼴★ — Chakra Petch (2026-09-10 · 선수·클랜 상세 v3 시안). 한글은 Noto Sans KR 이 받는다 */
const fontChakra = Chakra_Petch({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-chakra',
})
const fontTier = Bebas_Neue({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-bebas',
})

/**
 * ★링크 미리보기★ (2026-09-03 · O-008 ⑤).
 *
 * ══ 왜 필요한가 ══
 *
 * **공개 방식이 「링크를 뿌리는 것」이다** — 단톡방 · 디스코드에 주소를 던진다.
 * 그런데 운영에서 재 보니 **`og:` 태그가 0개**였다. 링크를 붙여도 **그냥 파란 글자**만
 * 뜨고 무엇인지 아무도 모른다. 천 명에게 뿌리는 그 한 줄이 가장 값싼 홍보인데
 * **그 자리가 비어 있었다.**
 *
 * ══ 이미지 ══
 *
 * ⚠ **2026-09-18 — 드디어 그림이 생겼다.** 사장님이 새 로고(구름 위의 고양이)를
 *   주셔서 그것으로 `app/opengraph-image.png`(1200×630)를 만들었다.
 *   ★파일 이름이 곧 규칙이다★ — Next 가 `app/opengraph-image.*` 를 보면
 *   `og:image` 를 저절로 넣는다. 여기 주소를 적지 않는다.
 *   같은 규칙으로 `app/icon.png`(파비콘) · `app/apple-icon.png` 도 놓았다.
 *
 * ⚠ 옛 파비콘(`icon.svg`)은 ★지우지 않았다★ — `public/brand/icon-v1.svg` 에 있다
 *   (`CLAUDE.md` 1-4). `app/` 안에 두 개가 같이 있으면 둘 다 나가므로 옮긴 것이다.
 *
 * ⚠ `metadataBase` 가 있어야 상대 주소가 절대 주소로 풀린다. 없으면 Next 가 경고만
 *   찍고 넘어가고, **미리보기에서 이미지가 조용히 빠진다.**
 */
export const metadata: Metadata = {
  /*
   * ⚠ ★2026-09-21 — 대문 주소는 `loginsa.cloud` 다★ (사장님이 도메인을 옮기셨다).
   *   `3rdcloud.my` 도 같은 사이트지만 ★링크 미리보기에 적히는 주소★ 는 하나여야 한다.
   */
  metadataBase: new URL('https://loginsa.cloud'),
  title: 'log in SA CLOUD - 서든어택 클랜전 전적검색',
  description: '서든어택 클랜전 기록 · 리그 · 래더',
  openGraph: {
    type: 'website',
    locale: 'ko_KR',
    siteName: 'log in SA CLOUD',
    title: 'log in SA CLOUD - 서든어택 클랜전 전적검색',
    /* 링크를 받은 사람이 **무엇을 볼 수 있는지**를 한 줄로. 기능 나열이 아니다 */
    description: '닉네임이나 클랜명으로 클랜전 기록을 찾아보세요. 래더 · 랭킹 · 경기 기록.',
    url: 'https://loginsa.cloud',
  },
  twitter: {
    /* ⚠ 2026-09-18 — 그림이 생겨서 큰 카드로 바꿨다 (`app/opengraph-image.png`) */
    card: 'summary_large_image',
    title: 'log in SA CLOUD - 서든어택 클랜전 전적검색',
    description: '닉네임이나 클랜명으로 클랜전 기록을 찾아보세요. 래더 · 랭킹 · 경기 기록.',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ko"
      className={`${fontBody.variable} ${fontCinzel.variable} ${fontTier.variable} ${fontChakra.variable}`}
    >
      {/*
        ★`sac-sky` — 2026-09-16 사장님이 주신 픽셀 밤하늘 배경★
          («사이트 배경이랑 로고 이걸로 바꿔봐 (…) 원상복구도 가능해야해»)

        ★★되돌리는 법: 이 낱말 `sac-sky` 하나만 지우면 2026-09-15 배경으로 돌아간다★★
        규칙은 `packages/ui/src/styles.css` 맨 아래 「새 사이트 배경」 블록에 있다 —
        클래스를 떼면 그 블록이 통째로 잠든다. 옛 규칙은 한 줄도 안 지웠다.
      */}
      <body className="antialiased sac-sky">
        <Providers>
          {/* 「알」이 깨졌는지를 화면 전체에 하나로 알려 준다 (`docs/EGG_SYSTEM_SPEC.md`) */}
          <EggBoot>
            <AppShell>{children}</AppShell>
          </EggBoot>
          {/* Mock 단계 전용 세션 전환 스위치 — 원본에 없는 개발 장치 */}
          <DevRoleSwitch />
        </Providers>
        {/*
          ★방문 통계★ (2026-09-25 사장님 「관리자 권한으로 접속량 같은거 볼 수 있나」)
          Vercel Analytics — 페이지뷰·방문자를 Vercel 대시보드(Analytics 탭)로 보낸다.
          우리 DB 를 안 건드린다 · 개인정보(IP·쿠키)를 직접 안 남기는 방식(Vercel 이 집계만 보관).
          지금까지 이 패키지가 없어서 대시보드가 "No data" 였다 — 이제부터 쌓인다.
        */}
        <Analytics />
      </body>
    </html>
  )
}
