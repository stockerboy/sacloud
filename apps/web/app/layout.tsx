import type { Metadata } from 'next'
import './globals.css'
import { MockApiProvider } from './dev-mock-provider'

/**
 * Phase 0의 전역 셸.
 * 헤더/푸터/GNB 같은 실제 레이아웃은 Phase 1에서 원본을 보고 구성한다.
 * 여기서는 빌드가 도는지 확인할 최소 골격만 둔다.
 */

export const metadata: Metadata = {
  title: 'sacloud',
  description: '서든어택 클랜전 기록 사이트 (개발 중)',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <MockApiProvider>{children}</MockApiProvider>
      </body>
    </html>
  )
}
