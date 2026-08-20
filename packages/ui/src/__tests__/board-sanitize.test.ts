import { describe, expect, it } from 'vitest'
import { sanitizePostContent } from '../board/sanitize'

/**
 * 게시글·댓글 본문 새니타이즈.
 * 리치텍스트로 들어온 HTML을 그대로 렌더하면 XSS가 되므로 위험 요소 제거를 고정한다.
 */
describe('sanitizePostContent', () => {
  it('script / iframe / object 는 내용까지 제거한다', () => {
    const out = sanitizePostContent(
      '<p>본문</p><script>alert(1)</script><iframe src="x"></iframe><object></object>',
    )
    expect(out).toContain('본문')
    expect(out).not.toContain('script')
    expect(out).not.toContain('alert')
    expect(out).not.toContain('iframe')
    expect(out).not.toContain('object')
  })

  it('on* 이벤트 속성을 제거한다', () => {
    const out = sanitizePostContent('<div onclick="x()" onerror="y()">본문</div>')
    expect(out).not.toContain('onclick')
    expect(out).not.toContain('onerror')
    expect(out).toContain('본문')
  })

  it('javascript: URL 을 제거한다', () => {
    const out = sanitizePostContent('<a href="javascript:alert(1)">링크</a>')
    expect(out).not.toContain('javascript:')
  })

  it('에디터가 남기는 안전한 style 만 허용한다', () => {
    const out = sanitizePostContent(
      '<p style="text-align:center;color:#ff0000;position:fixed;display:none">본문</p>',
    )
    expect(out).toContain('text-align:center')
    expect(out).toContain('color:#ff0000')
    // 레이아웃을 깨거나 화면을 가릴 수 있는 속성은 남기지 않는다
    expect(out).not.toContain('position')
    expect(out).not.toContain('display')
  })

  it('허용된 서식은 남긴다', () => {
    const out = sanitizePostContent(
      '<p><strong>굵게</strong><em>기울임</em><u>밑줄</u></p><ul><li>항목</li></ul>',
    )
    expect(out).toContain('<strong>굵게</strong>')
    expect(out).toContain('<em>기울임</em>')
    expect(out).toContain('<u>밑줄</u>')
    expect(out).toContain('<li>항목</li>')
  })

  it('외부 링크는 새 탭 + noopener 로 바꾼다', () => {
    const out = sanitizePostContent('<a href="https://example.com">링크</a>')
    expect(out).toContain('target="_blank"')
    expect(out).toContain('rel="noopener noreferrer"')
  })
})
