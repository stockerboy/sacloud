import type { Metadata } from 'next'
import { Black_Han_Sans, Cinzel, JetBrains_Mono, Noto_Sans_KR } from 'next/font/google'
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
const fontDisplay = Black_Han_Sans({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-display',
})

const fontBody = Noto_Sans_KR({
  weight: ['300', '400', '500', '700'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-body',
})

const fontNum = JetBrains_Mono({
  weight: ['400', '700'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-num',
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

export const metadata: Metadata = {
  title: 'SACLOUD - 서든어택 클랜전 전적검색',
  description: '서든어택 클랜전 기록 · 리그 · 래더',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ko"
      className={`${fontDisplay.variable} ${fontBody.variable} ${fontNum.variable} ${fontCinzel.variable}`}
    >
      <body className="antialiased">
        <Providers>
          {/* 「알」이 깨졌는지를 화면 전체에 하나로 알려 준다 (`docs/EGG_SYSTEM_SPEC.md`) */}
          <EggBoot>
            <AppShell>{children}</AppShell>
          </EggBoot>
          {/* Mock 단계 전용 세션 전환 스위치 — 원본에 없는 개발 장치 */}
          <DevRoleSwitch />
        </Providers>
      </body>
    </html>
  )
}
