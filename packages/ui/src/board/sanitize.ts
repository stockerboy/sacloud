import sanitizeHtml from 'sanitize-html'

/**
 * 게시글 · 댓글 본문 새니타이즈.
 *
 * 원본은 리치텍스트 에디터로 작성된 HTML을 그대로 저장한다.
 * **렌더 전에 반드시 이 함수를 거친다.** 서버(Phase 7)에서도 저장 시 같은 정책으로 한 번 더 거른다.
 *
 * 리그소개(`league/sanitize.ts`)와 정책이 거의 같지만, 게시글은 에디터가 남기는
 * 정렬·글자색 같은 인라인 스타일을 일부 허용해야 해서 따로 둔다.
 * 허용 범위 자체는 우리가 정한 것이며 원본의 정책은 `[미확인]`이다.
 */

/** 인라인 style 중 이 속성만 남긴다. position/display 등은 통째로 막는다. */
const SAFE_STYLES = {
  '*': {
    'text-align': [/^(left|right|center|justify)$/],
    color: [/^#[0-9a-fA-F]{3,8}$/, /^rgba?\([\d\s.,%]+\)$/],
    'background-color': [/^#[0-9a-fA-F]{3,8}$/, /^rgba?\([\d\s.,%]+\)$/],
    'font-size': [/^\d{1,3}(px|pt|em|rem|%)$/],
    'font-weight': [/^(normal|bold|[1-9]00)$/],
    'text-decoration': [/^(none|underline|line-through)$/],
  },
}

const POLICY: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'hr', 'div', 'span',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'strong', 'b', 'em', 'i', 'u', 's', 'del', 'ins', 'mark', 'small', 'sub', 'sup',
    'ul', 'ol', 'li',
    'blockquote', 'pre', 'code',
    'a', 'img',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height'],
    '*': ['class', 'style'],
  },
  allowedStyles: SAFE_STYLES,
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: { img: ['http', 'https', 'data'] },
  allowProtocolRelative: false,
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }),
  },
  nonTextTags: ['style', 'script', 'textarea', 'option', 'noscript', 'iframe', 'object', 'embed'],
}

export function sanitizePostContent(html: string): string {
  return sanitizeHtml(html, POLICY)
}
