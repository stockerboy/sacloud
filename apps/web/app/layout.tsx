import type { Metadata } from 'next'
import { Black_Han_Sans, JetBrains_Mono, Noto_Sans_KR } from 'next/font/google'
import { Providers } from './providers'
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
 *
 *   `Black Han Sans` 는 **큰 제목에만** 쓴다. 라벨까지 이 서체로 쓰면 화면이 소리친다.
 *   `subsets` 는 next/font 가 아는 값만 받는다 — 세 서체 모두 `latin` 하나뿐이라
 *   한글은 구글이 내려주는 유니코드 범위 분할본으로 따라온다.
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

export const metadata: Metadata = {
  title: 'SACLOUD - 서든어택 클랜전 전적검색',
  description: '서든어택 클랜전 기록 · 리그 · 래더',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ko"
      className={`${fontDisplay.variable} ${fontBody.variable} ${fontNum.variable}`}
    >
      <body className="antialiased">
        <Providers>
          <AppShell>{children}</AppShell>
          {/* Mock 단계 전용 세션 전환 스위치 — 원본에 없는 개발 장치 */}
          <DevRoleSwitch />
        </Providers>
      </body>
    </html>
  )
}
