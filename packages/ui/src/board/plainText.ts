/**
 * ★글자 그대로 붙여 넣은 본문 ↔ 저장용 HTML★ (2026-09-25 사장님
 * 「이거 그대로 갖다 붙이면 글이 문단도 안나뉘고 이상하게 들어가」).
 *
 * ── 무엇이 문제였나
 *   글쓰기 칸은 `<textarea>` 인데 저장은 ★HTML★ 로 한다(원본이 리치텍스트라 그 형태를 따랐다).
 *   textarea 의 줄바꿈(`\n`)은 HTML 에서 ★빈칸 하나★ 다. 그래서 문단을 나눠 붙여 넣어도
 *   화면에서는 한 덩어리로 붙어 나왔다.
 *
 * ── 규칙 (순수 함수 · 서버도 화면도 같은 것을 쓴다)
 *   빈 줄로 나뉜 덩어리 → `<p>`  ·  덩어리 안 줄바꿈 → `<br>`  ·  `<`·`&` 는 이스케이프.
 *   이미 태그가 든 글(옛 글 · 다른 편집기)은 ★손대지 않는다★ — `looksLikeHtml` 로 가른다.
 *   수정 화면은 반대로 `<p>`·`<br>` 을 줄바꿈으로 되돌려 textarea 에 넣는다.
 */

const BLOCK_TAG = /<(p|div|br|ul|ol|li|h[1-6]|blockquote|pre|table|hr)\b/i

/** 태그가 든 글인가 — 들었으면 편집기가 만든 HTML 로 보고 그대로 둔다 */
export function looksLikeHtml(content: string): boolean {
  return BLOCK_TAG.test(content)
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** textarea 글 → 문단 HTML. 이미 HTML 이면 그대로 돌려준다 */
export function plainTextToHtml(text: string): string {
  if (looksLikeHtml(text)) return text
  const normalized = text.replace(/\r\n?/g, '\n').trim()
  if (!normalized) return ''
  return normalized
    .split(/\n{2,}/)
    .map((para) => `<p>${escapeHtml(para).replace(/\n/g, '<br>')}</p>`)
    .join('\n')
}

/**
 * 저장된 문단 HTML → textarea 글. `plainTextToHtml` 이 만든 꼴만 되돌린다.
 * 다른 태그(표·그림 등)가 들어 있으면 ★그대로 둔다★ — 정보를 버리지 않는다.
 */
export function htmlToPlainText(html: string): string {
  const simple = /^(\s*<p>[\s\S]*?<\/p>\s*)+$/i.test(html) && !/<(?!\/?p\b|br\b)[a-z]/i.test(html)
  if (!simple) return html
  return html
    .replace(/\s*<\/p>\s*<p>\s*/gi, '\n\n')
    .replace(/^\s*<p>/i, '')
    .replace(/<\/p>\s*$/i, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}
