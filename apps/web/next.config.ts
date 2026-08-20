import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 워크스페이스 내부 패키지는 빌드 산출물 없이 소스를 그대로 참조한다
  transpilePackages: ['@sacloud/contract', '@sacloud/mock'],
}

export default nextConfig
