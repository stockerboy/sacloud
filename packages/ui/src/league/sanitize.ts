import sanitizeHtml from 'sanitize-html'

/**
 * 리그소개 HTML 새니타이즈 정책.
 *
 * 저장된 HTML을 그대로 렌더하면 XSS가 된다. **렌더 전 반드시 이 함수를 거친다.**
 * 아래 화이트리스트는 우리가 정한 정책이며 원본의 허용 범위는 `[미확인]`이다.
 * 서버(Phase 7)에서도 저장 시 같은 정책으로 한 번 더 거른다 — 클라이언트 새니타이즈만 믿지 않는다.
 */
const POLICY: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'hr',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'strong', 'b', 'em', 'i', 'u', 's', 'del', 'ins', 'mark', 'small', 'sub', 'sup',
    'ul', 'ol', 'li',
    'blockquote', 'pre', 'code',
    'a', 'img',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
    'span', 'div',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height'],
    // 에디터가 남기는 정렬 정도만 허용한다. style 은 통째로 막는다.
    '*': ['class'],
  },
  // javascript: 같은 스킴을 막는다
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: { img: ['http', 'https', 'data'] },
  allowProtocolRelative: false,
  // 외부 링크는 새 탭 + noopener
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }),
  },
  // 태그가 제거될 때 내용까지 같이 버릴 대상
  nonTextTags: ['style', 'script', 'textarea', 'option', 'noscript'],
}

export function sanitizeLeagueDescription(html: string): string {
  return sanitizeHtml(html, POLICY)
}
