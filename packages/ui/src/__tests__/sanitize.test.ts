import { describe, expect, it } from 'vitest'
import { sanitizeLeagueDescription } from '../league/sanitize'

/**
 * 리그소개 HTML 새니타이즈 정책.
 * 저장된 HTML을 그대로 렌더하면 XSS가 되므로, 위험한 것이 실제로 제거되는지 고정한다.
 */

describe('sanitizeLeagueDescription', () => {
  it('script 태그는 내용까지 제거한다', () => {
    const out = sanitizeLeagueDescription('<p>안녕</p><script>alert(1)</script>')
    expect(out).not.toContain('script')
    expect(out).not.toContain('alert')
    expect(out).toContain('안녕')
  })

  it('on* 이벤트 속성을 제거한다', () => {
    const out = sanitizeLeagueDescription('<div onclick="alert(1)" onmouseover="x()">본문</div>')
    expect(out).not.toContain('onclick')
    expect(out).not.toContain('onmouseover')
    expect(out).toContain('본문')
  })

  it('javascript: URL을 제거한다', () => {
    const out = sanitizeLeagueDescription('<a href="javascript:alert(1)">클릭</a>')
    expect(out).not.toContain('javascript:')
    expect(out).toContain('클릭')
  })

  it('style 속성과 style 태그를 제거한다', () => {
    const out = sanitizeLeagueDescription(
      '<style>body{display:none}</style><p style="position:fixed">본문</p>',
    )
    expect(out).not.toContain('<style')
    expect(out).not.toContain('display:none')
    expect(out).not.toContain('position:fixed')
    expect(out).toContain('본문')
  })

  it('iframe / object / embed 를 제거한다', () => {
    const out = sanitizeLeagueDescription(
      '<iframe src="https://example.com"></iframe><object></object><embed>',
    )
    expect(out).not.toContain('iframe')
    expect(out).not.toContain('object')
    expect(out).not.toContain('embed')
  })

  it('허용된 서식은 남긴다', () => {
    const out = sanitizeLeagueDescription(
      '<h2>규정</h2><p><strong>굵게</strong> <em>기울임</em></p><ul><li>항목</li></ul>',
    )
    expect(out).toContain('<h2>규정</h2>')
    expect(out).toContain('<strong>굵게</strong>')
    expect(out).toContain('<em>기울임</em>')
    expect(out).toContain('<li>항목</li>')
  })

  it('외부 링크는 새 탭 + noopener 로 바꾼다', () => {
    const out = sanitizeLeagueDescription('<a href="https://example.com">링크</a>')
    expect(out).toContain('href="https://example.com"')
    expect(out).toContain('target="_blank"')
    expect(out).toContain('rel="noopener noreferrer"')
  })

  it('http/https/mailto 외의 스킴을 막는다', () => {
    const out = sanitizeLeagueDescription('<a href="data:text/html,<script>x</script>">x</a>')
    expect(out).not.toContain('data:text/html')
  })

  it('이미지는 남기되 http/https/data 스킴만 허용한다', () => {
    const ok = sanitizeLeagueDescription('<img src="https://example.com/a.png" alt="a">')
    expect(ok).toContain('src="https://example.com/a.png"')
    const bad = sanitizeLeagueDescription('<img src="javascript:alert(1)">')
    expect(bad).not.toContain('javascript:')
  })
})
