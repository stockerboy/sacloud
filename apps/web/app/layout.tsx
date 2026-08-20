import type { Metadata } from 'next'
import { SiteShell } from '@sacloud/ui'
import { Providers } from './providers'
import './globals.css'

/**
 * 전역 셸.
 *
 * 원본은 모든 페이지가 같은 고정 헤더 + 본문 + 푸터 구조를 공유한다(`sp-pc-base`).
 * 문서 제목·설명은 원본 문구를 쓰지 않고 우리 값으로 채웠다 (CLAUDE.md 3장 4번).
 */
export const metadata: Metadata = {
  title: 'SACLOUD - 서든어택 클랜전 전적검색',
  description: '서든어택 클랜전 기록 · 리그 · 래더',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <Providers>
          <SiteShell>{children}</SiteShell>
        </Providers>
      </body>
    </html>
  )
}
