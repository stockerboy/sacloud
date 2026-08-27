/**
 * `resolveApiBaseUrl` 회귀 테스트 (D-151).
 *
 * 운영 배포에서 브라우저가 `https://api.sacloud.local` 로 요청을 보내
 * 서버 API 는 멀쩡한데 화면만 죽은 적이 있다. 그 사고를 여기서 고정한다.
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_API_BASE_URL,
  SAME_ORIGIN_API_BASE_URL,
  resolveApiBaseUrl,
} from '../config.js'

describe('resolveApiBaseUrl — 안전한 쪽으로 실패한다', () => {
  it('환경변수가 없으면 같은 오리진을 쓴다 (Mock 주소로 떨어지지 않는다)', () => {
    expect(resolveApiBaseUrl(undefined)).toBe(SAME_ORIGIN_API_BASE_URL)
    expect(resolveApiBaseUrl({})).toBe(SAME_ORIGIN_API_BASE_URL)
  })

  it('빈 문자열도 미설정으로 본다', () => {
    expect(resolveApiBaseUrl({ NEXT_PUBLIC_API_BASE_URL: '' })).toBe(SAME_ORIGIN_API_BASE_URL)
  })

  it('명시된 값이 있으면 그걸 쓴다', () => {
    expect(resolveApiBaseUrl({ NEXT_PUBLIC_API_BASE_URL: '/api' })).toBe('/api')
    expect(resolveApiBaseUrl({ NEXT_PUBLIC_API_BASE_URL: 'https://x.example' })).toBe(
      'https://x.example',
    )
  })

  it('mock 모드에서만 Mock 주소로 떨어진다', () => {
    expect(resolveApiBaseUrl({ NEXT_PUBLIC_API_MODE: 'mock' })).toBe(DEFAULT_API_BASE_URL)
  })

  it('live 모드에서는 절대 Mock 주소를 쓰지 않는다', () => {
    expect(resolveApiBaseUrl({ NEXT_PUBLIC_API_MODE: 'live' })).not.toBe(DEFAULT_API_BASE_URL)
    /* 오타나 예상 못 한 값도 live 로 본다 (D-116) */
    expect(resolveApiBaseUrl({ NEXT_PUBLIC_API_MODE: 'moc' })).not.toBe(DEFAULT_API_BASE_URL)
  })
})
